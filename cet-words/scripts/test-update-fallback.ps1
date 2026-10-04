$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '..\packaging\tools\update.ps1'
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('cet-words-update-test-' + [guid]::NewGuid().ToString('N'))
$testRoot = [IO.Path]::GetFullPath($testRoot)
if (-not $testRoot.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected test path' }
try {
  New-Item -ItemType Directory -Path (Join-Path $testRoot 'install\tools'), (Join-Path $testRoot 'install\app'), (Join-Path $testRoot 'payload') -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination (Join-Path $testRoot 'install\tools\update.ps1')
  Set-Content -LiteralPath (Join-Path $testRoot 'install\version.txt') -Value '1.0.1'
  Set-Content -LiteralPath (Join-Path $testRoot 'payload\server.js') -Value 'test payload'
  Compress-Archive -Path (Join-Path $testRoot 'payload\*') -DestinationPath (Join-Path $testRoot 'app.zip')
  $hash = (Get-FileHash -LiteralPath (Join-Path $testRoot 'app.zip') -Algorithm SHA256).Hash
  $manifest = @{ version = '1.0.2'; url = (Join-Path $testRoot 'app.zip'); sha256 = $hash } | ConvertTo-Json
  Set-Content -LiteralPath (Join-Path $testRoot 'feed.json') -Value $manifest
  @((Join-Path $testRoot 'missing.json'), (Join-Path $testRoot 'feed.json')) | Set-Content -LiteralPath (Join-Path $testRoot 'install\update-config.txt')
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $testRoot 'install\tools\update.ps1')
  if ((Get-Content -LiteralPath (Join-Path $testRoot 'install\version.txt') -Raw).Trim() -ne '1.0.2') { throw 'Fallback update failed' }
  if (-not (Test-Path -LiteralPath (Join-Path $testRoot 'install\app\server.js'))) { throw 'Payload missing' }
  Write-Host 'Fallback update passed'
} finally {
  if ($testRoot -like (Join-Path ([IO.Path]::GetFullPath([IO.Path]::GetTempPath())) 'cet-words-update-test-*')) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
