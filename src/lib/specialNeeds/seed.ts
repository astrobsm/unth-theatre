// ============================================================
// Getting the standard catalogue into the database
// ------------------------------------------------------------
// Idempotent, and safe to run on every deployment: it adds what is missing
// and touches nothing that is already there. Crucially it does NOT delete,
// because by the time this runs a second time the store keeper will have
// added local brands and sizes through the admin screen, and a seed that
// tidies up after itself would take those with it.
// ============================================================

import prisma from '@/lib/prisma';
import { standardCatalogue, type SeedItem } from './standardCatalogue';

export interface SeedResult {
  added: number;
  alreadyPresent: number;
}

/**
 * Insert any standard item the database does not yet hold.
 *
 * Matching is on (category, name, size, brand), the same tuple the unique
 * index uses, so "Syringe 5ml" cannot end up in the catalogue twice. Brand
 * is null for everything seeded here — these are generic descriptions, and
 * the brand column is for what the hospital actually buys.
 */
export async function seedStandardCatalogue(): Promise<SeedResult> {
  const wanted = standardCatalogue();

  const existing = await prisma.specialNeedItem.findMany({
    select: { category: true, name: true, size: true, brand: true },
  });

  const key = (c: string, n: string, s?: string | null, b?: string | null) =>
    `${c}\u0000${n}\u0000${s ?? ''}\u0000${b ?? ''}`;

  const have = new Set(existing.map((e) => key(e.category, e.name, e.size, e.brand)));

  const missing: SeedItem[] = wanted.filter(
    (w) => !have.has(key(w.category, w.name, w.size, null)),
  );

  if (missing.length === 0) {
    return { added: 0, alreadyPresent: wanted.length };
  }

  // skipDuplicates as well as the pre-filter above: two deployments racing
  // each other would otherwise collide on the unique index and fail the
  // build, which stops everything shipping.
  const result = await prisma.specialNeedItem.createMany({
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
      isLocallyAdded: false,
      createdByName: 'Standard catalogue',
    })),
    skipDuplicates: true,
  });

  return { added: result.count, alreadyPresent: wanted.length - missing.length };
}
