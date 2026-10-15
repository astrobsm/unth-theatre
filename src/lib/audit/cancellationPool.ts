// ============================================================
// The week's cancellations, and who has to come and account for them
// ------------------------------------------------------------
// Every case that did not hold is pooled into one weekly sitting. The point
// of pooling rather than dealing with each as it happens is that the pattern
// is the finding: one cancellation for a failed diathermy is bad luck, four
// in a week is a machine nobody has condemned.
//
// WHO IS SUMMONED. The team that had the case — surgeon, anaesthetist, the
// person who booked it, the person who cancelled it — and, where the category
// points at a service rather than at the team, whoever runs that service. A
// cancellation blamed on equipment with no engineer in the room is a
// discussion that reaches no conclusion.
//
// THE RESTRAINT MATTERS MORE THAN THE REACH. The temptation is to summon
// everyone who might be relevant, and a meeting of thirty people where
// twenty-six have nothing to answer for is one that stops being attended.
// So: the four people actually on the case, plus at most the service the
// category names. Committee members are not summoned — they are members, and
// they sit whether or not a particular case concerns them.
//
// ONE PERSON, ONE SUMMONS PER CASE. A consultant with three cancelled cases
// in a week has three matters to answer and gets three summonses, but they
// arrive as one notice listing all three. The unique index on
// (cause, userId, surgeryId) is what enforces the first half; grouping in the
// notifier is what gives the second.
//
// Pure. The week arithmetic and the summons list can both be proved without a
// database, which matters because getting either wrong means somebody is
// called to a meeting they did not need to attend.
// ============================================================

import { WAT_OFFSET_MINUTES } from '@/lib/watDay';

/** Monday is day 1. The audit week runs Monday to Sunday. */
const MONDAY = 1;

export interface AuditWeek {
  /** YYYY-MM-DD, the Monday. */
  start: string;
  /** YYYY-MM-DD, the Sunday. */
  end: string;
  /** UTC instants bounding the week: [from, to). For querying. */
  from: Date;
  to: Date;
  /** "13–19 October 2026", for the summons. */
  label: string;
}

/**
 * The audit week containing a given instant.
 *
 * Weeks are WAT weeks. A case cancelled at 00:30 on Monday is a Monday
 * cancellation, and reading the day in UTC would file it under the Sunday —
 * into the week that has already been audited.
 */
export function auditWeekOf(value: Date | string): AuditWeek {
  const d = value instanceof Date ? value : new Date(value);
  const local = new Date(d.getTime() + WAT_OFFSET_MINUTES * 60_000);
  const dow = local.getUTCDay();
  // Sunday (0) belongs to the week that began six days earlier, not to the
  // one starting tomorrow.
  const back = (dow - MONDAY + 7) % 7;

  const mondayUtcMidnight = Date.UTC(
    local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back,
  );
  const from = new Date(mondayUtcMidnight - WAT_OFFSET_MINUTES * 60_000);
  const to = new Date(from.getTime() + 7 * 24 * 3_600_000);

  const dayStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const start = dayStr(mondayUtcMidnight);
  const end = dayStr(mondayUtcMidnight + 6 * 24 * 3_600_000);

  return { start, end, from, to, label: describeWeek(start, end) };
}

/** The week before the one containing `value`. What a Monday sitting reviews. */
export function previousAuditWeek(value: Date | string): AuditWeek {
  const w = auditWeekOf(value);
  return auditWeekOf(new Date(w.from.getTime() - 24 * 3_600_000));
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "13–19 October 2026", or "29 September – 5 October 2026" across a month. */
export function describeWeek(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  if (sy === ey && sm === em) return `${sd}–${ed} ${MONTHS[em - 1]} ${ey}`;
  if (sy === ey) return `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]} ${ey}`;
  return `${sd} ${MONTHS[sm - 1]} ${sy} – ${ed} ${MONTHS[em - 1]} ${ey}`;
}

/**
 * The service role a cancellation category points at, or null when the
 * category is about the team or the patient and the team is already coming.
 *
 * PATIENT_CONDITION and PATIENT_REQUEST return null deliberately. Nobody runs
 * a service called "the patient was unwell", and summoning a department for
 * it would be summoning them for nothing.
 */
export function serviceRoleFor(category: string): string | null {
  switch (category) {
    case 'EQUIPMENT_FAILURE':
      return 'BIOMEDICAL_ENGINEER';
    case 'ADMINISTRATIVE':
      return 'THEATRE_MANAGER';
    case 'EMERGENCY_PRIORITY':
      // Whoever was running the floor when the theatre was taken.
      return 'THEATRE_MANAGER';
    case 'STAFF_UNAVAILABILITY':
    case 'PATIENT_CONDITION':
    case 'PATIENT_REQUEST':
    case 'OTHER':
    default:
      return null;
  }
}

/** One person to be called, with the part they played. */
export interface SummonsTarget {
  userId: string;
  roleOnCase: string;
}

export interface PooledCase {
  surgeryId: string;
  category: string;
  surgeonId?: string | null;
  anaesthetistId?: string | null;
  bookedById?: string | null;
  cancelledById?: string | null;
}

/**
 * Who to summon for one cancelled case.
 *
 * De-duplicated by person: a surgeon who booked their own case and then
 * cancelled it is one summons, described by the first part they played, not
 * three summonses to the same person for the same case.
 */
export function targetsForCase(c: PooledCase): SummonsTarget[] {
  const ordered: Array<[string | null | undefined, string]> = [
    [c.surgeonId, 'Surgeon'],
    [c.anaesthetistId, 'Anaesthetist'],
    [c.bookedById, 'Booked the case'],
    [c.cancelledById, 'Recorded the cancellation'],
  ];

  const seen = new Set<string>();
  const out: SummonsTarget[] = [];
  for (const [id, roleOnCase] of ordered) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ userId: id, roleOnCase });
  }
  return out;
}

/**
 * Group a week's summonses so one person receives one notice.
 *
 * Returns a map of userId to the matters they must answer. Three cancelled
 * cases is three matters in one message, not three messages — a consultant
 * who receives three separate summonses on a Monday morning reads the first.
 */
export function groupByPerson<T extends { userId: string }>(
  summonses: readonly T[],
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const s of summonses) {
    const list = out.get(s.userId);
    if (list) list.push(s);
    else out.set(s.userId, [s]);
  }
  return out;
}
