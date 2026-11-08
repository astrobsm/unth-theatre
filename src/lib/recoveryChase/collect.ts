// ============================================================
// Reading the recovery gaps off the database, and finding who answers for them
// ------------------------------------------------------------
// GROUPED BY DAY, because the accountable person is whoever was supervising
// that day — not whoever booked the case or whoever operated. That is what was
// asked for ("supervisor — from the duty roster") and it is also the only
// grouping that can be answered: a case with no recovery record has, by
// definition, no recovery nurse named on it to group under.
//
// AND MATCHED TO THE SHIFT, NOT JUST THE DAY. A case received into recovery at
// 19:40 is the evening supervisor's; sending it to the morning supervisor
// because it happened on their date is how a chase loses its authority in one
// message. Each case therefore carries the shifts that could have covered the
// hour the patient was actually in recovery, and a supervisor is only asked
// about the cases their own shift covers. Cases no rostered supervisor covers
// are reported separately rather than distributed to everybody.
//
// WHY DUTY PERFORMANCE DOES NOT ALREADY DO THIS. It does the other half. Its
// PACU_ADMISSION duty reads the same cases and attributes each to
// `pacuAssessment.receivedBy` — so a case with NO recovery record gets
// `personId: null` and silently credits and chases nobody. That null is the
// hole this module exists to fill, and the roster is the only place an answer
// can come from.
// ============================================================

import prisma from '@/lib/prisma';
import { watDay, watDayRange, watClock, dateColumn } from '@/lib/watDay';
import { supervisorShifts } from '@/lib/roster/theatreNursing';
import {
  recoveryGaps, hoursOpen, accountableMoment, RECOVERY_GAP_CODES,
  type CaseForRecoveryGaps, type RecoveryGapCode,
} from './gaps';

/** Where a recipient's accountability comes from. */
export type RecipientSource = 'SUPERVISOR' | 'RECOVERY_NURSE' | 'RECORD_HOLDER';

export interface RecoveryRecipient {
  id: string;
  fullName: string;
  role: string | null;
  hasPhone: boolean;
  active: boolean;
  /** The roster shift they were on, where the row says. */
  shift: string | null;
  source: RecipientSource;
  /** The cases this person is being asked about. */
  caseIds: string[];
}

export interface RecoveryChaseCase {
  id: string;
  patientName: string | null;
  folderNumber: string | null;
  procedureName: string;
  unit: string | null;
  scheduledDay: string;
  scheduledTime: string | null;
  gaps: RecoveryGapCode[];
  /** Whole hours an unclosed record has stood open. */
  hoursOpen: number | null;
  /** WAT wall clock the record was opened at, where there is one. */
  openedClock: string | null;
  /** Booked as needing ICU — context, never an exclusion. See gaps.ts. */
  needICU: boolean;
  /** The nurse named on the record, where there is a record. */
  receivedByName: string | null;
  receivedById: string | null;
  /** The shifts a supervisor covering this patient's recovery could be on. */
  coveringShifts: string[];
}

export interface RecoveryChaseDay {
  day: string;
  /** Completed cases on the day, gaps or not. The denominator. */
  completedCount: number;
  /** Cases excluded because a mortality is on file. Stated, not hidden. */
  mortalityCount: number;
  cases: RecoveryChaseCase[];
  counts: Record<string, number>;
  supervisors: RecoveryRecipient[];
  recoveryNurses: RecoveryRecipient[];
  recordHolders: RecoveryRecipient[];
  /** Cases whose hour no rostered supervisor's shift covers. */
  unmatched: RecoveryChaseCase[];
}

/** Day strings from `from` to `to` inclusive, in order. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = watDayRange(from).start;
  const last = watDayRange(to).start.getTime();
  // A guard, not a limit anybody meets: a mistyped year must not spin here.
  for (let i = 0; i < 400 && cursor.getTime() <= last; i += 1) {
    out.push(watDay(cursor));
    cursor = new Date(cursor.getTime() + 24 * 3_600_000);
  }
  return out;
}

const PERIOPERATIVE_NURSE_CATEGORIES = ['NURSES', 'RECOVERY_NURSES'];

/**
 * Every completed case in the window, with what its recovery record is
 * missing, grouped by day, with the people who answer for each day.
 *
 * `now` is a parameter so the grace periods can be proved rather than read.
 */
