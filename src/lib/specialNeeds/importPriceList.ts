// ============================================================
// Loading the hospital's price list into the catalogue
// ------------------------------------------------------------
// Two things happen here, and they have very different risk profiles.
//
// ADDING MISSING ITEMS is safe and repeatable. Nothing is deleted, so a
// store keeper's locally added brands and sizes survive every run.
//
// CHANGING A PRICE IS NOT. By the time this is run a second time, a
// pharmacist will have corrected prices in the app — that is what the
// pricing screens are for — and those corrections are more current than a
// CSV exported months earlier. So the default is to FILL BLANKS ONLY: an
// item with no price gets one, and an item somebody has already priced is
// left exactly as it is, with the difference reported rather than applied.
//
// Overwriting is still possible, because a hospital does reissue its tariff
// and then the list genuinely is newer. It is a deliberate second action
// with the differences shown first, not the default.
// ============================================================

import prisma from '@/lib/prisma';
import { UNTH_PRICE_LIST, type PricedSeedItem } from './unthPriceList';
import { toKobo } from './pricing';

export interface PriceDifference {
  itemId: string;
  name: string;
  /** What the hospital's list says, in naira. */
  listPrice: string;
  /** What is currently stored, in naira. */
  currentPrice: string;
  pricedByName: string | null;
}

export interface PriceListImportResult {
  /** Items created because the catalogue did not have them. */
  added: number;
  /** Items the catalogue already held. */
  alreadyPresent: number;
  /** Items that had no price and were given the list's price. */
  pricesSet: number;
  /** Items already priced the same as the list. Nothing to do. */
  pricesAgreed: number;
  /** Items priced differently. Left alone unless overwriting. */
  pricesDiffering: number;
  /** Items whose stored price was replaced by the list's. */
  pricesOverwritten: number;
  /** Rows on the list that carry no price at all. */
  unpricedOnList: number;
  /** The differences, so they can be shown before anybody overwrites. */
  differences: PriceDifference[];
  /** Existing rows that were adopted and stamped with the list's code. */
  codesStamped: number;
  /** Sized variants priced from an undifferentiated list price. */
  pricedByEquivalence: number;
}

/**
 * One price on the list, several rows in the catalogue.
 *
 * The hospital prices "Sterile gloves" at one figure per pair and "IV
 * cannula" at one figure per piece, with no size or gauge. The catalogue
 * carries the sizes and gauges separately, because a scrub nurse orders a
 * 7.5 and an anaesthetist orders a grey 16G — and the magnitude bundles
 * ask for them that way.
 *
 * Without this, every glove and cannula in every bundle stays unpriced and
 * each deposit is reported incomplete for items the hospital HAS priced.
 *
 * THIS IS AN INFERENCE, AND A NARROW ONE. It says only that a pair of
 * sterile gloves costs the same whatever the hand size, which is what a
 * single undifferentiated price on the list means. It is listed here in
 * the open so it can be read and disagreed with, it fills blanks only like
 * every other price here, and anyone can override any one of these rows on
 * the pricing screen afterwards.
 */
const PRICE_EQUIVALENCES: { code: string; appliesTo: { category: string; name: string }[] }[] = [
  {
    code: 'STERILE-GLOVES',
    appliesTo: [{ category: 'GLOVES', name: 'Surgical glove, sterile' }],
  },
  {
    code: 'IV-CANNULA',
    appliesTo: [
      { category: 'IV_CANNULA', name: 'IV cannula, orange' },
      { category: 'IV_CANNULA', name: 'IV cannula, grey' },
      { category: 'IV_CANNULA', name: 'IV cannula, green' },
      { category: 'IV_CANNULA', name: 'IV cannula, pink' },
      { category: 'IV_CANNULA', name: 'IV cannula, blue' },
      { category: 'IV_CANNULA', name: 'IV cannula, yellow' },
    ],
  },
];

/** The tuple the unique index uses, with null spelled consistently. */
function naturalKey(category: string, name: string, size?: string | null, brand?: string | null) {
  return `${category}\u0000${name}\u0000${size ?? ''}\u0000${brand ?? ''}`;
}

/** Same money, to the kobo. Decimal columns and CSV strings never match as strings. */
function samePrice(a: string | null | undefined, b: string | null | undefined) {
  const ka = toKobo(a ?? null);
  const kb = toKobo(b ?? null);
  return ka !== null && kb !== null && ka === kb;
}

