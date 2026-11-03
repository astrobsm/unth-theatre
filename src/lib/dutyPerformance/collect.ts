// ============================================================
// Ten queries, one shape
// ------------------------------------------------------------
// Each collector turns one duty's records into DutyEvent[]. Nothing here
// decides anything: no ranking, no grace, no judgement about who is doing
// well. All of that lives in report.ts, so the duties cannot drift apart
// into ten different ideas of what "late" means.
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

/** The WAT calendar day an instant falls in. Nigeria is UTC+1 all year. */
function watDay(d: Date): string {
  return new Date(d.getTime() + 60 * 60_000).toISOString().slice(0, 10);
}

/**
 * The day the person had to act, which is what a roster row can be matched to.
 *
 * `eve` for the duties discharged the evening before a list: the pack and the
 * review for Tuesday's theatre are Monday's work, and Monday is whose shift
 * owns them. Matching the roster on the day of SURGERY instead would hand
 * every case to the wrong shift, which is a worse error than quoting the
 * department's figure, because it is specific and wrong.
 */
function dutyDayFor(serviceDate: Date, eve: boolean): string {
  const t = new Date(serviceDate.getTime() + 60 * 60_000);
  if (eve) t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
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
      patientAbsentAt: true,
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

    // Attended, and the patient was not in the ward. Not counted as done --
    // the patient has not been seen, and a figure that said otherwise would
    // be a false assurance to everybody reading it. Not counted as missed
    // either: the doctor walked to the ward, and charging them for an empty
    // bed is how a performance figure stops meaning anything to the person
    // it is shown to. The case leaves the measure entirely, the same way a
    // handback in time does, and the finding is raised against whoever
    // listed a patient who was not there.
    if (r.patientAbsentAt && !r.reviewedAt) return;

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
      dutyDay: dutyDayFor(r.surgeryDate, true),
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
      dutyDay: dutyDayFor(r.surgery.scheduledDate, true),
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
    dutyDay: dutyDayFor(r.surgery?.scheduledDate ?? r.scheduledSurgeryDate, true),
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
    // The day of the alert. Nobody is rostered for an emergency the night
    // before it happens.
    dutyDay: r.emergencyBooking ? watDay(r.emergencyBooking.requestedAt) : null,
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
      dutyDay: dutyDayFor(r.scheduledDate, false),
    };
  });
}

