import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// CORS allow-list: same-origin always permitted; additional origins via env var
// (comma-separated). This avoids the insecure combination of `Origin: *` with
// `Allow-Credentials: true`, which browsers reject and which leaks credentials
// to any caller.
const EXTRA_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function resolveAllowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null; // same-origin / non-CORS request

  // Same-origin: trust the request's own host
  const requestUrl = new URL(request.url);
  const sameOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
  if (origin === sameOrigin) return origin;

  // Explicit allow-list from environment
  if (EXTRA_ALLOWED_ORIGINS.includes(origin)) return origin;

  return null;
}

export function middleware(request: NextRequest) {
  const allowedOrigin = resolveAllowedOrigin(request);

  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, X-CSRF-Token',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (allowedOrigin) {
      headers['Access-Control-Allow-Origin'] = allowedOrigin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    return new NextResponse(null, { status: 204, headers });
  }

  // Add CORS headers to actual responses (only when origin is permitted)
  const response = NextResponse.next();
  response.headers.set('Vary', 'Origin');
  if (allowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
}

// Apply middleware to API routes
export const config = {
  matcher: '/api/:path*',
};
