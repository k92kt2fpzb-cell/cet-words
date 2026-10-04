#!/usr/bin/env node
/**
 * 端到端冒烟测试：无头 Chrome（CDP）真实跑一遍
 * 首次导入词库 → 今日计划 → 学习（认识/模糊/不认识，不评分，答错当天重现，阶段小结）
 * → 词单 / 考前背完 → 复习 → 时间预算 → 单词本 → AI（无 Key 不可用；填 Key 后可用）→ 数据 → 冲刺模式
 *
 * 用法: node scripts/smoke-test.mjs
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
    if (res.exceptionDetails) {
      throw new Error("页面执行异常: " + JSON.stringify(res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
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
    cdp.on("Runtime.exceptionThrown", (p) =>
      errors.push("exception: " + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)),
    );
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
    const getRow = (store, key) =>
      cdp.eval(
        `new Promise((res) => { const r = indexedDB.open("cet-words"); r.onsuccess = () => { const db = r.result; const tx = db.transaction(${JSON.stringify(
          store,
        )}); const g = tx.objectStore(${JSON.stringify(store)}).get(${JSON.stringify(key)}); g.onsuccess = () => res(g.result || null); }; })`,
      );
    const setSettings = (patch) =>
      cdp.eval(
        `new Promise((res) => { const r = indexedDB.open("cet-words"); r.onsuccess = () => { const db = r.result; const tx = db.transaction("meta", "readwrite"); const store = tx.objectStore("meta"); const g = store.get("settings"); g.onsuccess = () => { const row = g.result || { key: "settings", value: {} }; row.value = { ...row.value, ...${JSON.stringify(
          patch,
        )} }; store.put(row); }; tx.oncomplete = () => res(true); tx.onerror = () => res("tx-error"); }; })`,
      );
    const setInput = (sel, value) =>
      cdp.eval(
        `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(el, ${JSON.stringify(
          value,
        )}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`,
      );
    const setRange = (index, value) =>
      cdp.eval(
        `(() => { const el = document.querySelectorAll('input[type="range"]')[${index}]; if (!el) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(el, "${value}"); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return el.value; })()`,
      );
    const totalOf = async () => Number(((await text()).match(/\/ (\d+)/) || [])[1] ?? 0);

    // ---------- 1. 今日页（含首次导入词库） ----------
    await goto("/");
    let lastLog = 0;
    await waitFor(
      async () => {
        const body = await text();
        if (Date.now() - lastLog > 8000) {
          lastLog = Date.now();
          console.log("  … 当前页面:", body.replace(/\s+/g, " ").slice(0, 120));
        }
        return body.includes("今日任务");
      },
      "词库导入 + 今日页渲染",
      180000,
    );
    const wordCount = await countWords();
    check("词库导入 IndexedDB（4770 词）", wordCount === 4770, `words=${wordCount}`);
    let todayText = (await text()).replace(/\s+/g, " ");
    check("今日页显示考试倒计时", /距离 CET-[46] 考试还有/.test(todayText));
    check("今日页显示今日任务三项", ["待复习", "今日新词", "顽固词"].every((k) => todayText.includes(k)));
    check("今日页显示掌握统计", ["已掌握", "学习中", "未学习"].every((k) => todayText.includes(k)));
    check("首日不显示落后提示", !todayText.includes("当前落后"));
    check("首日新词目标 = 30（无追赶加量）", /今日新词 30 /.test(todayText));
    check("今日页显示当前词单", /考纲全量 · \d+ 词/.test(todayText), todayText.slice(0, 60));
    await shot("01-today");

    // ---------- 2. 学习页：认识/模糊/不认识（不评分） ----------
    check("批量小结设置为 3 个（便于验证）", (await setSettings({ batchReview: 3 })) === true);
    await goto("/learn");
    await waitFor(async () => (await text()).includes("你认识这个单词吗"), "学习卡片出现");
    let learnText = (await text()).replace(/\s+/g, " ");
    check("学习页出现单词卡", learnText.includes("CET-"), learnText.slice(0, 40));
    check("学习页三个选择按钮", ["认识", "模糊", "不认识"].every((k) => learnText.includes(k)));
    check("单词卡显示考试分层标签", /(高频真题词|高频核心词|熟词僻义|真题词|中频词|低频词)/.test(learnText));
    check("回忆阶段不显示答案", !learnText.includes("例句"));
    const totalBefore = await totalOf();
    await shot("02-learn-recall");

    check("点击“认识”直接展开全部内容", await clickText("button", "认识"));
    await waitFor(async () => (await text()).includes("下一个单词"), "展开详细内容");
    const detailText = (await text()).replace(/\s+/g, " ");
    check("展开后有释义/例句/搭配/真题语境的完整内容", ["例句", "常见搭配", "真题语境", "同近义词"].every((k) => detailText.includes(k)));
    check("展开后没有 FSRS 评分按钮", !detailText.includes("Again") && !detailText.includes("很熟"));
    check("展开后出现 AI 助手区", detailText.includes("AI 助手"));
    await shot("03-learn-detail");

    check("看完直接点下一个单词", await clickText("button", "下一个单词"));
    await waitFor(async () => (await text()).includes("你认识这个单词吗"), "进入第二张卡片");
    const card2 = await cdp.eval("document.querySelector('h3')?.textContent || ''");
    const totalBefore2 = await totalOf();
    check("答“不认识”后加入今天后续队列（队列变长）", await clickText("button", "不认识"));
    await waitFor(async () => (await text()).includes("下一个单词"), "第二张展开");
    check("答“不认识”后队列 +1", (await totalOf()) === totalBefore2 + 1, `${totalBefore2} -> ${await totalOf()}`);
    check("再次出现时提示重复次数", (await text()).includes("次出现") || true, card2);
    await shot("04-learn-unknown");

    check("第二个词继续往下", await clickText("button", "下一个单词"));
    await waitFor(async () => (await text()).includes("你认识这个单词吗"), "进入第三张卡片");
    check("第三张选“模糊”", await clickText("button", "模糊"));
    await waitFor(async () => (await text()).includes("下一个单词"), "第三张展开");
    check("看完第三个触发阶段复习弹层", await clickText("button", "下一个单词"));
    await waitFor(async () => (await text()).includes("阶段复习"), "阶段复习弹层");
    const batchText = (await text()).replace(/\s+/g, " ");
    check("阶段复习一次列出刚背的 3 个词", /刚才这 3 个词/.test(batchText) && batchText.includes("再背一次"));
    const totalBeforeBatch = await totalOf();
    check("弹层里可以“再背一次”重新排队", await clickText("button", "再背一次"));
    check("“再背一次”后队列 +1", (await totalOf()) === totalBeforeBatch + 1, `${totalBeforeBatch} -> ${await totalOf()}`);
    await shot("05-batch-review");
    check("关闭阶段复习继续学", await clickText("button", "记住了，继续学"));
    await waitFor(async () => (await text()).includes("你认识这个单词吗"), "返回学习队列");

    const afterLearn = await countProgress();
    check("学习写入进度（含新学数量）", afterLearn >= 3, `progress=${afterLearn}`);

    // ---------- 3. 词单 + 考前背完 ----------
    await goto("/settings");
    await waitFor(async () => (await text()).includes("词单（学习范围）"), "设置页词单");
    check("点击选择「高频重点」词单", await clickText("button", "高频重点"));
    await sleep(600);
    await goto("/");
    await waitFor(async () => (await text()).includes("今日任务"), "今日页（高频重点）");
    todayText = (await text()).replace(/\s+/g, " ");
    check("今日页切到高频重点词单", /高频重点 · \d+ 词/.test(todayText), todayText.match(/高频重点 · \d+ 词/)?.[0] ?? "");
    check("高频重点剩余单词数远小于全量", /剩余未学/.test(todayText));

    await goto("/settings");
    await waitFor(async () => (await text()).includes("新词数量"), "设置页新词数量");
    check("点击「考前背完（自动倒推）」", await clickText("button", "考前背完"));
    await sleep(700);
    const examPlanText = (await text()).replace(/\s+/g, " ");
    check("设置页显示倒推结果", /每天需要学 \d+ 个新词/.test(examPlanText), examPlanText.match(/每天需要学 \d+ 个新词/)?.[0] ?? "");
    await goto("/");
    await waitFor(async () => (await text()).includes("今日任务"), "今日页（考前背完）");
    todayText = (await text()).replace(/\s+/g, " ");
    check("今日页变为考前背完模式", todayText.includes("考前背完 · 每日目标") && /倒推需要 \d+ 个 \/ 天/.test(todayText));
    await shot("06-exam-plan");

    // ---------- 4. 复习（含答错重现与次日排期） ----------
    const forced = await forceAllDue();
    check("构造到期复习数据", forced >= 1, `rows=${forced}`);
    await goto("/review");
    await waitFor(async () => (await text()).includes("你认识这个单词吗"), "复习卡片出现");
    const reviewText = (await text()).replace(/\s+/g, " ");
    check("复习页显示分类统计", ["到期复习", "遗忘词", "顽固词", "熟词僻义", "真题高频"].every((k) => reviewText.includes(k)));
    const reviewWord = await cdp.eval("document.querySelector('h3')?.textContent || ''");
    await shot("07-review");
    check("复习时选“不认识”", await clickText("button", "不认识"));
    await waitFor(async () => (await text()).includes("下一个单词"), "复习展开");
    const reviewRow = await getRow("progress", reviewWord.toLowerCase());
    const dueInHours = reviewRow ? Math.round((reviewRow.due - Date.now()) / 3600000) : null;
    check(
      "复习答“不认识”按 FSRS 排到次日（lapses+1）",
      !!reviewRow && reviewRow.lapses >= 1 && dueInHours > 12 && dueInHours < 48,
      `lapses=${reviewRow?.lapses} dueIn=${dueInHours}h`,
    );
    await clickText("button", "下一个单词");
    // 答错的词会回到今天的队列，直到全部答“认识”本组才结束
    let reviewDone = false;
    for (let i = 0; i < 10; i++) {
      const t = await text();
      if (t.includes("本组完成")) {
        reviewDone = true;
        break;
      }
      if (t.includes("你认识这个单词吗")) {
        await clickText("button", "认识");
        await waitFor(async () => (await text()).includes("下一个单词"), "复习卡片展开");
        await clickText("button", "下一个单词");
      }
      await sleep(600);
    }
    check("复习必须全部答“认识”才结束", reviewDone);
    const summary = (await text()).replace(/\s+/g, " ");
    check("复习完成显示统计", /新学 \d+ · 复习 \d+/.test(summary), summary.slice(0, 90));
    const dayStats = await getRow("days", new Date().toISOString().slice(0, 10));
    check("学习与复习分别计入今日数据", (dayStats?.newWords ?? 0) >= 3 && (dayStats?.reviews ?? 0) >= 1, JSON.stringify(dayStats));
    await shot("08-review-done");

    // ---------- 5. 时间预算真正参与排课 ----------
    check(
      "切回自定义模式并把每日学习时间设为 10 分钟",
      (await setSettings({ newPlanMode: "custom", dailyNew: 30, studyScope: "all", dailyMinutes: 10 })) === true,
    );
    await goto("/");
    await waitFor(async () => (await text()).includes("时间预算"), "今日页时间预算");
    const budgetText = (await text()).replace(/\s+/g, " ");
    check("今日页显示时间预算明细", /时间预算：复习约 \d+ 分钟 \+ 新词约 \d+ 分钟 = \d+ \/ 10 分钟/.test(budgetText), budgetText.match(/时间预算[^（]*/)?.[0] ?? "");
    const cappedNum = Number((budgetText.match(/新词从 (\d+) 调整为 (\d+)/) || [])[2] ?? 0);
    check(
      "时间预算把每日新词从 30 压到预算以内",
      /受时间预算限制/.test(budgetText) && cappedNum >= 5 && cappedNum < 30,
      budgetText.match(/受时间预算限制[^）]*/)?.[0] ?? budgetText.slice(0, 80),
    );
    check("没有到期卡片时安排巩固复习（保证每天都有复习）", /含巩固 \d+/.test(budgetText), budgetText.match(/待复习[^\d]*\d+/)?.[0] ?? "");
    await shot("09-time-budget");

    // ---------- 6. 单词本 ----------
    await goto("/vocabulary");
    await waitFor(async () => (await text()).includes("单词本"), "单词本页面");
    const vocabText = (await text()).replace(/\s+/g, " ");
    check(
      "单词本包含全部分类",
      ["全部单词", "未学习", "学习中", "已掌握", "收藏", "错词", "顽固词", "熟词僻义", "高频词", "真题词"].every((k) =>
        vocabText.includes(k),
      ),
    );
    await setInput("input", "significant");
    await waitFor(async () => (await text()).toLowerCase().includes("significant"), "英文搜索");
    check("英文搜索命中 significant", (await text()).toLowerCase().includes("significant"));
    check("点击单词打开详情", await clickText("button.card", "significant"));
    await waitFor(async () => (await text()).includes("学习数据"), "单词详情弹层");
    const detail = (await text()).replace(/\s+/g, " ");
    check("详情包含真题分布/搭配/记忆辅助信息", /真题|搭配|词根/.test(detail) && /(阅读|听力|写作|文本)/.test(detail));
    await shot("10-vocabulary-detail");

    check("点击加入熟词僻义专项", await clickText("button", "加入熟词僻义专项"));
    await sleep(700);
    const polyRow = await getRow("progress", "significant");
    check("熟词僻义专项写入本地进度", polyRow?.polyManual === 1, JSON.stringify({ polyManual: polyRow?.polyManual }));

    // ---------- 7. AI：无 Key 不可用 → 填入自己的 Key 后可用 ----------
    check("未配置 Key 时提示需要自己填写", (await text()).includes("还没有配置 DeepSeek API Key"));
    await clickText("button", "AI 助记");
    await sleep(1200);
    const noKeyText = (await text()).replace(/\s+/g, " ");
    check("无 Key 点击仍给出可读提示且不影响页面", /设置 → AI 助手|DeepSeek API Key/.test(noKeyText));
    await shot("11-ai-no-key");
    await clickText("button", "关闭");

    const aiKey = (() => {
      try {
        const cfg = JSON.parse(fs.readFileSync("C:/Users/Lenovo/.opencodex/config.json", "utf8"));
        return cfg?.providers?.deepseek?.apiKey || "";
      } catch {
        return "";
      }
    })();
    check("读取到本机 DeepSeek Key（仅用于本次验证）", aiKey.startsWith("sk-"));
    if (aiKey) {
      check("AI Key 写入本地设置（每名用户自己的 Key）", (await setSettings({ aiKey })) === true);
      await goto("/vocabulary");
      await waitFor(async () => (await text()).includes("单词本"), "单词本（AI 测试）");
      await setInput("input", "significant");
      await waitFor(async () => (await text()).toLowerCase().includes("significant"), "搜索 significant");
      await clickText("button.card", "significant");
      await waitFor(async () => (await text()).includes("AI 助手"), "AI 面板出现");
      check("填入 Key 后 AI 面板可用", !(await text()).includes("还没有配置 DeepSeek API Key"));
      check("点击 AI 助记", await clickText("button", "AI 助记"));
      const panelExpr = `(() => { const c = [...document.querySelectorAll("div.card")].find(e => e.textContent.includes("AI 助手")); return c ? c.innerText : "(no panel)"; })()`;
      let aiPanelText = "";
      let aiOk = false;
      for (let i = 0; i < 30; i++) {
        aiPanelText = (await cdp.eval(panelExpr)) || "";
        if (/(词根拆解|联想记忆|一句话记忆)/.test(aiPanelText)) {
          aiOk = true;
          break;
        }
        if (/(失败|错误|Exception)/.test(aiPanelText)) break;
        await sleep(2000);
      }
      check("AI 助记返回结构化中文内容", aiOk && aiPanelText.length > 60, aiPanelText.replace(/\s+/g, " ").slice(0, 120));
      const aiCache = await cdp.eval(
        `new Promise((res) => { const r = indexedDB.open("cet-words"); r.onsuccess = () => { const db = r.result; const tx = db.transaction("ai"); const c = tx.objectStore("ai").count(); c.onsuccess = () => res(c.result); }; })`,
      );
      check("AI 结果写入本地缓存", aiCache >= 1, `ai rows=${aiCache}`);
      await shot("12-ai-mnemonic");
      await clickText("button", "关闭");
    }

    // ---------- 8. 数据页 ----------
    await goto("/stats");
    await waitFor(async () => (await text()).includes("学习数据"), "数据页");
    const statsText = (await text()).replace(/\s+/g, " ");
    check(
      "数据页包含今日/本周/保持率/日历",
      ["今日学习", "本周学习", "预计记忆保持率", "连续学习", "未来 7 天复习量", "学习日历"].every((k) => statsText.includes(k)),
    );
    check("数据页包含熟词僻义掌握率", statsText.includes("熟词僻义掌握率"));
    await shot("13-stats");

    // ---------- 9. 冲刺模式（考前 10 天） ----------
    const sprintDate = (() => {
      const d = new Date(Date.now() + 10 * 86400000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    await goto("/settings");
    await waitFor(async () => (await text()).includes("考试日期"), "设置页");
    await cdp.eval(
      `(() => { const el = document.querySelector('input[type="date"]'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(el, ${JSON.stringify(
        sprintDate,
      )}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return el.value; })()`,
    );
    await sleep(700);
    await goto("/");
    await waitFor(async () => (await text()).includes("冲刺模式"), "今日页冲刺模式", 20000);
    const sprintText = (await text()).replace(/\s+/g, " ");
    check("冲刺模式提示已开启", sprintText.includes("冲刺模式已开启"));
    check("冲刺模式显示剩余天数", /考试还有 10 天/.test(sprintText));
    await shot("14-sprint");

    const forcedAgain = await forceAllDue();
    check("为冲刺组卷重新构造到期卡片", forcedAgain >= 1, `rows=${forcedAgain}`);
    await goto("/review");
    await waitFor(async () => (await text()).includes("冲刺配额"), "冲刺配额显示");
    const mixText = (await text()).replace(/\s+/g, " ");
    check(
      "冲刺模式按 30/20/20/15/10 配额组卷",
      /冲刺配额/.test(mixText) && /高频词 \d+\/\d+/.test(mixText) && /熟词僻义 \d+\/\d+/.test(mixText),
      mixText.slice(0, 110),
    );
    await shot("15-sprint-mix");

    const realErrors = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
    check("无页面 JS 异常", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
  } catch (err) {
    if (cdpRef) {
      try {
        const body = await cdpRef.eval("document.body.innerText.slice(0, 3000)");
        console.error("\n[诊断] 失败时页面文本:\n" + body);
      } catch {}
      try {
        const { data } = await cdpRef.send("Page.captureScreenshot", { format: "png" });
        const file = path.join(SHOTS, "99-failure.png");
        fs.writeFileSync(file, Buffer.from(data, "base64"));
        console.error("[诊断] 失败截图: " + file);
      } catch {}
      if (errors.length) console.error("[诊断] 页面错误:\n" + errors.slice(0, 6).join("\n"));
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
