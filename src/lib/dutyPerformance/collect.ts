// ============================================================
// Five queries, one shape
// ------------------------------------------------------------
// Each collector turns one duty's records into DutyEvent[]. Nothing here
// decides anything: no ranking, no grace, no judgement about who is doing
// well. All of that lives in report.ts, so the five duties cannot drift apart
// into five different ideas of what "late" means.
//
// WHAT EACH COLLECTOR OWES ITS CALLER is the honest answer to three questions
// — who was responsible, when was it due, when was it done — and NULL where it
// does not know. A collector that guesses an owner puts a real person's name
// against work they were never given.
//
// ── A LIMIT WORTH STATING PLAINLY ───────────────────────────────────────────
//
// Two of these duties can only see work that WAS done.
//
// A drug pack that nobody picked up has no packer; an emergency that no nurse
// answered has no row in emergency_team_availability. There is no roster of
// "who was on pharmacy this afternoon" to attribute the gap to. So for those
// duties the outstanding work is counted in the TOTALS and against the UNIT,
// where it is visible, but it cannot be laid at any individual's door — and a
// board that invented an owner for it would be worse than one that admits the
// gap. Those two duties therefore rank people on punctuality, which is a real
// measure of what they did, and the department sees its own completion rate at
// the top of the page.
//
// The pre-op review does not have this problem, because preop_review_assignments
// records the expected reviewer BEFORE the review happens. That is the model
// the other two would need to measure completion per person, and it is a
// change to how the work is handed out, not to this file.
//
// There is now a second route to the same people that does not require
// inventing an owner: every duty names the roles that perform it and, where
// the department publishes one, the roster that says who was on. ./dutyTeam.ts
// writes to all of them about the team's duty rather than picking one to
// blame, so a duty with no attributable owner still reaches the right people.
// ============================================================

import prisma from '@/lib/prisma';
import { reviewDeadline } from '@/lib/anaesthesia/reviewWatch';
import type { DutyEvent, DutyKey } from './types';

/** A WAT calendar day as the UTC instant it begins. Nigeria is UTC+1 all year. */
export function watDayStart(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0) - 60 * 60_000);
}

function windowBounds(from: string, to: string) {
  return {
    start: watDayStart(from),
    end: new Date(watDayStart(to).getTime() + 24 * 3_600_000),
  };
}

/**
 * When an operating list starts, as an instant.
 *
 * scheduledTime is "09:00" in WAT where it is recorded at all. Where it is
 * not, 08:00 is assumed — the hour UNTH lists begin. Assumed rather than
 * skipped, because a case with no time recorded still had to be packed for,
 * and dropping it would quietly shrink the denominator.
 */
function listStart(scheduledDate: Date, scheduledTime: string | null): Date {
  const local = new Date(scheduledDate.getTime() + 60 * 60_000);
  const m = /^(\d{1,2}):(\d{2})/.exec(scheduledTime ?? '');
  const hour = m ? parseInt(m[1], 10) : 8;
  const minute = m ? parseInt(m[2], 10) : 0;
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute, 0)
    - 60 * 60_000,
  );
}

/** End of the operating day in WAT — the deadline for work with no finer one. */
function endOfDay(scheduledDate: Date): Date {
  const local = new Date(scheduledDate.getTime() + 60 * 60_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 23, 59, 59)
    - 60 * 60_000,
  );
}

const caseLabel = (
  patient: { name: string | null; folderNumber: string | null } | null | undefined,
  procedure: string | null,
) => {
  const who = patient?.folderNumber
    ? `${patient.name ?? 'Patient'} (${patient.folderNumber})`
    : (patient?.name ?? 'Patient');
  return `${who} — ${procedure ?? 'Procedure not recorded'}`;
};

// ── 1. The anaesthetist's pre-operative review ──────────────────────────────
//
// Read from preop_review_assignments, which names the expected reviewer
// BEFORE the review happens — so a review never done is attributable, which
// is the whole reason that table exists.
async function collectPreopReview(from: string, to: string): Promise<DutyEvent[]> {
  const { start, end } = windowBounds(from, to);

  const rows = await prisma.preopReviewAssignment.findMany({
    where: { surgeryDate: { gte: start, lt: end } },
    select: {
      surgeryId: true,
      surgeryDate: true,
      expectedReviewerId: true,
      expectedReviewerName: true,
      assignmentSource: true,
      handedBackAt: true,
      reassignedToId: true,
      reassignedToName: true,
      reviewedAt: true,
      reviewedById: true,
      surgery: {
        select: {
          unit: true,
          procedureName: true,
          patient: { select: { name: true, folderNumber: true } },
        },
      },
    },
  });

  const events: DutyEvent[] = [];
  rows.forEach((r) => {
    // Handed back in time is not a failure — it is the documented way to say
    // "I cannot do this", and counting it against the person would teach them
    // to stay silent instead, which is the outcome the handback exists to
    // prevent.
    if (r.handedBackAt && !r.reassignedToId) return;

    // A fallback is cover, not an assignment. reviewWatch.ts makes the same
    // distinction before it summons anybody, and a board that ignored it
    // would put a name against work nobody gave them.
    const isRealAssignment =
      r.assignmentSource !== 'unrostered' && r.assignmentSource !== 'none';

    const personId = r.reassignedToId ?? (isRealAssignment ? r.expectedReviewerId : null);
    const personName = r.reassignedToName ?? (isRealAssignment ? r.expectedReviewerName : null);

    events.push({
      id: r.surgeryId,
      personId: r.reviewedById ?? personId,
      personName,
      unit: r.surgery?.unit ?? null,
      label: caseLabel(r.surgery?.patient, r.surgery?.procedureName ?? null),
      dueAt: reviewDeadline(r.surgeryDate),
      doneAt: r.reviewedAt,
    });
  });
  return events;
}

