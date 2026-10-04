#!/usr/bin/env node
/**
 * 一键发布到 GitHub：
 *   1) 构建 + 打包，并把 update.json 的下载地址写成 GitHub Pages 的公网地址
 *   2) 把代码推到主分支（main）
 *   3) 用独立的 feed 分支（orphan，强制推送，只保留 1 个提交）承载更新源文件
 *      —— 这样仓库不会因为每个版本的 zip 越来越大
 *   4) 校验 Pages 上的 update.json 是否可访问（首次需要你在 GitHub 上开启 Pages）
 *
 * 配置：github.config.json（已被 .gitignore 忽略）
 * 用法: node scripts/publish-github.mjs [--skip-build]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const skipBuild = process.argv.includes("--skip-build");

const cfgPath = path.join(root, "github.config.json");
if (!fs.existsSync(cfgPath)) {
  console.error("缺少 github.config.json：请复制 github.config.example.json 并填写。");
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
for (const k of ["repo", "publicBaseUrl"]) {
  if (!cfg[k]) {
    console.error(`github.config.json 缺少字段：${k}`);
    process.exit(1);
  }
}
const feedBranch = cfg.feedBranch || "feed";
const mainBranch = cfg.mainBranch || "main";
const sshCmd = [
  "ssh",
  cfg.keyPath ? `-i "${cfg.keyPath}"` : "",
  "-o IdentitiesOnly=yes",
  "-o StrictHostKeyChecking=accept-new",
]
  .filter(Boolean)
  .join(" ");

function run(cmd, args, opts = {}) {
  console.log("  $", cmd, args.join(" "));
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, GIT_SSH_COMMAND: sshCmd, ...(opts.env || {}) },
    ...opts,
  });
  if (res.status !== 0 && !opts.allowFail) throw new Error(`${cmd} 失败（exit ${res.status}）`);
  return res.status;
}

const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const zipName = `CET-Words-app-${version}.zip`;
const publicBase = cfg.publicBaseUrl.replace(/\/+$/, "");

// ---------- 1. 打包 ----------
if (!skipBuild) {
  console.log("① 构建并打包…");
  run(process.execPath, [path.join(root, "scripts", "make-package.mjs")], { timeout: 0 });
} else {
  console.log("① 跳过构建（--skip-build）");
}

const updateDir = path.join(root, "dist", "update");
const zipPath = path.join(updateDir, zipName);
const manifestPath = path.join(updateDir, "update.json");
if (!fs.existsSync(zipPath)) {
  console.error("找不到更新包，请先执行 node scripts/make-package.mjs");
  process.exit(1);
}

console.log("② 写入更新源地址…");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.url = `${publicBase}/${zipName}`;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("   ", manifest.url);

// ---------- 2. 推送代码 ----------
console.log("③ 推送代码到 GitHub…");
const remotes = spawnSync("git", ["remote"], { cwd: root, encoding: "utf8" }).stdout || "";
if (!remotes.split(/\r?\n/).includes("origin")) {
  run("git", ["remote", "add", "origin", cfg.repo]);
} else {
  run("git", ["remote", "set-url", "origin", cfg.repo]);
}
run("git", ["push", "-u", "origin", `HEAD:${mainBranch}`]);

// ---------- 3. 生成并推送更新源分支 ----------
console.log(`④ 刷新更新源分支 ${feedBranch}…`);
const feedDir = path.join(os.tmpdir(), `cet-words-feed-${version}`);
fs.rmSync(feedDir, { recursive: true, force: true });
fs.mkdirSync(feedDir, { recursive: true });
fs.copyFileSync(zipPath, path.join(feedDir, zipName));
fs.copyFileSync(manifestPath, path.join(feedDir, "update.json"));
fs.writeFileSync(
  path.join(feedDir, "index.html"),
  `<!doctype html>
<meta charset="utf-8">
<title>CET Words 更新源</title>
<h1>CET Words 更新源</h1>
<p>当前版本：<b>${version}</b>（${new Date().toISOString().slice(0, 10)}）</p>
<p>客户端更新地址：<code>${publicBase}/update.json</code></p>
<p><a href="./${zipName}">下载应用负载 ${zipName}</a></p>
<p>完整安装包请在仓库的 Releases 或对话记录里获取。</p>
`,
);
run("git", ["init", "-q", "-b", feedBranch], { cwd: feedDir });
run("git", ["add", "-A"], { cwd: feedDir });
run("git", ["-c", "user.name=CET Words", "-c", "user.email=noreply@localhost", "commit", "-q", "-m", `feed ${version}`], {
  cwd: feedDir,
});
run("git", ["push", "-f", cfg.repo, `HEAD:${feedBranch}`], { cwd: feedDir, timeout: 0 });

// ---------- 4. 校验 ----------
console.log("⑤ 校验公网更新源…");
try {
  const res = await fetch(`${publicBase}/update.json?t=${Date.now()}`, { cache: "no-store" });
  if (res.ok) {
    const remote = await res.json();
    const ok = String(remote.version) === version;
    console.log(`   update.json 可访问 ✓ version=${remote.version}${ok ? "" : "（与本地不一致，稍等 Pages 构建）"}`);
  } else {
    console.log(`   update.json 返回 HTTP ${res.status}：如果这是首次发布，去仓库 Settings → Pages ` +
      `把 Source 设为 “Deploy from a branch”，分支选 ${feedBranch}、目录选 / (root)，保存后再跑一次本脚本。`);
  }
} catch (err) {
  console.log("   校验失败：", err.message);
}

console.log("");
console.log(`代码已推送 ✅  更新源分支 ${feedBranch} 已刷新（版本 ${version}）`);
console.log(`朋友端的更新地址：${publicBase}/update.json`);
