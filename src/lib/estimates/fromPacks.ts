// ============================================================
// Turning the existing surgical packs into estimate lines
// ------------------------------------------------------------
// The hospital already maintains 55 consumable and pharmacy packs per
// subspecialty. Those are the authoritative statement of what a procedure
// consumes, so an estimate is built FROM them rather than from a second list
// that would immediately diverge.
//
// Pure: the caller loads packs and tariffs, this decides what becomes a line
// and at what price. The hard part is not the mapping, it is what happens when
// a pack item has no price — which is most of them, at first.
// ============================================================

import type { ChargeKind } from './chargeKinds';
import type { DraftLine, EstimateSection } from './calculate';
import { priceOn, priceForItemOn, isInForce, type TariffRow, type UnpricedItem } from './priceLookup';

/** A pack, narrowed to what line-building needs. */
export interface PackInput {
  id: string;
  name: string;
  kind: string; // SurgicalPackKind — CONSUMABLE or PHARMACY in practice
  subspecialty: string;
  items: PackItemInput[];
}

export interface PackItemInput {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  /** Consumable packs only. */
  category?: string | null;
  /** Pharmacy packs only — presence of this is what marks a drug. */
  drugType?: string | null;
  dosage?: string | null;
  sortOrder?: number;
}

/**
 * Which part of the estimate a pack item belongs in.
 *
 * Anaesthetic packs are stored with an `ANAESTHESIA::` prefix on the
 * subspecialty (see the anaesthesia pack seeding), so that prefix — not the
 * pack kind — is what separates a surgeon's materials from an anaesthetist's.
 */
export function sectionForPackItem(
  pack: PackInput,
  item: PackItemInput
): EstimateSection {
  const isAnaesthesia = pack.subspecialty.startsWith('ANAESTHESIA::');
  const isDrug = Boolean(item.drugType);

  if (isAnaesthesia) return 'ANAESTHESIA_MATERIAL';
  // A drug in a surgical pack is theatre medication used during the operation,
  // not post-operative medication. Post-op drugs come from the prescription,
  // which is a different source entirely.
  if (isDrug) return 'SURGICAL_MATERIAL';
  return 'SURGICAL_MATERIAL';
}

export function kindForPackItem(item: PackItemInput): ChargeKind {
  return item.drugType ? 'DRUG' : 'CONSUMABLE';
}

/**
 * Normalise a name into a price-master code.
 *
 * Pack items are free text written by clinicians ("Suture 2/0", "suture 2-0")
 * while tariff codes are typed by an administrator. Without normalisation the
 * two almost never meet, and every item lands unpriced.
 */
export function codeForName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface BuildFromPacksResult {
  lines: DraftLine[];
  /** Items that exist in a pack but have no price. Reported, never priced at zero. */
  unpriced: UnpricedItem[];
}

/**
 * Build estimate lines from packs.
 *
 * Matching is tried in three ways, most specific first:
 *   1. a tariff whose code equals the normalised item name
 *   2. a tariff whose name matches the item name, case-insensitively
 *   3. nothing — reported as unpriced
 *
 * Unmatched items are NOT dropped and NOT priced at zero. Either would put a
 * quietly wrong figure in front of a patient; the caller shows the list and
 * somebody adds the missing prices.
 */
export function buildFromPacks(
  packs: PackInput[],
  tariffs: TariffRow[],
  on: Date
): BuildFromPacksResult {
  const lines: DraftLine[] = [];
  const unpriced: UnpricedItem[] = [];

  // Name index built once. With 55 packs and a few thousand tariff rows, a
  // linear scan per item is thousands of passes for no reason.
  //
  // Filtered by isInForce FIRST. Without that this fallback bypassed the
  // effective-date window entirely and would happily price an item from a
  // tariff that does not apply yet — quietly defeating the one guarantee this
  // module exists to provide.
  const byName = new Map<string, TariffRow>();
  for (const t of tariffs) {
    if (!isInForce(t, on)) continue;
    const key = t.name.trim().toLowerCase();
    const existing = byName.get(key);
    // Among several in force, the latest to take effect.
    if (!existing || t.effectiveFrom > existing.effectiveFrom) byName.set(key, t);
  }

  for (const pack of packs) {
    const section = pack.subspecialty.startsWith('ANAESTHESIA::')
      ? 'ANAESTHESIA_MATERIAL' as const
      : 'SURGICAL_MATERIAL' as const;

    const sorted = pack.items.slice().sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    for (const item of sorted) {
      const kind = kindForPackItem(item);
      const code = codeForName(item.name);

      let tariff = priceOn(tariffs, code, kind, on);
      if (!tariff) {
        const byNameHit = byName.get(item.name.trim().toLowerCase());
        // Only accept a name match of a compatible kind, or a consumable would
        // silently take a drug's price.
        if (byNameHit && byNameHit.kind === kind) tariff = byNameHit;
      }

      if (!tariff) {
        unpriced.push({
          description: item.name,
          kind,
          code,
          reason: 'no price in the price master',
        });
        continue;
      }

      lines.push({
        section: sectionForPackItem(pack, item) ?? section,
        kind,
        description: item.dosage ? `${item.name} (${item.dosage})` : item.name,
        unit: item.unit || 'each',
        quantity: item.quantity > 0 ? item.quantity : 1,
        unitPriceKobo: tariff.amount,
        tariffId: tariff.id,
        tariffCode: tariff.code,
        surgicalPackId: pack.id,
        priceEffectiveFrom: tariff.effectiveFrom,
        medicationName: item.drugType ? item.name : null,
      });
    }
  }

  return { lines, unpriced };
}

/**
 * A single non-pack charge — a fee, theatre charge, bed, investigation.
 *
 * Returns null when unpriced so the caller decides whether that blocks issuing.
 * Some absences are fatal (a surgeon's fee), some are not (an optional test).
 */
export function lineForCharge(
  tariffs: TariffRow[],
  opts: {
    section: EstimateSection;
    kind: ChargeKind;
    code: string;
    description: string;
    quantity?: number;
    unit?: string;
    itemId?: string | null;
    frequencyPerDay?: number | null;
    durationDays?: number | null;
  },
  on: Date
): DraftLine | null {
  const tariff = opts.itemId
    ? priceForItemOn(tariffs, opts.itemId, on)
    : priceOn(tariffs, opts.code, opts.kind, on);

  if (!tariff) return null;

  return {
    section: opts.section,
    kind: opts.kind,
    description: opts.description,
    unit: opts.unit ?? 'each',
    quantity: opts.quantity,
    unitPriceKobo: tariff.amount,
    tariffId: tariff.id,
    tariffCode: tariff.code,
    inventoryItemId: opts.itemId ?? null,
    priceEffectiveFrom: tariff.effectiveFrom,
    frequencyPerDay: opts.frequencyPerDay ?? null,
    durationDays: opts.durationDays ?? null,
  };
}
