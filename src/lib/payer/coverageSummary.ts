// ============================================================
// Insurance Coverage Summary
// ------------------------------------------------------------
// WHAT THIS REPORT IS FOR, stated plainly so it does not drift into being a
// billing document. It answers one question for the Theatre Users Committee
// and for Management: of everything the theatre asked the schemes to cover,
// how much did they, and what keeps coming back?
//
// The "top non-covered items" list is the actionable half. An item that is
// refused forty times in a month is either genuinely outside the scheme --
// in which case the booking standard should stop including it for insured
// patients -- or it is covered and nobody has ticked the flag. Both are
// fixable; neither is visible without counting.
//
// PURE. Takes rows, returns numbers. The route reads the database and hands
// them over, so the arithmetic can be exercised without one.
// ============================================================

import { isInsuredPayer, type PayerCategory } from './categories';
import type { FulfilmentUnit, PackListKind } from './routing';

export interface SummaryRow {
  list: PackListKind;
  name: string;
  quantity: number;
  payerCategory: PayerCategory;
  routedTo: FulfilmentUnit;
  /** Set where the NHIA Pharmacy sent the line on. */
  reassignedFrom?: FulfilmentUnit | null;
  reassignReason?: string | null;
  /** Withdrawn lines are counted separately, never silently. */
  status: string;
}

export interface SchemeTotals {
  scheme: PayerCategory;
  /** Lines asked for on insured cases. */
  requested: number;
  /** Lines the routing sent to the scheme's counter. */
  covered: number;
  /** Lines the scheme's counter sent on afterwards. */
  reassigned: number;
  /** Lines that never reached the scheme at all: not covered from the start. */
  notCovered: number;
  /** Quantities, which is what the money follows. */
  requestedUnits: number;
  coveredUnits: number;
}

export interface NonCoveredItem {
  name: string;
  list: PackListKind;
  times: number;
  units: number;
  /** The reasons given, most common first, where any were given. */
  reasons: string[];
}

export interface CoverageSummary {
  schemes: SchemeTotals[];
  topNonCovered: NonCoveredItem[];
  /** Lines on insured cases that nobody has classified either way. */
  unclassified: number;
  /** Cases in the window whose payer category was never set. */
  unspecifiedCases: number;
  totals: { insuredCases: number; insuredLines: number };
}

const INSURED: PayerCategory[] = ['NHIA', 'NHIS', 'CEmONC'];

/** Withdrawn lines are not requests. Counting them would flatter every figure. */
const isLive = (s: string) => String(s ?? '').toUpperCase() !== 'CANCELLED';

export function summariseCoverage(
  rows: SummaryRow[],
  opts: { insuredCases?: number; unspecifiedCases?: number; unclassified?: number } = {},
): CoverageSummary {
  const live = rows.filter((r) => isLive(r.status)).filter((r) => isInsuredPayer(r.payerCategory));

  const schemes: SchemeTotals[] = INSURED.map((scheme) => {
    const mine = live.filter((r) => r.payerCategory === scheme);
    const covered = mine.filter((r) => r.routedTo === 'NHIA_PHARMACY');
    const reassigned = mine.filter((r) => r.reassignedFrom === 'NHIA_PHARMACY');
    return {
      scheme,
      requested: mine.length,
      covered: covered.length,
      reassigned: reassigned.length,
      // Never reached the scheme: routed away from it and not sent away by
      // it. The two are different facts and a report that merged them would
      // hide whether the catalogue or the counter is the problem.
      notCovered: mine.filter(
        (r) => r.routedTo !== 'NHIA_PHARMACY' && r.reassignedFrom !== 'NHIA_PHARMACY',
      ).length,
      requestedUnits: mine.reduce((n, r) => n + (r.quantity || 0), 0),
      coveredUnits: covered.reduce((n, r) => n + (r.quantity || 0), 0),
    };
  });

  // ---- What keeps coming back -------------------------------------------
  const byName = new Map<string, NonCoveredItem & { reasonCounts: Map<string, number> }>();
  for (const r of live) {
    if (r.routedTo === 'NHIA_PHARMACY') continue;
    const key = `${r.list}:${r.name.trim().toLowerCase()}`;
    if (!byName.has(key)) {
      byName.set(key, {
        name: r.name.trim(), list: r.list, times: 0, units: 0,
        reasons: [], reasonCounts: new Map(),
      });
    }
    const e = byName.get(key)!;
    e.times += 1;
    e.units += r.quantity || 0;
    const reason = (r.reassignReason ?? '').trim();
    if (reason) e.reasonCounts.set(reason, (e.reasonCounts.get(reason) ?? 0) + 1);
  }

  const topNonCovered = Array.from(byName.values())
    .map((e) => ({
      name: e.name,
      list: e.list,
      times: e.times,
      units: e.units,
      reasons: Array.from(e.reasonCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([reason]) => reason)
        .slice(0, 3),
    }))
    // Most frequent first; ties broken by quantity, because twenty of one
    // thing costs a family more than two of another asked the same number
    // of times.
    .sort((a, b) => (b.times - a.times) || (b.units - a.units) || a.name.localeCompare(b.name))
    .slice(0, 25);

  return {
    schemes,
    topNonCovered,
    unclassified: opts.unclassified ?? 0,
    unspecifiedCases: opts.unspecifiedCases ?? 0,
    totals: { insuredCases: opts.insuredCases ?? 0, insuredLines: live.length },
  };
}

/** The share of what was asked for that the scheme actually took, 0–100. */
export function coverageRate(t: SchemeTotals): number {
  if (t.requested === 0) return 0;
  return Math.round((t.covered / t.requested) * 1000) / 10;
}