export async function collectRecoveryGaps(
  from: string,
  to: string,
  now: Date = new Date(),
): Promise<RecoveryChaseDay[]> {
  const start = watDayRange(from).start;
  const end = watDayRange(to).end;

  const rows = await prisma.surgery.findMany({
    where: {
      status: 'COMPLETED' as never,
      scheduledDate: { gte: start, lt: end },
    },
    select: {
      id: true,
      unit: true,
      scheduledDate: true,
      scheduledTime: true,
      procedureName: true,
      needICU: true,
      // The SAME expression duty performance uses for this deadline
      // (actualEndTime ?? completedAt). Adding a third fallback here would
      // make the two boards disagree about when the record was due, and the
      // first person to notice would be right to disbelieve both.
      actualEndTime: true,
      completedAt: true,
      patient: { select: { name: true, folderNumber: true } },
      pacuAssessment: {
        select: {
          admissionTime: true, dischargeTime: true, createdAt: true, receivedBy: true,
        },
      },
    },
    orderBy: { scheduledDate: 'asc' },
  });

  // A death in theatre is not a missing record. Fetched rather than inferred.
  const deaths = rows.length
    ? await prisma.mortality.findMany({
      where: { surgeryId: { in: rows.map((r) => r.id) } },
      select: { surgeryId: true },
    })
    : [];
  const died = new Set(deaths.map((d) => d.surgeryId));

  // ── The roster: who was supervising, and which recovery nurses were on ──
  // PUBLISHED only. A draft roster is somebody's plan, not somebody's duty,
  // and nothing else in this application treats it as one.
  const days = dayRange(from, to);
  const rosterRows = await prisma.roster.findMany({
    where: {
      // Roster.date is a @db.Date: midnight UTC of each day, built from the
      // day strings rather than from watDayRange. See dateColumn.
      date: { gte: dateColumn(from)!, lte: dateColumn(to)! },
      status: 'PUBLISHED',
      staffCategory: { in: PERIOPERATIVE_NURSE_CATEGORIES as never },
    },
    select: {
      date: true, userId: true, staffName: true, shift: true,
      subRole: true, staffCategory: true,
      user: { select: { id: true, fullName: true, role: true, phoneNumber: true, status: true } },
    },
  }).catch(() => [] as never[]);

  // The nurses named on the records that exist, so a message can say who
  // opened the record it is asking about.
  const holderIds = Array.from(new Set(
    rows.map((r) => r.pacuAssessment?.receivedBy).filter((x): x is string => !!x),
  ));
  const holders = holderIds.length
    ? await prisma.user.findMany({
      where: { id: { in: holderIds } },
      select: { id: true, fullName: true, role: true, phoneNumber: true, status: true },
    })
    : [];
  const holderById = new Map(holders.map((h) => [h.id, h]));

  // ── Assemble, day by day ────────────────────────────────────────
  const byDay = new Map<string, RecoveryChaseDay>();
  days.forEach((day) => {
    byDay.set(day, {
      day,
      completedCount: 0,
      mortalityCount: 0,
      cases: [],
      counts: Object.fromEntries(RECOVERY_GAP_CODES.map((c) => [c, 0])),
      supervisors: [],
      recoveryNurses: [],
      recordHolders: [],
      unmatched: [],
    });
  });

  rows.forEach((r) => {
    const day = watDay(r.scheduledDate);
    const bucket = byDay.get(day);
    if (!bucket) return;
    bucket.completedCount += 1;
    if (died.has(r.id)) {
      bucket.mortalityCount += 1;
      return;
    }

    const facts: CaseForRecoveryGaps = {
      scheduledDay: day,
      leftTheatreAt: r.actualEndTime ?? r.completedAt ?? null,
      recovery: r.pacuAssessment
        ? {
          admissionTime: r.pacuAssessment.admissionTime,
          dischargeTime: r.pacuAssessment.dischargeTime,
          createdAt: r.pacuAssessment.createdAt,
          receivedBy: r.pacuAssessment.receivedBy ?? null,
        }
        : null,
      diedInTheatre: false,
      needICU: r.needICU,
    };

    const gaps = recoveryGaps(facts, now);
    if (gaps.length === 0) return;

    const heldBy = facts.recovery?.receivedBy ?? null;
    const holder = heldBy ? holderById.get(heldBy) ?? null : null;

    bucket.cases.push({
      id: r.id,
      patientName: r.patient?.name ?? null,
      folderNumber: r.patient?.folderNumber ?? null,
      procedureName: r.procedureName,
      unit: r.unit ?? null,
      scheduledDay: day,
      scheduledTime: r.scheduledTime ?? null,
      gaps,
      hoursOpen: hoursOpen(facts, now),
      openedClock: facts.recovery ? watClock(facts.recovery.admissionTime) : null,
      needICU: r.needICU,
      receivedByName: holder?.fullName ?? null,
      receivedById: heldBy,
      coveringShifts: supervisorShifts(accountableMoment(facts)) as string[],
    });
    gaps.forEach((g) => { bucket.counts[g] = (bucket.counts[g] ?? 0) + 1; });
  });

  // ── Who answers for each day ────────────────────────────────────
  type RRow = typeof rosterRows[number];
  const rosterByDay = new Map<string, RRow[]>();
  (rosterRows as RRow[]).forEach((row) => {
    const day = watDay(row.date);
    const list = rosterByDay.get(day);
    if (list) list.push(row); else rosterByDay.set(day, [row]);
  });

  byDay.forEach((bucket, day) => {
    const dayRows = rosterByDay.get(day) ?? [];

    /** The cases a person rostered on `shift` is being asked about. */
    const casesFor = (shift: string | null) => (shift
      ? bucket.cases.filter((c) => c.coveringShifts.indexOf(shift) !== -1)
      : bucket.cases).map((c) => c.id);

    const build = (row: RRow, source: RecipientSource): RecoveryRecipient => ({
      id: row.userId,
      fullName: row.user?.fullName ?? row.staffName,
      role: row.user?.role ? String(row.user.role) : null,
      hasPhone: Boolean(row.user?.phoneNumber),
      active: !row.user || row.user.status === 'APPROVED',
      shift: row.shift ? String(row.shift) : null,
      source,
      caseIds: casesFor(row.shift ? String(row.shift) : null),
    });

    const dedupe = (list: RecoveryRecipient[]) => {
      const seen = new Map<string, RecoveryRecipient>();
      list.forEach((p) => {
        const had = seen.get(p.id);
        // One person rostered twice in a day keeps both shifts' cases.
        if (had) {
          const merged = Array.from(new Set(had.caseIds.concat(p.caseIds)));
          seen.set(p.id, { ...had, caseIds: merged });
        } else seen.set(p.id, p);
      });
      return Array.from(seen.values()).filter((p) => p.caseIds.length > 0);
    };

    bucket.supervisors = dedupe(dayRows
      .filter((row) => String(row.staffCategory) === 'NURSES' && row.subRole === 'SUPERVISING')
      .map((row) => build(row, 'SUPERVISOR')));

    // The recovery room's own nurses, from either the recovery category or a
    // nurse whose account role is RECOVERY_ROOM_NURSE. Both spellings are in
    // use on the live roster, and reading only one of them would report a
    // staffed recovery room as unstaffed.
    bucket.recoveryNurses = dedupe(dayRows
      .filter((row) => String(row.staffCategory) === 'RECOVERY_NURSES'
        || String(row.user?.role ?? '') === 'RECOVERY_ROOM_NURSE')
      .map((row) => build(row, 'RECOVERY_NURSE')))
      .filter((p) => !bucket.supervisors.some((s) => s.id === p.id));

    // The nurse who opened a record and never closed it. Named on their own
    // cases only — never on a case with no record, which has no holder.
    const holderMap = new Map<string, string[]>();
    bucket.cases.forEach((c) => {
      if (!c.receivedById) return;
      const list = holderMap.get(c.receivedById);
      if (list) list.push(c.id); else holderMap.set(c.receivedById, [c.id]);
    });
    bucket.recordHolders = Array.from(holderMap.entries()).map(([id, caseIds]) => {
      const u = holderById.get(id);
      return {
        id,
        fullName: u?.fullName ?? 'Nurse not on file',
        role: u?.role ? String(u.role) : null,
        hasPhone: Boolean(u?.phoneNumber),
        active: !u || u.status === 'APPROVED',
        shift: null,
        source: 'RECORD_HOLDER' as RecipientSource,
        caseIds,
      };
    });

    const covered = new Set(bucket.supervisors.flatMap((s) => s.caseIds));
    bucket.unmatched = bucket.cases.filter((c) => !covered.has(c.id));
  });

  // Days with nothing completed and nothing outstanding are not a finding.
  return days
    .map((d) => byDay.get(d) as RecoveryChaseDay)
    .filter((d) => d.cases.length > 0 || d.completedCount > 0);
}

/** Every outstanding case in the window, flattened. For totals. */
export const allGapCases = (days: readonly RecoveryChaseDay[]): RecoveryChaseCase[] =>
  days.flatMap((d) => d.cases);

/** One person's outstanding cases on one day, recomputed server-side. */
export function recipientOn(
  day: RecoveryChaseDay,
  personId: string,
): RecoveryRecipient | null {
  return day.supervisors.find((p) => p.id === personId)
    ?? day.recoveryNurses.find((p) => p.id === personId)
    ?? day.recordHolders.find((p) => p.id === personId)
    ?? null;
}
