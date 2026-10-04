param(
  [string]$KeyPath = '',
  [string]$Server = '139.196.198.4',
  [string]$User = 'root'
)

$ErrorActionPreference = 'Stop'
if (-not $KeyPath) { $KeyPath = Join-Path $env:USERPROFILE '.ssh\cet_words_deploy' }
$sshDir = Split-Path -Parent $KeyPath
if (-not (Test-Path -LiteralPath $sshDir)) { New-Item -ItemType Directory -Force -Path $sshDir | Out-Null }

if (Test-Path -LiteralPath $KeyPath) {
  Write-Host "[已存在] $KeyPath（要重新生成请先删除该文件）" -ForegroundColor Yellow
} else {
  # 用 cmd 调用，避免 PowerShell 5.1 丢掉空字符串参数（-N "" 表示不设密码，便于自动化部署）
  & cmd.exe /c "ssh-keygen -t ed25519 -f `"$KeyPath`" -N `"\`"`" -C cet-words-deploy"
  if (-not (Test-Path -LiteralPath $KeyPath)) { throw '密钥生成失败' }
  Write-Host "[完成] 已生成部署密钥：$KeyPath" -ForegroundColor Green
}

Write-Host ""
Write-Host "接下来把下面这一行整行复制到 PowerShell 执行一次（会提示输入服务器密码）：" -ForegroundColor Cyan
Write-Host ""
Write-Host "type `"$KeyPath.pub`" | ssh $User@$Server `"mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`""
Write-Host ""
Write-Host "（也可以把下面这行公钥贴到阿里云控制台的密钥对里）" -ForegroundColor DarkGray
Get-Content -LiteralPath "$KeyPath.pub"
