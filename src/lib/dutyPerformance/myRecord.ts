// ============================================================
// One person's own record, in their own words
// ------------------------------------------------------------
// The board at /dashboard/duty-performance answers a manager's question:
// across the hospital, who is doing this duty and who is not. This answers the
// question the colleague themselves has, which is a different one: how am I
// doing, and is anything of mine outstanding right now.
//
// IT MUST AGREE WITH THE BOARD, TO THE DECIMAL. If this card tells a nurse her
// record is good while the manager's board is offering a button to chase her
// about it, the card is worse than nothing: she finds out she was behind when
// the message arrives, having been told otherwise by the same system that sent
// it. So the thresholds are not redefined here — COMMENDATION_RATE and
// CHASE_RATE are imported from report.ts, the same constants the chase and the
// commendation are gated on, and the band is derived from the identical share.
//
// WHY A RANK IS SHOWN AT ALL, given that a ranking between colleagues is the
// part most likely to sting. Because the figure alone does not tell anybody
// whether 78% is good: it is good if the theatre is at 60% and poor if the
// theatre is at 95%, and without that context people either despair at a
// respectable figure or relax at a bad one. The rank supplies the context.
//
// WHY IT IS SOMETIMES WITHHELD. A rank out of two colleagues is not a ranking,
// it is a comparison with one other person, and being told you are "2nd of 2"
// is being told you are last with the arithmetic hidden. Below
// MIN_RANKED_FOR_RANK the figures are shown and the position is not.
// ============================================================

import {
  DUTIES, type DutyKey, type DutyPerformance, type DutyReport,
} from './types';
import { CHASE_RATE, COMMENDATION_RATE, MIN_EVENTS_TO_RANK, formatRate } from './report';

/**
 * How many colleagues must be ranked before a position is worth showing.
 *
 * Three. With two, a rank is a comparison with one named person, which is a
 * thing to discuss face to face and not to put on somebody's dashboard.
 */
export const MIN_RANKED_FOR_RANK = 3;

export type StandingBand =
  /** At or above the commendation threshold — the same bar the thank-you uses. */
  | 'EXCELLENT'
  /** Between the two thresholds. Nothing is wrong; nothing is outstanding. */
  | 'GOOD'
  /** Below the chase threshold. The board would offer a chase about this. */
  | 'NEEDS_ATTENTION'
  /** Too little work in the period for a percentage to mean anything. */
  | 'TOO_FEW';

export const BAND_LABEL: Record<StandingBand, string> = {
  EXCELLENT: 'On top of it',
  GOOD: 'Keeping up',
  NEEDS_ATTENTION: 'Falling behind',
  TOO_FEW: 'Too few to score',
};

export interface MyDutyStanding {
  duty: DutyKey;
  /** "Receiving a patient into recovery" */
  label: string;
  /** "Recovery room nurses" */
  owner: string;
  /** Where the work is recorded, so the card can say where to go. */
  where: string;
  /** The one-sentence reason it matters. */
  whyShort: string;
  /** Everything they were responsible for in the window. */
  total: number;
  done: number;
  outstanding: number;
  late: number;
  onTime: number;
  completionRate: number | null;
  punctualityRate: number | null;
  /** onTime / total — the single share both thresholds are read against. */
  onTimeShare: number | null;
  /** 1-based position among ranked colleagues, or null when withheld. */
  rank: number | null;
  /** How many colleagues were ranked for this duty. */
  ofRanked: number;
  band: StandingBand;
  /** Nothing outstanding and nothing late. */
  perfect: boolean;
  /** One line, written to be read on a phone between cases. */
  headline: string;
}

/** onTime / total. The share the board commends and chases against. */
export function onTimeShare(p: DutyPerformance): number | null {
  if (p.total <= 0) return null;
  return (p.done - p.late) / p.total;
}

/**
 * Which band a record falls in.
 *
 * Deliberately derived from the same share and the same two constants the
 * message route gates on, so "Falling behind" on somebody's dashboard and a
 * chase being available to their manager are always the same fact.
 */
export function bandOf(p: DutyPerformance): StandingBand {
  if (!p.ranked) return 'TOO_FEW';
  const share = onTimeShare(p);
  if (share === null) return 'TOO_FEW';
  if (share >= COMMENDATION_RATE) return 'EXCELLENT';
  if (share < CHASE_RATE) return 'NEEDS_ATTENTION';
  return 'GOOD';
}

/** "4th of 11" — or nothing, where a position would not be a ranking. */
export function rankLabel(rank: number | null, ofRanked: number): string | null {
  if (rank === null || ofRanked < MIN_RANKED_FOR_RANK) return null;
  const suffix = (n: number) => {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return 'th';
    const mod10 = n % 10;
    if (mod10 === 1) return 'st';
    if (mod10 === 2) return 'nd';
    if (mod10 === 3) return 'rd';
    return 'th';
  };
  return `${rank}${suffix(rank)} of ${ofRanked}`;
}

/**
 * The line at the top of the row.
 *
 * It leads with what is OUTSTANDING, because that is the only part the person
 * can still act on. A percentage describes a month that has already happened;
 * two unrecorded discharges are two things they could enter this afternoon.
 */
