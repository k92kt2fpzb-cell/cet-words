# 在桌面和开始菜单创建 CET Words 快捷方式（指向 CET Words.vbs，使用 cet-words.ico 图标）
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vbs = Join-Path $root 'CET Words.vbs'
$ico = Join-Path $root 'cet-words.ico'

if (-not (Test-Path -LiteralPath $vbs)) { throw "missing launcher: $vbs" }
if (-not (Test-Path -LiteralPath $ico)) { throw "missing icon: $ico" }

$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'CET Words.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'CET Words.lnk')
)

$ws = New-Object -ComObject WScript.Shell
foreach ($lnkPath in $targets) {
  $lnk = $ws.CreateShortcut($lnkPath)
  $lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $lnk.Arguments = '"' + $vbs + '"'
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = $ico + ',0'
  $lnk.Description = 'CET Words · 四六级智能背单词'
  $lnk.WindowStyle = 1
  $lnk.Save()
  Write-Output ("created: " + $lnkPath)
}
