#!/usr/bin/env node
/**
 * 生成分发产物：
 *   dist/CET-Words-<version>-win64.zip        完整安装包（内置 node 运行时，第一次发给朋友）
 *   dist/update/CET-Words-app-<version>.zip   仅应用负载（自动更新用，体积小）
 *   dist/update/update.json                   更新清单（发布前把 url 改成直链地址）
 *   dist/发布更新说明.txt                     发布步骤说明
 *
 * 用法: node scripts/make-package.mjs [--skip-build]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const skipBuild = process.argv.includes("--skip-build");

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version || "1.0.0";
const date = new Date().toISOString().slice(0, 10);

const NODE_EXE =
  process.env.CET_NODE_EXE || "C:/Users/Lenovo/.cache/nodejs-lts/node.exe";

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) throw new Error(`${cmd} 执行失败（exit ${res.status}）`);
}

function copyDir(src, dest, filter) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (filter && !filter(from, entry)) continue;
    if (entry.isDirectory()) copyDir(from, to, filter);
    else fs.copyFileSync(from, to);
  }
}

/** 写文本文件：统一 CRLF；可选 UTF-8 BOM（PowerShell 5.1 / 记事本友好） */
function writeText(dest, text, { bom = false } = {}) {
  const normalized = text.replace(/\r?\n/g, "\r\n");
  const asciiOnly = /^[\x00-\x7F]*$/.test(normalized);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (asciiOnly && !bom) fs.writeFileSync(dest, normalized, "latin1");
  else fs.writeFileSync(dest, (bom ? "\uFEFF" : "") + normalized, "utf8");
}

function zipDirContents(srcDir, zipPath) {
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  // ZipFile 使用标准相对路径和 UTF-8 文件名；tar.exe 生成的 ./ 前缀会让资源管理器把 ZIP 显示为空。
  sh("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
    path.join(__dirname, "zip-directory.ps1"), "-Source", srcDir, "-Destination", zipPath,
  ]);
}

function readText(rel) {
  return fs.readFileSync(path.join(root, "packaging", rel), "utf8");
}

if (!fs.existsSync(NODE_EXE)) {
  throw new Error(`找不到 node.exe：${NODE_EXE}（可用环境变量 CET_NODE_EXE 指定）`);
}