// ── 6. The technician's statement that a theatre is ready ───────────────────
//
// Counted per THEATRE-DAY, not per case. One confirmation covers a theatre for
// a day however many cases run in it, which is also what the unique
// constraint on theatre_readiness_confirmations says, so a technician must not
// be charged a duty per case for a statement they are only asked to make once.
//
// A theatre-day exists to be confirmed when a list was actually booked into
// that theatre. Theatres with nothing booked are not a duty anybody missed.
async function collectTheatreReadiness(from: string, to: string): Promise<DutyEvent[]> {
  const { start, end } = windowBounds(from, to);

  const surgeries = await prisma.surgery.findMany({
    where: {
      scheduledDate: { gte: start, lt: end },
      status: { notIn: ['CANCELLED'] as never },
      theatreId: { not: null },
    },
    select: {
      id: true,
      unit: true,
      theatreId: true,
      scheduledDate: true,
      scheduledTime: true,
      theatreTechnicianId: true,
    },
  });
  if (surgeries.length === 0) return [];

  // One bucket per theatre and WAT day.
  interface Bucket {
    theatreId: string;
    day: string;
    cases: number;
    earliest: Date;
    units: string[];
    technicianIds: string[];
  }
  const buckets: Record<string, Bucket> = {};
  surgeries.forEach((s) => {
    if (!s.theatreId) return;
    const day = watDay(s.scheduledDate);
    const key = `${s.theatreId}|${day}`;
    const at = listStart(s.scheduledDate, s.scheduledTime);
    const b = buckets[key];
    if (!b) {
      buckets[key] = {
        theatreId: s.theatreId,
        day,
        cases: 1,
        earliest: at,
        units: s.unit ? [s.unit] : [],
        technicianIds: s.theatreTechnicianId ? [s.theatreTechnicianId] : [],
      };
      return;
    }
    b.cases += 1;
    if (at.getTime() < b.earliest.getTime()) b.earliest = at;
    if (s.unit && b.units.indexOf(s.unit) === -1) b.units.push(s.unit);
    if (s.theatreTechnicianId && b.technicianIds.indexOf(s.theatreTechnicianId) === -1) {
      b.technicianIds.push(s.theatreTechnicianId);
    }
  });

  const keys = Object.keys(buckets);
  const theatreIds: string[] = [];
  keys.forEach((k) => {
    const id = buckets[k].theatreId;
    if (theatreIds.indexOf(id) === -1) theatreIds.push(id);
  });

  const [confirmations, theatres] = await Promise.all([
    prisma.theatreReadinessConfirmation.findMany({
      where: {
        role: 'THEATRE_TECHNICIAN' as never,
        theatreId: { in: theatreIds },
        readyDate: { gte: start, lt: end },
      },
      select: {
        theatreId: true,
        readyDate: true,
        confirmedById: true,
        confirmedByName: true,
        complete: true,
        completedAt: true,
        theatreName: true,
      },
    }),
    prisma.theatreSuite.findMany({
      where: { id: { in: theatreIds } },
      select: { id: true, name: true },
    }),
  ]);

  const theatreName: Record<string, string> = {};
  theatres.forEach((t) => { theatreName[t.id] = t.name; });

  const confirmed: Record<string, typeof confirmations[number]> = {};
  confirmations.forEach((c) => {
    // readyDate is a DATE column: midnight UTC of the day it names, so it is
    // sliced rather than shifted into WAT, which would move it to the day
    // before.
    confirmed[`${c.theatreId}|${c.readyDate.toISOString().slice(0, 10)}`] = c;
  });

  // Technician names, for the theatre-days nobody confirmed. Without this a
  // missed confirmation would be attributable to a bare id and therefore to
  // nobody, and the person actually rostered to that theatre would never see
  // it against their name.
  const techIds: string[] = [];
  keys.forEach((k) => {
    buckets[k].technicianIds.forEach((id) => {
      if (techIds.indexOf(id) === -1) techIds.push(id);
    });
  });
  const techs = techIds.length
    ? await prisma.user.findMany({
      where: { id: { in: techIds } },
      select: { id: true, fullName: true },
    })
    : [];
  const techName: Record<string, string> = {};
  techs.forEach((u) => { techName[u.id] = u.fullName; });

  return keys.map((key) => {
    const b = buckets[key];
    const c = confirmed[key] ?? null;
    // Whoever confirmed it owns it. Where nobody did, the technician assigned
    // to the cases in that theatre does — and where the booking named none,
    // null: the theatre-day stays counted in the totals and against the unit,
    // but it is laid at nobody's door, which is the rule this whole module
    // keeps.
    const assigned = b.technicianIds.length === 1 ? b.technicianIds[0] : null;
    const personId = c?.confirmedById ?? assigned;
    const personName = c?.confirmedByName
      ?? (assigned ? techName[assigned] ?? null : null);
    const name = theatreName[b.theatreId] ?? c?.theatreName ?? 'Theatre';
    return {
      id: key,
      personId: personId ?? null,
      personName: personName ?? null,
      // A theatre running two units' cases belongs to neither for this duty.
      unit: b.units.length === 1 ? b.units[0] : null,
      label: `${name} — ${b.cases} ${b.cases === 1 ? 'case' : 'cases'}, ${b.day}`,
      dueAt: b.earliest,
      // Only a COMPLETE confirmation is the duty done. A record with half the
      // checks ticked is a theatre nobody has said is ready.
      doneAt: c && c.complete ? (c.completedAt ?? null) : null,
      dutyDay: b.day,
    };
  });
}

