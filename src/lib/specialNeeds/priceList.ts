// ============================================================
// One price list, from two documents
// ------------------------------------------------------------
// The hospital has issued its tariff twice. The 2025 export is organised by
// specialty and names things the way a theatre list names them ("PDS loop
// (mass closure)", "Redivac/closed suction drain"). The 2026 sheet is
// organised by item and names things the way the store does ("Polydioxanone
// (PDS-type) 1", "Foley, all-silicone 16Fr"). They overlap heavily.
//
// LOADING BOTH SEPARATELY WOULD DOUBLE THE CATALOGUE. Every item the two
// sheets spell differently would become two rows: one the bundles and
// pickers already point at, and one nobody would ever choose, each with its
// own price, each counted on its own deposit. So they are merged HERE, once,
// into a single list with one row per real thing — and the merge is the
// thing this file exists to do, rather than something the importer discovers
// row by row against whatever happens to be in the database that morning.
//
// THE NEWER SHEET WINS, BUT ONLY WHERE IT SAYS SOMETHING. A blank or a zero
// on the 2026 sheet is a cell the committee has not filled in, not a
// repricing to nothing, so the 2025 figure is kept where the 2026 sheet is
// silent. The reverse would quietly un-price items that have been priced for
// a year.
// ============================================================

import { UNTH_PRICE_LIST, type PricedSeedItem } from './unthPriceList';
import { UNTH_TARIFF_2026, type TariffRow } from './unthTariff2026';
import { comparisonForm, comparisonSize } from './normalise';

/** The tuple that decides two rows are the same real-world thing. */
export function itemKey(
  category: string,
  name: string,
  size?: string | null,
): string {
  return `${category}\u0000${comparisonForm(name)}\u0000${comparisonSize(size)}`;
}

/** What the merge did, so it can be shown rather than taken on trust. */
export interface MergeSummary {
  /** Rows on the 2026 sheet that are the same item as a 2025 row. */
  matched2025: number;
  /** Rows the 2026 sheet adds that the 2025 list did not carry. */
  newIn2026: number;
  /** Items the 2026 sheet gives a price the 2025 list did not have. */
  newlyPriced: number;
  /** Items both sheets price, differently. The 2026 figure is used. */
  repriced: { name: string; from: string; to: string }[];
  /** Rows the 2026 sheet leaves blank or at zero. */
  blankOn2026: number;
  /** Rows in the merged list, which is one per real thing. */
  total: number;
}

function describe(row: { name: string; size?: string }) {
  return `${row.name}${row.size ? ` ${row.size}` : ''}`;
}

/**
 * The two sheets as one list, one row per item.
 *
 * Built fresh on each call rather than frozen at module load: it is read
 * once per import and once per preview, and a shared mutable array that the
 * importer could write through would be a bug waiting for its second caller.
 */
export function currentPriceList(): PricedSeedItem[] {
  const merged: PricedSeedItem[] = UNTH_PRICE_LIST.map((i) => ({ ...i }));
  const byKey = new Map<string, PricedSeedItem>();
  merged.forEach((i) => {
    const k = itemKey(i.category, i.name, i.size);
    // First writer wins, so a duplicate inside the 2025 list itself does not
    // decide which row the 2026 price lands on by accident of iteration.
    if (!byKey.has(k)) byKey.set(k, i);
  });

  UNTH_TARIFF_2026.forEach((t: TariffRow) => {
    const existing = byKey.get(itemKey(t.category, t.name, t.size));

    if (existing) {
      // The newer figure, where there is one. Never a blank over a price.
      if (t.unitPrice) existing.unitPrice = t.unitPrice;
      // The store's own wording for how it issues the thing is the 2026
      // sheet's, because that sheet is organised by item rather than by
      // specialty — but only where the older list said nothing useful.
      if (t.unit && existing.unit === 'piece') existing.unit = t.unit;
      return;
    }

    const row: PricedSeedItem = {
      category: t.category,
      name: t.name,
      ...(t.size ? { size: t.size } : {}),
      ...(t.unitPrice ? { unitPrice: t.unitPrice } : {}),
      ...(t.dispensedByPharmacy ? { dispensedByPharmacy: true } : {}),
      ...(t.specification ? { specification: t.specification } : {}),
      unit: t.unit,
      code: t.code,
      // Nothing reads this yet; it is part of the shape the 2025 list
      // defined. One, rather than a number invented per category.
      maxQtyPerPack: 1,
    };
    merged.push(row);
    byKey.set(itemKey(row.category, row.name, row.size), row);
  });

  return merged;
}

/** The same merge, counted, for the screen that offers to run the import. */
export function mergeSummary(): MergeSummary {
  const by2025 = new Map<string, PricedSeedItem>();
  UNTH_PRICE_LIST.forEach((i) => {
    const k = itemKey(i.category, i.name, i.size);
    if (!by2025.has(k)) by2025.set(k, i);
  });

  const summary: MergeSummary = {
    matched2025: 0,
    newIn2026: 0,
    newlyPriced: 0,
    repriced: [],
    blankOn2026: 0,
    total: 0,
  };

  UNTH_TARIFF_2026.forEach((t) => {
    if (!t.unitPrice) summary.blankOn2026 += 1;
    const old = by2025.get(itemKey(t.category, t.name, t.size));
    if (!old) {
      summary.newIn2026 += 1;
      return;
    }
    summary.matched2025 += 1;
    if (!t.unitPrice) return;
    if (!old.unitPrice) {
      summary.newlyPriced += 1;
      return;
    }
    if (Number(old.unitPrice) !== Number(t.unitPrice)) {
      summary.repriced.push({ name: describe(t), from: old.unitPrice, to: t.unitPrice });
    }
  });

  summary.total = currentPriceList().length;
  return summary;
}

/** How much of the merged list carries a price. Shown before importing. */
export function currentPriceListSummary() {
  const list = currentPriceList();
  let priced = 0;
  let drugs = 0;
  list.forEach((i) => {
    if (i.unitPrice) priced += 1;
    if (i.dispensedByPharmacy) drugs += 1;
  });
  return {
    total: list.length,
    priced,
    unpriced: list.length - priced,
    drugs,
    consumables: list.length - drugs,
  };
}
