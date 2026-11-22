/**
 * The patient's own number, for the office that is waiting on their payment.
 *
 * WHY THIS IS A SEPARATE REQUEST rather than another field on the readiness
 * board. The board is deliberately open wide -- knowing that a case is not
 * ready is operational, and half the theatre needs it. A patient's personal
 * phone number is not that, and shipping it inside the list payload would hand
 * it to every role that can see the board, on every page load, whether anybody
 * looked at it or not.
 *
 * So it is fetched only when somebody actually clicks the name, only for the
 * roles that collect the money, and every disclosure is written to the audit
 * trail. "Who pulled up this patient's number, and when" is a question the
 * hospital may one day have to answer.
 *
 * The message itself is built here rather than in the browser so that the
 * counts in it come from the database and not from whatever the page last
 * rendered -- a notice telling a patient to pay for thirty items when six are
 * outstanding is worse than no notice.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { patientContact } from '@/lib/patients/contact';
import { whatsappLink } from '@/lib/whatsapp';
import {
  buildPatientPayMessage,
  buildShortPayMessage,
  canNotifyPatientAboutPacks,
  outstandingPayPoints,
  payNoticeProblem,
} from '@/lib/packs/patientPayNotice';
import { OUTSTANDING_STATUSES } from '@/lib/packs/chase';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized - Please login' }, { status: 401 });
  }

  if (!canNotifyPatientAboutPacks(session.user.role)) {
    return NextResponse.json(
      {
        error:
          'Only the consumable office, the theatre pharmacy and theatre management '
          + 'may bring up a patient’s phone number from this board.',
      },
      { status: 403 },
    );
  }

  try {
    const surgery = await prisma.surgery.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        procedureName: true,
        scheduledDate: true,
        scheduledTime: true,
        location: true,
        patient: {
          select: {
            id: true,
            name: true,
            folderNumber: true,
            phoneNumber: true,
            caregiverName: true,
            caregiverPhone: true,
          },
        },
      },
    });
    if (!surgery) return NextResponse.json({ error: 'No such case' }, { status: 404 });
    if (!surgery.patient) {
      return NextResponse.json({ error: 'This case has no patient record' }, { status: 404 });
    }

    // Outstanding counts, read now rather than trusted from the caller. The
    // numbers go into a message a patient will act on.
    // Filtered in TypeScript rather than in the WHERE clause, because
    // OUTSTANDING_STATUSES is the pack module's own list and Prisma types the
    // column as its generated enum. Casting the list to that enum would make
    // the two definitions silently independent: add a status to the lib and
    // this query would keep using the old set without a word. The chase route
    // does the same, for the same reason.
    const [consumableRows, pharmacyRows] = await Promise.all([
      prisma.surgeryConsumableRequest.findMany({
        where: { surgeryId: surgery.id },
        select: { status: true },
      }),
      prisma.surgeryDrugDressingRequest.findMany({
        where: { surgeryId: surgery.id },
        select: { status: true },
      }),
    ]);
    const consumable = consumableRows
      .filter((r) => OUTSTANDING_STATUSES.includes(r.status)).length;
    const pharmacy = pharmacyRows
      .filter((r) => OUTSTANDING_STATUSES.includes(r.status)).length;

    const contact = patientContact(surgery.patient);
    const outstanding = { consumable, pharmacy };
    const problem = payNoticeProblem({ outstanding, hasContact: Boolean(contact) });

    const scheduledAt = surgery.scheduledDate ?? null;
    const common = {
      patientName: surgery.patient.name,
      outstanding,
      owner: contact?.owner ?? ('PATIENT' as const),
      procedureName: surgery.procedureName,
      scheduledAt,
      theatreName: surgery.location,
      senderName: session.user.name ?? null,
    };

    const message = problem ? null : buildPatientPayMessage(common);
    const shortMessage = problem ? null : buildShortPayMessage(common);

    // Recorded whether or not a message is sent: the number was disclosed the
    // moment this responded.
    if (contact) {
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'READ',
          tableName: 'patient_contact_for_pack_payment',
          recordId: surgery.id,
          changes: JSON.stringify({
            patientId: surgery.patient.id,
            owner: contact.owner,
            outstanding,
            payPoints: outstandingPayPoints(outstanding),
          }),
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      patient: {
        name: surgery.patient.name,
        folderNumber: surgery.patient.folderNumber,
      },
      // The numbers as recorded, so staff can read them out on a call, plus the
      // normalised form wa.me needs.
      contact: contact
        ? {
          owner: contact.owner,
          ownerLabel: contact.ownerLabel,
          asRecorded: contact.asRecorded,
          tel: `tel:${contact.asRecorded.replace(/\s+/g, '')}`,
          whatsapp: message ? whatsappLink(contact.asRecorded, message) : null,
          whatsappShort: shortMessage ? whatsappLink(contact.asRecorded, shortMessage) : null,
        }
        : null,
      outstanding,
      payPoints: outstandingPayPoints(outstanding),
      problem,
      message,
      shortMessage,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[surgeries/patient-contact] failed', err);
    return NextResponse.json({ error: 'Could not look up that patient' }, { status: 500 });
  }
}
