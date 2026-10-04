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

  $feeds = @(Get-Content -LiteralPath $configPath -Encoding UTF8 |
    Where-Object { $_.Trim() -ne '' -and -not $_.Trim().StartsWith('#') } |
    ForEach-Object { $_.Trim() })
  if ($feeds.Count -eq 0) { Write-Log 'update feed not configured, skip'; exit 0 }

  $versionFile = Join-Path $root 'version.txt'
  $current = if (Test-Path -LiteralPath $versionFile) { (Get-Content -LiteralPath $versionFile -Raw).Trim() } else { '0.0.0' }
  Write-Log "check update: current=$current feeds=$($feeds.Count)"

  $candidates = @()
  for ($i = 0; $i -lt $feeds.Count; $i++) {
    $feed = $feeds[$i]
    try {
      if ($feed -match '^https?://') {
        $manifest = Invoke-RestMethod -Uri $feed -TimeoutSec 10
      } else {
        $manifest = Get-Content -LiteralPath $feed -Raw -Encoding UTF8 | ConvertFrom-Json
      }
      $latest = [version][string]$manifest.version
      if ($latest -gt [version]$current) {
        $candidates += [pscustomobject]@{ feed = $feed; manifest = $manifest; version = $latest; order = $i }
      }
    } catch {
      Write-Log "feed failed: $feed ($($_.Exception.Message))"
    }
  }
  if ($candidates.Count -eq 0) { Write-Log "already up to date or feeds unavailable ($current)"; exit 0 }

  $zip = $null
  $latest = $null
  foreach ($candidate in @($candidates | Sort-Object @{ Expression = 'version'; Descending = $true }, order)) {
    $url = [string]$candidate.manifest.url
    $download = Join-Path $env:TEMP ("cet-words-app-" + $candidate.version + ".zip")
    try {
      if ($url -match '^https?://') {
        Invoke-WebRequest -Uri $url -OutFile $download -TimeoutSec 180
      } else {
        Copy-Item -LiteralPath $url -Destination $download -Force
      }
      if (-not $candidate.manifest.sha256) { throw 'manifest has no sha256' }
      $hash = (Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToUpper()
      if ($hash -ne ([string]$candidate.manifest.sha256).ToUpper()) { throw "sha256 mismatch (got $hash)" }
      $zip = $download
      $latest = [string]$candidate.version
      Write-Log "new version available: $latest from $($candidate.feed)"
      break
    } catch {
      Write-Log "download failed: $url ($($_.Exception.Message))"
      Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue
    }
  }
  if (-not $zip) { Write-Log 'all update sources failed, keep current version'; exit 0 }

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
