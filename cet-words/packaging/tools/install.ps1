param(
  [string]$Name = 'CET Words',
  [string]$TargetDir = '',
  [string]$IconPath = '',
  [switch]$DesktopOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $TargetDir) { $TargetDir = $root }
$vbs = Join-Path $TargetDir 'CET Words.vbs'
if (-not $IconPath) { $IconPath = Join-Path $TargetDir 'cet-words.ico' }

if (-not (Test-Path -LiteralPath $vbs)) {
  Write-Host "[错误] 没找到启动器：$vbs" -ForegroundColor Red
  Write-Host "请确认压缩包已经完整解压（不要在压缩包里直接运行）。" -ForegroundColor Red
  exit 1
}

$targets = @(Join-Path ([Environment]::GetFolderPath('Desktop')) "$Name.lnk")
if (-not $DesktopOnly) {
  $targets += Join-Path ([Environment]::GetFolderPath('Programs')) "$Name.lnk"
}

$ws = New-Object -ComObject WScript.Shell
foreach ($lnkPath in $targets) {
  $lnk = $ws.CreateShortcut($lnkPath)
  $lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $lnk.Arguments = '"' + $vbs + '"'
  $lnk.WorkingDirectory = $TargetDir
  if (Test-Path -LiteralPath $IconPath) { $lnk.IconLocation = $IconPath + ',0' }
  $lnk.Description = 'CET Words · 四六级智能背单词'
  $lnk.WindowStyle = 1
  $lnk.Save()
  Write-Host "[完成] 已创建快捷方式：$lnkPath" -ForegroundColor Green
}

Write-Host ""
Write-Host "安装完成！以后双击桌面上的「CET Words」图标即可使用。" -ForegroundColor Cyan
Write-Host "第一次打开会花几秒钟导入词库，之后就是秒开。"
Write-Host "想固定到任务栏：右键桌面图标 → 固定到任务栏。"
Write-Host "卸载：双击本目录下的「卸载快捷方式.cmd」，再删除整个文件夹即可。"
Write-Host ""
