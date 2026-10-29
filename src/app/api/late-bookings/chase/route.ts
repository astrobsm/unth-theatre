// ============================================================
// Chasing one late elective booking
// ------------------------------------------------------------
//   POST { surgeryId } — record the offence, send the booker a WhatsApp
//   chase, tell the unit's supervising consultant, and on the third and
//   every later offence raise a formal query copied to the head of
//   department for the subspecialty.
//
// THE LATENESS IS RECOMPUTED HERE, never taken from the request. The client
// says which case; the server decides whether it was late. A warning issued
// because a browser asserted something is a warning that cannot be defended.
//
// IDEMPOTENT BY CASE. The unique index on surgeryId means pressing this
// twice records one offence. That matters more than it sounds: the ladder
// counts rows, and a double press would move somebody from a second warning
// to a formal query for a single late booking.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/apiMiddleware';
import { bookingLateness, formatBookedAt } from '@/lib/bookingLateness';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';
import {
  escalationFor,
  countsTowardsEscalation,
  buildChaseMessage,
  buildConsultantNotice,
  ESCALATION_LABELS,
  DEFAULT_COUNTING_FROM,
} from '@/lib/lateBooking/escalation';
import { standingFor, PERFORMANCE_WINDOW_DAYS } from '@/lib/lateBooking/punctuality';

export const dynamic = 'force-dynamic';

const ACT_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
] as const;

/** Which head of department covers a subspecialty. */
function headRoleFor(subspecialty: string): string[] {
  const s = (subspecialty ?? '').toLowerCase();
  if (/obstet|gynae/.test(s)) return ['HEAD_OF_OBSTETRICS_GYNAECOLOGY'];
  if (/anaesth/.test(s)) return ['HEAD_OF_ANAESTHESIA'];
  // Every surgical subspecialty sits under the Head of Surgery. Listed
  // explicitly rather than defaulted silently so an unmapped subspecialty
  // is a visible choice, not an accident.
  return ['HEAD_OF_SURGERY'];
}

