# Background music — Supabase Storage setup

The 121 tracks are too large to commit (~1.1 GB). They live in a public
Supabase Storage bucket; the app fetches a small `manifest.json` at runtime
and streams the audio from Supabase.

## One-time setup

### 1. Create the bucket (Supabase Studio)

Open <https://supabase.com/dashboard/project/gynkghgypuuvpxkfagcu/storage/buckets>

- Click **New bucket**
- Name: `background-music`
- **Public bucket: ON**  ← required so the browser can stream without auth
- File size limit: leave default (50 MB is enough for these MP3s)
- Save

### 2. Get your service-role key

Open <https://supabase.com/dashboard/project/gynkghgypuuvpxkfagcu/settings/api>

- Find the row labelled **`service_role`**  (NOT `anon` — anon cannot upload)
- Click **Reveal** then **Copy**

> ⚠ The service-role key bypasses RLS. Never commit it; never expose it to the
> browser. Use it only for one-shot uploads from your machine.

### 3. Stage the files locally (already done once)

```powershell
cd "e:\THEATHRE CHAIR\unth-theatre"
powershell -ExecutionPolicy Bypass -File scripts\build-music-manifest.ps1
```

This:
- Copies all 121 audio files from the 5 source folders on `D:\theathre bacground\`
  into `D:\theathre bacground\_staging\` with safe slugged filenames
  (e.g. `yanni--nostalgia.mp3`).
- Writes [public/audio/background/manifest.json](../public/audio/background/manifest.json)
  — committed to the repo, ~30 KB.

Re-run any time you add/remove source folders.

### 4. Upload to Supabase

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOi...your-service-role-key..."
powershell -ExecutionPolicy Bypass -File scripts\upload-music-supabase.ps1
```

121 files × ~9 MB average over a typical home connection takes 10–30 minutes.
The script uses `x-upsert: true` so it is safe to rerun if interrupted.

### 5. Verify

Open one URL from the manifest in your browser, e.g.:

    https://gynkghgypuuvpxkfagcu.supabase.co/storage/v1/object/public/background-music/yanni--nostalgia.mp3

It should stream / download.

### 6. Deploy

The committed `manifest.json` is all the app needs. After the next push to
`master`, Vercel rebuilds and the player loads the playlist on next visit.

## Adding more music later

1. Drop the new folder into `D:\theathre bacground\` and edit `$Sources` in
   [scripts/build-music-manifest.ps1](build-music-manifest.ps1).
2. Re-run `build-music-manifest.ps1` (regenerates staging + manifest from scratch).
3. Re-run `upload-music-supabase.ps1` (only changed/new files actually re-upload
   thanks to `x-upsert`; bucket size grows accordingly).
4. Commit the updated `manifest.json` and push.

## Cost / limits

Supabase free tier: 1 GB storage, 2 GB egress / month. The library at 1.1 GB
will tip you slightly over storage and egress will scale with active staff
listening — worth promoting to **Pro ($25/mo)** before rollout. Alternatively,
host on Azure Blob (cheaper egress) and swap `BaseUrl` in the manifest script.
