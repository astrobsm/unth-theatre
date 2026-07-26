import { NextResponse } from 'next/server';

// Lightweight keep-warm / health endpoint.
//
// Vercel spins serverless functions down after a period of inactivity, so the
// FIRST request after an idle spell ("cold start") is slow — which is what makes
// the app feel sluggish to open first thing in the day. A scheduled ping to this
// route (see .github/workflows/keep-warm.yml) keeps the deployment warm so real
// launches hit an already-running instance.
//
// Deliberately does NO database or auth work: it must stay cheap and never fail,
// so it can be hit frequently at effectively zero cost.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json(
    { ok: true, service: 'orm', ts: Date.now() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