export async function importPriceList(
  options: { overwritePrices?: boolean; byName?: string | null } = {},
): Promise<PriceListImportResult> {
  const overwrite = options.overwritePrices === true;
  const by = options.byName ?? 'UNTH price list';

  const existing = await prisma.specialNeedItem.findMany({
    select: {
      id: true,
      category: true,
      name: true,
      size: true,
      brand: true,
      unitPrice: true,
      pricedByName: true,
      sourceCode: true,
    },
  });

  const byCode = new Map<string, (typeof existing)[number]>();
  const byNatural = new Map<string, (typeof existing)[number]>();
  existing.forEach((e) => {
    if (e.sourceCode) byCode.set(e.sourceCode, e);
    // First writer wins: if the catalogue somehow holds two rows with the
    // same natural key (possible, because Postgres lets NULLs repeat in a
    // unique index), price the one that was created first rather than
    // picking arbitrarily on each run.
    const k = naturalKey(e.category, e.name, e.size, e.brand);
    if (!byNatural.has(k)) byNatural.set(k, e);
  });

  const result: PriceListImportResult = {
    added: 0,
    alreadyPresent: 0,
    pricesSet: 0,
    pricesAgreed: 0,
    pricesDiffering: 0,
    pricesOverwritten: 0,
    unpricedOnList: 0,
    differences: [],
    codesStamped: 0,
    pricedByEquivalence: 0,
  };

  const missing: PricedSeedItem[] = [];

  // ── Pass one: decide, item by item, without writing ──────────────────
  type Plan = { row: (typeof existing)[number]; item: PricedSeedItem; stampCode: boolean };
  const toPrice: Plan[] = [];
  const toStampOnly: Plan[] = [];

  UNTH_PRICE_LIST.forEach((item) => {
    if (!item.unitPrice) result.unpricedOnList += 1;

    // Match on the hospital's own code first: it survives a name being
    // corrected. Fall back to the natural key so the FIRST import adopts
    // rows the standard catalogue already seeded instead of duplicating
    // them, and stamps the code onto them for next time.
    const row =
      byCode.get(item.code) ??
      byNatural.get(naturalKey(item.category, item.name, item.size ?? null, null));

    if (!row) {
      missing.push(item);
      return;
    }

    result.alreadyPresent += 1;
    const stampCode = row.sourceCode !== item.code;

    if (!item.unitPrice) {
      if (stampCode) toStampOnly.push({ row, item, stampCode });
      return;
    }

    const current = row.unitPrice == null ? null : String(row.unitPrice);

    if (current == null) {
      toPrice.push({ row, item, stampCode });
      return;
    }
    if (samePrice(current, item.unitPrice)) {
      result.pricesAgreed += 1;
      if (stampCode) toStampOnly.push({ row, item, stampCode });
      return;
    }

    result.pricesDiffering += 1;
    result.differences.push({
      itemId: row.id,
      name: `${row.name}${row.size ? ` ${row.size}` : ''}`,
      listPrice: item.unitPrice,
      currentPrice: current,
      pricedByName: row.pricedByName,
    });
    if (overwrite) toPrice.push({ row, item, stampCode });
    else if (stampCode) toStampOnly.push({ row, item, stampCode });
  });

  // ── Pass two: write ──────────────────────────────────────────────────
  if (missing.length > 0) {
    // skipDuplicates as well as the pre-filter: two administrators pressing
    // the button at the same moment must not collide on the unique index.
    const created = await prisma.specialNeedItem.createMany({
      data: missing.map((m) => ({
        category: m.category as never,
        name: m.name,
        size: m.size ?? null,
        material: m.material ?? null,
        needleType: m.needleType ?? null,
        needleSize: m.needleSize ?? null,
        absorbable: m.absorbable ?? null,
        specification: m.specification ?? null,
        dispensedByPharmacy: m.dispensedByPharmacy ?? false,
        unit: m.unit,
        sourceCode: m.code,
        unitPrice: m.unitPrice == null ? null : m.unitPrice,
        pricedAt: m.unitPrice == null ? null : new Date(),
        pricedByName: m.unitPrice == null ? null : by,
        isLocallyAdded: false,
        createdByName: by,
      })),
      skipDuplicates: true,
    });
    result.added = created.count;
    result.pricesSet += missing.filter((m) => !!m.unitPrice).length;
  }

  for (const plan of toPrice) {
    const price = {
      unitPrice: plan.item.unitPrice,
      pricedAt: new Date(),
      pricedByName: by,
      unit: plan.item.unit,
    };
    // THE PRICE MATTERS, THE CODE DOES NOT. If the code collides, drop the
    // code and still set the price — losing a price because of a
    // bookkeeping field would undercharge a patient.
    try {
      await prisma.specialNeedItem.update({
        where: { id: plan.row.id },
        data: plan.stampCode ? { ...price, sourceCode: plan.item.code } : price,
      });
      if (plan.stampCode) result.codesStamped += 1;
    } catch {
      await prisma.specialNeedItem.update({ where: { id: plan.row.id }, data: price });
    }
    if (plan.row.unitPrice == null) result.pricesSet += 1;
    else result.pricesOverwritten += 1;
  }

  for (const plan of toStampOnly) {
    // The code is unique, so a stamp can collide with a row that already
    // holds it. That is a defect in the list, not a reason to abandon an
    // import an administrator is watching: skip the stamp, keep the item,
    // and leave the existing mapping alone.
    try {
      await prisma.specialNeedItem.update({
        where: { id: plan.row.id },
        data: { sourceCode: plan.item.code, unit: plan.item.unit },
      });
      result.codesStamped += 1;
    } catch {
      await prisma.specialNeedItem.update({
        where: { id: plan.row.id },
        data: { unit: plan.item.unit },
      });
    }
  }

  // ── Pass three: the one-to-many prices ───────────────────────────────
  for (const rule of PRICE_EQUIVALENCES) {
    const listed = UNTH_PRICE_LIST.find((i) => i.code === rule.code);
    if (!listed?.unitPrice) continue;

    for (const target of rule.appliesTo) {
      // Fills blanks only, and never touches a row somebody has priced —
      // an inference must not outrank a person.
      const where = overwrite
        ? { category: target.category as never, name: target.name }
        : { category: target.category as never, name: target.name, unitPrice: null };

      const touched = await prisma.specialNeedItem.updateMany({
        where,
        data: {
          unitPrice: listed.unitPrice,
          pricedAt: new Date(),
          pricedByName: `${by} (same price for every size)`,
        },
      });
      result.pricedByEquivalence += touched.count;
    }
  }

  return result;
}
