#!/usr/bin/env node
/**
 * Find — and only on request, cancel — post-op prescriptions that were sent twice.
 *
 * WHY THIS IS A SCRIPT AND NOT A MIGRATION. These are clinical records. A
 * migration that quietly deleted prescriptions would run on every deployment,
 * against every database, with nobody looking at what it removed. This runs
 * when somebody decides to run it, prints what it proposes, and does nothing
 * else unless told.
 *
 * DRY RUN IS THE DEFAULT. With no arguments it reports and changes nothing.
 *
 *   node scripts/find-duplicate-prescriptions.js              # report only
 *   node scripts/find-duplicate-prescriptions.js --cancel     # act
 *
 * IT CANCELS, IT DOES NOT DELETE. A duplicate is marked CANCELLED with a note
 * saying why, so the record of what happened survives and the decision can be
 * read back. Deleting would leave a gap nobody could explain — the same reason
 * Payment reverses rather than deletes elsewhere in this schema.
 *
 * WHAT IT WILL NOT TOUCH:
 *   - the earliest prescription in any group; that one is the real one
 *   - anything pharmacy has acted on (PACKING and beyond), because a packed
 *     prescription may already have been dispensed and cancelling it would
 *     contradict what physically happened
 *   - groups from different prescribers, which are two people's intentions
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const CANCEL = process.argv.includes('--cancel');

/** Mirrors lib/prescriptions/duplicateGuard.fingerprint. */
function fingerprint(medsJson) {
  let meds;
  try {
    const parsed = JSON.parse(medsJson);
    meds = Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;              // unreadable: never grouped with anything
  }
  const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const lines = meds
    .filter((m) => norm(m.drugName).length > 0)
    .map((m) => [
      norm(m.drugName), norm(m.dosage), norm(m.route),
      norm(m.frequency), norm(m.duration), String(m.quantity ?? 1),
    ].join('|'))
    .sort();
  return lines.length ? lines.join('~') : null;
}

const UNTOUCHED = ['DRAFT', 'SENT_TO_PHARMACY'];

async function main() {
  const all = await prisma.postOpPrescription.findMany({
    select: {
      id: true, surgeryId: true, patientName: true, folderNumber: true,
      prescribedById: true, prescribedByName: true, prescribedAt: true,
      status: true, medications: true,
    },
    orderBy: { prescribedAt: 'asc' },
  });

  // Grouped by the thing that makes two rows the same prescription: one
  // surgery, one prescriber, identical drugs.
  const groups = new Map();
  for (const p of all) {
    const print = fingerprint(p.medications);
    if (!print) continue;
    const key = `${p.surgeryId}::${p.prescribedById}::${print}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const duplicated = [...groups.values()].filter((g) => g.length > 1);

  if (!duplicated.length) {
    console.log('No duplicate post-op prescriptions found.');
    return;
  }

  let proposed = 0;
  let protectedCount = 0;

  console.log(`\n${duplicated.length} group(s) of repeated prescriptions:\n`);

  for (const group of duplicated) {
    const [keep, ...rest] = group;           // earliest, by the query's ordering
    const cancellable = rest.filter((p) => UNTOUCHED.includes(p.status));
    const acted = rest.filter((p) => !UNTOUCHED.includes(p.status));
    protectedCount += acted.length;
    proposed += cancellable.length;

    const span = Math.round(
      (new Date(group[group.length - 1].prescribedAt) - new Date(keep.prescribedAt)) / 60000);

    console.log(`  ${keep.patientName} (${keep.folderNumber ?? '—'})`);
    console.log(`    ${group.length} copies over ${span} min, by ${keep.prescribedByName}`);
    console.log(`    keep     ${keep.id}  ${new Date(keep.prescribedAt).toISOString()}  ${keep.status}`);
    for (const p of cancellable) {
      console.log(`    cancel   ${p.id}  ${new Date(p.prescribedAt).toISOString()}  ${p.status}`);
    }
    for (const p of acted) {
      console.log(`    LEAVE    ${p.id}  ${new Date(p.prescribedAt).toISOString()}  ${p.status}`
        + '  ← pharmacy has acted on this; may already be dispensed');
    }
    console.log('');
  }

  console.log(`Proposed: cancel ${proposed}, leave ${protectedCount} that pharmacy has acted on.`);

  if (!CANCEL) {
    console.log('\nDRY RUN — nothing changed. Re-run with --cancel to apply.\n');
    return;
  }

  let done = 0;
  for (const group of duplicated) {
    const [keep, ...rest] = group;
    for (const p of rest) {
      if (!UNTOUCHED.includes(p.status)) continue;
      await prisma.postOpPrescription.update({
        where: { id: p.id },
        data: {
          status: 'CANCELLED',
          packNotes: `Duplicate of ${keep.id}. Sent again after a dropped connection `
            + 'reported a failure that had not happened. Cancelled, not deleted, so the '
            + 'record of what occurred survives.',
        },
      });
      done += 1;
    }
  }
  console.log(`\nCancelled ${done} duplicate prescription(s). Nothing was deleted.\n`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
