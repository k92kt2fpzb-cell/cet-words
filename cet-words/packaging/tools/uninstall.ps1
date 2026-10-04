param(
  [string]$Name = 'CET Words'
)

$ErrorActionPreference = 'Stop'
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) "$Name.lnk"),
  (Join-Path ([Environment]::GetFolderPath('Programs')) "$Name.lnk")
)

foreach ($lnkPath in $targets) {
  if (Test-Path -LiteralPath $lnkPath) {
    Remove-Item -LiteralPath $lnkPath -Force
    Write-Host "[完成] 已删除快捷方式：$lnkPath" -ForegroundColor Green
  } else {
    Write-Host "[跳过] 不存在：$lnkPath"
  }
}

Write-Host ""
Write-Host "快捷方式已清理。学习数据保存在浏览器本地，删除文件夹不会影响浏览器里的数据；" -ForegroundColor Cyan
Write-Host "如果彻底不用了，可以再删除整个程序文件夹。"
Write-Host ""