// ── 7. The nurse receiving the patient into theatre ─────────────────────────
//
// Only cases that actually reached a theatre. A case still SCHEDULED may be
// one that has not started yet rather than one nobody received, and charging
// a nurse for a patient who never came is how a board gets dismissed.
async function collectPatientReception(from: string, to: string): Promise<DutyEvent[]> {
  const { start, end } = windowBounds(from, to);

  const rows = await prisma.surgery.findMany({
    where: {
      scheduledDate: { gte: start, lt: end },
      status: { in: ['IN_PROGRESS', 'COMPLETED'] as never },
    },
    select: {
      id: true,
      unit: true,
      scheduledDate: true,
      procedureName: true,
      scrubNurseId: true,
      patient: { select: { name: true, folderNumber: true } },
      caseFlow: {
        select: { patientReceived: true, patientReceivedAt: true, receivedById: true },
      },
    },
  });

  const ids: string[] = [];
  rows.forEach((r) => {
    const by = r.caseFlow?.receivedById;
    if (by && ids.indexOf(by) === -1) ids.push(by);
    if (r.scrubNurseId && ids.indexOf(r.scrubNurseId) === -1) ids.push(r.scrubNurseId);
  });
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
    : [];
  const nameOf: Record<string, string> = {};
  users.forEach((u) => { nameOf[u.id] = u.fullName; });

  return rows.map((r) => {
    const f = r.caseFlow;
    // Whoever pressed Receive owns it; failing that the scrub nurse on the
    // case, who is the person the duty belongs to when nobody pressed
    // anything at all. The same rule as the surgery times, for the same
    // reason.
    const personId = f?.receivedById ?? r.scrubNurseId ?? null;
    return {
      id: r.id,
      personId,
      personName: personId ? nameOf[personId] ?? null : null,
      unit: r.unit,
      label: caseLabel(r.patient, r.procedureName),
      // The day, not the scheduled minute. A list of six cases shares one
      // scheduled time, so timing reception against it would report the
      // fourth patient of the morning as three hours late for arriving when
      // the theatre was ready for them.
      dueAt: endOfDay(r.scheduledDate),
      doneAt: f?.patientReceived ? (f.patientReceivedAt ?? null) : null,
      dutyDay: dutyDayFor(r.scheduledDate, false),
    };
  });
}

// ── 8. The recovery nurse receiving the patient into recovery ───────────────
async function collectPacuAdmission(from: string, to: string): Promise<DutyEvent[]> {
  const { start, end } = windowBounds(from, to);

  const rows = await prisma.surgery.findMany({
    where: {
      scheduledDate: { gte: start, lt: end },
      status: { in: ['COMPLETED'] as never },
    },
    select: {
      id: true,
      unit: true,
      scheduledDate: true,
      scheduledTime: true,
      procedureName: true,
      actualEndTime: true,
      completedAt: true,
      patient: { select: { name: true, folderNumber: true } },
      pacuAssessment: {
        select: { receivedBy: true, admissionTime: true, createdAt: true },
      },
    },
  });
  if (rows.length === 0) return [];

  const ids: string[] = [];
  rows.forEach((r) => {
    const by = r.pacuAssessment?.receivedBy;
    if (by && ids.indexOf(by) === -1) ids.push(by);
  });
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
    : [];
  const nameOf: Record<string, string> = {};
  users.forEach((u) => { nameOf[u.id] = u.fullName; });

  return rows.map((r) => {
    const a = r.pacuAssessment;
    // Half an hour from the patient leaving theatre. Where no end time was
    // recorded there is no finer deadline to use, so the end of the operating
    // day stands in rather than the case being dropped: a patient still had
    // to be received.
    const left = r.actualEndTime ?? r.completedAt ?? null;
    const dueAt = left
      ? new Date(left.getTime() + 30 * 60_000)
      : endOfDay(r.scheduledDate);
    return {
      id: r.id,
      personId: a?.receivedBy ?? null,
      personName: a?.receivedBy ? nameOf[a.receivedBy] ?? null : null,
      unit: r.unit,
      label: caseLabel(r.patient, r.procedureName),
      dueAt,
      // createdAt, not admissionTime: admissionTime is the hour the nurse
      // says the patient arrived, which a record opened at the end of the
      // shift can still be truthful about. Punctuality is about when the
      // record was opened, and only createdAt knows that.
      doneAt: a?.createdAt ?? null,
      dutyDay: watDay(left ?? r.scheduledDate),
    };
  });
}

