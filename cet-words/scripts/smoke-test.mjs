#!/usr/bin/env node
/**
 * 端到端冒烟测试：用无头 Chrome（CDP 协议）真实走一遍
 * 首次运行导入词库 → 今日 → 学习（四阶段 + 评分）→ 复习 → 单词本（搜索/详情）→ 数据 → 设置
 *
 * 用法:
 *   node scripts/smoke-test.mjs                       # 默认 http://localhost:3100
 *   APP_URL=http://localhost:3100 SHOTS_DIR=/tmp/x node scripts/smoke-test.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP = process.env.APP_URL || "http://localhost:3100";
const PORT = Number(process.env.CDP_PORT || 9333);
const SHOTS = process.env.SHOTS_DIR || path.join(os.tmpdir(), "cet-shots");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const errors = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
};

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        (this.listeners.get(msg.method) || []).forEach((fn) => fn(msg.params || {}));
      }
    });
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const res = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error("页面执行异常: " + JSON.stringify(res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    return res.result?.value;
  }
}

async function waitFor(fn, label, timeoutMs = 45000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      last = await fn();
      if (last) return last;
    } catch (err) {
      last = err.message;
    }
    await sleep(350);
  }
  throw new Error(`等待超时: ${label}（最后结果: ${JSON.stringify(last)}）`);
}

async function probe(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** 若目标地址没有服务，就用当前 node 直接拉起 `next start`，测试结束后再关闭 */
async function ensureServer() {
  if (await probe(APP)) {
    console.log(`使用已在运行的服务: ${APP}`);
    return null;
  }
  const port = new URL(APP).port || "3100";
  const bin = path.join(ROOT, "node_modules/next/dist/bin/next");
  console.log(`未检测到服务，启动生产服务: next start -p ${port}`);
  const proc = spawn(process.execPath, [bin, "start", "-p", port], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", (d) => process.stdout.write("[next] " + d));
  proc.stderr.on("data", (d) => process.stderr.write("[next] " + d));
  const start = Date.now();
  while (Date.now() - start < 60000) {
    if (await probe(APP)) return proc;
    await sleep(500);
  }
  throw new Error("服务启动超时（60s）");
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await ensureServer();
  const browser = BROWSERS.find((p) => fs.existsSync(p));
  if (!browser) throw new Error("找不到 Chrome / Edge");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cet-smoke-"));
  let cdpRef = null;
  const child = spawn(
    browser,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--window-size=1280,1700",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    await waitFor(async () => {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return res.ok;
    }, "CDP 端点");

    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === "page");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", reject);
    });
    const cdp = new CDP(ws);
    cdpRef = cdp;
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    cdp.on("Runtime.exceptionThrown", (p) => errors.push("exception: " + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    cdp.on("Runtime.consoleAPICalled", (p) => {
      if (p.type === "error") errors.push("console.error: " + p.args.map((a) => a.value ?? a.description ?? "").join(" "));
    });

    const text = () => cdp.eval("document.body.innerText");
    const shot = async (name) => {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
    };
    const clickText = (sel, needle) =>
      cdp.eval(
        `(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => (e.textContent || "").includes(${JSON.stringify(
          needle,
        )})); if (!el) return false; el.click(); return true; })()`,
      );
    const goto = async (route) => {
      await cdp.send("Page.navigate", { url: APP + route });
      await waitFor(() => cdp.eval("document.readyState === 'complete'"), `加载 ${route}`);
    };
    const countProgress = () =>
      cdp.eval(
        `new Promise((res) => { const r = indexedDB.open("cet-words"); r.onsuccess = () => { const db = r.result; const tx = db.transaction("progress"); const c = tx.objectStore("progress").count(); c.onsuccess = () => res(c.result); }; r.onerror = () => res(-1); })`,
      );
    const countWords = () =>
      cdp.eval(
        `new Promise((res) => { const r = indexedDB.open("cet-words"); r.onsuccess = () => { const db = r.result; const tx = db.transaction("words"); const c = tx.objectStore("words").count(); c.onsuccess = () => res(c.result); }; r.onerror = () => res(-1); })`,
      );
    const forceAllDue = () =>
      cdp.eval(
        `new Promise((res) => { const r = indexedDB.open("cet-words"); r.onsuccess = () => { const db = r.result; const tx = db.transaction("progress", "readwrite"); const store = tx.objectStore("progress"); const req = store.openCursor(); let n = 0; req.onsuccess = () => { const c = req.result; if (c) { const v = c.value; v.due = Date.now() - 120000; v.state = 2; c.update(v); n++; c.continue(); } else { res(n); } }; }; })`,
      );
    const setInput = (sel, value) =>
      cdp.eval(
        `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(el, ${JSON.stringify(
          value,
        )}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`,
      );

    // 1. 今日页（含首次导入词库）
    await goto("/");
    let lastLog = 0;
    await waitFor(
      async () => {
        const body = await text();
        if (Date.now() - lastLog > 8000) {
          lastLog = Date.now();
          console.log("  … 当前页面:", body.replace(/\s+/g, " ").slice(0, 150));
        }
        return body.includes("今日任务");
      },
      "词库导入 + 今日页渲染",
      180000,
    );
    const wordCount = await countWords();
    check("词库导入 IndexedDB（4770 词）", wordCount === 4770, `words=${wordCount}`);
    let todayText = await text();
    check("今日页显示考试倒计时", /距离 CET-[46] 考试还有/.test(todayText));
    check("今日页显示今日任务三项", ["待复习", "今日新词", "顽固词"].every((k) => todayText.includes(k)));
    check("今日页显示掌握统计", ["已掌握", "学习中", "未学习"].every((k) => todayText.includes(k)));
    check("首日不显示落后提示", !todayText.includes("当前落后"));
    check("首日新词目标 = 30（无追赶加量）", /今日新词\s*30\b/.test(todayText));
    await shot("01-today");

    // 2. 学习页：四阶段 + FSRS 评分
    await goto("/learn");
    await waitFor(async () => (await text()).includes("你认识这个单词吗"), "学习卡片出现");
    const firstWord = await cdp.eval("document.querySelector('h3')?.textContent || ''");
    check("学习页出现单词卡", firstWord.length > 1, `word=${firstWord}`);
    const learnText = await text();
    check("学习页主动回忆三个按钮", ["认识", "模糊", "不认识"].every((k) => learnText.includes(k)));
    const totalBefore = Number((learnText.match(/1 \/ (\d+)/) || [])[1]);
    await shot("02-learn-recall");
    check("点击“认识”进入答案阶段", await clickText("button", "认识"));
    await waitFor(async () => (await text()).includes("记忆辅助"), "答案 + 记忆辅助按钮");
    await shot("03-learn-answer");
    await clickText("button", "记忆辅助");
    await waitFor(async () => (await text()).includes("开始评分"), "记忆辅助阶段");
    await clickText("button", "开始评分");
    await waitFor(async () => (await text()).includes("忘了") && (await text()).includes("很熟"), "四档评分按钮");
    const gradeText = await text();
    check("评分按钮包含 Again/Hard/Good/Easy", ["Again", "Hard", "Good", "Easy"].every((k) => gradeText.includes(k)));
    check("评分按钮显示预计间隔", /分钟|小时|天/.test(gradeText));
    await shot("04-learn-grade");
    await clickText("button", "记得");
    const afterOne = await waitFor(async () => {
      const n = await countProgress();
      return n >= 1 ? n : 0;
    }, "写入学习进度", 20000);
    check("评分后写入学习进度", afterOne >= 1, `progress=${afterOne}`);
    await waitFor(async () => (await text()).includes("你认识这个单词吗"), "自动进入下一张卡片");
    const nextWord = await cdp.eval("document.querySelector('h3')?.textContent || ''");
    check("自动切换到下一个新词", nextWord !== firstWord, `${firstWord} -> ${nextWord}`);
    const totalAfter = Number(((await text()).match(/2 \/ (\d+)/) || [])[1]);
    check("新学卡片按 FSRS 学习步在同一组内重现", totalAfter === totalBefore + 1, `${totalBefore} -> ${totalAfter}`);
    await shot("05-learn-next");

    // 3. 复习页：把所有卡片设为到期后进入复习
    const forced = await forceAllDue();
    check("构造到期复习数据", forced >= 1, `rows=${forced}`);
    await goto("/review");
    await waitFor(async () => (await text()).includes("你认识这个单词吗"), "复习卡片出现");
    const reviewText = await text();
    check("复习页显示分类统计", ["到期复习", "遗忘词", "顽固词", "熟词僻义", "真题高频"].every((k) => reviewText.includes(k)));
    const reviewWord = await cdp.eval("document.querySelector('h3')?.textContent || ''");
    await shot("06-review");
    await clickText("button", "认识");
    await waitFor(async () => (await text()).includes("记忆辅助"), "复习：答案阶段");
    await clickText("button", "记忆辅助");
    await waitFor(async () => (await text()).includes("开始评分"), "复习：记忆辅助阶段");
    await clickText("button", "开始评分");
    await waitFor(async () => (await text()).includes("很熟"), "复习：四档评分按钮");
    await clickText("button", "忘了");
    await waitFor(async () => (await text()).includes("本组完成"), "复习：完成本组");
    const summary = (await text()).replace(/\s+/g, " ");
    check("复习完成后显示本组统计", /共 1 张/.test(summary) && /忘记 1 个/.test(summary), summary.slice(0, 70));
    const reviewProgress = await cdp.eval(
      `new Promise((res) => { const r = indexedDB.open("cet-words"); r.onsuccess = () => { const db = r.result; const tx = db.transaction("progress"); const g = tx.objectStore("progress").get(${JSON.stringify(
        reviewWord.toLowerCase(),
      )}); g.onsuccess = () => res(g.result || null); }; })`,
    );
    const dueInHours = reviewProgress ? Math.round((reviewProgress.due - Date.now()) / 3600000) : null;
    check(
      "复习卡评“忘了”按 FSRS 排到次日（lapses+1）",
      !!reviewProgress && reviewProgress.lapses >= 1 && dueInHours > 12 && dueInHours < 48,
      `lapses=${reviewProgress?.lapses} dueIn=${dueInHours}h`,
    );
    const dayStats = await cdp.eval(
      `new Promise((res) => { const d = new Date(); const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); const r = indexedDB.open("cet-words"); r.onsuccess = () => { const db = r.result; const tx = db.transaction("days"); const g = tx.objectStore("days").get(key); g.onsuccess = () => res(g.result || null); }; })`,
    );
    check(
      "学习与复习分别计入今日数据",
      (dayStats?.newWords ?? 0) === 1 && (dayStats?.reviews ?? 0) >= 1,
      JSON.stringify(dayStats),
    );
    await shot("06b-review-graded");

    // 4. 单词本：分类 + 搜索 + 详情
    await goto("/vocabulary");
    await waitFor(async () => (await text()).includes("单词本"), "单词本页面");
    const vocabText = await text();
    check(
      "单词本包含全部分类",
      ["全部单词", "未学习", "学习中", "已掌握", "收藏", "错词", "顽固词", "熟词僻义", "高频词", "真题词"].every((k) =>
        vocabText.includes(k),
      ),
    );
    await shot("07-vocabulary");
    await setInput("input", "significant");
    await waitFor(async () => (await text()).toLowerCase().includes("significant"), "英文搜索");
    check("英文搜索命中 significant", (await text()).toLowerCase().includes("significant"));
    check("点击单词打开详情", await clickText("button.card", "significant"));
    await waitFor(async () => (await text()).includes("学习数据"), "单词详情弹层");
    const detail = await text();
    check("详情包含真题分布/搭配/记忆辅助信息", /真题|搭配|词根/.test(detail) && /(阅读|听力|写作|文本)/.test(detail));
    await shot("08-vocabulary-detail");
    await clickText("button", "关闭");

    // 5. 数据页
    await goto("/stats");
    await waitFor(async () => (await text()).includes("学习数据"), "数据页");
    const statsText = await text();
    check("数据页包含今日/本周/保持率", ["今日学习", "本周学习", "预计记忆保持率", "连续学习", "未来 7 天复习量"].every((k) => statsText.includes(k)));
    check("数据页包含熟词僻义掌握率", statsText.includes("熟词僻义掌握率"));
    await shot("09-stats");

    // 6. 设置页：切换六级并持久化
    await goto("/settings");
    await waitFor(async () => (await text()).includes("考试类型"), "设置页");
    await shot("10-settings");
    check("切换考试类型为 CET-6", await clickText("button", "英语六级"));
    await sleep(800);
    await goto("/settings");
    await waitFor(async () => (await text()).includes("考试类型"), "设置页重载");
    const sixSelected = await cdp.eval(
      `[...document.querySelectorAll("button")].some((b) => b.textContent.includes("英语六级") && b.className.includes("border-indigo-300"))`,
    );
    check("考试类型持久化（重载后仍为六级）", sixSelected);
    await goto("/vocabulary");
    await waitFor(async () => (await text()).includes("单词本"), "六级单词本");
    check("单词本切换为 CET-6 词库", (await text()).includes("CET-6 词库"));
    await shot("11-vocabulary-cet6");

    // 页面级错误
    const realErrors = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
    check("无页面 JS 异常", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
  } catch (err) {
    if (cdpRef) {
      try {
        const body = await cdpRef.eval("document.body.innerText.slice(0, 4000)");
        console.error("\n[诊断] 失败时页面文本:\n" + body);
      } catch {}
      try {
        const { data } = await cdpRef.send("Page.captureScreenshot", { format: "png" });
        const file = path.join(SHOTS, "99-failure.png");
        fs.writeFileSync(file, Buffer.from(data, "base64"));
        console.error("[诊断] 失败截图: " + file);
      } catch {}
      if (errors.length) console.error("[诊断] 页面错误:\n" + errors.slice(0, 10).join("\n"));
    }
    console.error("冒烟测试异常:", err.message);
    process.exitCode = 2;
  } finally {
    try {
      child.kill();
    } catch {}
    try {
      server?.kill();
    } catch {}
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过`);
  console.log(`截图目录: ${SHOTS}`);
  if (failed.length) {
    console.log("失败项:");
    failed.forEach((f) => console.log(" -", f.name, f.extra));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("冒烟测试异常:", err.message);
  process.exit(2);
});
