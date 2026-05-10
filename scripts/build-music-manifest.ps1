# Build the background-music manifest and a clean staging folder.
#
# Scans the 5 source folders on D:\, copies each MP3/M4A/FLAC into a single
# staging folder under safe slugged filenames, and writes a manifest.json that
# the BackgroundMusicPlayer fetches at runtime.
#
# Run: pwsh -File scripts\build-music-manifest.ps1

$ErrorActionPreference = 'Stop'

$Sources = @(
    @{ Path = 'D:\theathre bacground\enya and yani';                                                                       Album = 'Enya & Yanni'; Artist = 'Various' },
    @{ Path = 'D:\theathre bacground\Dido - Greatest Hits (Deluxe Edition) 2013 320kbps CBR MP3 [VX] [P2PDL]\2';            Album = 'Greatest Hits (Disc 2)'; Artist = 'Dido' },
    @{ Path = 'D:\theathre bacground\lene marrlin';                                                                         Album = 'Lene Marlin Collection'; Artist = 'Lene Marlin' },
    @{ Path = 'D:\theathre bacground\Top 25 Acoustic Worship Songs\Top 25 Acoustic Worship Songs Disc 1';                   Album = 'Top 25 Acoustic Worship (Disc 1)'; Artist = 'Various Worship' },
    @{ Path = 'D:\theathre bacground\Yanni - Ultimate Yanni[www.lokotorrents.com][mp3]';                                    Album = 'Ultimate Yanni'; Artist = 'Yanni' }
)

$StagingDir   = 'D:\theathre bacground\_staging'
$ManifestPath = Join-Path $PSScriptRoot '..\public\audio\background\manifest.json'
$ManifestPath = [IO.Path]::GetFullPath($ManifestPath)

# Public Supabase Storage URL pattern (project gynkghgypuuvpxkfagcu, bucket background-music)
$BaseUrl = 'https://gynkghgypuuvpxkfagcu.supabase.co/storage/v1/object/public/background-music'

if (Test-Path $StagingDir) { Remove-Item $StagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $StagingDir -Force | Out-Null

function To-Slug([string]$s) {
    $s = $s -replace '[^a-zA-Z0-9]+', '-'
    $s = $s.Trim('-').ToLower()
    if ($s.Length -gt 80) { $s = $s.Substring(0, 80).Trim('-') }
    return $s
}

function Strip-TrackNumber([string]$name) {
    # Removes leading "01 - ", "01. ", "1) " etc.
    return ($name -replace '^\s*\d{1,3}\s*[\-\._\)\(]?\s*', '').Trim()
}

$tracks = @()
$used   = @{}

foreach ($src in $Sources) {
    if (-not (Test-Path -LiteralPath $src.Path)) { Write-Warning "Missing: $($src.Path)"; continue }
    $files = Get-ChildItem -LiteralPath $src.Path -Recurse -File -ErrorAction SilentlyContinue |
             Where-Object { $_.Extension -match '^\.(mp3|m4a|flac|ogg|wav)$' } |
             Sort-Object FullName
    foreach ($f in $files) {
        $titleRaw = Strip-TrackNumber([IO.Path]::GetFileNameWithoutExtension($f.Name))
        if (-not $titleRaw) { $titleRaw = [IO.Path]::GetFileNameWithoutExtension($f.Name) }
        $artistSlug = To-Slug $src.Artist
        $titleSlug  = To-Slug $titleRaw
        $ext        = $f.Extension.ToLower()
        $base       = "$artistSlug--$titleSlug$ext"
        $i = 1
        $candidate = $base
        while ($used.ContainsKey($candidate)) {
            $i++
            $candidate = "$artistSlug--$titleSlug-$i$ext"
        }
        $used[$candidate] = $true

        Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $StagingDir $candidate)

        $tracks += [pscustomobject]@{
            title   = $titleRaw
            artist  = $src.Artist
            album   = $src.Album
            file    = $candidate
            url     = "$BaseUrl/$candidate"
            sizeMB  = [math]::Round($f.Length / 1MB, 2)
        }
    }
}

$manifestDir = Split-Path $ManifestPath -Parent
if (-not (Test-Path $manifestDir)) { New-Item -ItemType Directory -Path $manifestDir -Force | Out-Null }

$manifest = [pscustomobject]@{
    generatedAt = (Get-Date).ToString('o')
    bucket      = 'background-music'
    baseUrl     = $BaseUrl
    count       = $tracks.Count
    totalMB     = [math]::Round(($tracks | Measure-Object sizeMB -Sum).Sum, 1)
    tracks      = $tracks
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $ManifestPath -Encoding UTF8

Write-Host ""
Write-Host "Staged $($tracks.Count) tracks, $((Get-ChildItem $StagingDir | Measure-Object Length -Sum).Sum / 1MB | ForEach-Object { '{0:N1}' -f $_ }) MB" -ForegroundColor Green
Write-Host "Staging folder : $StagingDir"
Write-Host "Manifest       : $ManifestPath"
Write-Host ""
Write-Host "Next: run scripts\upload-music-supabase.ps1 to push the staging folder to Supabase Storage." -ForegroundColor Cyan