// ── 9. The recovery nurse recording the discharge ───────────────────────────
//
// READ THE DEADLINE HERE BEFORE CHANGING IT. It is the end of the WAT day the
// patient was ADMITTED to recovery, and it is deliberately not "admission plus
// two hours" or anything else derived from how long the patient stayed.
//
// A deadline measured from the length of stay would reward discharging
// patients sooner. Recovery is the one place in this hospital where the right
// answer is routinely "keep them longer", and a performance board that scores
// a three-hour stay worse than a forty-minute one would be pressure in
// exactly the wrong direction, applied to the nurse standing over the
// patient. What is being measured is whether the discharge was WRITTEN DOWN.
// A long stay entered properly is a good record; a short stay nobody entered
// is not.
async function collectPacuDischarge(from: string, to: string): Promise<DutyEvent[]> {
  const { start, end } = windowBounds(from, to);

  const rows = await prisma.pACUAssessment.findMany({
    where: { admissionTime: { gte: start, lt: end } },
    select: {
      id: true,
      surgeryId: true,
      admissionTime: true,
      dischargeTime: true,
      receivedBy: true,
      surgery: {
        select: {
          unit: true,
          procedureName: true,
          patient: { select: { name: true, folderNumber: true } },
        },
      },
    },
  });
  if (rows.length === 0) return [];

  // Who actually discharged them. The assessment records who RECEIVED the
  // patient and nothing about who sent them on, so the attribution comes from
  // the movement row the discharge writes. Where there is none — an older
  // record, or a discharge that never happened — it falls back to the nurse
  // who holds the record, because an open record is that nurse's to close.
  const surgeryIds = rows.map((r) => r.surgeryId);
  const movements = await prisma.patientMovement.findMany({
    where: { surgeryId: { in: surgeryIds }, phase: 'RETURNED_TO_WARD' as never },
    select: { surgeryId: true, recordedBy: true, timestamp: true },
    orderBy: { timestamp: 'asc' },
  });
  const dischargedBy: Record<string, string> = {};
  movements.forEach((m) => {
    if (m.recordedBy && !dischargedBy[m.surgeryId]) dischargedBy[m.surgeryId] = m.recordedBy;
  });

  const ids: string[] = [];
  rows.forEach((r) => {
    const by = dischargedBy[r.surgeryId] ?? r.receivedBy;
    if (by && ids.indexOf(by) === -1) ids.push(by);
  });
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
    : [];
  const nameOf: Record<string, string> = {};
  users.forEach((u) => { nameOf[u.id] = u.fullName; });

  return rows.map((r) => {
    const personId = dischargedBy[r.surgeryId] ?? r.receivedBy ?? null;
    return {
      id: r.id,
      personId,
      personName: personId ? nameOf[personId] ?? null : null,
      unit: r.surgery?.unit ?? null,
      label: caseLabel(r.surgery?.patient, r.surgery?.procedureName ?? null),
      dueAt: endOfDay(r.admissionTime),
      doneAt: r.dischargeTime,
      dutyDay: watDay(r.admissionTime),
    };
  });
}

