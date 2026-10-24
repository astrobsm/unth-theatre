// ============================================================
// The hospital's own address for the Android app
// ------------------------------------------------------------
//   https://unth-theatre.link/downloads/android
//
// A redirect, not a copy of the file. The APK stays on a GitHub release
// because a 6 MB binary in git history costs that much per release for ever,
// and pushing one over the hospital link has timed out before. But staff
// should never be asked to tap a github.com URL to install a hospital system:
// an address nobody recognises is the moment a careful person stops, and the
// careful ones are the staff you least want to put off.
//
// This also means the published address survives the next release. The tag in
// APK_TAG changes; unth-theatre.link/downloads/android does not, so a link
// pasted into a WhatsApp group a year ago still lands on the current build.
// ============================================================

import { NextResponse } from 'next/server';

/** Keep in step with APK_TAG in ../page.tsx. */
const APK_TAG = 'android-v1.5';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.redirect(
    `https://github.com/astrobsm/unth-theatre/releases/download/${APK_TAG}/orm-unth.apk`,
    // 302, not 301. A permanent redirect is cached by the browser and by
    // anything between here and the phone, so the next release would keep
    // serving this one from caches nobody can reach to clear.
    302,
  );
}