function generateRefNumber(): string {
  const d = new Date();
  const yy = d.getFullYear().toString().slice(-2);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `DQ-${yy}${mm}${dd}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

const dayLabel = (d: Date) =>
  new Date(d.getTime() + 60 * 60_000).toISOString().slice(0, 10);

export async function POST(request: NextRequest) {
  const { error, session } = await requireRole(ACT_ROLES as never);
  if (error) return error;

  const actor = session!.user as { id?: string; name?: string | null; fullName?: string | null };
  const actorName = actor.fullName || actor.name || 'Theatre Management';

  try {
    const body = await request.json();
    const surgeryId = String(body?.surgeryId ?? '');
    if (!surgeryId) {
      return NextResponse.json({ error: 'Which case?' }, { status: 400 });
    }

    const already = await prisma.lateBookingOffence.findUnique({ where: { surgeryId } });
    if (already) {
      return NextResponse.json({
        alreadyRecorded: true,
        offence: already,
        message: `Already recorded as ${ESCALATION_LABELS[already.level as never] ?? already.level} (number ${already.offenceNumber}). Nothing was sent again.`,
      });
    }

    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      select: {
        id: true,
        scheduledDate: true,
        scheduledTime: true,
        createdAt: true,
        surgeryType: true,
        unit: true,
        subspecialty: true,
        procedureName: true,
        bookedById: true,
        bookedByName: true,
        supervisingConsultantId: true,
        supervisingConsultantName: true,
        patient: { select: { name: true, folderNumber: true } },
      },
    });
    if (!surgery) return NextResponse.json({ error: 'No such case' }, { status: 404 });

    // Decided here, from the stored record.
    const verdict = bookingLateness({
      scheduledDate: surgery.scheduledDate,
      bookedAt: surgery.createdAt,
      surgeryType: surgery.surgeryType as unknown as string,
    });
    if (!verdict.isLate) {
      return NextResponse.json(
        { error: `This case was not late. ${verdict.reason}` },
        { status: 400 },
      );
    }

    if (!countsTowardsEscalation(surgery.createdAt, DEFAULT_COUNTING_FROM)) {
      return NextResponse.json(
        {
          error:
            `This case was booked before tracking began on ${DEFAULT_COUNTING_FROM}. ` +
            `It appears in the report but cannot be escalated — nobody may be sanctioned ` +
            `for conduct that preceded the rule.`,
        },
        { status: 400 },
      );
    }

    // ── Where on the ladder ───────────────────────────────────────────
    const countingFrom = new Date(DEFAULT_COUNTING_FROM);
    const prior = surgery.bookedById
      ? await prisma.lateBookingOffence.count({
          where: { personId: surgery.bookedById, createdAt: { gte: countingFrom } },
        })
      : await prisma.lateBookingOffence.count({
          where: {
            personName: surgery.bookedByName ?? 'Not recorded',
            createdAt: { gte: countingFrom },
          },
        });

    const decision = escalationFor(prior);

    const personName = (surgery.bookedByName ?? '').trim() || 'Not recorded';

    // ── Where they presently stand ────────────────────────────────────
    // The chase is an appeal, and the appeal is to a figure: "X of your Y
    // bookings were late." That figure is computed here from the record
    // rather than taken from the report the operator was looking at, so the
    // number quoted to a named clinician is one the server can defend.
    const windowStart = new Date(Date.now() - PERFORMANCE_WINDOW_DAYS * 24 * 3_600_000);
    const standingRows = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: windowStart },
        surgeryType: 'ELECTIVE' as never,
        ...(surgery.bookedById
          ? { bookedById: surgery.bookedById }
          : { bookedByName: surgery.bookedByName ?? '__none__' }),
      },
      select: { scheduledDate: true, createdAt: true, surgeryType: true },
    });
    const standing = {
      ...standingFor(
        standingRows.map((r) => ({
          scheduledDate: r.scheduledDate,
          createdAt: r.createdAt,
          surgeryType: r.surgeryType as unknown as string,
        })),
      ),
      periodLabel: `the last ${PERFORMANCE_WINDOW_DAYS} days`,
    };
    const patientLabel = surgery.patient?.folderNumber
      ? `${surgery.patient.name} (${surgery.patient.folderNumber})`
      : (surgery.patient?.name ?? 'Patient');
    const unit = surgery.unit ?? 'Unrecorded unit';

    // ── The formal query, when it is earned ───────────────────────────
    let queryId: string | null = null;
    if (decision.raisesQuery && surgery.bookedById) {
      const person = await prisma.user.findUnique({
        where: { id: surgery.bookedById },
        select: { id: true, fullName: true, role: true },
      });
      if (person) {
        const deadline = new Date(Date.now() + 48 * 3_600_000);
        const created = await prisma.disciplinaryQuery.create({
          data: {
            referenceNumber: generateRefNumber(),
            recipientId: person.id,
            recipientName: person.fullName,
            recipientRole: String(person.role),
            recipientUnit: unit,
            queryType: 'PROTOCOL_VIOLATION',
            subject: `Repeated late booking of elective surgery (offence ${decision.offenceNumber})`,
            description:
              `Dear ${person.fullName},\n\n` +
              `This is to formally query you regarding the booking of elective surgical cases ` +
              `after the stipulated deadline of 15:00 on the day preceding surgery.\n\n` +
              `The present case is as follows:\n` +
              `  Patient: ${patientLabel}\n` +
              `  Procedure: ${surgery.procedureName ?? 'Not recorded'}\n` +
              `  Unit: ${unit}\n` +
              `  Scheduled for: ${dayLabel(surgery.scheduledDate)}\n` +
              `  Booked: ${formatBookedAt(surgery.createdAt)}\n` +
              `  Hours past the deadline: ${Math.round(verdict.hoursLate ?? 0)}\n\n` +
              `This is late booking number ${decision.offenceNumber} recorded against you since ` +
              `tracking began on ${DEFAULT_COUNTING_FROM}. Two prior warnings have been issued.\n\n` +
              `Late booking of elective cases disrupts work that is already complete. By 15:00 the ` +
              `operating list has been planned, CSSD has begun sterilising for the following day, ` +
              `pharmacy and the consumable pack providers have drawn their packs, and nursing ` +
              `assignments have been made. A case arriving after that point displaces another ` +
              `patient's preparation.\n\n` +
              `You are required to provide a written explanation within 48 hours of receipt of ` +
              `this query. A copy has been forwarded to your Head of Department.\n\n` +
              `Where a genuine difficulty prevents booking before 15:00, this must be communicated ` +
              `to the Theatre Manager or the Theatre Chairman before 12 noon on the preceding day.\n\n` +
              `Signed,\nTheatre Management\nUniversity of Nigeria Teaching Hospital, Ituku-Ozalla`,
            deadlineTime: deadline,
            deadlineType: 'LATE_BOOKING_48H',
            evidence: JSON.stringify({
              surgeryId: surgery.id,
              bookedAt: surgery.createdAt,
              scheduledDate: surgery.scheduledDate,
              hoursLate: verdict.hoursLate,
              offenceNumber: decision.offenceNumber,
              cutoff: verdict.cutoff,
            }),
            issuedById: actor.id ?? null,
            issuedByName: 'Theatre Management',
            issuedByTitle: 'University of Nigeria Teaching Hospital, Ituku-Ozalla',
          },
        });
        queryId = created.id;

        // Copy the head of department for the subspecialty.
        const heads = await prisma.user.findMany({
          where: { role: { in: headRoleFor(surgery.subspecialty ?? '') as never } },
          select: { id: true },
        });
        for (const head of heads) {
          await prisma.notification.create({
            data: {
              userId: head.id,
              type: 'LATE_BOOKING_QUERY',
              title: `Query issued: repeated late booking (${unit})`,
              message:
                `${person.fullName} has been issued a formal query (Ref: ${created.referenceNumber}) ` +
                `for late booking number ${decision.offenceNumber}. A copy is on the case record and ` +
                `a PDF can be printed from the late-booking report.`,
              link: `/dashboard/late-bookings?case=${surgery.id}`,
            },
          });
        }
      }
    }

    // ── The chase to whoever booked it ────────────────────────────────
    const chase = buildChaseMessage({
      personName,
      patientLabel,
      procedureName: surgery.procedureName ?? 'Not recorded',
      scheduledFor: dayLabel(surgery.scheduledDate),
      bookedAtLabel: formatBookedAt(surgery.createdAt),
      decision,
      unit,
      standing,
    });

    let whatsappQueued = false;
    let whatsappSkipped: string | null = null;
    // The number and the text, handed back so the operator's own WhatsApp can
    // carry the message immediately.
    //
    // THE QUEUE IS NOT A DELIVERY. A queued WHATSAPP row waits for a provider
    // that is not configured here, so until it is, "WhatsApp chase queued"
    // meant the booker heard nothing at all. A wa.me hand-off is what actually
    // reaches them today, and it reaches them from a person rather than from a
    // system — which suits a message that is asking for cooperation.
    let whatsapp: { number: string; text: string } | null = null;

    if (surgery.bookedById) {
      // The number has to be resolved HERE. The send policy refuses an
      // external channel with no address, so a chase queued without one is
      // recorded as cancelled and the booker is never actually reached — a
      // warning nobody receives, which is the one failure mode this feature
      // cannot have.
      const bookerContact = await prisma.user
        .findUnique({ where: { id: surgery.bookedById }, select: { phoneNumber: true } })
        .catch(() => null);
      const wa = bookerContact?.phoneNumber ? toWhatsAppNumber(bookerContact.phoneNumber) : null;

      const q = await queueMessage({
        channel: 'WHATSAPP' as never,
        priority: 'NORMAL' as never,
        recipientUserId: surgery.bookedById,
        recipientName: personName,
        recipientAddress: wa,
        recipientIsStaff: true,
        body: chase,
        relatedType: 'SURGERY',
        relatedId: surgery.id,
        trigger: 'LATE_BOOKING_CHASE',
        scope: surgery.id,
        escalationLevel: decision.offenceNumber,
        createdById: actor.id ?? null,
        createdByName: actorName,
      });
      whatsappQueued = q.queued === true;
      if (!q.queued) whatsappSkipped = q.reason ?? 'Not queued';
      if (wa) whatsapp = { number: wa, text: chase };
      else whatsappSkipped = `${personName} has no phone number on file.`;

      // In-app as well as WhatsApp. A staff member who has opted out of
      // WhatsApp, or has no number on file, must still be told — a warning
      // nobody received is not a warning.
      await prisma.notification.create({
        data: {
          userId: surgery.bookedById,
          type: 'LATE_BOOKING_WARNING',
          title: `${ESCALATION_LABELS[decision.level]}: late elective booking`,
          message: decision.summary,
          link: `/dashboard/surgeries/${surgery.id}`,
        },
      });
    } else {
      whatsappSkipped = 'No booker recorded on this case.';
    }

    // ── The unit's supervising consultant ─────────────────────────────
    if (surgery.supervisingConsultantId) {
      const notice = buildConsultantNotice({
        bookerName: personName,
        unit,
        patientLabel,
        procedureName: surgery.procedureName ?? 'Not recorded',
        scheduledFor: dayLabel(surgery.scheduledDate),
        decision,
      });
      await prisma.notification.create({
        data: {
          userId: surgery.supervisingConsultantId,
          type: 'LATE_BOOKING_UNIT',
          title: notice.title,
          message: notice.message,
          link: `/dashboard/late-bookings?case=${surgery.id}`,
        },
      });
    }

    const offence = await prisma.lateBookingOffence.create({
      data: {
        surgeryId: surgery.id,
        personId: surgery.bookedById,
        personName,
        unit,
        subspecialty: surgery.subspecialty ?? 'Not recorded',
        offenceNumber: decision.offenceNumber,
        level: decision.level,
        hoursLate: verdict.hoursLate,
        consultantId: surgery.supervisingConsultantId,
        consultantName: surgery.supervisingConsultantName,
        disciplinaryQueryId: queryId,
        whatsappQueued,
        whatsappSkipped,
        recordedById: actor.id ?? null,
        recordedByName: actorName,
      },
    });

    return NextResponse.json({
      offence,
      decision,
      whatsappQueued,
      whatsappSkipped,
      queryId,
      standing,
      whatsapp,
    });
  } catch (err) {
    console.error('[late-bookings/chase] failed:', err);
    return NextResponse.json({ error: 'Could not record this one' }, { status: 500 });
  }
}
