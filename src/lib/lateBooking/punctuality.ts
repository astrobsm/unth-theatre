// ============================================================
// Who books elective cases on time, and how much notice they give
// ------------------------------------------------------------
// The other side of report.ts. Same rows, same cut-off, opposite question:
// not who to warn, but who to thank.
//
// COMPLIANCE IS NOT THE WHOLE MEASURE. A booking made at 14:55 on the day
// before surgery is compliant and gives the theatre five minutes. One made
// four days ahead gives CSSD, pharmacy, the pack providers and the nursing
// officer room to work. Ranking on the pass/fail flag alone would put those
// two people level and tell the hospital that notice does not matter, so
// NOTICE IS MEASURED AND RANKED — compliance first, then how early.
//
// A VOLUME FLOOR, OR THE BOARD IS MEANINGLESS. One elective case booked on
// time is 100%. Put that above a surgeon who booked forty of forty-one on
// time and the board stops being a recognition of performance and becomes a
// prize for doing almost nothing. People below the floor are still listed,
// under their own heading, so nobody is invisible.
//
// MEDIAN, NOT MEAN, FOR NOTICE. One case booked three weeks early drags a
// mean so far that a habitually last-minute booker looks excellent. The
// median says what this person usually does.
//
// RATES ARE COMPUTED FROM ELECTIVE CASES ONLY, the same denominator
// report.ts uses, so the two pages can never disagree about one person.
// ============================================================

import { bookingLateness, lateBookingCutoff } from '@/lib/bookingLateness';
import type { LateBookingCaseInput } from '@/lib/lateBooking/report';

/**
 * The fewest elective cases a person or unit needs before they are ranked.
 *
 * Three is low on purpose: many units book a handful of electives a month,
 * and a floor high enough to exclude them would recognise only the busiest
 * firms. It is high enough to stop a single case topping the board.
 */
export const MIN_CASES_TO_RANK = 3;

/** At or above this share of on-time bookings, the record is commendable. */
export const COMMENDATION_RATE = 0.9;

/** How far back "their current rate" looks, in days of operating list. */
export const PERFORMANCE_WINDOW_DAYS = 90;

export interface BookerPerformance {
  personId: string | null;
  name: string;
  /** Units they booked for in the window, usually one. */
  units: string[];
  electiveTotal: number;
  onTime: number;
  late: number;
  /** onTime / electiveTotal, 0–1. Null when they booked nothing elective. */
  complianceRate: number | null;
  /**
   * Hours of notice before the 15:00 deadline, median over their on-time
   * cases. Null when none of their bookings can be timed.
   */
  medianNoticeHours: number | null;
  /** Every elective case booked before the deadline. */
  perfect: boolean;
  /** Enough cases to be ranked fairly. */
  ranked: boolean;
  /** Ranked, compliant at or above COMMENDATION_RATE. */
  commendable: boolean;
}

export interface UnitPerformance {
  unit: string;
  electiveTotal: number;
  onTime: number;
  late: number;
  complianceRate: number | null;
  medianNoticeHours: number | null;
  ranked: boolean;
}

export interface PunctualityReport {
  from: string;
  to: string;
  totalElective: number;
  totalOnTime: number;
  overallComplianceRate: number | null;
  /** Median notice across every on-time elective booking in the window. */
  medianNoticeHours: number | null;
  /** Best first, and only those with enough cases to rank. */
  bookers: BookerPerformance[];
  /** Below the volume floor — listed, not ranked. */
  unranked: BookerPerformance[];
  /** Best first. */
  units: UnitPerformance[];
  /** The subset of `bookers` worth a letter of appreciation. */
  commendable: BookerPerformance[];
}

const UNRECORDED = 'Not recorded';

const clean = (v: string | null | undefined): string => {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : UNRECORDED;
};

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** The middle value, or the average of the two middle values. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Hours between the booking and the deadline it had to beat.
 *
 * Positive is notice given; negative would be lateness, and this returns null
 * for those so a late case cannot quietly improve somebody's notice figure.
 */
export function noticeHours(input: {
  scheduledDate: Date | string;
  bookedAt: Date | string | null | undefined;
}): number | null {
  const scheduled = asDate(input.scheduledDate);
  const booked = asDate(input.bookedAt);
  if (!scheduled || !booked) return null;
  const cutoff = lateBookingCutoff(scheduled);
  const hours = (cutoff.getTime() - booked.getTime()) / 3_600_000;
  return hours < 0 ? null : hours;
}

/** "3 days" / "19 hours" / "—" — notice as a clinician would say it. */
export function formatNotice(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 24) {
    const h = Math.round(hours);
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  const days = hours / 24;
  const rounded = days < 10 ? Math.round(days * 10) / 10 : Math.round(days);
  return `${rounded} day${rounded === 1 ? '' : 's'}`;
}