export function standingHeadline(s: {
  total: number; done: number; outstanding: number; late: number;
  onTimeShare: number | null; band: StandingBand; verb: string;
}): string {
  if (s.total === 0) return 'Nothing was assigned to you in this period.';

  if (s.band === 'TOO_FEW') {
    return `${s.done} of ${s.total} ${s.verb}`
      + `${s.outstanding > 0 ? `, ${s.outstanding} still outstanding` : ''}. `
      + `Too few for a percentage to mean anything.`;
  }

  const parts: string[] = [];
  if (s.outstanding > 0) {
    parts.push(`${s.outstanding} still not ${s.verb}`);
  }
  if (s.late > 0) parts.push(`${s.late} ${s.verb} late`);

  const share = formatRate(s.onTimeShare);
  if (parts.length === 0) return `All ${s.total} ${s.verb} on time — ${share}.`;
  return `${parts.join(' and ')}, out of ${s.total} — ${share} on time.`;
}

/**
 * One colleague's standing on one duty, from the report the board is built on.
 *
 * Returns null when they had nothing: a card listing every duty in the
 * hospital against a nurse who holds four of them is a card nobody reads.
 */
export function myStanding(
  duty: DutyKey,
  report: DutyReport,
  personId: string,
): MyDutyStanding | null {
  const index = report.people.findIndex((p) => p.personId === personId);
  const p = index >= 0
    ? report.people[index]
    : report.unranked.find((x) => x.personId === personId) ?? null;
  if (!p || p.total === 0) return null;

  const d = DUTIES[duty];
  const band = bandOf(p);
  const share = onTimeShare(p);

  return {
    duty,
    label: d.label,
    owner: d.owner,
    where: d.where,
    whyShort: d.whyShort,
    total: p.total,
    done: p.done,
    outstanding: p.outstanding,
    late: p.late,
    onTime: p.onTime,
    completionRate: p.completionRate,
    punctualityRate: p.punctualityRate,
    onTimeShare: share,
    rank: index >= 0 ? index + 1 : null,
    ofRanked: report.people.length,
    band,
    perfect: p.perfect,
    headline: standingHeadline({
      total: p.total,
      done: p.done,
      outstanding: p.outstanding,
      late: p.late,
      onTimeShare: share,
      band,
      verb: d.verb,
    }),
  };
}

/** Worst first: the thing to act on, at the top. */
const BAND_ORDER: Record<StandingBand, number> = {
  NEEDS_ATTENTION: 0,
  GOOD: 1,
  EXCELLENT: 2,
  TOO_FEW: 3,
};

/**
 * The duties worth showing somebody, in the order they should read them.
 *
 * Outstanding work first within a band, because that is what is actionable,
 * and volume last so a duty they carry forty times outranks one they carried
 * three times.
 */
export function sortMine(standings: MyDutyStanding[]): MyDutyStanding[] {
  return standings.slice().sort((a, b) => (
    BAND_ORDER[a.band] - BAND_ORDER[b.band]
    || b.outstanding - a.outstanding
    || b.late - a.late
    || b.total - a.total
    || a.label.localeCompare(b.label)
  ));
}

export interface MyRecordSummary {
  duties: number;
  /** Across every duty: work never done. The number that matters. */
  outstanding: number;
  late: number;
  total: number;
  needsAttention: number;
  excellent: number;
  /** Their best position, where one is worth showing. */
  bestRank: { duty: DutyKey; label: string; rank: number; ofRanked: number } | null;
}

export function summariseMine(standings: MyDutyStanding[]): MyRecordSummary {
  let outstanding = 0;
  let late = 0;
  let total = 0;
  let needsAttention = 0;
  let excellent = 0;
  let bestRank: MyRecordSummary['bestRank'] = null;

  standings.forEach((s) => {
    outstanding += s.outstanding;
    late += s.late;
    total += s.total;
    if (s.band === 'NEEDS_ATTENTION') needsAttention += 1;
    if (s.band === 'EXCELLENT') excellent += 1;
    if (s.rank !== null && s.ofRanked >= MIN_RANKED_FOR_RANK) {
      if (!bestRank || s.rank < bestRank.rank) {
        bestRank = { duty: s.duty, label: s.label, rank: s.rank, ofRanked: s.ofRanked };
      }
    }
  });

  return {
    duties: standings.length,
    outstanding,
    late,
    total,
    needsAttention,
    excellent,
    bestRank,
  };
}

/**
 * The single line at the top of the card.
 *
 * Praise is only given where it is earned across the board — one excellent
 * duty beside one neglected one is not "well done", and a card that opens with
 * congratulations above a row saying two discharges were never recorded reads
 * as a system that is not paying attention.
 */
export function myHeadline(s: MyRecordSummary): string {
  if (s.duties === 0) return 'Nothing recorded against you in this period.';

  if (s.outstanding > 0) {
    return `${s.outstanding} ${s.outstanding === 1 ? 'thing' : 'things'} of yours `
      + `${s.outstanding === 1 ? 'is' : 'are'} still not recorded.`;
  }
  if (s.needsAttention > 0) {
    return `Everything of yours is recorded, but `
      + `${s.needsAttention === 1 ? 'one duty is' : `${s.needsAttention} duties are`} `
      + 'running late more often than not.';
  }
  if (s.late > 0) {
    return `Everything of yours is recorded. ${s.late} `
      + `${s.late === 1 ? 'was' : 'were'} entered after the deadline.`;
  }
  return `All ${s.total} of your ${s.total === 1 ? 'duty' : 'duties'} in this period were `
    + 'done on time.';
}

/** Re-exported so a caller never has to reach past this module for the floor. */
export { MIN_EVENTS_TO_RANK };
