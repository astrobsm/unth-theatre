// ============================================================
// Reset a password with the Staff ID number alone
// ------------------------------------------------------------
// Asked for on 7 November, after the one-time code was raised as the thing
// that proved the person asking owned the account:
//
//   "modify such that once the user inputs the staff id number he can set a
//    new password without need for the 6 digit sms code on the registered
//    phone"
//
// WHAT THIS MEANS, STATED PLAINLY SO NOBODY HAS TO REDISCOVER IT. A Staff ID
// number is not a secret in this hospital: it is printed on the card, read out
// at handover, listed on /dashboard/users inside this application, and typed
// into the duty-logging board. Anybody who knows a colleague's Staff ID can
// now set that colleague's password and sign in as them. That was weighed and
// chosen: 20 approved accounts have no phone number on file at all, the SMS
// gateway has been unreliable, and staff locked out of a clinical system in
// the middle of the night were queueing at the Theatre Manager's door.
//
// WHAT IS LEFT IN PLACE, BECAUSE IT COSTS THE REAL USER NOTHING:
//
//   1. The address is throttled. Twelve lookups and four completed resets per
//      half hour. A person mistyping their own number is unaffected; somebody
//      working down a staff list is slowed to a crawl.
//   2. Every reset is written to the audit log with the address it came from
//      and how the person was identified.
//   3. The account holder is TOLD, by SMS, that their password has just been
//      changed. This does not stop a takeover; it is what makes one visible
//      within minutes instead of never. It is sent after the change and never
//      blocks it, so a dead gateway cannot lock anybody out.
//   4. Only APPROVED accounts, and only when the number names exactly one of
//      them. Resolution is shared with the one-time-code routes.
//
// THE ONE-TIME-CODE ROUTES ARE UNTOUCHED and still work. This is an additional
// door, not a replacement lock.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { sendSms } from '@/lib/sms';
import { resolveRecoveryUser } from '@/lib/auth/recoveryLookup';
import { passwordChangedSms } from '@/lib/auth/resetNotice';
import {
  overLimit, pruneAttempts, retryAfterSeconds,
  MAX_ATTEMPTS_PER_WINDOW, MAX_RESETS_PER_WINDOW,
} from '@/lib/auth/resetThrottle';

export const dynamic = 'force-dynamic';

/** Matches the rest of the application rather than inventing a new rule. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Per-address counters.
 *
 * In memory, and therefore per instance: on Vercel this is best effort and on
 * the theatre server, which runs one pm2 process, it is exact. Best effort is
 * worth having -- the alternative on offer was nothing at all.
 */
const LOOKUPS = new Map<string, number[]>();
const RESETS = new Map<string, number[]>();

function addressOf(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
  );
}

function record(store: Map<string, number[]>, key: string, now: number): void {
  store.set(key, [...pruneAttempts(store.get(key) ?? [], now), now]);
}


export async function POST(request: NextRequest) {
  const ip = addressOf(request);
  const now = Date.now();

  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const identifier = String(body.identifier ?? '').trim();
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : null;

    if (!identifier) {
      return NextResponse.json({ error: 'Enter your Staff ID number.' }, { status: 400 });
    }

    const store = newPassword === null ? LOOKUPS : RESETS;
    const limit = newPassword === null ? MAX_ATTEMPTS_PER_WINDOW : MAX_RESETS_PER_WINDOW;
    if (overLimit(store.get(ip) ?? [], limit, now)) {
      return NextResponse.json(
        {
          error: 'Too many attempts from this device. Wait a while, or ask the '
            + 'Theatre Manager to reset it for you.',
          retryAfterSeconds: retryAfterSeconds(store.get(ip) ?? [], now),
        },
        { status: 429 },
      );
    }
    record(store, ip, now);

    const match = await resolveRecoveryUser(identifier);

    // Said plainly, unlike the one-time-code route. That route stays silent
    // because telling a stranger which accounts exist is its whole risk; here
    // the account can be opened outright, so silence protects nothing and
    // would only leave a real member of staff typing a password into a form
    // that was never going to work.
    if (!match) {
      return NextResponse.json(
        {
          error: 'That Staff ID number is not on file. Check the number on your '
            + 'hospital ID card, or ask the Theatre Manager.',
          code: 'NOT_FOUND',
        },
        { status: 404 },
      );
    }

    const { user, matchedBy } = match;

    /* ---- Phase 1: who this is, and what their username is ---------------- */
    if (newPassword === null) {
      return NextResponse.json({
        found: true,
        fullName: user.fullName,
        username: user.username,
        identifiedBy: matchedBy,
        // So the screen can say whether a confirmation message will arrive.
        willNotifyPhone: Boolean(user.phoneNumber),
      });
    }

    /* ---- Phase 2: set the new password ----------------------------------- */
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 },
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashed,
          // Anything outstanding dies with the reset: a code sitting in an
          // inbox after the password has changed is a second key to a changed
          // lock.
          resetToken: null,
          resetTokenExpiry: null,
          // They have just chosen a password. Demanding another one at sign-in
          // is how people end up choosing something they will forget again.
          isFirstLogin: false,
          mustChangePassword: false,
        },
      }),
      prisma.authOtp.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'PASSWORD_RESET_BY_STAFF_ID',
          tableName: 'users',
          recordId: user.id,
          changes: JSON.stringify({
            method: 'Staff ID number, no one-time code',
            identifiedBy: matchedBy,
            requestIp: ip,
          }),
        },
      }),
    ]);

    // Detection, not prevention. Never blocks, never changes the answer.
    if (user.phoneNumber) {
      sendSms(user.phoneNumber, passwordChangedSms(user.fullName)).catch(() => {
        /* a dead gateway must not undo a password the user has already set */
      });
    }

    return NextResponse.json({
      ok: true,
      username: user.username,
      fullName: user.fullName,
      message: 'Your password has been changed. You can sign in now.',
    });
  } catch (error) {
    console.error('[staff-id-reset] failed:', error);
    return NextResponse.json(
      { error: 'Your password could not be changed. Please try again.' },
      { status: 500 },
    );
  }
}
