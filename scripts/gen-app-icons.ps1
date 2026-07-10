Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
New-Item -ItemType Directory -Force -Path resources | Out-Null

$srcPath = if (Test-Path 'public\logo.png') { 'public\logo.png' } else { 'desktop\build\icon.png' }
$src = [System.Drawing.Image]::FromFile((Resolve-Path $srcPath).Path)

function Save-Png($bmp, $rel) {
  $bmp.Save((Join-Path (Get-Location) $rel), [System.Drawing.Imaging.ImageFormat]::Png)
}

# 1024x1024 launcher icon
$icon = New-Object System.Drawing.Bitmap 1024, 1024
$g = [System.Drawing.Graphics]::FromImage($icon)
$g.InterpolationMode = 'HighQualityBicubic'
$g.SmoothingMode = 'HighQuality'
$g.DrawImage($src, 0, 0, 1024, 1024)
$g.Dispose()
Save-Png $icon 'resources\icon.png'
$icon.Dispose()

# 2732x2732 splash screens (brand background with centered logo)
$configs = @(
  @{ file = 'resources\splash.png';      color = [System.Drawing.Color]::White },
  @{ file = 'resources\splash-dark.png'; color = [System.Drawing.Color]::FromArgb(30, 64, 175) }
)
foreach ($cfg in $configs) {
  $sp = New-Object System.Drawing.Bitmap 2732, 2732
  $g2 = [System.Drawing.Graphics]::FromImage($sp)
  $g2.Clear($cfg.color)
  $g2.InterpolationMode = 'HighQualityBicubic'
  $g2.SmoothingMode = 'HighQuality'
  $size = 900
  $off = (2732 - $size) / 2
  $g2.DrawImage($src, $off, $off, $size, $size)
  $g2.Dispose()
  Save-Png $sp $cfg.file
  $sp.Dispose()
}
$src.Dispose()

Get-ChildItem resources\*.png | ForEach-Object {
  $i = [System.Drawing.Image]::FromFile($_.FullName)
  '{0} {1}x{2}' -f $_.Name, $i.Width, $i.Height
  $i.Dispose()
}
