import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { sendMail, passwordResetEmail } from "@/lib/mailer";

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPIRES_MIN = 60;

function originFromRequest(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    request.headers.get('origin') ||
    `https://${request.headers.get('host') || 'unth-theatre-mai.vercel.app'}`
  );
}

/**
 * POST /api/auth/reset-password/request
 * Body:  { email?: string; username?: string }
 *
 * If a matching account is found, a one-time reset token is generated, stored
 * on the user record, and a reset link is emailed to the user's registered
 * email address. The HTTP response is intentionally generic so callers cannot
 * enumerate which usernames / emails exist.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const email = String(body.email ?? '').trim().toLowerCase();
    const username = String(body.username ?? '').trim();

    if (!email && !username) {
      return NextResponse.json(
        { error: 'Provide your registered email address or username.' },
        { status: 400 }
      );
    }
    if (email && !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    const user = email
      ? await prisma.user.findUnique({ where: { email } })
      : await prisma.user.findUnique({ where: { username } });

    const generic = {
      message:
        'If an account matches what you entered, a password-reset link has been emailed to the registered address. Please check your inbox (and spam folder).',
    };

    if (!user) {
      return NextResponse.json(generic, { status: 200 });
    }
    if (!user.email) {
      // Account has no email on file — admin reset is the only path.
      return NextResponse.json(
        {
          error:
            'No email address is on file for this account. Please contact the Theatre Manager to reset your password.',
        },
        { status: 400 }
      );
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + EXPIRES_MIN * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    });

    const resetUrl = `${originFromRequest(request)}/auth/reset-password/confirm?token=${encodeURIComponent(
      resetToken
    )}`;
    const { subject, text, html } = passwordResetEmail({
      fullName: user.fullName,
      resetUrl,
      expiresMinutes: EXPIRES_MIN,
    });
    await sendMail({ to: user.email, subject, text, html });

    return NextResponse.json(generic, { status: 200 });
  } catch (error) {
    console.error('Password reset request error:', error);
    return NextResponse.json(
      { error: 'Failed to process reset request' },
      { status: 500 }
    );
  }
}
