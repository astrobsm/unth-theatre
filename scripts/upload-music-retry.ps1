# Re-uploads only the files that failed in upload-music.log.
# Safe to run as many times as needed (x-upsert: true).

$ErrorActionPreference = 'Stop'

$ProjectRef = 'gynkghgypuuvpxkfagcu'
$Bucket     = 'background-music'
$StagingDir = 'D:\theathre bacground\_staging'
$LogPath    = 'upload-music.log'

if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
    Write-Error "SUPABASE_SERVICE_ROLE_KEY is not set."; exit 1
}
if (-not (Test-Path $LogPath)) {
    Write-Error "$LogPath not found."; exit 1
}

# Pull the file basenames from each FAIL line: "[N/121] <filename>  (... MB) ... FAIL: ..."
$failed = Get-Content $LogPath |
    Select-String 'FAIL' |
    ForEach-Object {
        if ($_.Line -match '\]\s+(\S+\.(?:mp3|m4a|flac|ogg|wav))\s+\(') { $Matches[1] }
    } | Sort-Object -Unique

Write-Host "Retrying $($failed.Count) failed file(s)..." -ForegroundColor Cyan

$Headers = @{
    'Authorization' = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
    'apikey'        = $env:SUPABASE_SERVICE_ROLE_KEY
    'Content-Type'  = 'audio/mpeg'
    'x-upsert'      = 'true'
}

$ok = 0; $fail = 0; $i = 0
foreach ($name in $failed) {
    $i++
    $path = Join-Path $StagingDir $name
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Host ("[{0}/{1}] {2} ... MISSING" -f $i, $failed.Count, $name) -ForegroundColor Yellow
        $fail++; continue
    }
    $url = "https://$ProjectRef.supabase.co/storage/v1/object/$Bucket/$name"
    Write-Host ("[{0}/{1}] {2} ... " -f $i, $failed.Count, $name) -NoNewline

    # Clear ReadOnly so Invoke-WebRequest doesn't choke; harmless if already clear.
    try { (Get-Item -LiteralPath $path).IsReadOnly = $false } catch {}

    $attempt = 0
    while ($true) {
        $attempt++
        try {
            # Read bytes via shared-read FileStream to bypass IWR -InFile internal write-lock attempt.
            $fs = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
            try {
                $bytes = New-Object byte[] $fs.Length
                [void]$fs.Read($bytes, 0, $fs.Length)
            } finally { $fs.Close() }

            Invoke-WebRequest -Method Post -Uri $url -Headers $Headers -Body $bytes -UseBasicParsing -TimeoutSec 600 | Out-Null
            Write-Host "OK" -ForegroundColor Green
            $ok++; break
        } catch {
            if ($attempt -lt 4 -and $_.Exception.Message -match 'denied|being used|locked|timed out|aborted') {
                Start-Sleep -Seconds (3 * $attempt)
                continue
            }
            Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
            $fail++; break
        }
    }
}

Write-Host ""
Write-Host "Retry done. OK: $ok, Failed: $fail" -ForegroundColor Cyan
