import { NextResponse } from 'next/server';

// Serves the latest native app version + download URL so the installed Android
// app can prompt users to update the shell. Derived automatically from the
// newest GitHub Release, so no manual version bumping is needed here.
// The upstream call is cached (revalidated) to stay well within GitHub's
// unauthenticated rate limit.
export const revalidate = 1800; // 30 minutes

const RELEASES_URL =
  'https://api.github.com/repos/astrobsm/unth-theatre/releases/latest';

export async function GET() {
  try {
    const res = await fetch(RELEASES_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'orm-unth-app-version',
      },
      next: { revalidate: 1800 },
    });

    if (!res.ok) {
      return NextResponse.json({ android: null, desktop: null });
    }

    const rel = await res.json();
    const version: string = (rel.tag_name || '').replace(/^v/, '');
    const assets: Array<{ name: string; browser_download_url: string }> =
      Array.isArray(rel.assets) ? rel.assets : [];

    // Prefer a signed release APK; fall back to the debug APK.
    const apk =
      assets.find((a) => /\.apk$/i.test(a.name) && !/debug/i.test(a.name)) ||
      assets.find((a) => /\.apk$/i.test(a.name));

    return NextResponse.json({
      android:
        version && apk
          ? { version, url: apk.browser_download_url, name: apk.name }
          : null,
      desktop: version ? { version, url: rel.html_url } : null,
    });
  } catch {
    return NextResponse.json({ android: null, desktop: null });
  }
}
