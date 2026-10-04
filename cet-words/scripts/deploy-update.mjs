#!/usr/bin/env node
/**
 * 一键上线：把新版本发布到服务器，朋友下次打开自动更新。
 *   1) 构建 + 打包（完整包 + 更新包 + update.json）
 *   2) 把 update.json 的 url 改成公网直链
 *   3) scp 上传到服务器（配了密钥就免密；没配会提示输入密码）
 *   4) 从公网地址拉回 update.json / zip 校验版本与 sha256（真正的上线验证）
 *
 * 用法: node scripts/deploy-update.mjs [--skip-build]
 * 配置: deploy.config.json（照着 deploy.config.example.json 改，已被 .gitignore 忽略）
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const skipBuild = process.argv.includes("--skip-build");

const cfgPath = path.join(root, "deploy.config.json");
if (!fs.existsSync(cfgPath)) {
  console.error("缺少 deploy.config.json：请复制 deploy.config.example.json 并填写服务器信息。");
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const nonInteractive = process.argv.includes("--non-interactive");
for (const key of ["host", "user", "remoteDir", "publicBaseUrl"]) {
  if (!cfg[key]) {
    console.error(`deploy.config.json 缺少字段：${key}`);
    process.exit(1);
  }
}

const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const zipName = `CET-Words-app-${version}.zip`;
const updateDir = path.join(root, "dist", "update");
const zipPath = path.join(updateDir, zipName);
const manifestPath = path.join(updateDir, "update.json");
const remoteBase = cfg.remoteDir.replace(/\/+$/, "");
const publicBase = cfg.publicBaseUrl.replace(/\/+$/, "");
// 三种发布方式：
//   ssh  —— 有服务器：scp 上传（配了密钥就免密）
//   oss  —— 对象存储：用本机已配置好的 ossutil 上传（阿里云 OSS / 腾讯云 COS 都提供兼容工具）
//   manual —— 只生成文件，自己拖到任意直链托管（网盘直链/网页控制台上传等）
const kind = cfg.kind || "ssh";

function run(cmd, args, { allowFail = false, timeoutMs = Number(process.env.CET_DEPLOY_TIMEOUT_MS || 300000) } = {}) {
  console.log("  $", cmd, args.join(" "));
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    timeout: timeoutMs,
  });
  if (res.status !== 0 && !allowFail) throw new Error(`${cmd} 失败（exit ${res.status}）`);
  return res.status;
}

// ---------- 1. 打包 ----------
if (!skipBuild) {
  console.log("① 构建并打包…");
  run(process.execPath, [path.join(root, "scripts", "make-package.mjs")], { timeoutMs: 0 });
} else {
  console.log("① 跳过构建（--skip-build）");
}
if (!fs.existsSync(zipPath)) {
  console.error(`找不到更新包：${zipPath}（先执行 node scripts/make-package.mjs）`);
  process.exit(1);
}

// ---------- 2. 写上公网地址 ----------
console.log("② 生成公网更新清单…");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.url = `${publicBase}/${zipName}`;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("   url =", manifest.url);

// ---------- 3. 上传 ----------
if (kind === "manual") {
  console.log("③ 只生成文件（manual 模式）：请把下面两个文件上传到你的更新源目录");
  console.log("   ", zipPath);
  console.log("   ", manifestPath);
  console.log("   更新源目录对应公网地址：", publicBase);
} else if (kind === "oss") {
  console.log("③ 上传到对象存储（ossutil）…");
  if (!cfg.ossPrefix) {
    console.error("oss 模式需要在 deploy.config.json 里配置 ossPrefix，例如 oss://cet-words/cet-words");
    process.exit(1);
  }
  const prefix = String(cfg.ossPrefix).replace(/\/+$/, "");
  run("ossutil", ["cp", "-f", zipPath, `${prefix}/${zipName}`], { timeoutMs: 0 });
  run("ossutil", ["cp", "-f", manifestPath, `${prefix}/update.json`], { timeoutMs: 0 });
} else {
  console.log("③ 上传到服务器（ssh/scp）…");
const common = ["-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=20"];
if (cfg.keyPath) common.push("-i", cfg.keyPath, "-o", "IdentitiesOnly=yes");
if (nonInteractive) common.push("-o", "BatchMode=yes");
const target = `${cfg.user}@${cfg.host}`;
const sshPort = cfg.port ? ["-p", String(cfg.port)] : [];
const scpPort = cfg.port ? ["-P", String(cfg.port)] : [];

run("ssh.exe", [...common, ...sshPort, target, `mkdir -p ${remoteBase} && chmod 755 ${remoteBase}`]);
run("scp.exe", [...common, ...scpPort, zipPath, manifestPath, `${target}:${remoteBase}/`]);
run("ssh.exe", [...common, ...sshPort, target, `chmod 644 ${remoteBase}/* && ls -l ${remoteBase}`]);
}

// ---------- 4. 公网校验 ----------
console.log("④ 公网校验（模拟客户端更新）…");
let ok = true;
try {
  const res = await fetch(`${publicBase}/update.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const remote = await res.json();
  const sameVersion = String(remote.version) === String(version);
  const sameSha = String(remote.sha256 || "").toUpperCase() === String(manifest.sha256).toUpperCase();
  console.log(`   update.json: version=${remote.version}（本地 ${version}） sha256 ${sameSha ? "一致" : "不一致"}`);
  if (!sameVersion || !sameSha) ok = false;

  const ranged = await fetch(remote.url, { headers: { Range: "bytes=0-1023" } });
  console.log(`   zip 可下载: HTTP ${ranged.status}（${ranged.headers.get("content-length") || "?"} 字节首段）`);
  if (!(ranged.status === 200 || ranged.status === 206)) ok = false;
} catch (err) {
  console.error("   公网校验失败：", err.message);
  ok = false;
}

console.log("");
if (ok) {
  console.log(`上线成功 ✅  版本 ${version}`);
  console.log(`朋友们的更新源：${publicBase}/update.json`);
  console.log("他们下次打开软件就会自动更新到这一版。");
} else {
  console.log("上线未通过校验 ❌ 请检查服务器目录是否可公开访问（或路径/权限）。");
  process.exit(1);
}
