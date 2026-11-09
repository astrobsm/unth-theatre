// ============================================================
// Telling the patient
// ------------------------------------------------------------
// GET  — who this would reach, and the lists of things that may be said. The
//        screen shows whose phone it is BEFORE anybody presses send, because
//        "the patient" and "the patient's son" are different decisions.
// POST — send it: the queued record, and a wa.me hand-off to send it now.
//
// WHY A HAND-OFF AS WELL AS A QUEUE. A business-initiated WhatsApp message may
// only use a template Meta has approved, and approval takes days. Until the
// four patient templates are approved, queueMessage will record each one as
// refused, with the reason — which is correct and auditable, and delivers
// nothing. So the response also carries a wa.me link with exactly the same
// text, which the nurse presses and sends from their own WhatsApp. The day
// Meta approves the templates, the queue starts delivering and not one line of
// this changes.
//
// IT REFUSES WHEN NOBODY CAN BE REACHED. A patient with no usable number gets
// 409 and a message naming the two boxes that would fix it — never a cheerful
// "sent" over a send loop that ran zero times.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { queueMessage } from '@/lib/comms/send';
import { patientContact, NO_CONTACT_MESSAGE } from '@/lib/patients/contact';
import { patientFeedbackLink } from '@/lib/patients/publicLink';
import {
  buildPatientNotice, noticeAuditLine, reasonsFor, depositSentence,
  DELAY_REASONS, CHANGE_REASONS, EATING_INSTRUCTIONS,
  type NoticeKind,
} from '@/lib/patients/notices';

export const dynamic = 'force-dynamic';

/**
 * Who may message a patient.
 *
 * Wider than the chase, because the people who know a list has slipped are the
 * ward and theatre nurses and the booking office, and narrower than "anybody
 * signed in", because this goes outside the hospital under the hospital's name.
 */
const MAY_MESSAGE = [
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'INFECTION_CONTROL_NURSE', 'NURSE',
  'WARD_NURSE', 'NURSE_MANAGER', 'MATRON',
  'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ANAESTHETIC_TECHNICIAN',
  'SURGEON', 'CONSULTANT_SURGEON',
  'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ADMIN', 'SYSTEM_ADMINISTRATOR',
  'BOOKING_OFFICER',
];

const KINDS: NoticeKind[] = [
  'SAFETY', 'PAYMENT_WARNING', 'STILL_HOLDING', 'RESCHEDULED', 'CANCELLED',
];

/**
 * The deposit sentence for this case, or null when there is no deposit.
 *
 * Null is the honest answer and the screen depends on it: the payment warning
 * tells a patient their deposit is paid at the revenue unit, and sending that
 * to somebody whose deposit has not been worked out tells them to go and pay an
 * amount nobody has set.
 */
async function depositFor(surgeryId: string): Promise<string | null> {
  const row = await prisma.caseDepositStatus.findUnique({
    where: { surgeryId },
    select: { consumableAmount: true, pharmacyAmount: true },
  }).catch(() => null);
  if (!row) return null;
  return depositSentence({
    consumableAmount: row.consumableAmount == null ? null : String(row.consumableAmount),
    pharmacyAmount: row.pharmacyAmount == null ? null : String(row.pharmacyAmount),
  });
}

async function load(surgeryId: string) {
  return prisma.surgery.findUnique({
    where: { id: surgeryId },
    select: {
      id: true, scheduledDate: true, scheduledTime: true, status: true,
      patient: {
        select: {
          id: true, name: true, folderNumber: true, ward: true,
          phoneNumber: true, caregiverName: true, caregiverPhone: true,
        },
      },
    },
  });
}

/** GET — what can be said, and to whom. */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const surgery = await load(params.id);
    if (!surgery) {
      return NextResponse.json({ error: 'That case could not be found.' }, { status: 404 });
    }

    const contact = surgery.patient ? patientContact(surgery.patient) : null;
    const deposit = await depositFor(surgery.id);

    return NextResponse.json({
      // Drives whether the payment warning is offered at all. Offering it on a
      // case with no deposit would put a button on the screen whose only
      // outcome is a refusal.
      depositActive: deposit !== null,
      depositSentence: deposit,
      patientName: surgery.patient?.name ?? null,
      ward: surgery.patient?.ward ?? null,
      scheduledDate: surgery.scheduledDate,
      scheduledTime: surgery.scheduledTime,
      // Null is the answer that makes the screen show the refusal up front,
      // rather than after somebody has composed a message.
      contact: contact
        ? { owner: contact.owner, ownerLabel: contact.ownerLabel, number: contact.whatsAppNumber }
        : null,
      noContactMessage: contact ? null : NO_CONTACT_MESSAGE,
      kinds: KINDS,
      delayReasons: DELAY_REASONS,
      changeReasons: CHANGE_REASONS,
      eatingInstructions: EATING_INSTRUCTIONS,
      feedbackLink: patientFeedbackLink(),
    });
  } catch (error) {
    return apiError('surgeries/[id]/patient-message GET', error);
  }
}

