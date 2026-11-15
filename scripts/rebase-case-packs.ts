/**
 * Bring cases already booked onto the CURRENT mandatory base pack.
 *
 *     npx tsx scripts/rebase-case-packs.ts                 # report, writes nothing
 *     npx tsx scripts/rebase-case-packs.ts --write         # apply
 *     npx tsx scripts/rebase-case-packs.ts --write --all   # include past dates
 *     npx tsx scripts/rebase-case-packs.ts --write --cancel-only
 *
 * WHY THIS IS NEEDED AT ALL. The base pack is not computed when a pack is
 * read; it is written into surgery_consumable_requests as rows at booking
 * time, deliberately, so that what a provider was asked for is a record rather
 * than a recalculation. The consequence is that replacing the pack definition
 * changes nothing for a case already booked: it goes on showing the list it
 * was booked with, which is exactly what was reported — "it's still showing
 * the old list" on a laparotomy booked before the change.
 *
 * WHAT IT TOUCHES, AND WHAT IT WILL NOT
 *
 * Only rows stamped with BASE_PACK_LABEL in `notes`. A line a surgeon added,
 * a line from a pack they applied, a line the standard composed for this
 * operation — none of those are the base pack, none were put there by a
 * default, and none are touched.
 *
 * THE SCHEMA SAYS NOTHING IS DELETED, and it is right:
 *
 *     "removing an item cancels it and records who and why, because the
 *      provider may already have picked it and a list that silently loses a
 *      line looks like a list that never had it."
 *
 * The rationale is the provider having already picked it, and `status` is
 * precisely the record of whether they have.
 *
 *   PACKING / PACKED / DELIVERED — the provider has acted. NOT TOUCHED AT
 *   ALL, not even cancelled: those gowns are physically on a trolley and the
 *   list must go on saying so. Reported instead, so somebody can decide.
 *
 *   REQUESTED — nobody has picked it, and nobody ever chose it: it was a
 *   standing default that the hospital has now replaced. These are removed
 *   outright, because the alternative is eighteen struck-through lines on
 *   every case, which is the old pack with lines through it rather than the
 *   new pack. --cancel-only withdraws them instead, visibly, for anyone who
 *   would rather keep the paper trail.
 *
 * Quantities of lines that survive the change are corrected in place, since
 * the figures moved too (examination gloves went from 20 pairs to 1 pack).
 */
import prisma from '../src/lib/prisma';
import { resolveBasePack, BASE_PACK_LABEL } from '../src/lib/baseConsumablePack';
import { toConsumableCategory } from '../src/lib/packs/enums';

const WRITE = process.argv.includes('--write');
const ALL = process.argv.includes('--all');
const CANCEL_ONLY = process.argv.includes('--cancel-only');

/** Statuses where the provider has already acted on the line. */
const ACTED_ON = ['PACKING', 'PACKED', 'DELIVERED'];

