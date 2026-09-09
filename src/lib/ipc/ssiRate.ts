// ============================================================
// Turning surveillance records into a rate somebody can defend
// ------------------------------------------------------------
// An SSI rate is quoted constantly and almost never defined. The number that
// matters is not "infections divided by operations" — it is infections divided
// by operations THAT WERE ACTUALLY FOLLOWED UP, reported alongside how many
// were not, because those two numbers move in opposite directions and quoting
// only the first is how a service with poor follow-up reports an excellent
// rate.
//
// Pure, so the arithmetic can be checked without a database. This is a number
// that goes into a report to the Medical Advisory Committee, and it should not
// take a live server to prove it is right.
// ============================================================

export type WoundClass = 'CLEAN' | 'CLEAN_CONTAMINATED' | 'CONTAMINATED' | 'DIRTY_INFECTED';
export type SurveillanceStatus =
  | 'OPEN' | 'CLOSED_NO_INFECTION' | 'CLOSED_INFECTION' | 'LOST_TO_FOLLOW_UP';

export interface SurveillanceRow {
  woundClass: WoundClass;
  status: SurveillanceStatus;
}

export interface RateBreakdown {
  /** Every record, whatever its state. */
  total: number;
  /** Followed to a conclusion: the denominator of the rate. */
  evaluable: number;
  infections: number;
  stillOpen: number;
  lostToFollowUp: number;
  /** Infections / evaluable, as a percentage. Null when nothing is evaluable. */
  ratePercent: number | null;
  /**
   * How much of the cohort reached a conclusion. A rate computed from a third
   * of the cases is not wrong, but it is not the same claim, and this is what
   * says so.
   */
  followUpPercent: number | null;
}

const EMPTY = (): RateBreakdown => ({
  total: 0, evaluable: 0, infections: 0, stillOpen: 0, lostToFollowUp: 0,
  ratePercent: null, followUpPercent: null,
});

function finalise(b: RateBreakdown): RateBreakdown {
  b.ratePercent = b.evaluable === 0 ? null : round1((b.infections / b.evaluable) * 100);
  b.followUpPercent = b.total === 0 ? null : round1((b.evaluable / b.total) * 100);
  return b;
}

/** One decimal place: an SSI rate quoted to four is false precision. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function tally(b: RateBreakdown, row: SurveillanceRow): void {
  b.total += 1;
  switch (row.status) {
    case 'CLOSED_INFECTION':
      b.evaluable += 1;
      b.infections += 1;
      break;
    case 'CLOSED_NO_INFECTION':
      b.evaluable += 1;
      break;
    case 'OPEN':
      b.stillOpen += 1;
      break;
    case 'LOST_TO_FOLLOW_UP':
      // NOT evaluable, and deliberately not counted as "no infection". Counting
      // it that way is the single easiest way to make a rate look good, and it
      // is why the follow-up percentage is reported beside it.
      b.lostToFollowUp += 1;
      break;
  }
}

/** The overall rate, and the same figures split by wound class. */
export function ssiRates(rows: readonly SurveillanceRow[]): {
  overall: RateBreakdown;
  byWoundClass: Record<WoundClass, RateBreakdown>;
} {
  const overall = EMPTY();
  const byWoundClass: Record<WoundClass, RateBreakdown> = {
    CLEAN: EMPTY(),
    CLEAN_CONTAMINATED: EMPTY(),
    CONTAMINATED: EMPTY(),
    DIRTY_INFECTED: EMPTY(),
  };

  for (const row of rows) {
    tally(overall, row);
    // An unrecognised class would otherwise throw on a null column and take
    // the whole report down; it is counted in the overall figure regardless.
    if (byWoundClass[row.woundClass]) tally(byWoundClass[row.woundClass], row);
  }

  finalise(overall);
  for (const k of Object.keys(byWoundClass) as WoundClass[]) finalise(byWoundClass[k]);
  return { overall, byWoundClass };
}

/**
 * When follow-up is due.
 *
 * Thirty days from the operation, or ninety where an implant was placed —
 * a deep infection around a prosthesis routinely declares itself months later,
 * and closing at thirty days would call it clean.
 */
export function followUpDue(operationDate: Date, implantPlaced: boolean): Date {
  const due = new Date(operationDate);
  due.setDate(due.getDate() + (implantPlaced ? 90 : 30));
  return due;
}
