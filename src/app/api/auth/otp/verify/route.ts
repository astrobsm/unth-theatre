import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import {
  verifyCode,
  normaliseNigerianPhone,
  hashCode,
  type OtpPurpose,
} from '@/lib/auth/otp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/otp/verify
 * Body: { identifier, code, purpose }
 *
 * For USERNAME_RECOVERY this is the end of the journey: a correct code returns
 * the username, because a username is not a secret — it is printed on rotas and
 * said aloud in handovers. Protecting it behind a code at all is only to stop
 * the endpoint being used to harvest 551 staff names.
 *
 * For PASSWORD_RESET it returns a short-lived ticket, which the reset route
 * exchanges for a password change. The code is consumed here, so it cannot be
 * replayed, and the ticket is stored HASHED — the mistake in the old flow was
 * keeping the reset token in plain text on the user row, where anyone with
 * database read access could use it.
 */

const PEPPER = process.env.OTP_PEPPER || process.env.NEXTAUTH_SECRET || '';

/** Long enough to finish typing a new password, short enough that a ticket left
 *  in a browser tab is not a standing key. */
const TICKET_TTL_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  if (!PEPPER) {
    return NextResponse.json(
      { error: 'Account recovery is not configured. Please contact the Theatre Manager.' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json().catch(() => ({} as any));
    const identifier = String(body.identifier ?? '').trim();
    const submitted = String(body.code ?? '').trim();
    const purpose: OtpPurpose =
      body.purpose === 'USERNAME_RECOVERY' ? 'USERNAME_RECOVERY' : 'PASSWORD_RESET';

    if (!identifier || !submitted) {
      return NextResponse.json({ error: 'Enter the 6-digit code that was sent to you.' }, { status: 400 });
    }

    const asPhone = normaliseNigerianPhone(identifier);
    let user = null;
    if (asPhone) {
      const local = `0${asPhone.slice(3)}`;
      user = await prisma.user.findFirst({
        where: {
          status: 'APPROVED',
          OR: [
            { phoneNumber: asPhone },
            { phoneNumber: `+${asPhone}` },
            { phoneNumber: local },
            { phoneNumber: local.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3') },
          ],
        },
        select: { id: true, username: true },
      });
    }
    if (!user) {
      user = await prisma.user.findFirst({
        where: { username: identifier, status: 'APPROVED' },
        select: { id: true, username: true },
      });
    }

    // One message for every failure below, so a wrong code, an expired code and
    // an account that does not exist are indistinguishable from outside.
    const rejected = NextResponse.json(
      { error: 'That code is not valid, or it has expired. Request a new one.' },
      { status: 400 },
    );

    if (!user) return rejected;

    const otp = await prisma.authOtp.findFirst({
      where: { userId: user.id, purpose },
      orderBy: { createdAt: 'desc' },
    });

    const verdict = verifyCode(otp, submitted, PEPPER);

    if (!verdict.ok) {
      // A wrong guess costs an attempt. An expired or already-used code does
      // not, because there is nothing left to protect and counting it would
      // punish a user for tapping twice.
      if (verdict.reason === 'WRONG_CODE' && otp) {
        await prisma.authOtp.update({
          where: { id: otp.id },
          data: { attempts: { increment: 1 } },
        });
      }
      return rejected;
    }

    // Correct. Burn it immediately — before anything else can fail — so it can
    // never be used twice.
    await prisma.authOtp.update({
      where: { id: otp!.id },
      data: { consumedAt: new Date(), attempts: { increment: 1 } },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: purpose === 'USERNAME_RECOVERY' ? 'USERNAME_RECOVERED' : 'OTP_VERIFIED',
        tableName: 'auth_otps',
        recordId: otp!.id,
        changes: JSON.stringify({ purpose }),
      },
    }).catch(() => { /* never block recovery on the audit write */ });

    if (purpose === 'USERNAME_RECOVERY') {
      return NextResponse.json({ ok: true, username: user.username }, { status: 200 });
    }

    // A password-reset ticket. Random, returned once, stored only as a hash.
    const ticket = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashCode(ticket, PEPPER),
        resetTokenExpiry: new Date(Date.now() + TICKET_TTL_MS),
      },
    });

    return NextResponse.json({ ok: true, ticket, expiresInMinutes: TICKET_TTL_MS / 60000 }, { status: 200 });
  } catch (error) {
    console.error('[otp/verify] failed:', error);
    return NextResponse.json(
      { error: 'That code could not be checked. Please try again.' },
      { status: 500 },
    );
  }
}
