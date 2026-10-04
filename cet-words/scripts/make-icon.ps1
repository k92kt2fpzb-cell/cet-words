# 生成 CET Words 应用图标：public/icon-512.png、public/icon-192.png、app/icon.png、cet-words.ico
$ErrorActionPreference = 'Stop'
try { Add-Type -AssemblyName System.Drawing -ErrorAction Stop } catch { Add-Type -AssemblyName System.Drawing.Common -ErrorAction Stop }

$root = Split-Path -Parent $PSScriptRoot
$outPng = Join-Path $root 'public\icon-512.png'
$outPng192 = Join-Path $root 'public\icon-192.png'
$outAppIcon = Join-Path $root 'app\icon.png'
$outIco = Join-Path $root 'cet-words.ico'

function New-RoundedPath([System.Drawing.RectangleF]$rect, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Logo([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  $pad = [float]($size * 0.04)
  $rect = New-Object System.Drawing.RectangleF($pad, $pad, [float]($size - 2 * $pad), [float]($size - 2 * $pad))
  $path = New-RoundedPath $rect ([float]($size * 0.22))
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 79, 70, 229),
    [System.Drawing.Color]::FromArgb(255, 139, 92, 246),
    60.0
  )
  $g.FillPath($brush, $path)

  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

  $f1 = New-Object System.Drawing.Font('Segoe UI', [float]($size * 0.30), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $rect1 = New-Object System.Drawing.RectangleF(0, [float]($size * 0.27), $size, [float]($size * 0.32))
  $g.DrawString('CET', $f1, [System.Drawing.Brushes]::White, $rect1, $fmt)

  $f2 = New-Object System.Drawing.Font('Segoe UI', [float]($size * 0.135), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $rect2 = New-Object System.Drawing.RectangleF(0, [float]($size * 0.58), $size, [float]($size * 0.18))
  $soft = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 255, 255, 255))
  $g.DrawString('WORDS', $f2, $soft, $rect2, $fmt)

  $g.Dispose()
  return $bmp
}

$big = New-Logo 512
$big.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
$mid = New-Logo 256
$mid.Save($outAppIcon, [System.Drawing.Imaging.ImageFormat]::Png)
$small = New-Logo 192
$small.Save($outPng192, [System.Drawing.Imaging.ImageFormat]::Png)

$hicon = $mid.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hicon)
$fs = [System.IO.File]::Create($outIco)
$icon.Save($fs)
$fs.Close()

$big.Dispose(); $mid.Dispose(); $small.Dispose()
Write-Output "icon ok -> $outIco"
