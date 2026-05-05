import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const PHONE_RE = /^(0\d{10}|\+234\d{10})$/;

// Tiny in-memory rate limit (per IP) — Vercel/serverless: best-effort only.
const RL = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQ = 10;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = RL.get(ip);
  if (!cur || cur.resetAt < now) {
    RL.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  cur.count += 1;
  return cur.count > MAX_REQ;
}

// Build the alternative spelling of a Nigerian phone number so we match
// users regardless of whether they registered as 0XXXXXXXXXX or +234XXXXXXXXXX.
function phoneVariants(raw: string): string[] {
  const trimmed = raw.replace(/\s+/g, '');
  const out = new Set<string>([trimmed]);
  if (/^0\d{10}$/.test(trimmed))      out.add('+234' + trimmed.slice(1));
  if (/^\+234\d{10}$/.test(trimmed))  out.add('0' + trimmed.slice(4));
  return Array.from(out);
}

// POST /api/auth/forgot-username   body: { phoneNumber: string }
// Public endpoint. Returns username(s) registered with the supplied phone number.
// Also reports onboarding submissions still awaiting administrator approval.
export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const phoneNumber = String(body.phoneNumber ?? '').trim().replace(/\s+/g, '');

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }
    if (!PHONE_RE.test(phoneNumber)) {
      return NextResponse.json(
        { error: 'Use 11 digits starting with 0, or +234XXXXXXXXXX' },
        { status: 400 }
      );
    }

    const variants = phoneVariants(phoneNumber);

    const [users, pending] = await Promise.all([
      prisma.user.findMany({
        where: { phoneNumber: { in: variants } },
        select: {
          username: true,
          fullName: true,
          role: true,
          status: true,
          staffCode: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.onboardingSubmission.findMany({
        where: { phoneNumber: { in: variants }, status: 'PENDING' },
        select: {
          username: true,
          fullName: true,
          role: true,
          staffCode: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return NextResponse.json({ matches: users, pending });
  } catch (err: any) {
    console.error('forgot-username error:', err);
    return NextResponse.json(
      { error: 'Lookup failed', details: err?.message ?? null },
      { status: 500 }
    );
  }
}