/** POST — send one of the four. */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!MAY_MESSAGE.includes((session.user.role ?? '').toUpperCase())) {
    return NextResponse.json({
      error: 'Messaging patients is done by the ward and theatre nurses, the surgical team '
        + 'and the booking office.',
      code: 'NO_ACCESS',
    }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const kind = String(body.kind ?? '').toUpperCase() as NoticeKind;
    if (!KINDS.includes(kind)) {
      return NextResponse.json({ error: 'Which message?' }, { status: 400 });
    }

    const surgery = await load(params.id);
    if (!surgery?.patient) {
      return NextResponse.json({ error: 'That case could not be found.' }, { status: 404 });
    }

    // THE REFUSAL. Checked before the message is built, so the answer is "there
    // is nobody to tell" rather than a composed message with nowhere to go.
    const contact = patientContact(surgery.patient);
    if (!contact) {
      return NextResponse.json({
        error: NO_CONTACT_MESSAGE,
        code: 'NO_PATIENT_NUMBER',
        sent: 0,
      }, { status: 409 });
    }

    const notice = buildPatientNotice({
      kind,
      patientName: surgery.patient.name,
      feedbackLink: patientFeedbackLink(),
      reasonKey: typeof body.reasonKey === 'string' ? body.reasonKey : null,
      instructionKey: typeof body.instructionKey === 'string' ? body.instructionKey : null,
      expected: typeof body.expected === 'string' ? body.expected.slice(0, 120) : null,
      newDate: typeof body.newDate === 'string' ? body.newDate.slice(0, 120) : null,
      // Read from the deposit row, never from the request. A figure a caller
      // could post is a figure a caller could get wrong, and this one tells a
      // patient how much money to carry to a cashier.
      deposit: kind === 'PAYMENT_WARNING' ? await depositFor(surgery.id) : null,
    });
    if (!notice.ok) {
      return NextResponse.json(
        { error: notice.problem, code: 'INCOMPLETE' },
        { status: 400 },
      );
    }

    const now = Date.now();
    const q = await queueMessage({
      channel: 'WHATSAPP' as never,
      priority: (kind === 'SAFETY' ? 'NORMAL' : 'HIGH') as never,
      recipientName: contact.ownerLabel,
      recipientAddress: contact.whatsAppNumber,
      recipientIsStaff: false,
      // The patient, or the next of kin recorded on their own file. This is
      // what lets a PATIENT_IDENTIFIED template leave the building at all.
      recipientIsPatient: true,
      templateCode: notice.templateCode,
      variables: notice.variables,
      relatedType: 'SURGERY',
      relatedId: surgery.id,
      trigger: `PATIENT_NOTICE_${kind}`,
      // One per press. Pressing it again an hour later is somebody deciding the
      // patient needs telling again, and they are right.
      scope: `${surgery.id}:${contact.whatsAppNumber}:${now}`,
      createdById: session.user.id,
      createdByName: session.user.name ?? null,
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'PATIENT_NOTICE_SENT',
        tableName: 'surgeries',
        recordId: surgery.id,
        changes: JSON.stringify({
          kind,
          to: contact.ownerLabel,
          owner: contact.owner,
          reasonKey: notice.variables.reason ? (body.reasonKey ?? null) : null,
          instructionKey: notice.variables.instructions ? (body.instructionKey ?? null) : null,
          queued: q.queued,
          queueReason: q.reason ?? null,
        }),
      },
    }).catch(() => { /* the message matters more than the log of it */ });

    return NextResponse.json({
      ok: true,
      kind,
      to: contact.ownerLabel,
      owner: contact.owner,
      number: contact.whatsAppNumber,
      text: notice.text,
      // The link that actually delivers today. Same text as the queued record,
      // because both came out of the same template render.
      handoff: `https://wa.me/${contact.whatsAppNumber}?text=${encodeURIComponent(notice.text)}`,
      queued: q.queued,
      // Shown rather than swallowed: "waiting for Meta to approve the template"
      // is something the theatre manager should be able to see and chase.
      queueNote: q.queued ? null : (q.reason ?? null),
      auditLine: noticeAuditLine(kind, contact.ownerLabel),
      reasons: reasonsFor(kind),
    });
  } catch (error) {
    return apiError('surgeries/[id]/patient-message POST', error);
  }
}