export interface Standing {
  electiveTotal: number;
  onTime: number;
  late: number;
  /** late / electiveTotal, 0–1. Null when nothing elective was booked. */
  lateRate: number | null;
  /** onTime / electiveTotal, 0–1. */
  complianceRate: number | null;
}

/**
 * One person's current record, used by the chase message.
 *
 * SEPARATE FROM THE REPORT ON PURPOSE. The chase quotes a percentage back to
 * the person receiving it, and that figure has to be produced by the same
 * code whichever screen or message asks for it. A warning that states one
 * rate while the board shows another is a warning nobody has to take
 * seriously.
 */
export function standingFor(
  rows: {
    scheduledDate: Date | string;
    createdAt: Date | string | null;
    surgeryType: string | null;
  }[],
): Standing {
  let electiveTotal = 0;
  let late = 0;

  rows.forEach((r) => {
    const type = (r.surgeryType ?? 'ELECTIVE').toUpperCase();
    if (type !== 'ELECTIVE') return;
    electiveTotal += 1;
    const verdict = bookingLateness({
      scheduledDate: r.scheduledDate,
      bookedAt: r.createdAt,
      surgeryType: r.surgeryType,
    });
    if (verdict.isLate) late += 1;
  });

  const onTime = electiveTotal - late;
  return {
    electiveTotal,
    onTime,
    late,
    lateRate: electiveTotal > 0 ? late / electiveTotal : null,
    complianceRate: electiveTotal > 0 ? onTime / electiveTotal : null,
  };
}

/** Best first: compliance, then notice, then volume, then name. */
function byPerformance(a: BookerPerformance, b: BookerPerformance): number {
  const ra = a.complianceRate ?? 0;
  const rb = b.complianceRate ?? 0;
  if (rb !== ra) return rb - ra;
  const na = a.medianNoticeHours ?? 0;
  const nb = b.medianNoticeHours ?? 0;
  if (nb !== na) return nb - na;
  // Volume breaks a tie in favour of the person who did it more often. Forty
  // of forty on time is a larger achievement than three of three.
  if (b.electiveTotal !== a.electiveTotal) return b.electiveTotal - a.electiveTotal;
  return a.name.localeCompare(b.name);
}

interface Accumulator {
  personId: string | null;
  name: string;
  units: string[];
  electiveTotal: number;
  late: number;
  notices: number[];
}

