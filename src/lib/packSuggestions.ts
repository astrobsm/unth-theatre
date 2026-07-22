// History-based suggestions for authoring surgical packs.
//
// The per-surgery request history is too sparse to auto-author clinically-safe
// packs (most subspecialties have thin, inconsistent data), so we do NOT
// auto-generate packs. Instead this surfaces the items most often requested for
// a subspecialty as a starting point an admin/pharmacist can accept or edit.

import prisma from '@/lib/prisma';

export interface PackSuggestion {
  name: string;
  timesRequested: number; // number of requests carrying this item name
  surgeriesSeen: number; // distinct surgeries in the subspecialty that used it
  typicalQuantity: number; // most common quantity requested
  category?: string | null; // consumable category, if consistent
  size?: string | null;
  drugType?: string | null; // pharmacy type, if consistent
  dosage?: string | null;
  route?: string | null;
  unit?: string | null;
}

function mode<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) { bestN = n; best = v; }
  }
  return best;
}

/**
 * Top historically-requested items for a subspecialty, ranked by how many
 * distinct surgeries used them. `kind` selects consumables vs pharmacy items.
 */
export async function getPackSuggestions(
  subspecialty: string,
  kind: 'CONSUMABLE' | 'PHARMACY',
  limit = 25
): Promise<PackSuggestion[]> {
  const surgeries = await prisma.surgery.findMany({
    where: { subspecialty },
    select: { id: true },
  });
  const ids = surgeries.map((s) => s.id);
  if (ids.length === 0) return [];

  if (kind === 'CONSUMABLE') {
    const rows = await prisma.surgeryConsumableRequest.findMany({
      where: { surgeryId: { in: ids } },
      select: { name: true, quantity: true, category: true, size: true, unit: true, surgeryId: true },
    });
    return summarise(rows, limit, (r) => ({
      category: r.category ?? null,
      size: r.size ?? null,
      unit: r.unit ?? null,
    }));
  }

  const rows = await prisma.surgeryDrugDressingRequest.findMany({
    where: { surgeryId: { in: ids } },
    select: { name: true, quantity: true, type: true, dosage: true, route: true, unit: true, surgeryId: true },
  });
  return summarise(rows, limit, (r) => ({
    drugType: r.type ?? null,
    dosage: r.dosage ?? null,
    route: r.route ?? null,
    unit: r.unit ?? null,
  }));
}

function summarise<
  R extends { name: string; quantity: number; surgeryId: string }
>(rows: R[], limit: number, extra: (r: R) => Partial<PackSuggestion>): PackSuggestion[] {
  const groups: Record<string, R[]> = {};
  for (const r of rows) {
    const key = r.name.trim();
    if (!key) continue;
    (groups[key] ||= []).push(r);
  }

  const out: PackSuggestion[] = [];
  for (const name of Object.keys(groups)) {
    const list = groups[name];
    const surgeriesSeen = new Set(list.map((r: R) => r.surgeryId)).size;
    const e = extra(list[0]);
    out.push({
      name,
      timesRequested: list.length,
      surgeriesSeen,
      typicalQuantity: mode(list.map((r: R) => r.quantity)) ?? 1,
      ...e,
    });
  }
  out.sort((a, b) => b.surgeriesSeen - a.surgeriesSeen || b.timesRequested - a.timesRequested);
  return out.slice(0, limit);
}
