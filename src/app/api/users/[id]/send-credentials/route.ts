import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';
import {
  generateTemporaryPassword,
  temporaryPasswordExpiry,
  credentialMessage,
  credentialTemplateVariables,
  TEMP_PASSWORD_TTL_HOURS,
} from '@/lib/auth/temporaryPassword';

export const dynamic = 'force-dynamic';

/**
 * Send a member of staff their username and a temporary password on WhatsApp.
 *
 * The complaint this answers is people forgetting BOTH, and the old remedy —
 * an administrator typing a new password into a box and then telephoning it —
 * failed twice over: the password was chosen by whoever was on the desk, and
 * it was never forced to be changed.
 *
 * ORDER MATTERS HERE, and it is not the obvious one.
 *
 * Everything that can refuse is checked BEFORE the password is touched: the
 * account exists, it is approved, it has a WhatsApp number, and the number is
 * in a shape Meta will accept. A reset that succeeds and then fails to send
 * leaves somebody locked out of an account whose password nobody knows — which
 * is strictly worse than the state they were already in.
 *
 * Then the password changes and the message is queued. If queueing still fails
 * after all that, the response carries the temporary password back to the
 * ADMINISTRATOR who asked for it, once, so it can be passed on by another
 * route. It is the only circumstance in which this endpoint returns it, and it
 * is better than a silent lockout.
 */

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

/** The approved WhatsApp template, when one is configured. */
const TEMPLATE_CODE = process.env.WHATSAPP_CREDENTIALS_TEMPLATE ?? null;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const actor = session!.user as { id: string; role: string; fullName?: string; name?: string };
  if (!ADMIN_ROLES.includes(actor.role)) {
    return NextResponse.json(
      { error: 'Only an administrator or theatre manager can send login details.' },
      { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, username: true, fullName: true, phoneNumber: true, status: true },
  });
  if (!user) return NextResponse.json({ error: 'No such user.' }, { status: 404 });

  // A suspended or rejected account must not be handed working credentials.
  if (user.status !== 'APPROVED') {
    return NextResponse.json(
      { error: `That account is ${user.status.toLowerCase()}, so it cannot be sent login details. Approve it first.` },
      { status: 409 });
  }

  if (!user.phoneNumber) {
    return NextResponse.json(
      { error: `${user.fullName} has no phone number on file, so there is nowhere to send this.` },
      { status: 400 });
  }

  const wa = toWhatsAppNumber(user.phoneNumber);
  if (!wa) {
    return NextResponse.json(
      { error: `"${user.phoneNumber}" is not a number WhatsApp will accept. Correct it on the user first.` },
      { status: 400 });
  }

  // Everything that can refuse has refused. Only now is the account touched.
  const temporaryPassword = generateTemporaryPassword();
  const expiresAt = temporaryPasswordExpiry();
  const hashed = await bcrypt.hash(temporaryPassword, 10);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        // The whole point: they set their own on the way in.
        mustChangePassword: true,
        // Reused as the temporary password's own expiry. Any outstanding
        // reset link is invalidated by the same write, so two routes to the
        // account cannot be open at once.
        resetToken: null,
        resetTokenExpiry: expiresAt,
      },
    });
  } catch (e) {
    console.error('[users/send-credentials] could not set the password:', e);
    return NextResponse.json(
      { error: 'The password could not be changed, so nothing was sent.' },
      { status: 500 });
  }

  // Recorded without the password. That somebody reset another person's
  // credentials is exactly the kind of act an audit log exists for; the
  // credential itself is not something to keep.
  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'UPDATE',
      tableName: 'users',
      recordId: user.id,
      changes: JSON.stringify({
        action: 'SEND_LOGIN_DETAILS',
        to: `${user.fullName} (${user.username})`,
        channel: 'WHATSAPP',
        by: actor.fullName || actor.name || actor.id,
        expiresAt: expiresAt.toISOString(),
      }),
    },
  }).catch((e) => console.error('[users/send-credentials] audit failed:', e));

  const body = credentialMessage({
    fullName: user.fullName,
    username: user.username,
    temporaryPassword,
    expiresAt,
  });

  const queued = await queueMessage({
    channel: 'WHATSAPP',
    priority: 'HIGH',
    recipientUserId: user.id,
    recipientName: user.fullName,
    recipientAddress: wa,
    recipientIsStaff: true,
    // No patient is named. This is about a staff account.
    sensitivity: 'OPERATIONAL',
    templateCode: TEMPLATE_CODE,
    variables: credentialTemplateVariables({
      fullName: user.fullName, username: user.username, temporaryPassword, expiresAt,
    }),
    body,
    trigger: 'ACCOUNT_CREDENTIALS',
    // Scoped to the user AND the moment. Scoping to the user alone would make
    // a second, genuinely wanted reset look like a duplicate of the first and
    // be silently dropped.
    scope: `${user.id}:${expiresAt.getTime()}`,
    relatedType: 'user',
    relatedId: user.id,
    createdById: actor.id,
    createdByName: actor.fullName || actor.name || null,
  });

  if (!queued.queued) {
    // The password HAS changed. Saying so, and handing it back once, is the
    // only honest thing to do — the alternative is an administrator who thinks
    // nothing happened and a member of staff who can no longer sign in.
    console.warn('[users/send-credentials] message not queued:', queued.reason);
    return NextResponse.json({
      ok: false,
      passwordChanged: true,
      temporaryPassword,
      expiresAt,
      error:
        `The password was changed but WhatsApp would not accept the message (${queued.reason ?? 'unknown reason'}). `
        + 'Give them these details another way — they will not be shown again.',
    }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    sentTo: user.phoneNumber,
    username: user.username,
    expiresAt,
    expiresInHours: TEMP_PASSWORD_TTL_HOURS,
    duplicate: queued.duplicate ?? false,
  });
}
