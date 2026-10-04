param(
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logFile = Join-Path $env:TEMP 'cet-words-update.log'

function Write-Log([string]$text) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $text
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
  if (-not $Quiet) { Write-Host $text }
}

try {
  $configPath = Join-Path $root 'update-config.txt'
  if (-not (Test-Path -LiteralPath $configPath)) { Write-Log 'no update-config.txt, skip'; exit 0 }

  $feed = Get-Content -LiteralPath $configPath -Encoding UTF8 |
    Where-Object { $_.Trim() -ne '' -and -not $_.Trim().StartsWith('#') } |
    Select-Object -First 1
  if (-not $feed) { Write-Log 'update feed not configured, skip'; exit 0 }
  $feed = $feed.Trim()

  $versionFile = Join-Path $root 'version.txt'
  $current = if (Test-Path -LiteralPath $versionFile) { (Get-Content -LiteralPath $versionFile -Raw).Trim() } else { '0.0.0' }
  Write-Log "check update: current=$current feed=$feed"

  $manifest = $null
  if ($feed -match '^https?://') {
    $manifest = Invoke-RestMethod -Uri $feed -TimeoutSec 10
  } elseif (Test-Path -LiteralPath $feed) {
    $manifest = Get-Content -LiteralPath $feed -Raw -Encoding UTF8 | ConvertFrom-Json
  } else {
    Write-Log "feed not reachable: $feed"; exit 0
  }

  $latest = [string]$manifest.version
  if ([string]::IsNullOrWhiteSpace($latest)) { Write-Log 'manifest has no version, skip'; exit 0 }
  if ([version]$latest -le [version]$current) { Write-Log "already up to date ($current)"; exit 0 }
  Write-Log "new version available: $latest (current $current)"

  $zip = Join-Path $env:TEMP ("cet-words-app-" + $latest + ".zip")
  $url = [string]$manifest.url
  if ($url -match '^https?://') {
    Invoke-WebRequest -Uri $url -OutFile $zip -TimeoutSec 180
  } elseif (Test-Path -LiteralPath $url) {
    Copy-Item -LiteralPath $url -Destination $zip -Force
  } else {
    Write-Log "payload not reachable: $url"; exit 0
  }

  if ($manifest.sha256) {
    # 用 .NET 直接算 SHA256（不依赖 PowerShell 模块，避免某些精简系统缺少 Get-FileHash）
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($zip)
    $hash = ($sha.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) -join ''
    $stream.Close()
    $sha.Dispose()
    $hash = $hash.ToUpper()
    if ($hash -ne ([string]$manifest.sha256).ToUpper()) {
      Write-Log "sha256 mismatch, abort (got $hash)"; exit 1
    }
  }

  $stage = Join-Path $root 'app.new'
  $backup = Join-Path $root 'app.old'
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }

  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  & tar.exe -x -f $zip -C $stage
  if ($LASTEXITCODE -ne 0) { throw "extract failed (tar exit $LASTEXITCODE)" }
  if (-not (Test-Path -LiteralPath (Join-Path $stage 'server.js'))) {
    Write-Log 'downloaded package is invalid (no server.js), abort'
    Remove-Item -LiteralPath $stage -Recurse -Force
    exit 1
  }

  Rename-Item -LiteralPath (Join-Path $root 'app') -NewName 'app.old'
  Rename-Item -LiteralPath $stage -NewName 'app'
  Set-Content -LiteralPath $versionFile -Value $latest -Encoding ASCII
  Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
  Write-Log "updated to $latest"
  exit 0
} catch {
  Write-Log ("update failed: " + $_.Exception.Message)
  exit 0
}
