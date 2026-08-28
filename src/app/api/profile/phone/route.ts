import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { normaliseNigerianPhone, maskPhone } from '@/lib/auth/otp';

export const dynamic = 'force-dynamic';

/**
 * The user's own recovery phone number.
 *
 * Recovery only works if the number on file is right, and the number on file is
 * whatever an administrator typed when the account was created. Sixteen
 * approved staff have no number at all, and nobody knows how many of the other
 * 532 are wrong until the day somebody is locked out and the code goes to a
 * handset they stopped using two years ago.
 *
 * So: let people fix their own, while they can still sign in. This is also the
 * number "Chase on WhatsApp" dials, so a correction here fixes two things.
 *
 * Deliberately NOT an OTP-verified change. A signed-in session is already proof
 * of identity, and demanding a code sent to the old number would defeat the one
 * case that matters most — the person whose old number no longer works.
 */

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    select: { phoneNumber: true },
  });

  const normalised = normaliseNigerianPhone(user?.phoneNumber);
  return NextResponse.json({
    phoneNumber: user?.phoneNumber ?? null,
    masked: normalised ? maskPhone(normalised) : null,
    usable: Boolean(normalised),
  });
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({} as any));
  const raw = String(body.phoneNumber ?? '').trim();

  const normalised = normaliseNigerianPhone(raw);
  if (!normalised) {
    return NextResponse.json(
      { error: 'Enter a Nigerian mobile number, for example 08039133373.' },
      { status: 400 },
    );
  }

  // Stored in the local 0803... form, which is how every other number in this
  // database is written and how staff read it back to each other. The E.164
  // form is derived when sending, not stored.
  const local = `0${normalised.slice(3)}`;

  await prisma.user.update({
    where: { id: (session.user as any).id },
    data: { phoneNumber: local },
  });

  await prisma.auditLog.create({
    data: {
      userId: (session.user as any).id,
      action: 'PHONE_NUMBER_UPDATED',
      tableName: 'users',
      recordId: (session.user as any).id,
      changes: JSON.stringify({ masked: maskPhone(normalised) }),
    },
  }).catch(() => { /* not worth failing the update over */ });

  return NextResponse.json({ ok: true, phoneNumber: local, masked: maskPhone(normalised) });
}