if (!skipBuild) {
  console.log("→ 构建应用（next build）…");
  sh(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build"], { cwd: root });
}

const standalone = path.join(root, ".next/standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  throw new Error("没有找到 .next/standalone/server.js，请先执行 npm run build");
}

// ---------- 1. 应用负载 ----------
console.log("→ 组装应用负载…");
const payloadApp = path.join(distDir, "_payload", "app");
fs.rmSync(path.join(distDir, "_payload"), { recursive: true, force: true });
copyDir(standalone, payloadApp);
copyDir(path.join(root, ".next/static"), path.join(payloadApp, ".next/static"));
copyDir(path.join(root, "public"), path.join(payloadApp, "public"));

// 许可证与第三方声明必须随程序一起分发（词库数据是 BSD 3-Clause）：
// 放进 app/public 后，安装包与更新负载都会带上它们，应用内也能直接访问
for (const f of ["LICENSE", "THIRD-PARTY-NOTICES.md"]) {
  fs.copyFileSync(path.join(root, f), path.join(payloadApp, "public", f));
}
copyDir(path.join(root, "licenses"), path.join(payloadApp, "public", "licenses"));

// ---------- 2. 自动更新包 ----------
console.log("→ 生成更新包（app 负载 zip）…");
const updateDir = path.join(distDir, "update");
const updateZip = path.join(updateDir, `CET-Words-app-${version}.zip`);
zipDirContents(payloadApp, updateZip);
const sha256 = crypto.createHash("sha256").update(fs.readFileSync(updateZip)).digest("hex").toUpperCase();
const updateSize = fs.statSync(updateZip).size;

// ---------- 3. 完整安装包目录 ----------
console.log("→ 组装完整安装包…");
const fullName = `CET-Words-${version}-win64`;
const fullDir = path.join(distDir, fullName);
fs.rmSync(fullDir, { recursive: true, force: true });
copyDir(payloadApp, path.join(fullDir, "app"));

const nodeDir = path.join(fullDir, "node");
fs.mkdirSync(nodeDir, { recursive: true });
fs.copyFileSync(NODE_EXE, path.join(nodeDir, "node.exe"));
const nodeLicense = path.join(path.dirname(NODE_EXE), "LICENSE");
if (fs.existsSync(nodeLicense)) fs.copyFileSync(nodeLicense, path.join(nodeDir, "LICENSE"));

writeText(path.join(fullDir, "CET Words.vbs"), readText("launcher.vbs"));
writeText(path.join(fullDir, "安装到桌面.cmd"), readText("install.cmd"));
writeText(path.join(fullDir, "卸载快捷方式.cmd"), readText("uninstall.cmd"));
writeText(path.join(fullDir, "使用说明.txt"), readText("使用说明.txt"), { bom: true });
writeText(path.join(fullDir, "update-config.txt"), readText("update-config.txt"), { bom: true });
writeText(path.join(fullDir, "tools/install.ps1"), readText("tools/install.ps1"), { bom: true });
writeText(path.join(fullDir, "tools/uninstall.ps1"), readText("tools/uninstall.ps1"), { bom: true });
writeText(path.join(fullDir, "tools/update.ps1"), readText("tools/update.ps1"), { bom: true });
writeText(path.join(fullDir, "version.txt"), `${version}\n`);
fs.copyFileSync(path.join(root, "cet-words.ico"), path.join(fullDir, "cet-words.ico"));

// 安装包根目录再放一份，方便直接查看
for (const f of ["LICENSE", "THIRD-PARTY-NOTICES.md"]) {
  fs.copyFileSync(path.join(root, f), path.join(fullDir, f));
}
copyDir(path.join(root, "licenses"), path.join(fullDir, "licenses"));

const fullZip = path.join(distDir, `${fullName}.zip`);
zipDirContents(fullDir, fullZip);

// ---------- 4. 更新清单与发布说明 ----------
const manifest = {
  version,
  date,
  url: `https://把这里换成你的直链地址/cet-words/CET-Words-app-${version}.zip`,
  sha256,
  size: updateSize,
  notes: "新增学习数据导入功能，便于迁移到桌面安装版。",
};
writeText(path.join(updateDir, "update.json"), JSON.stringify(manifest, null, 2) + "\n");

const publishGuide = `发布新版本给朋友（以后不用再发安装包）
==================================================

1. 改完代码后运行：  node scripts/make-package.mjs
   （会重新构建、生成完整安装包和更新包）

2. 把 dist/update/ 里的两个文件上传到同一个目录（你的更新源）：
     CET-Words-app-<版本>.zip   应用负载（约 10MB）
     update.json                更新清单
   更新源可以是：GitHub Release 附件 / 阿里云 OSS、腾讯云 COS 等对象存储 /
   自己的服务器 / 局域网共享目录（\\\\电脑名\\共享\\cet-words\\）。

3. 打开 update.json，把 url 改成上面 zip 的【可直链下载地址】，重新上传这个 json。
   注意 sha256 与 size 由脚本自动生成，不要手改，否则客户端会校验失败。

4. 第一次分享：把 dist/${fullName}.zip 发给朋友。
   对方解压后双击「安装到桌面.cmd」完成安装。更新地址已写入安装包。

5. 以后发布新版本：只重复第 1-3 步。朋友下次打开软件时自动更新，不需要再收安装包。

注意事项
--------------------------------------------------
· 版本号在 package.json 的 version 字段，发新版本记得改大（例如 1.0.1、1.1.0），
  否则客户端会认为没有更新。
· 更新只替换 app 目录，node 运行时、快捷方式、学习数据都不动，所以更新包很小。
· 更新失败会自动回退到当前版本，不影响使用；日志在 %TEMP%\\cet-words-update.log。
· 更新在启动前执行，因此替换文件时服务没有在运行，不会出现文件占用问题。
`;
writeText(path.join(distDir, "发布更新说明.txt"), publishGuide, { bom: true });

console.log("");
console.log("完成：");
console.log("  完整安装包（第一次发给朋友）:", fullZip);
console.log("     ", (fs.statSync(fullZip).size / 1024 / 1024).toFixed(1), "MB");
console.log("  更新包（上传到更新源）:", updateZip);
console.log("     ", (updateSize / 1024 / 1024).toFixed(1), "MB  sha256:", sha256.slice(0, 16) + "…");
console.log("  更新清单:", path.join(updateDir, "update.json"));
console.log("  发布步骤:", path.join(distDir, "发布更新说明.txt"));
