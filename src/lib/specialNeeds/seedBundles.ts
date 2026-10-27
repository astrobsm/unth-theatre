// ============================================================
// Putting the standard bundles into the table the theatre can edit
// ------------------------------------------------------------
// bundle.ts holds what a case of each size carries, in code. That was the
// right place to start — it is auditable in git and cannot be deleted by
// accident — but it is the wrong place to finish, because what a minor
// case needs is a clinical judgement belonging to this hospital and
// changing it should not require a deployment.
//
// This copies the built-in lists into magnitude_bundle_items once, so the
// editor in Settings opens on something real instead of four empty tabs.
// From then on the table is the source of truth and the built-in list is
// only a fallback.
//
// EXISTING LINES ARE NEVER TOUCHED. By the time anybody runs this twice,
// somebody will have changed a quantity or removed a line on purpose, and
// a seed that "restores" those is a seed that overrules the theatre.
// Removals stay removed; only genuinely absent lines are added.
// ============================================================

import prisma from '@/lib/prisma';
import { bundleFor, type BundleLine } from './bundle';
import { MAGNITUDES, type Magnitude } from './pricing';

export interface BundleSeedResult {
  /** Lines inserted, by magnitude. */
  added: Record<string, number>;
  /** Lines already there, left exactly as they were. */
  alreadyPresent: number;
  /**
   * Bundle lines with no catalogue item behind them, as readable text.
   *
   * Reported rather than swallowed: a line that resolves to nothing is an
   * item the case will not carry and a cost the deposit will not include,
   * and the only way anybody finds out otherwise is a scrub nurse at eight
   * in the morning.
   */
  unresolved: string[];
}

const describe = (l: BundleLine) => `${l.name}${l.size ? ` ${l.size}` : ''} (${l.category})`;

export async function seedMagnitudeBundles(
  byName?: string | null,
): Promise<BundleSeedResult> {
  const result: BundleSeedResult = { added: {}, alreadyPresent: 0, unresolved: [] };

  const catalogue = await prisma.specialNeedItem.findMany({
    where: { isActive: true },
    select: { id: true, category: true, name: true, size: true },
  });

  // Exact match on the same tuple the booking form uses, so a line that
  // resolves here resolves there too.
  const index = new Map<string, string>();
  catalogue.forEach((c) => {
    index.set(`${c.category}\u0000${c.name}\u0000${c.size ?? ''}`, c.id);
  });

  const existing = await prisma.magnitudeBundleItem.findMany({
    select: { magnitude: true, itemId: true },
  });
  const have = new Set(existing.map((e) => `${e.magnitude}\u0000${e.itemId}`));

  const unresolved = new Set<string>();

  for (const magnitude of MAGNITUDES as Magnitude[]) {
    // No transfusion and no local anaesthetic: those two are driven by
    // decisions made on the booking form, not by the size of the case, and
    // baking them into every bundle would charge every patient for blood
    // adjuncts they are not having.
    const lines = bundleFor({ magnitude });

    const toCreate: { magnitude: string; itemId: string; quantity: number; updatedByName: string | null }[] = [];

    for (const line of lines) {
      const itemId =
        index.get(`${line.category}\u0000${line.name}\u0000${line.size ?? ''}`) ??
        // A line given without a size matches an item with no size only.
        (line.size === undefined ? index.get(`${line.category}\u0000${line.name}\u0000`) : undefined);

      if (!itemId) {
        unresolved.add(describe(line));
        continue;
      }
      if (have.has(`${magnitude}\u0000${itemId}`)) {
        result.alreadyPresent += 1;
        continue;
      }
      toCreate.push({
        magnitude,
        itemId,
        quantity: line.quantity,
        updatedByName: byName ?? 'Standard bundle',
      });
      have.add(`${magnitude}\u0000${itemId}`);
    }

    if (toCreate.length > 0) {
      const created = await prisma.magnitudeBundleItem.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
      result.added[magnitude] = created.count;
    } else {
      result.added[magnitude] = 0;
    }
  }

  unresolved.forEach((u) => result.unresolved.push(u));
  result.unresolved.sort();
  return result;
}
