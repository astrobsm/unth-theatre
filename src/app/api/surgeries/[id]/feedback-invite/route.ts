// ============================================================
// "Tell us how it went" — handed over at the end of care
// ------------------------------------------------------------
// GET  — whether this case is ready to be asked about, and whether somebody
//        already asked.
// POST — mint an invitation: a one-time anonymous link, the message to send
//        with it, and a wa.me hand-off.
//
// THE HOSPITAL NEVER LEARNS WHO ANSWERED. The row created here knows which
// patient it was, because that is how the invitation is kept to one per case
// and how the unit is attached. The moment the form is submitted, that row's
// patientId and surgeryId are cleared, in the same transaction as the
// feedback is written. After that there is no join from an opinion back to a
// person — see POST /api/feedback/patient.
//
// It is offered only on a case that is FINISHED. An invitation handed over
// before the patient has been through recovery buys an answer about half an
// experience, and it only works once.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { patientContact } from '@/lib/patients/contact';
import {
  newInviteToken, inviteExpiry, inviteUrl, buildInviteMessage, careContextOf,
  INVITE_TTL_DAYS,
} from '@/lib/patients/feedbackInvite';

export const dynamic = 'force-dynamic';

/** Who hands a patient the invitation. The people who are there at the end. */
const MAY_INVITE = [
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'INFECTION_CONTROL_NURSE', 'NURSE',
  'WARD_NURSE', 'NURSE_MANAGER', 'MATRON',
  'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ANAESTHETIC_TECHNICIAN',
  'SURGEON', 'CONSULTANT_SURGEON',
  'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ADMIN', 'SYSTEM_ADMINISTRATOR',
  'BOOKING_OFFICER',
];

/** Care is over, one way or the other. A cancelled patient has an experience too. */
const FINISHED = ['COMPLETED', 'CANCELLED'];

async function load(id: string) {
  return prisma.surgery.findUnique({
    where: { id },
    select: {
      id: true, status: true, unit: true, location: true, completedAt: true,
      patient: {
        select: {
          id: true, name: true,
          phoneNumber: true, caregiverName: true, caregiverPhone: true,
        },
      },
    },
  });
}

/** An invitation that is still open, if there is one. */
async function existingInvite(surgeryId: string) {
  return prisma.feedbackRequest.findFirst({
    where: { surgeryId, submittedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { requestedAt: 'desc' },
    select: { id: true, requestedAt: true, requestedByName: true, expiresAt: true },
  }).catch(() => null);
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const surgery = await load(params.id);
    if (!surgery) {
      return NextResponse.json({ error: 'That case could not be found.' }, { status: 404 });
    }

    const open = await existingInvite(surgery.id);
    const already = await prisma.feedbackRequest.findFirst({
      where: { surgeryId: surgery.id, submittedAt: { not: null } },
      select: { submittedAt: true },
    }).catch(() => null);

    return NextResponse.json({
      finished: FINISHED.includes(surgery.status),
      status: surgery.status,
      patientName: surgery.patient?.name ?? null,
      contact: surgery.patient
        ? (() => {
          const c = patientContact(surgery.patient!);
          return c ? { ownerLabel: c.ownerLabel, number: c.whatsAppNumber } : null;
        })()
        : null,
      // An invitation already out there. The token cannot be shown again — it
      // was never stored — so the honest answer is to say one exists and offer
      // to issue a fresh one, not to pretend to reprint it.
      openInvite: open
        ? {
          requestedAt: open.requestedAt,
          requestedByName: open.requestedByName,
          expiresAt: open.expiresAt,
        }
        : null,
      // Said WITHOUT saying what they wrote. That the patient answered is a
      // fact about this case; what they answered is not.
      alreadyAnswered: Boolean(already),
      ttlDays: INVITE_TTL_DAYS,
    });
  } catch (error) {
    return apiError('surgeries/[id]/feedback-invite GET', error);
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!MAY_INVITE.includes((session.user.role ?? '').toUpperCase())) {
    return NextResponse.json({
      error: 'Inviting a patient to give feedback is done by the ward and theatre staff.',
      code: 'NO_ACCESS',
    }, { status: 403 });
  }

  try {
    const surgery = await load(params.id);
    if (!surgery?.patient) {
      return NextResponse.json({ error: 'That case could not be found.' }, { status: 404 });
    }

    if (!FINISHED.includes(surgery.status)) {
      return NextResponse.json({
        error: 'This patient\'s care is not finished yet. The invitation works once, so '
          + 'asking now buys an answer about half an experience — wait until the case is '
          + 'completed.',
        code: 'NOT_FINISHED',
        status: surgery.status,
      }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const replace = body?.replace === true;

    const open = await existingInvite(surgery.id);
    if (open && !replace) {
      return NextResponse.json({
        error: `An invitation was already given to this patient on `
          + `${open.requestedAt.toISOString().slice(0, 10)}`
          + `${open.requestedByName ? ` by ${open.requestedByName}` : ''}, and it is still `
          + `open. Issuing another does not cancel it; send the first one again if the `
          + `patient lost it.`,
        code: 'ALREADY_INVITED',
        openInvite: {
          requestedAt: open.requestedAt,
          requestedByName: open.requestedByName,
          expiresAt: open.expiresAt,
        },
      }, { status: 409 });
    }

    const { token, tokenHash } = newInviteToken();
    await prisma.feedbackRequest.create({
      data: {
        patientId: surgery.patient.id,
        surgeryId: surgery.id,
        tokenHash,
        expiresAt: inviteExpiry(),
        requestedById: session.user.id,
        requestedByName: session.user.name ?? null,
      },
    });

    const url = inviteUrl(token);
    const text = buildInviteMessage({ patientName: surgery.patient.name, url });
    const contact = patientContact(surgery.patient);

    // Deliberately NOT recording the patient's name against the audit row's
    // changes blob beyond the id already in recordId: this log is read by
    // administrators, and the point of the feature is that an opinion cannot
    // be tied back to a person. Who was INVITED is a fact about the case; it
    // is what they SAID that stays unlinked.
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'FEEDBACK_INVITED',
        tableName: 'surgeries',
        recordId: surgery.id,
        changes: JSON.stringify({ replaced: Boolean(open), ttlDays: INVITE_TTL_DAYS }),
      },
    }).catch(() => { /* the invitation matters more than the log of it */ });

    return NextResponse.json({
      ok: true,
      url,
      text,
      ttlDays: INVITE_TTL_DAYS,
      // Null is a usable answer here, unlike on the notice route: the link can
      // be read off the screen, written down, or shown as a QR code to
      // somebody with no phone at all.
      to: contact?.ownerLabel ?? null,
      handoff: contact
        ? `https://wa.me/${contact.whatsAppNumber}?text=${encodeURIComponent(text)}`
        : null,
      careContext: careContextOf(surgery),
    });
  } catch (error) {
    return apiError('surgeries/[id]/feedback-invite POST', error);
  }
}
