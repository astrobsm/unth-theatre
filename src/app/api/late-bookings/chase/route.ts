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
import { consultantIdsOf } from '@/lib/surgery/consultantIds';

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

  // Hoisted so the catch can name the case. request.clone() is no use
  // there: the body has already been read by then.
  let surgeryId = '';

  try {
    const body = await request.json();
    surgeryId = String(body?.surgeryId ?? '');
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

    // -- The chase text, built before anything is written --
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

    // -- Who can actually be written to --
    //
    // Notification.userId carries a foreign key; bookedById and
    // supervisingConsultantId do not. Nothing has ever guaranteed that
    // either names a row in users, so both are checked here rather than
    // discovered by a constraint violation three writes later.
    const booker = surgery.bookedById
      ? await prisma.user.findUnique({
          where: { id: surgery.bookedById },
          select: { id: true, fullName: true, role: true, phoneNumber: true },
        }).catch(() => null)
      : null;

    const consultantIds = consultantIdsOf(surgery.supervisingConsultantId);
    const realConsultants = consultantIds.length
      ? await prisma.user.findMany({ where: { id: { in: consultantIds } }, select: { id: true } })
      : [];
    const unreachableConsultants = consultantIds.length - realConsultants.length;

    const consultantNotice = buildConsultantNotice({
      bookerName: personName,
      unit,
      patientLabel,
      procedureName: surgery.procedureName ?? 'Not recorded',
      scheduledFor: dayLabel(surgery.scheduledDate),
      decision,
    });

    // -- One transaction, or nothing --
    //
    // These writes used to run one after another with the offence row LAST,
    // so a failure part-way through left a formal disciplinary query issued
    // to a named clinician, their head of department notified, and no
    // offence recorded. The dialog then told the operator "Nothing was
    // saved, so pressing again is safe", which was false: every retry
    // issued another query with a new reference number.
    //
    // Now it is all-or-nothing, and the offence row is written FIRST so the
    // unique index on surgeryId is what stops a double press, rather than a
    // check made moments earlier.
    const { offence, queryId } = await prisma.$transaction(async (tx) => {
      const row = await tx.lateBookingOffence.create({
        data: {
          surgeryId: surgery.id,
          personId: surgery.bookedById,
          personName,
          unit,
          subspecialty: surgery.subspecialty ?? 'Not recorded',
          offenceNumber: decision.offenceNumber,
          level: decision.level,
          hoursLate: verdict.hoursLate,
          // The LIST, kept whole. Truncating it to the first id would
          // quietly drop the other consultants from the record of who was
          // told.
          consultantId: surgery.supervisingConsultantId,
          consultantName: surgery.supervisingConsultantName,
          recordedById: actor.id ?? null,
          recordedByName: actorName,
        },
      });

      let qid: string | null = null;
      if (decision.raisesQuery && booker) {
        const person = booker;
        const deadline = new Date(Date.now() + 48 * 3_600_000);
          const created = await tx.disciplinaryQuery.create({
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
        qid = created.id;

          // Copy the head of department for the subspecialty.
          const heads = await tx.user.findMany({
            where: { role: { in: headRoleFor(surgery.subspecialty ?? '') as never } },
            select: { id: true },
          });
          for (const head of heads) {
            await tx.notification.create({
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

      // The booker, in-app. A staff member with no number on file, or who
      // has opted out of WhatsApp, must still be told: a warning nobody
      // received is not a warning.
      if (booker) {
        await tx.notification.create({
          data: {
            userId: booker.id,
            type: 'LATE_BOOKING_WARNING',
            title: `${ESCALATION_LABELS[decision.level]}: late elective booking`,
            message: decision.summary,
            link: `/dashboard/surgeries/${surgery.id}`,
          },
        });
      }

      // Every supervising consultant on the unit, not just the first.
      for (let i = 0; i < realConsultants.length; i += 1) {
        await tx.notification.create({
          data: {
            userId: realConsultants[i].id,
            type: 'LATE_BOOKING_UNIT',
            title: consultantNotice.title,
            message: consultantNotice.message,
            link: `/dashboard/late-bookings?case=${surgery.id}`,
          },
        });
      }

      if (qid) {
        await tx.lateBookingOffence.update({
          where: { id: row.id },
          data: { disciplinaryQueryId: qid },
        });
      }

      return { offence: { ...row, disciplinaryQueryId: qid }, queryId: qid };
    });

    // -- The message itself, AFTER the record is safe --
    //
    // Deliberately outside the transaction. Comms is the part most likely
    // to fail and the least important to roll back: an offence recorded
    // whose WhatsApp did not go out is a true and useful row, while a
    // WhatsApp sent against an offence that was rolled back is a warning
    // for an event the system denies happened.
    //
    // THE QUEUE IS NOT A DELIVERY. A queued WHATSAPP row waits for a
    // provider that is not configured here, so "chase queued" has meant the
    // booker heard nothing. The wa.me hand-off below is what reaches them.
    let whatsappQueued = false;
    let whatsappSkipped: string | null = null;
    let whatsapp: { number: string; text: string } | null = null;

    if (!booker) {
      whatsappSkipped = surgery.bookedById
        ? 'The booker on this case is no longer a user on the system.'
        : 'No booker recorded on this case.';
    } else {
      const wa = booker.phoneNumber ? toWhatsAppNumber(booker.phoneNumber) : null;
      try {
        const q = await queueMessage({
          channel: 'WHATSAPP' as never,
          priority: 'NORMAL' as never,
          recipientUserId: booker.id,
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
      } catch (commsErr) {
        // The offence stands. Say so rather than failing the whole request.
        console.error('[late-bookings/chase] comms failed after recording:', commsErr);
        whatsappSkipped = 'The message could not be queued, but the offence is recorded.';
      }
      if (wa) whatsapp = { number: wa, text: chase };
      else whatsappSkipped = `${personName} has no phone number on file.`;
    }

    if (unreachableConsultants > 0) {
      whatsappSkipped = [
        whatsappSkipped,
        `${unreachableConsultants} supervising consultant`
        + `${unreachableConsultants === 1 ? '' : 's'} on this case could not be `
        + 'notified: no matching user account.',
      ].filter(Boolean).join(' ');
    }

    await prisma.lateBookingOffence.update({
      where: { id: offence.id },
      data: { whatsappQueued, whatsappSkipped },
    }).catch(() => undefined);

    return NextResponse.json({
      offence: { ...offence, whatsappQueued, whatsappSkipped },
      decision,
      whatsappQueued,
      whatsappSkipped,
      queryId,
      standing,
      whatsapp,
      consultantsNotified: realConsultants.length,
    });
  } catch (err) {
    // A CATCH-ALL THAT SAYS NOTHING IS WHY THIS TOOK SO LONG TO FIND.
    //
    // For months every failure here became the same five words, "Could not
    // record this one", with a dialog offering Try again -- which could
    // never work, because the cause was in the data and nothing about
    // pressing again was going to change it. The code is logged and the
    // known conditions are named, so the next one is diagnosable from what
    // the operator can see.
    const code = (err as { code?: string } | null)?.code;

    // Two presses at once, or a retry that raced the first. The unique
    // index did its job; this is a success from the operator's side.
    if (code === 'P2002') {
      const existing = surgeryId
        ? await prisma.lateBookingOffence.findUnique({ where: { surgeryId } }).catch(() => null)
        : null;
      return NextResponse.json({
        alreadyRecorded: true,
        offence: existing,
        message: 'This case was already recorded. Nothing was sent twice.',
      });
    }

    console.error('[late-bookings/chase] failed:', code ?? '', err);

    if (code === 'P2003') {
      return NextResponse.json({
        error: 'This case points at a member of staff who no longer has an account, '
          + 'so nobody could be notified. Nothing was saved. Please report this case '
          + 'to the system administrator.',
      }, { status: 409 });
    }

    return NextResponse.json({
      error: 'Could not record this one. Nothing was saved'
        + (code ? ` (${code})` : '')
        + '. If it happens again on the same case, report the patient and unit '
        + 'to the system administrator -- it is the case, not the connection.',
    }, { status: 500 });
  }
}
