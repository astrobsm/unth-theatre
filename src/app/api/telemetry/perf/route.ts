import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/**
 * Where page-load timings are recorded.
 *
 * The audit could measure the server (nginx now logs request time, Postgres now
 * has pg_stat_statements) but had no way to say what a person actually waited
 * for: time to first byte on a real handset, when the page became interactive,
 * how long hydration took. Every claim about front-end speed was inference.
 *
 * Deliberately NOT stored in Postgres. The database already carries the
 * hospital's clinical record and a sync journal; adding a high-frequency
 * telemetry table to it would make the thing being measured slower — and this
 * data is worth days, not years. It goes to the application log, where
 * journalctl already rotates it, and can be read with a grep.
 *
 * NOTHING identifying is accepted. No user id, no patient id, no folder number,
 * no free text. The schema below is a whitelist, and anything else in the body
 * is dropped by zod rather than logged.
 */

const schema = z.object({
  /** Route pattern, never a URL with ids in it. See the client for scrubbing. */
  route: z.string().trim().max(120),
  /** Milliseconds, from the Navigation Timing API. */
  ttfb: z.number().nonnegative().max(600_000).optional(),
  domReady: z.number().nonnegative().max(600_000).optional(),
  loadComplete: z.number().nonnegative().max(600_000).optional(),
  /** Largest Contentful Paint, when the browser reports it. */
  lcp: z.number().nonnegative().max(600_000).optional(),
  /** Rough device class, for separating tablet from desktop. */
  cores: z.number().int().min(1).max(256).optional(),
  memoryGb: z.number().nonnegative().max(1024).optional(),
  /** 'local' when served by the theatre server, 'cloud' otherwise. */
  origin: z.enum(['local', 'cloud']).optional(),
  connection: z.string().trim().max(20).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // A malformed beacon is not worth a 400 the client will never read.
    return new NextResponse(null, { status: 204 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 204 });
  const d = parsed.data;

  // console.WARN, not console.log, and not by preference.
  //
  // next.config.js strips console.log from production builds
  // (removeConsole, excluding only 'error' and 'warn'). This endpoint was
  // deployed, accepted beacons, returned 204 and discarded every one of them —
  // found by checking the log rather than trusting the status code, which is
  // the whole reason instrumentation gets verified end to end.
  //
  // warn is the quietest channel that survives the build. It is not a warning;
  // it is a measurement, and it lands in orm-error.log alongside the other
  // surviving application output.
  console.warn(
    `[perf] route=${d.route} ttfb=${d.ttfb ?? '-'} domReady=${d.domReady ?? '-'} ` +
      `load=${d.loadComplete ?? '-'} lcp=${d.lcp ?? '-'} ` +
      `cores=${d.cores ?? '-'} memGb=${d.memoryGb ?? '-'} ` +
      `origin=${d.origin ?? '-'} conn=${d.connection ?? '-'}`,
  );

  // 204 so sendBeacon never retries and the client never waits.
  return new NextResponse(null, { status: 204 });
}
