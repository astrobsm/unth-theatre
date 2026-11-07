import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendSms } from '@/lib/sms';
import { resolveRecoveryUser } from '@/lib/auth/recoveryLookup';
import {
  generateCode,
  hashCode,
  canRequest,
  normaliseNigerianPhone,
  maskPhone,
  otpMessage,
  CODE_TTL_MS,
  GENERIC_REQUEST_RESPONSE,
  type OtpPurpose,
} from '@/lib/auth/otp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/otp/request
 * Body: { identifier: string, purpose: 'PASSWORD_RESET' | 'USERNAME_RECOVERY' }
 *
 * `identifier` is a STAFF ID NUMBER, a duty code, a phone number or a username.
 * The Staff ID printed on the card in a person's pocket is the identifier most
 * likely to be both known and correctly spelled; see lib/auth/recoveryLookup.
 *
 * THE RESPONSE IS ALWAYS THE SAME. Whether the account exists, has no phone
 * number, or was invented by whoever is poking at the endpoint, the caller sees
 * one sentence. Anything else turns this route into a way to enumerate 625
 * members of hospital staff by name.
 */

const PEPPER = process.env.OTP_PEPPER || process.env.NEXTAUTH_SECRET || '';

export async function POST(request: NextRequest) {
  // A pepper is not optional. Without one the stored hashes are a plain
  // six-digit SHA, which is a rainbow table with a million rows. Refuse to
  // issue codes at all rather than issue weak ones.
  if (!PEPPER) {
    console.error('[otp/request] OTP_PEPPER (or NEXTAUTH_SECRET) is not set. Refusing to issue codes.');
    return NextResponse.json(
      { error: 'Account recovery is not configured. Please contact the Theatre Manager.' },
      { status: 503 },
    );
  }

  const generic = NextResponse.json({ message: GENERIC_REQUEST_RESPONSE }, { status: 200 });

  try {
    const body = await request.json().catch(() => ({} as any));
    const identifier = String(body.identifier ?? '').trim();
    const purpose: OtpPurpose =
      body.purpose === 'USERNAME_RECOVERY' ? 'USERNAME_RECOVERY' : 'PASSWORD_RESET';

    if (!identifier) {
      return NextResponse.json(
        {
          error:
            'Enter your Staff ID number, or the phone number or username registered '
            + 'with your account.',
        },
        { status: 400 },
      );
    }

    // Staff ID number, duty code, phone number or username. One resolver,
    // shared with /otp/verify: when the two routes each had their own copy of
    // this lookup, adding a way of identifying yourself to one of them meant
    // the other would reject the code it had just sent.
    const match = await resolveRecoveryUser(identifier);

    // Unknown account, an identifier that names more than one account, or an
    // account with no usable phone number. The same answer to all three. The
    // 20 approved staff with no phone number on file reach the Theatre Manager
    // instead, and this route must not be the thing that tells an outsider who
    // they are.
    const destination = normaliseNigerianPhone(match?.user.phoneNumber);
    if (!match || !destination) return generic;
    const user = match.user;

    const recent = await prisma.authOtp.findMany({
      where: { userId: user.id, purpose },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { createdAt: true, consumedAt: true },
    });

    const verdict = canRequest(recent);
    if (!verdict.allowed) {
      // Told plainly, because this one is about the person's own account and
      // saying "wait 40 seconds" leaks nothing an attacker does not already
      // know from having just made the request.
      return NextResponse.json(
        {
          error:
            verdict.reason === 'COOLDOWN'
              ? `A code was just sent. Wait ${Math.ceil(verdict.retryAfterMs / 1000)} seconds before asking for another.`
              : 'Too many codes have been requested for this account. Try again later, or contact the Theatre Manager.',
          retryAfterSeconds: Math.ceil(verdict.retryAfterMs / 1000),
        },
        { status: 429 },
      );
    }

    // A new code invalidates every earlier one. Otherwise a user who taps
    // "resend" twice has three live codes and the attempt cap means a third as
    // much as it says.
    await prisma.authOtp.updateMany({
      where: { userId: user.id, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const code = generateCode();
    const otp = await prisma.authOtp.create({
      data: {
        userId: user.id,
        purpose,
        codeHash: hashCode(code, PEPPER),
        destination: maskPhone(destination),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
        requestIp:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          request.headers.get('x-real-ip') ||
          null,
      },
      select: { id: true },
    });

    const result = await sendSms(destination, otpMessage(code, purpose));

    if (result.reference) {
      await prisma.authOtp.update({
        where: { id: otp.id },
        data: { providerRef: result.reference },
      });
    }

    if (!result.sent) {
      // Logged, not surfaced. The user is told the same thing either way; the
      // people on support need to know the gateway is down.
      console.error('[otp/request] code was created but not delivered:', result.error);
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'OTP_REQUESTED',
        tableName: 'auth_otps',
        recordId: otp.id,
        changes: JSON.stringify({
          purpose,
          delivered: result.sent,
          provider: result.provider,
          // How they identified themselves, so a support call can be answered
          // without asking the person to repeat what they typed.
          identifiedBy: match.matchedBy,
        }),
      },
    }).catch(() => { /* an audit failure must not block a locked-out user */ });

    return NextResponse.json(
      { message: GENERIC_REQUEST_RESPONSE, sentTo: maskPhone(destination) },
      { status: 200 },
    );
  } catch (error) {
    console.error('[otp/request] failed:', error);
    // Still generic: an error here must not become a way to tell real accounts
    // from invented ones by watching which requests break.
    return generic;
  }
}