// ── 10. Every team member saying whether they are coming ────────────────────
//
// The one duty in this file with no attribution problem at all: the team is
// named on the case before anybody answers, so an unanswered case has a person
// against it the same way an answered one does. That is the model the comment
// at the top of this file says the other duties would need.
//
// ONLY CASES WHOSE LIST HAS ALREADY STARTED. Nobody has failed to answer for
// a case that has not come up yet, and without this filter a window that
// included tomorrow would report the whole theatre as silent.
async function collectCaseAvailability(from: string, to: string): Promise<DutyEvent[]> {
  const { start, end } = windowBounds(from, to);
  const now = new Date();

  const surgeries = await prisma.surgery.findMany({
    where: {
      scheduledDate: { gte: start, lt: end },
      status: { notIn: ['CANCELLED'] as never },
    },
    select: {
      id: true,
      unit: true,
      scheduledDate: true,
      scheduledTime: true,
      procedureName: true,
      surgeonId: true,
      supervisingConsultantId: true,
      assistantSurgeonId: true,
      anesthetistId: true,
      scrubNurseId: true,
      theatreTechnicianId: true,
      patient: { select: { name: true, folderNumber: true } },
    },
  });
  if (surgeries.length === 0) return [];

  const due: Record<string, Date> = {};
  const live = surgeries.filter((s) => {
    const at = listStart(s.scheduledDate, s.scheduledTime);
    due[s.id] = at;
    return at.getTime() <= now.getTime();
  });
  if (live.length === 0) return [];

  const ids = live.map((s) => s.id);

  const [assignments, booked, answers] = await Promise.all([
    prisma.theatreTeamAssignment.findMany({
      where: { surgeryId: { in: ids }, removedAt: null },
      select: { surgeryId: true, userId: true, userName: true },
    }),
    prisma.surgicalTeamMember.findMany({
      where: { surgeryId: { in: ids }, userId: { not: null } },
      select: { surgeryId: true, userId: true, memberName: true },
    }),
    prisma.caseTeamAvailability.findMany({
      where: { surgeryId: { in: ids } },
      select: { surgeryId: true, userId: true, userName: true, respondedAt: true },
    }),
  ]);

  // Who was on each case, from all three sources, de-duplicated.
  const team: Record<string, Record<string, string | null>> = {};
  const put = (surgeryId: string, userId: string | null | undefined, name: string | null) => {
    if (!userId) return;
    const t = team[surgeryId] ?? (team[surgeryId] = {});
    if (!(userId in t) || (!t[userId] && name)) t[userId] = name;
  };
  live.forEach((s) => {
    put(s.id, s.surgeonId, null);
    put(s.id, s.supervisingConsultantId, null);
    put(s.id, s.assistantSurgeonId, null);
    put(s.id, s.anesthetistId, null);
    put(s.id, s.scrubNurseId, null);
    put(s.id, s.theatreTechnicianId, null);
  });
  assignments.forEach((a) => put(a.surgeryId, a.userId, a.userName ?? null));
  booked.forEach((b) => put(b.surgeryId, b.userId, b.memberName ?? null));

  const answered: Record<string, Date> = {};
  answers.forEach((a) => {
    // An answer from somebody not otherwise on the team still counts: they
    // were evidently asked, and a duty they discharged must not be invisible.
    put(a.surgeryId, a.userId, a.userName ?? null);
    answered[`${a.surgeryId}|${a.userId}`] = a.respondedAt;
  });

  // Names for the ids the Surgery columns gave us bare.
  const need: string[] = [];
  Object.keys(team).forEach((sid) => {
    Object.keys(team[sid]).forEach((uid) => {
      if (!team[sid][uid] && need.indexOf(uid) === -1) need.push(uid);
    });
  });
  const users = need.length
    ? await prisma.user.findMany({ where: { id: { in: need } }, select: { id: true, fullName: true } })
    : [];
  const nameOf: Record<string, string> = {};
  users.forEach((u) => { nameOf[u.id] = u.fullName; });

  const byId: Record<string, typeof live[number]> = {};
  live.forEach((s) => { byId[s.id] = s; });

  const events: DutyEvent[] = [];
  Object.keys(team).forEach((surgeryId) => {
    const s = byId[surgeryId];
    if (!s) return;
    Object.keys(team[surgeryId]).forEach((userId) => {
      events.push({
        // One duty per person per case, so the id must carry both.
        id: `${surgeryId}|${userId}`,
        personId: userId,
        personName: team[surgeryId][userId] ?? nameOf[userId] ?? null,
        unit: s.unit,
        label: caseLabel(s.patient, s.procedureName),
        dueAt: due[surgeryId],
        doneAt: answered[`${surgeryId}|${userId}`] ?? null,
        dutyDay: dutyDayFor(s.scheduledDate, false),
      });
    });
  });
  return events;
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
    case 'THEATRE_READINESS': return collectTheatreReadiness(from, to);
    case 'PATIENT_RECEPTION': return collectPatientReception(from, to);
    case 'PACU_ADMISSION': return collectPacuAdmission(from, to);
    case 'PACU_DISCHARGE': return collectPacuDischarge(from, to);
    case 'CASE_AVAILABILITY': return collectCaseAvailability(from, to);
    default: return [];
  }
}
