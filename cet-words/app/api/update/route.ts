import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 手动检查更新：调用安装目录里的 tools/update.ps1（仅免安装版可用） */
export async function POST() {
  if (process.env.CET_DESKTOP === "1") {
    return NextResponse.json({ ok: true, message: "桌面安装版请使用新版安装包升级。" });
  }
  const root = path.resolve(process.cwd(), "..");
  const script = path.join(root, "tools", "update.ps1");
  const versionFile = path.join(root, "version.txt");
  const readVersion = () => {
    try {
      return fs.readFileSync(versionFile, "utf8").trim();
    } catch {
      return null;
    }
  };

  const before = readVersion();
  if (!fs.existsSync(script)) {
    return NextResponse.json({
      ok: false,
      dev: true,
      current: before,
      message: "当前是开发环境（没有 tools/update.ps1），在线更新只在安装版里可用。",
    });
  }

  const out = await new Promise<string>((resolve) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
      { windowsHide: true },
    );
    let text = "";
    child.stdout.on("data", (d) => (text += d.toString()));
    child.stderr.on("data", (d) => (text += d.toString()));
    child.on("close", () => resolve(text));
    setTimeout(() => child.kill(), 240000);
  });

  const after = readVersion();
  const updated = Boolean(before && after && before !== after);
  const lastLine = out.split(/\r?\n/).filter(Boolean).pop() || "";
  return NextResponse.json({
    ok: true,
    current: after ?? before,
    previous: before,
    updated,
    message: updated
      ? `已更新到 ${after}，请关闭窗口后重新双击桌面图标即可使用新版本。`
      : lastLine || "已是最新版本（或未配置更新源）。",
  });
}