export function buildPunctualityReport(
  rows: LateBookingCaseInput[],
  window: { from: string; to: string },
): PunctualityReport {
  const people = new Map<string, Accumulator>();
  const peopleOrder: string[] = [];

  const unitAcc = new Map<string, { electiveTotal: number; late: number; notices: number[] }>();
  const unitOrder: string[] = [];

  const allNotices: number[] = [];
  let totalElective = 0;
  let totalLate = 0;

  rows.forEach((r) => {
    const type = (r.surgeryType ?? 'ELECTIVE').toUpperCase();
    // Emergencies are never late and were never early — including them would
    // reward a unit for the cases it could not have booked ahead.
    if (type !== 'ELECTIVE') return;

    const unit = clean(r.unit);
    const name = clean(r.bookedByName);
    // Keyed on id where there is one, so two people with the same name stay
    // two records and one person renamed stays one.
    const key = r.bookedById ?? `name:${name}`;

    const verdict = bookingLateness({
      scheduledDate: r.scheduledDate,
      bookedAt: r.createdAt,
      surgeryType: r.surgeryType,
    });
    const isLate = verdict.isLate;
    const notice = isLate ? null : noticeHours({ scheduledDate: r.scheduledDate, bookedAt: r.createdAt });

    totalElective += 1;
    if (isLate) totalLate += 1;
    if (notice != null) allNotices.push(notice);

    let person = people.get(key);
    if (!person) {
      person = { personId: r.bookedById ?? null, name, units: [], electiveTotal: 0, late: 0, notices: [] };
      people.set(key, person);
      peopleOrder.push(key);
    }
    person.electiveTotal += 1;
    if (isLate) person.late += 1;
    if (notice != null) person.notices.push(notice);
    if (person.units.indexOf(unit) === -1) person.units.push(unit);

    let u = unitAcc.get(unit);
    if (!u) {
      u = { electiveTotal: 0, late: 0, notices: [] };
      unitAcc.set(unit, u);
      unitOrder.push(unit);
    }
    u.electiveTotal += 1;
    if (isLate) u.late += 1;
    if (notice != null) u.notices.push(notice);
  });

  const everyone: BookerPerformance[] = peopleOrder.map((key) => {
    const p = people.get(key)!;
    const onTime = p.electiveTotal - p.late;
    const rate = p.electiveTotal > 0 ? onTime / p.electiveTotal : null;
    const ranked = p.electiveTotal >= MIN_CASES_TO_RANK;
    // A case with no booker recorded is a data problem, not a performer.
    // There is nobody to rank and nobody to thank, and a record flagged
    // commendable with no person behind it is a trap for any caller that
    // trusts the flag.
    const attributable = p.name !== UNRECORDED;
    return {
      personId: p.personId,
      name: p.name,
      units: p.units.slice().sort(),
      electiveTotal: p.electiveTotal,
      onTime,
      late: p.late,
      complianceRate: rate,
      medianNoticeHours: median(p.notices),
      perfect: p.electiveTotal > 0 && p.late === 0,
      ranked: ranked && attributable,
      // Commendation needs the volume floor as well as the rate. Praising a
      // single on-time booking by name, in a hospital where other people
      // booked thirty, would devalue the commendation for everybody.
      commendable: ranked && attributable && rate != null && rate >= COMMENDATION_RATE,
    };
  });

  const bookers: BookerPerformance[] = [];
  const unranked: BookerPerformance[] = [];
  everyone.forEach((p) => {
    // Unranked is not a hiding place: everybody the board cannot rank is
    // still listed, so nobody is simply absent from it.
    if (p.ranked) bookers.push(p);
    else unranked.push(p);
  });
  bookers.sort(byPerformance);
  unranked.sort(byPerformance);

  const units: UnitPerformance[] = unitOrder.map((unit) => {
    const u = unitAcc.get(unit)!;
    const onTime = u.electiveTotal - u.late;
    return {
      unit,
      electiveTotal: u.electiveTotal,
      onTime,
      late: u.late,
      complianceRate: u.electiveTotal > 0 ? onTime / u.electiveTotal : null,
      medianNoticeHours: median(u.notices),
      ranked: u.electiveTotal >= MIN_CASES_TO_RANK,
    };
  });
  units.sort((a, b) => {
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
    const ra = a.complianceRate ?? 0;
    const rb = b.complianceRate ?? 0;
    if (rb !== ra) return rb - ra;
    const na = a.medianNoticeHours ?? 0;
    const nb = b.medianNoticeHours ?? 0;
    if (nb !== na) return nb - na;
    if (b.electiveTotal !== a.electiveTotal) return b.electiveTotal - a.electiveTotal;
    return a.unit.localeCompare(b.unit);
  });

  const totalOnTime = totalElective - totalLate;

  return {
    from: window.from,
    to: window.to,
    totalElective,
    totalOnTime,
    overallComplianceRate: totalElective > 0 ? totalOnTime / totalElective : null,
    medianNoticeHours: median(allNotices),
    bookers,
    unranked,
    units,
    commendable: bookers.filter((b) => b.commendable),
  };
}

/**
 * The thank-you sent to somebody whose record deserves one.
 *
 * SPECIFIC, OR IT IS NOISE. It names the figures, because a commendation that
 * could have been sent to anybody is read as a circular. It asks for nothing
 * and threatens nothing: the moment a letter of appreciation carries a
 * reminder about sanctions it stops being appreciation.
 */
export function buildCommendationMessage(input: {
  personName: string;
  performance: Pick<BookerPerformance, 'electiveTotal' | 'onTime' | 'complianceRate' | 'medianNoticeHours' | 'perfect'>;
  periodLabel: string;
  rankLabel?: string | null;
}): string {
  const { performance: p } = input;
  const pct = p.complianceRate == null ? '—' : `${Math.round(p.complianceRate * 100)}%`;

  const lines = [
    `UNTH Theatre — thank you`,
    ``,
    `Dear ${input.personName},`,
    ``,
    p.perfect
      ? `Every one of your ${p.electiveTotal} elective bookings for ${input.periodLabel} was made before the 15:00 deadline.`
      : `${p.onTime} of your ${p.electiveTotal} elective bookings for ${input.periodLabel} were made before the 15:00 deadline — ${pct}.`,
  ];

  if (p.medianNoticeHours != null) {
    lines.push(
      ``,
      `You gave the theatre ${formatNotice(p.medianNoticeHours)} of notice on a typical case.`,
    );
  }

  if (input.rankLabel) {
    lines.push(``, input.rankLabel);
  }

  lines.push(
    ``,
    `That is what allows the list to be planned properly, CSSD to sterilise in good time, pharmacy and the consumable pack providers to draw the right packs, and the nursing officer to assign staff to each theatre before the day begins. Your patients arrive to a theatre that is ready, and so do other people's.`,
    ``,
    `Theatre Management is grateful, and we wanted to say so rather than only write to colleagues who are running late.`,
    ``,
    `With appreciation,`,
    `Theatre Management, UNTH Ituku-Ozalla`,
  );

  return lines.join('\n');
}
