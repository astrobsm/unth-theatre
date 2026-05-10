# Uploads the staging folder to Supabase Storage in bucket `background-music`.
#
# Prereqs (one-time):
#   1. In Supabase Studio (https://supabase.com/dashboard/project/gynkghgypuuvpxkfagcu/storage/buckets):
#        - Click "New bucket"
#        - Name: background-music
#        - PUBLIC bucket: ON
#        - Allowed MIME: leave blank
#   2. Get the service-role key:
#        Settings -> API -> "service_role" key (NOT the anon key).
#   3. Set it for this PowerShell session:
#        $env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOi..."
#
# Run: pwsh -File scripts\upload-music-supabase.ps1

$ErrorActionPreference = 'Stop'

$ProjectRef = 'gynkghgypuuvpxkfagcu'
$Bucket     = 'background-music'
$StagingDir = 'D:\theathre bacground\_staging'

if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
    Write-Error "SUPABASE_SERVICE_ROLE_KEY is not set. Run: `$env:SUPABASE_SERVICE_ROLE_KEY = 'eyJ...' (use the service_role key, not anon)."
    exit 1
}
if (-not (Test-Path $StagingDir)) {
    Write-Error "Staging folder not found: $StagingDir. Run scripts\build-music-manifest.ps1 first."
    exit 1
}

$Headers = @{
    'Authorization'  = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
    'apikey'         = $env:SUPABASE_SERVICE_ROLE_KEY
    'Content-Type'   = 'audio/mpeg'
    'x-upsert'       = 'true'
}

$files = Get-ChildItem -Path $StagingDir -File
$total = $files.Count
$ok    = 0
$fail  = 0
$i     = 0

foreach ($f in $files) {
    $i++
    $url = "https://$ProjectRef.supabase.co/storage/v1/object/$Bucket/$($f.Name)"
    Write-Host ("[{0}/{1}] {2}  ({3:N1} MB) ... " -f $i, $total, $f.Name, ($f.Length / 1MB)) -NoNewline
    try {
        Invoke-WebRequest -Method Post -Uri $url -Headers $Headers -InFile $f.FullName -UseBasicParsing -TimeoutSec 300 | Out-Null
        Write-Host "OK" -ForegroundColor Green
        $ok++
    } catch {
        Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
        $fail++
    }
}

Write-Host ""
Write-Host "Done. Uploaded: $ok, Failed: $fail / $total" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verify one URL in your browser, e.g.:"
Write-Host "  https://$ProjectRef.supabase.co/storage/v1/object/public/$Bucket/$($files[0].Name)"
