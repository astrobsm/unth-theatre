import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { hashCode } from '@/lib/auth/otp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/otp/reset
 * Body: { ticket, newPassword }
 *
 * The last step. The ticket came from /otp/verify, which only issues one after
 * a correct code, and it is matched against a HASH — the plain ticket exists
 * only in the browser that is using it.
 *
 * On success every live recovery code for the account is burned, and the
 * first-login and must-change-password flags are cleared, because the user has
 * just proved possession of the registered phone and chosen a password. Leaving
 * mustChangePassword set would immediately demand a second password change,
 * which is how people end up choosing something they will forget again.
 */

const PEPPER = process.env.OTP_PEPPER || process.env.NEXTAUTH_SECRET || '';

/** Matches the rest of the application rather than inventing a new rule. */
const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: NextRequest) {
  if (!PEPPER) {
    return NextResponse.json(
      { error: 'Account recovery is not configured. Please contact the Theatre Manager.' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json().catch(() => ({} as any));
    const ticket = String(body.ticket ?? '').trim();
    const newPassword = String(body.newPassword ?? '');

    if (!ticket) {
      return NextResponse.json({ error: 'This reset link is incomplete. Start again.' }, { status: 400 });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 },
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: hashCode(ticket, PEPPER),
        resetTokenExpiry: { gt: new Date() },
      },
      select: { id: true, username: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'This reset has expired. Request a new code and try again.' },
        { status: 400 },
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashed,
          resetToken: null,
          resetTokenExpiry: null,
          isFirstLogin: false,
          mustChangePassword: false,
        },
      }),
      // Anything still outstanding dies with the reset. A code sitting in an
      // inbox after the password has changed is a second key to a changed lock.
      prisma.authOtp.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'PASSWORD_RESET_BY_OTP',
          tableName: 'users',
          recordId: user.id,
          changes: JSON.stringify({ method: 'SMS one-time code' }),
        },
      }),
    ]);

    return NextResponse.json(
      { ok: true, username: user.username, message: 'Your password has been changed. You can sign in now.' },
      { status: 200 },
    );
  } catch (error) {
    console.error('[otp/reset] failed:', error);
    return NextResponse.json(
      { error: 'Your password could not be changed. Please try again.' },
      { status: 500 },
    );
  }
}
