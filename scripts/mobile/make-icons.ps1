# ============================================================
# Build the icon and splash sources Capacitor's generator expects
# ------------------------------------------------------------
#   powershell -NoProfile -File scripts/mobile/make-icons.ps1
#
# Input:  assets/logo.png — the hospital mark, square. THE ONLY TRACKED IMAGE.
# Output: assets/icon.png, icon-foreground.png, icon-background.png,
#         splash.png, splash-dark.png — all gitignored, all rebuilt from the
#         logo, because a derived PNG committed beside its source is 2.6 MB of
#         binary that silently stops matching the thing it was derived from.
# Then `npx capacitor-assets generate --android` fans those out into every
# density, which build-apk.sh does for you.
#
# ANDROID MASKS THE OUTER THIRD, which is the whole reason this exists. An
# adaptive icon is drawn on a 108dp canvas of which only the centre 72dp is
# guaranteed to survive: launchers crop the rest to a circle, a squircle or a
# rounded square as they each prefer. A mark that fills its square — and this
# one does, out to the fingertips — loses the hands and the outer ring on
# most phones, and nobody notices until it is on a hundred of them.
#
# So the foreground is the mark scaled into that safe centre, and the
# background is the white it was drawn against, so the masked shape reads as
# a deliberate white badge rather than whatever the launcher puts behind it.
# icon.png is left full-bleed for older launchers that use it unmasked.
#
# Written in PowerShell rather than Node on purpose: sharp needs a native
# binary this machine could not install, and System.Drawing is already here.
# ============================================================

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root   = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$assets = Join-Path $root 'assets'
$src    = Join-Path $assets 'logo.png'

if (-not (Test-Path $src)) {
  Write-Error "No source mark at $src. Put the hospital logo there as a square PNG."
}

$CANVAS = 1024
$SAFE   = [int]($CANVAS * 0.66)   # the centre share no launcher crops
$PAD    = [int](($CANVAS - $SAFE) / 2)

$paper = [System.Drawing.Color]::FromArgb(255, 251, 251, 248)  # warmed white
$ink   = [System.Drawing.Color]::FromArgb(255, 21, 50, 59)     # the app's teal

function New-Canvas([int]$w, [int]$h, $fill) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  if ($null -ne $fill) { $g.Clear($fill) } else { $g.Clear([System.Drawing.Color]::Transparent) }
  return @($bmp, $g)
}

$logo = [System.Drawing.Image]::FromFile($src)

# capacitor-assets looks for icon.png by name. Full-bleed, for the older
# launchers that use it unmasked rather than compositing the adaptive pair.
Copy-Item $src (Join-Path $assets 'icon.png') -Force

# ── Foreground: the mark inside the safe zone, on transparency ──────────────
$fg, $fgG = New-Canvas $CANVAS $CANVAS $null
$fgG.DrawImage($logo, $PAD, $PAD, $SAFE, $SAFE)
$fg.Save((Join-Path $assets 'icon-foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$fgG.Dispose(); $fg.Dispose()

# ── Background: the paper the mark was drawn on ─────────────────────────────
$bg, $bgG = New-Canvas $CANVAS $CANVAS $paper
$bg.Save((Join-Path $assets 'icon-background.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bgG.Dispose(); $bg.Dispose()

# ── Splash: square at the largest size asked for, so it crops to any screen ─
foreach ($pair in @(@('splash.png', $paper), @('splash-dark.png', $ink))) {
  $name, $fill = $pair
  $sp, $spG = New-Canvas 2732 2732 $fill
  $mark = 900
  $off  = [int]((2732 - $mark) / 2)
  $spG.DrawImage($logo, $off, $off, $mark, $mark)
  $sp.Save((Join-Path $assets $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $spG.Dispose(); $sp.Dispose()
}

$logo.Dispose()

Write-Output "icon.png             full-bleed, copied from logo.png"
Write-Output "icon-foreground.png  mark at 66%, transparent"
Write-Output "icon-background.png  #FBFBF8"
Write-Output "splash.png           2732x2732 on #FBFBF8"
Write-Output "splash-dark.png      2732x2732 on #15323B"
Write-Output ""
Write-Output "Next: npx capacitor-assets generate --android"
