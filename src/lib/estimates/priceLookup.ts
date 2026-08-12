// ============================================================
// Finding the price that applied on a given date
// ------------------------------------------------------------
// Pure selection over tariff rows the caller has already loaded. Kept separate
// from the database query because "which of these rows was in force" is the
// part that has to be right, and it is the part worth testing exhaustively.
//
// The price master is effective-dated: superseding a price writes effectiveTo
// on the old row and inserts a new one, so several rows share a code and only
// one is current. Choosing the wrong one misprices an estimate in a way nobody
// notices until a patient disputes it.
// ============================================================

import type { ChargeKind } from './chargeKinds';

/** A tariff row, narrowed to what selection needs. */
export interface TariffRow {
  id: string;
  code: string;
  name: string;
  kind: ChargeKind;
  amount: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  itemId?: string | null;
  surgicalPackId?: string | null;
}

/** Compare dates by calendar day. Tariff windows are dates, not instants. */
function dayValue(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Was this row in force on `on`?
 *
 * effectiveFrom is inclusive and effectiveTo EXCLUSIVE, which is what makes a
 * supersession clean: the new row's from equals the old row's to, and exactly
 * one of them applies on that day. Treating `to` as inclusive would make both
 * apply and the answer would depend on sort order.
 */
export function isInForce(row: TariffRow, on: Date): boolean {
  const day = dayValue(on);
  if (dayValue(row.effectiveFrom) > day) return false;
  if (row.effectiveTo !== null && dayValue(row.effectiveTo) <= day) return false;
  return true;
}

/**
 * The price for a code and kind on a date, or null if the hospital has never
 * priced it.
 *
 * Returning null rather than zero is deliberate: a missing price is a gap in the
 * price master that someone must fill, and a silent zero on a patient's estimate
 * reads as "free".
 */
export function priceOn(
  rows: TariffRow[],
  code: string,
  kind: ChargeKind,
  on: Date
): TariffRow | null {
  const candidates = rows.filter(
    (r) => r.code === code && r.kind === kind && isInForce(r, on));

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Overlapping windows mean the price master is inconsistent — a bad import,
  // or a row inserted without closing its predecessor. Take the most recently
  // effective, and then the most recently created, so the answer is at least
  // deterministic rather than dependent on row order from the database.
  return candidates.slice().sort((a, b) => {
    const d = dayValue(b.effectiveFrom) - dayValue(a.effectiveFrom);
    return d !== 0 ? d : b.id.localeCompare(a.id);
  })[0];
}

/** Same, for a stock item priced by id rather than code. */
export function priceForItemOn(
  rows: TariffRow[],
  itemId: string,
  on: Date
): TariffRow | null {
  const candidates = rows.filter((r) => r.itemId === itemId && isInForce(r, on));
  if (candidates.length <= 1) return candidates[0] ?? null;
  return candidates.slice().sort((a, b) => {
    const d = dayValue(b.effectiveFrom) - dayValue(a.effectiveFrom);
    return d !== 0 ? d : b.id.localeCompare(a.id);
  })[0];
}

/**
 * Admission is priced per ward, and Tariff has no ward column — the bulk import
 * folds the ward into the code as `CODE::WARD`. Same convention here, so the
 * two cannot drift apart.
 */
export function admissionCode(base: string, ward: string | null | undefined): string {
  return ward ? `${base}::${ward.trim().toUpperCase()}` : base;
}

export interface UnpricedItem {
  description: string;
  kind: ChargeKind;
  code?: string;
  reason: string;
}

/**
 * Report what could not be priced.
 *
 * Surfaced rather than swallowed: an estimate with silently missing charges is
 * worse than one that refuses to be issued, because the patient plans around it.
 */
export function summariseUnpriced(items: UnpricedItem[]): string[] {
  return items.map((i) =>
    `${i.description} (${i.kind}${i.code ? `, ${i.code}` : ''}): ${i.reason}`);
}
