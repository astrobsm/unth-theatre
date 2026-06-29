import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

/**
 * Return JSON with an ETag and honour conditional requests (If-None-Match).
 *
 * On the periodic 30-min refresh (and manual sync), the payload for a given day
 * usually has not changed. When the client sends back the ETag it received last
 * time, we reply `304 Not Modified` with an EMPTY body — so nothing but headers
 * travels over the wire. This is the safe way to "only transfer recent changes"
 * without fragile client-side delta merging.
 *
 * The client lib (`cacheFirstFetch`) stores the ETag alongside the cached data
 * and replays it as `If-None-Match`, then keeps its cached copy on a 304.
 */
export function jsonWithETag(request: Request, data: unknown): NextResponse {
  const body = JSON.stringify(data);
  const etag = `"${createHash('sha1').update(body).digest('base64')}"`;

  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag },
    });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      ETag: etag,
      'Content-Type': 'application/json',
    },
  });
}
