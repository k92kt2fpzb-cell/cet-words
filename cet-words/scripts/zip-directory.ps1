param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourcePath = (Resolve-Path -LiteralPath $Source).ProviderPath
$destinationPath = [System.IO.Path]::GetFullPath($Destination)
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $sourcePath,
  $destinationPath,
  [System.IO.Compression.CompressionLevel]::Optimal,
  $false,
  [System.Text.Encoding]::UTF8
)
