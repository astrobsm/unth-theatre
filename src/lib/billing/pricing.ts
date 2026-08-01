// ============================================================
// Pricing — what a thing cost on the day it was charged
// ------------------------------------------------------------
// A tariff is never edited to change a price. Superseding it closes the old row
// and opens a new one, so the catalogue is a history rather than a snapshot.
//
// That matters for one reason above all: a bill raised in March must still
// reprice to March's figures. If prices were mutable, updating a price list
// would silently rewrite every past invoice that referenced it, and the ledger
// would stop reconciling with no visible cause.
//
// The rule for "which price applies" is stated once, here:
//
//     effectiveFrom <= asOf  AND  (effectiveTo is null OR asOf < effectiveTo)
//
// effectiveFrom is INCLUSIVE and effectiveTo is EXCLUSIVE. A price ending on
// the 1st and its successor starting on the 1st therefore have exactly one
// winner on that day — no gap, no overlap.
// ============================================================

export interface TariffRow {
  id: string;
  code: string;
  name: string;
  kind: string;
  /** Kobo. */
  amount: number;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  itemId?: string | null;
}

/** Midnight UTC of a date, so a time-of-day never decides which price applies. */
function dayOf(value: Date | string): number {
  const d = new Date(value);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Anything with an effective window — a tariff, a revenue rule. Structural on
 * purpose: revenue rules are dated by exactly the same convention, and a second
 * copy of this comparison is a second place for the inclusive/exclusive
 * boundary to drift.
 */
export interface EffectiveDated {
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
}

/** Was this in force on `asOf`? Start inclusive, end exclusive. */
export function isEffective(row: EffectiveDated, asOf: Date | string = new Date()): boolean {
  const on = dayOf(asOf);
  if (dayOf(row.effectiveFrom) > on) return false;
  if (row.effectiveTo && dayOf(row.effectiveTo) <= on) return false;
  return true;
}

/**
 * The price in force on a date.
 *
 * When two rows somehow overlap — which a correct supersede never produces, but
 * a hand-edited catalogue might — the one that started LATER wins. Picking the
 * most recently commenced price is both the likelier intent and stable, rather
 * than depending on the order rows came back from the database.
 */
export function priceOn(
  tariffs: TariffRow[],
  asOf: Date | string = new Date()
): TariffRow | null {
  const live = tariffs.filter((t) => isEffective(t, asOf));
  if (live.length === 0) return null;
  return live.reduce((best, t) =>
    dayOf(t.effectiveFrom) > dayOf(best.effectiveFrom) ? t : best
  );
}

/** Price for one code on a date, or null when nothing is in force. */
export function priceForCode(
  tariffs: TariffRow[],
  code: string,
  asOf: Date | string = new Date()
): TariffRow | null {
  return priceOn(tariffs.filter((t) => t.code === code), asOf);
}

/** Price for a stock item on a date. */
export function priceForItem(
  tariffs: TariffRow[],
  itemId: string,
  asOf: Date | string = new Date()
): TariffRow | null {
  return priceOn(tariffs.filter((t) => t.itemId === itemId), asOf);
}

/**
 * The change set for superseding a price: close the current row on the day the
 * new one starts, and open the new one.
 *
 * Returned as a plan rather than applied, so the caller can write both inside
 * one transaction. A closed old price without its replacement leaves an item
 * with no price at all.
 */
export interface SupersedePlan {
  closeId: string | null;
  closeOn: Date | null;
  openAmount: number;
  openFrom: Date;
}

export function planSupersede(params: {
  current: TariffRow | null;
  newAmount: number;
  effectiveFrom: Date | string;
}): SupersedePlan {
  const from = new Date(dayOf(params.effectiveFrom));
  return {
    closeId: params.current ? params.current.id : null,
    // Exclusive end: the old price stops the instant the new one starts.
    closeOn: params.current ? from : null,
    openAmount: params.newAmount,
    openFrom: from,
  };
}

/**
 * Whether a proposed price change is even a change. Repricing to the same
 * figure would add a row to the history that says nothing.
 */
export function isRealPriceChange(current: TariffRow | null, newAmount: number): boolean {
  if (!current) return true;
  return current.amount !== newAmount;
}

/**
 * Full price history for a code, newest first — what an auditor reads when
 * asking why a charge was what it was.
 */
export function priceHistory(tariffs: TariffRow[], code: string): TariffRow[] {
  return tariffs
    .filter((t) => t.code === code)
    .sort((a, b) => dayOf(b.effectiveFrom) - dayOf(a.effectiveFrom));
}
