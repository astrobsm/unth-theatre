import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Identifies the currently-deployed build. On Vercel, VERCEL_GIT_COMMIT_SHA
// changes with every deployment, so the client can detect when a new version
// (fixes/improvements) has gone live and refresh the app to it — this is what
// keeps the installed Android app up to date without a re-install.
const VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.NEXT_PUBLIC_BUILD_ID ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  'dev';

export function GET() {
  return NextResponse.json(
    { version: VERSION, ts: Date.now() },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  );
}
