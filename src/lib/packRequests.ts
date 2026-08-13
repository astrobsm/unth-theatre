// ============================================================
// Turning a case's procedures into pack requests
// ------------------------------------------------------------
// Booking a case should send the consumables to the pack provider and the drugs
// to pharmacy, without anybody assembling the list by hand and without the system
// guessing which packs apply.
//
// The guessing was removed earlier: only CONFIRMED mappings are read. This file
// does the rest — look them up, pull their items, and merge the packs for a
// multi-procedure case by the higher quantity rather than the sum.
// ============================================================

import prisma from '@/lib/prisma';
import { mergePackItems, packItemKey, parseProcedures, type PackItemLike } from './procedurePacks';

export interface BuiltRequests {
  // Shaped exactly like the request payloads the booking route already handles,
  // so the mapping can fill in for a form submission with no call-site changes.
  consumables: {
    templateId: string | null;
    name: string; category: string; size: string | null; unit: string;
    quantity: number; notes: string | null;
  }[];
  drugs: {
    templateId: string | null;
    name: string; type: string; dosage: string | null; route: string | null;
    quantity: number; unit: string; notes: string | null;
  }[];
  /** Which mappings were used, so the booking can say what it attached. */
  packsUsed: { procedure: string; consumablePack?: string | null; pharmacyPack?: string | null }[];
  /** Procedures with no confirmed mapping. Reported, never guessed at. */
  unmapped: string[];
}

/** Pack item categories are free text; anything unrecognised becomes OTHER. */
const CONSUMABLE_CATEGORIES = new Set([
  'GLOVES', 'GOWNS_DRAPES', 'SUTURES', 'SYRINGES_NEEDLES', 'CATHETERS_TUBING',
  'DRESSING_PACKS', 'SKIN_PREP', 'CLEANING_SOLUTION', 'STERILE_DRESSINGS',
  'IRRIGATION', 'DIATHERMY', 'SUCTION', 'ANAESTHESIA_AIRWAY', 'PPE', 'OTHER',
]);
const DRUG_TYPES = new Set([
  'ANTIBIOTIC', 'ANALGESIC', 'ANAESTHETIC_ADJUNCT', 'IV_FLUID',
  'WOUND_DRESSING_AGENT', 'ANTISEPTIC', 'HAEMOSTATIC', 'OTHER',
]);

/**
 * Build the requests for a case.
 *
 * Returns empty lists rather than throwing when nothing is mapped: a booking must
 * never fail because an administrator has not finished the mapping screen. The
 * unmapped procedures are reported so somebody can act on them, and the case is
 * booked either way.
 */
export async function buildPackRequests(
  procedureName: string,
  additionalProcedures?: string | null
): Promise<BuiltRequests> {
  const procedures = parseProcedures(procedureName, additionalProcedures);
  if (procedures.length === 0) {
    return { consumables: [], drugs: [], packsUsed: [], unmapped: [] };
  }

  const keys = procedures.map((p) => packItemKey({ name: p.name, quantity: 1 }));

  const maps = await prisma.procedurePackMap.findMany({
    where: {
      procedureKey: { in: keys },
      isActive: true,
      // Only what a person has confirmed. A suggestion must never reach a theatre
      // trolley on its own.
      confirmedAt: { not: null },
    },
    select: {
      procedureKey: true, procedureName: true,
      consumablePackId: true, consumablePackName: true,
      pharmacyPackId: true, pharmacyPackName: true,
    },
  });
  const byKey = new Map(maps.map((m) => [m.procedureKey, m]));

  const unmapped = procedures
    .filter((p) => !byKey.has(packItemKey({ name: p.name, quantity: 1 })))
    .map((p) => p.name);

  const packIds = Array.from(new Set(
    maps.flatMap((m) => [m.consumablePackId, m.pharmacyPackId]).filter(Boolean) as string[]
  ));
  if (packIds.length === 0) {
    return { consumables: [], drugs: [], packsUsed: [], unmapped };
  }

  const packs = await prisma.surgicalPack.findMany({
    where: { id: { in: packIds }, isActive: true },
    select: {
      id: true, name: true,
      items: {
        select: {
          name: true, quantity: true, unit: true, category: true,
          drugType: true, dosage: true, route: true, notes: true, sortOrder: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  const packById = new Map(packs.map((p) => [p.id, p]));

  // Collected across every procedure BEFORE merging, so the merge sees all the
  // contributions at once and can take the true maximum.
  const consumableItems: PackItemLike[] = [];
  const drugItems: (PackItemLike & { route?: string | null; notes?: string | null })[] = [];

  for (const m of maps) {
    const cons = m.consumablePackId ? packById.get(m.consumablePackId) : null;
    for (const it of cons?.items ?? []) {
      // A drug sitting in a consumable pack still goes to pharmacy: which list an
      // item belongs on is decided by what it IS, not by which pack it came from.
      const target = it.drugType ? drugItems : consumableItems;
      target.push({
        name: it.name, quantity: it.quantity, unit: it.unit,
        category: it.category, drugType: it.drugType, dosage: it.dosage,
        route: it.route, notes: it.notes,
        sourcePackId: cons!.id, sourcePackName: cons!.name,
      });
    }

    const pharm = m.pharmacyPackId ? packById.get(m.pharmacyPackId) : null;
    for (const it of pharm?.items ?? []) {
      const target = it.drugType ? drugItems : consumableItems;
      target.push({
        name: it.name, quantity: it.quantity, unit: it.unit,
        category: it.category, drugType: it.drugType, dosage: it.dosage,
        route: it.route, notes: it.notes,
        sourcePackId: pharm!.id, sourcePackName: pharm!.name,
      });
    }
  }

  const mergedConsumables = mergePackItems(consumableItems);
  const mergedDrugs = mergePackItems(drugItems);

  /** Says where a shared item came from, so a picker can query the figure. */
  const provenance = (contributions: { packName: string | null; quantity: number }[]) =>
    contributions.length > 1
      ? `From ${contributions.map((c) => `${c.packName ?? 'pack'} (${c.quantity})`).join(', ')} — higher quantity taken`
      : null;

  return {
    consumables: mergedConsumables.map((i) => ({
      // No template: these came from a pack mapping, not from a saved template.
      templateId: null,
      name: i.name,
      category: CONSUMABLE_CATEGORIES.has(String(i.category ?? '')) ? String(i.category) : 'OTHER',
      size: null,
      unit: i.unit || 'piece',
      quantity: i.quantity,
      notes: provenance(i.contributions),
    })),
    drugs: mergedDrugs.map((i) => ({
      templateId: null,
      name: i.name,
      type: DRUG_TYPES.has(String(i.drugType ?? '')) ? String(i.drugType) : 'OTHER',
      dosage: i.dosage ?? null,
      route: (i as { route?: string | null }).route ?? null,
      quantity: i.quantity,
      unit: i.unit || 'vial',
      notes: provenance(i.contributions),
    })),
    packsUsed: maps.map((m) => ({
      procedure: m.procedureName,
      consumablePack: m.consumablePackName,
      pharmacyPack: m.pharmacyPackName,
    })),
    unmapped,
  };
}