const key = (s: unknown) => String(s ?? '').trim().toLowerCase();

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cases = await prisma.surgery.findMany({
    where: {
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      ...(ALL ? {} : { scheduledDate: { gte: today } }),
    },
    select: { id: true, procedureName: true, magnitude: true, scheduledDate: true },
    orderBy: { scheduledDate: 'asc' },
  });

  console.log(`${cases.length} case(s) in scope${ALL ? ' (all dates)' : ' (today onwards)'}.`);
  console.log(WRITE ? (CANCEL_ONLY ? 'WRITING (withdrawing, not deleting).\n' : 'WRITING.\n')
    : 'Dry run — nothing will be written. Add --write.\n');

  let touched = 0, removed = 0, added = 0, requantified = 0, locked = 0, clean = 0;

  for (const c of cases) {
    const rows = await prisma.surgeryConsumableRequest.findMany({
      where: { surgeryId: c.id },
      select: { id: true, name: true, quantity: true, unit: true, size: true,
                notes: true, status: true },
    });

    const want = resolveBasePack(c.magnitude);
    const wantByName = new Map(want.map((w) => [key(w.name), w]));

    // ONLY the base pack. Everything else on the case belongs to somebody.
    const baseRows = rows.filter((r) => r.notes === BASE_PACK_LABEL);
    const presentNames = new Set(rows.map((r) => key(r.name)));

    const superseded = baseRows.filter((r) => !wantByName.has(key(r.name)));
    const supersededFree = superseded.filter((r) => !ACTED_ON.includes(String(r.status).toUpperCase())
      && String(r.status).toUpperCase() !== 'CANCELLED');
    const supersededLocked = superseded.filter((r) => ACTED_ON.includes(String(r.status).toUpperCase()));

    const wrongQty = baseRows.filter((r) => {
      const w = wantByName.get(key(r.name));
      if (!w) return false;
      if (String(r.status).toUpperCase() === 'CANCELLED') return false;
      return r.quantity !== w.quantity || r.unit !== w.unit || (r.size ?? null) !== (w.size ?? null);
    });

    const missing = want.filter((w) => !presentNames.has(key(w.name)));

    if (!supersededFree.length && !wrongQty.length && !missing.length) {
      clean += 1;
      if (supersededLocked.length) {
        locked += supersededLocked.length;
        console.log(`  ${c.procedureName}: ${supersededLocked.length} superseded line(s) already picked — left alone`);
      }
      continue;
    }

    touched += 1;
    removed += supersededFree.length;
    added += missing.length;
    requantified += wrongQty.length;
    locked += supersededLocked.length;

    const when = c.scheduledDate ? c.scheduledDate.toISOString().slice(0, 10) : '—';
    console.log(`  ${when}  ${c.procedureName}  (${c.magnitude ?? 'no magnitude'})`);
    console.log(`        ${CANCEL_ONLY ? 'withdraw' : 'remove'} ${supersededFree.length}`
      + `, add ${missing.length}, requantify ${wrongQty.length}`
      + (supersededLocked.length ? `, LEAVE ${supersededLocked.length} already picked` : ''));
    for (const r of supersededFree) console.log(`          - ${r.quantity} x ${r.name}`);
    for (const w of missing) console.log(`          + ${w.quantity} x ${w.name}${w.size ? ' ' + w.size : ''}`);
    for (const r of wrongQty) {
      const w = wantByName.get(key(r.name))!;
      console.log(`          ~ ${r.name}: ${r.quantity} ${r.unit} -> ${w.quantity} ${w.unit}`);
    }

    if (!WRITE) continue;

    if (supersededFree.length) {
      if (CANCEL_ONLY) {
        await prisma.surgeryConsumableRequest.updateMany({
          where: { id: { in: supersededFree.map((r) => r.id) } },
          data: {
            status: 'CANCELLED',
            removedAt: new Date(),
            removalReason: 'Superseded — the mandatory base pack was replaced on 15 November 2026.',
          },
        });
      } else {
        await prisma.surgeryConsumableRequest.deleteMany({
          where: { id: { in: supersededFree.map((r) => r.id) } },
        });
      }
    }

    for (const r of wrongQty) {
      const w = wantByName.get(key(r.name))!;
      await prisma.surgeryConsumableRequest.update({
        where: { id: r.id },
        data: { quantity: w.quantity, unit: w.unit, size: w.size ?? null },
      });
    }

    if (missing.length) {
      await prisma.surgeryConsumableRequest.createMany({
        data: missing.map((w) => ({
          surgeryId: c.id,
          templateId: null,
          name: w.name,
          category: toConsumableCategory(w.category) as never,
          size: w.size ?? null,
          unit: w.unit,
          quantity: w.quantity,
          // Stamped, so the next change to the pack can find these the same way.
          notes: BASE_PACK_LABEL,
          requestedById: null,
          requestedByName: 'Base pack update',
        })),
      });
    }
  }

  console.log('\n────────────────────────────────────────');
  console.log(`cases in scope:          ${cases.length}`);
  console.log(`already on the new pack: ${clean}`);
  console.log(`cases ${WRITE ? 'updated' : 'that would change'}:  ${touched}`);
  console.log(`  lines ${CANCEL_ONLY ? 'withdrawn' : 'removed'}:        ${removed}`);
  console.log(`  lines added:           ${added}`);
  console.log(`  quantities corrected:  ${requantified}`);
  console.log(`  left alone (picked):   ${locked}`);
  if (!WRITE) console.log('\nNothing was written. Re-run with --write.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