// ── 2 & 3. Pharmacy drugs and the consumable packs ──────────────────────────
//
// One collector, because the two tables differ only in their name: the duty,
// the deadline and the attribution are identical, and two copies of this would
// drift the moment one was corrected.
async function collectPacking(
  which: 'PHARMACY_PACKING' | 'CONSUMABLE_PACKING',
  from: string,
  to: string,
): Promise<DutyEvent[]> {
  const { start, end } = windowBounds(from, to);

  const where = { surgery: { scheduledDate: { gte: start, lt: end } } };
  const select = {
    id: true,
    name: true,
    packedById: true,
    packedByName: true,
    packedAt: true,
    removedAt: true,
    surgery: {
      select: {
        unit: true,
        scheduledDate: true,
        scheduledTime: true,
        procedureName: true,
        patient: { select: { name: true, folderNumber: true } },
      },
    },
  };

  // Queried separately rather than through one shared options object: Prisma
  // infers the row type from the literal passed to findMany, and a shared
  // object defeats that, which costs the select-shaped typing that makes the
  // mapping below safe.
  const rows =
    which === 'PHARMACY_PACKING'
      ? await prisma.surgeryDrugDressingRequest.findMany({ where, select })
      : await prisma.surgeryConsumableRequest.findMany({ where, select });

  const events: DutyEvent[] = [];
  rows.forEach((r) => {
    // A cancelled line was deliberately removed from the list. Counting it as
    // unpacked would report somebody for not doing work that was withdrawn.
    if (r.removedAt) return;
    if (!r.surgery) return;

    events.push({
      id: r.id,
      personId: r.packedById,
      personName: r.packedByName,
      unit: r.surgery.unit,
      label: `${r.name} — ${caseLabel(r.surgery.patient, r.surgery.procedureName)}`,
      dueAt: listStart(r.surgery.scheduledDate, r.surgery.scheduledTime),
      doneAt: r.packedAt,
    });
  });

  return events;
}

/**
 * The anaesthetic prescriptions pharmacy had to pack.
 *
 * COUNTED ALONGSIDE THE DRUG/DRESSING REQUESTS, not instead of them, because
 * pharmacy's packing duty is discharged across two screens and a board that
 * read only one of them told the department it had done nothing all month.
 * That figure is not merely unflattering, it is wrong — and a wrong figure in
 * a chase message is the fastest way to lose a department's cooperation.
 *
 * Only prescriptions that reached pharmacy are counted. A draft, one still
 * awaiting a consultant's approval, one rejected, withdrawn or superseded was
 * never pharmacy's to pack, and counting it would report them for work that
 * never arrived.
 */
