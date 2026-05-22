import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendMail, usernameRecoveryEmail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

const PHONE_RE = /^(0\d{10}|\+234\d{10})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function originFromRequest(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    request.headers.get('origin') ||
    `https://${request.headers.get('host') || 'unth-theatre-mai.vercel.app'}`
  );
}

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
    const rawEmail = String(body.email ?? '').trim().toLowerCase();
    const phoneNumber = String(body.phoneNumber ?? '').trim().replace(/\s+/g, '');

    /* ---------------- Email path (preferred) -------------------- */
    if (rawEmail) {
      if (!EMAIL_RE.test(rawEmail)) {
        return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
      }

      const users = await prisma.user.findMany({
        where: { email: rawEmail },
        select: { username: true, fullName: true, role: true, status: true, email: true },
        orderBy: { createdAt: 'asc' },
      });
      const usable = users.filter((u) => u.status === 'APPROVED' || u.status === 'PENDING');

      if (usable.length > 0) {
        const loginUrl = `${originFromRequest(request)}/auth/login`;
        const { subject, text, html } = usernameRecoveryEmail({
          fullName: usable[0].fullName,
          usernames: usable.map((u) => u.username),
          loginUrl,
        });
        await sendMail({ to: rawEmail, subject, text, html });
      }

      // Generic response either way to avoid revealing which addresses are registered.
      return NextResponse.json({
        method: 'email',
        message:
          'If that email is registered with us, your username has been sent to it. Please check your inbox (and spam folder).',
      });
    }

    /* ---------------- Phone path (legacy) ----------------------- */
    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Provide your registered email address or phone number.' },
        { status: 400 }
      );
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

    return NextResponse.json({ method: 'phone', matches: users, pending });
  } catch (err: any) {
    console.error('forgot-username error:', err);
    return NextResponse.json(
      { error: 'Lookup failed', details: err?.message ?? null },
      { status: 500 }
    );
  }
}
