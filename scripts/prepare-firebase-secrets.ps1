# ============================================================
# prepare-firebase-secrets.ps1
# ------------------------------------------------------------
# After you download the two files from the Firebase console, run:
#
#   powershell -ExecutionPolicy Bypass -File scripts\prepare-firebase-secrets.ps1 `
#       -GoogleServices "C:\path\google-services.json" `
#       -ServiceAccount "C:\path\service-account.json"
#
# It prints (and copies) the exact values you paste into:
#   • GitHub  → repo Settings → Secrets and variables → Actions:
#         GOOGLE_SERVICES_JSON_BASE64   (for the Android app build)
#   • Vercel  → Project → Settings → Environment Variables:
#         FCM_SERVICE_ACCOUNT           (for the server that sends the pushes)
# ============================================================
param(
  [Parameter(Mandatory = $true)][string]$GoogleServices,
  [Parameter(Mandatory = $true)][string]$ServiceAccount
)

if (-not (Test-Path $GoogleServices)) { Write-Error "google-services.json not found: $GoogleServices"; exit 1 }
if (-not (Test-Path $ServiceAccount)) { Write-Error "service-account.json not found: $ServiceAccount"; exit 1 }

# 1) GOOGLE_SERVICES_JSON_BASE64 — base64 of google-services.json (GitHub secret)
$gsBytes = [IO.File]::ReadAllBytes((Resolve-Path $GoogleServices).Path)
$gsB64 = [Convert]::ToBase64String($gsBytes)

# 2) FCM_SERVICE_ACCOUNT — the service-account JSON as-is (Vercel env var)
$saJson = Get-Content (Resolve-Path $ServiceAccount).Path -Raw

Write-Host ""
Write-Host "=== 1) GitHub secret: GOOGLE_SERVICES_JSON_BASE64 ===" -ForegroundColor Cyan
Write-Host "Copied to clipboard. Paste it as the secret value." -ForegroundColor Green
$gsB64 | Set-Clipboard
Write-Host ""
Write-Host "=== 2) Vercel env var: FCM_SERVICE_ACCOUNT ===" -ForegroundColor Cyan
Write-Host "Paste the following WHOLE JSON as the value:" -ForegroundColor Yellow
Write-Host $saJson
Write-Host ""
Write-Host "After setting both, push a new tag to rebuild the app (e.g. git tag v1.0.2; git push origin v1.0.2)." -ForegroundColor Green