async function collectPrescriptionPacking(from: string, to: string): Promise<DutyEvent[]> {
  const { start, end } = windowBounds(from, to);

  const rows = await prisma.anestheticPrescription.findMany({
    where: {
      scheduledSurgeryDate: { gte: start, lt: end },
      status: {
        notIn: ['DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'CANCELLED', 'SUPERSEDED'] as never,
      },
    },
    select: {
      id: true,
      patientName: true,
      scheduledSurgeryDate: true,
      packedById: true,
      packedByName: true,
      packedAt: true,
      surgery: {
        select: {
          unit: true,
          scheduledDate: true,
          scheduledTime: true,
          procedureName: true,
          patient: { select: { name: true, folderNumber: true } },
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    personId: r.packedById,
    personName: r.packedByName,
    unit: r.surgery?.unit ?? null,
    label:
      'Anaesthetic prescription — '
      + caseLabel(
        r.surgery?.patient ?? { name: r.patientName, folderNumber: null },
        r.surgery?.procedureName ?? null,
      ),
    // The surgery's own time where there is one; the prescription's copy of
    // the date otherwise, so a prescription whose surgery row has moved on is
    // still measured against a real list start rather than dropped.
    dueAt: listStart(
      r.surgery?.scheduledDate ?? r.scheduledSurgeryDate,
      r.surgery?.scheduledTime ?? null,
    ),
    doneAt: r.packedAt,
  }));
}

// ── 4. Nurses acknowledging an emergency ────────────────────────────────────
async function collectEmergencyAck(from: string, to: string): Promise<DutyEvent[]> {
  const { start, end } = windowBounds(from, to);

  const rows = await prisma.emergencyTeamAvailability.findMany({
    where: {
      teamRole: { in: ['SCRUB_NURSE', 'CIRCULATING_NURSE', 'RECOVERY_ROOM_NURSE'] as never },
      emergencyBooking: { requestedAt: { gte: start, lt: end } },
    },
    select: {
      id: true,
      userId: true,
      userName: true,
      respondedAt: true,
      emergencyBooking: {
        select: {
          requestedAt: true,
          surgicalUnit: true,
          procedureName: true,
          patientName: true,
          folderNumber: true,
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    personId: r.userId,
    personName: r.userName,
    unit: r.emergencyBooking?.surgicalUnit ?? null,
    label: caseLabel(
      {
        name: r.emergencyBooking?.patientName ?? null,
        folderNumber: r.emergencyBooking?.folderNumber ?? null,
      },
      r.emergencyBooking?.procedureName ?? null,
    ),
    // Fifteen minutes from the alert. The grace in DUTIES adds five more
    // before anything is called late.
    dueAt: r.emergencyBooking
      ? new Date(r.emergencyBooking.requestedAt.getTime() + 15 * 60_000)
      : null,
    doneAt: r.respondedAt,
  }));
}

// ── 5. Recording when surgery started and ended ─────────────────────────────
//
// Counted per CASE, not per timestamp. A case with a start and no end is not
// half-recorded — it is a case whose duration cannot be computed, which is the
// thing that actually matters, so both must be present for it to count as
// done.
async function collectSurgeryTiming(from: string, to: string): Promise<DutyEvent[]> {
  const { start, end } = windowBounds(from, to);

  const rows = await prisma.surgery.findMany({
    where: {
      scheduledDate: { gte: start, lt: end },
      status: { in: ['COMPLETED', 'IN_PROGRESS'] as never },
    },
    select: {
      id: true,
      unit: true,
      scheduledDate: true,
      procedureName: true,
      scrubNurseId: true,
      patient: { select: { name: true, folderNumber: true } },
      surgicalTiming: {
        select: { incisionTime: true, procedureEndTime: true, recordedBy: true, updatedAt: true },
      },
    },
  });

  // recordedBy holds a User id. Resolved to names in one query rather than
  // one per case.
  const ids: string[] = [];
  rows.forEach((r) => {
    const by = r.surgicalTiming?.recordedBy;
    if (by && ids.indexOf(by) === -1) ids.push(by);
    if (r.scrubNurseId && ids.indexOf(r.scrubNurseId) === -1) ids.push(r.scrubNurseId);
  });
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.fullName]));

  return rows.map((r) => {
    const t = r.surgicalTiming;
    const complete = !!(t?.incisionTime && t?.procedureEndTime);
    // Whoever entered the times owns it; failing that, the scrub nurse on the
    // case, who is the person the duty belongs to when nobody has entered
    // anything at all.
    const personId = t?.recordedBy ?? r.scrubNurseId ?? null;
    return {
      id: r.id,
      personId,
      personName: personId ? nameOf.get(personId) ?? null : null,
      unit: r.unit,
      label: caseLabel(r.patient, r.procedureName),
      dueAt: endOfDay(r.scheduledDate),
      // The end time is the moment the pair became complete; updatedAt is when
      // it was actually typed in, which is what punctuality is about.
      doneAt: complete ? (t?.updatedAt ?? t?.procedureEndTime ?? null) : null,
    };
  });
}

/** Every duty's events for a window, by key. */
export async function collectDutyEvents(
  duty: DutyKey,
  from: string,
  to: string,
): Promise<DutyEvent[]> {
  switch (duty) {
    case 'PREOP_REVIEW': return collectPreopReview(from, to);
    case 'PHARMACY_PACKING': {
      const [requests, prescriptions] = await Promise.all([
        collectPacking('PHARMACY_PACKING', from, to),
        collectPrescriptionPacking(from, to),
      ]);
      return requests.concat(prescriptions);
    }
    case 'CONSUMABLE_PACKING': return collectPacking('CONSUMABLE_PACKING', from, to);
    case 'EMERGENCY_ACK': return collectEmergencyAck(from, to);
    case 'SURGERY_TIMING': return collectSurgeryTiming(from, to);
    default: return [];
  }
}
