#!/usr/bin/env node
/**
 * Export every distinct item across every surgical and pharmacy pack, as a CSV
 * with an empty price column to fill in.
 *
 *   node scripts/maintenance/export-pack-pricelist.js > pack-prices.csv
 *   node scripts/maintenance/export-pack-pricelist.js --subspecialty "General Surgery"
 *   node scripts/maintenance/export-pack-pricelist.js --unpriced-only
 *
 * The columns are exactly what Settings > Price Master accepts, so the same file
 * goes back in once the prices are filled. No re-typing, no reformatting, and no
 * chance of a name drifting between the two.
 *
 * Items are DE-DUPLICATED across packs using the same normalisation the estimate
 * engine uses. "Suture 2/0" in eleven packs is one thing to price once — pricing
 * it eleven times is how eleven different prices end up in the system.
 *
 * The `amount` column is left EMPTY on purpose. A zero would import cleanly and
 * read as "free" on a patient's estimate; a blank is refused by the importer,
 * which is the behaviour you want for a price nobody has set.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const { PrismaClient } = require(path.join(ROOT, 'node_modules/@prisma/client'));

const args = process.argv.slice(2);
const argOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const subspecialtyFilter = argOf('--subspecialty');
const unpricedOnly = args.includes('--unpriced-only');

/** Same normalisation as src/lib/estimates/fromPacks.ts — they must agree. */
function codeForName(name) {
  return String(name)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A field that may contain commas, quotes or newlines. */
function csv(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const packs = await prisma.surgicalPack.findMany({
      where: {
        isActive: true,
        ...(subspecialtyFilter ? { subspecialty: subspecialtyFilter } : {}),
      },
      select: {
        id: true, name: true, subspecialty: true, kind: true,
        items: {
          select: {
            name: true, quantity: true, unit: true,
            category: true, drugType: true, dosage: true,
          },
        },
      },
      orderBy: [{ subspecialty: 'asc' }, { name: 'asc' }],
    });

    // Which codes already have a price in force, so a second run can list only
    // what is still missing.
    const today = new Date();
    const tariffs = await prisma.tariff.findMany({
      select: { code: true, kind: true, effectiveFrom: true, effectiveTo: true },
    });
    const priced = new Set(
      tariffs
        .filter((t) => t.effectiveFrom <= today && (t.effectiveTo === null || t.effectiveTo > today))
        .map((t) => `${t.code}|${t.kind}`)
    );

    // Keyed by code + kind: the same name as a consumable and as a drug are two
    // priceable things, and dosage distinguishes 500 mg from 1 g.
    const byKey = new Map();

    for (const pack of packs) {
      const isAnaesthesia = pack.subspecialty.startsWith('ANAESTHESIA::');
      const specialty = isAnaesthesia
        ? pack.subspecialty.replace('ANAESTHESIA::', '') + ' (anaesthesia)'
        : pack.subspecialty;

      for (const item of pack.items) {
        const kind = item.drugType ? 'DRUG' : 'CONSUMABLE';
        const displayName = item.dosage ? `${item.name} (${item.dosage})` : item.name;
        const code = codeForName(displayName);
        if (!code) continue;

        const key = `${code}|${kind}`;
        const existing = byKey.get(key);
        if (existing) {
          existing.specialties.add(specialty);
          existing.packs.add(pack.name);
          // The largest quantity any single pack asks for — the same figure the
          // estimate engine uses when packs are merged.
          existing.maxQty = Math.max(existing.maxQty, item.quantity || 1);
          continue;
        }

        byKey.set(key, {
          code,
          name: displayName,
          kind,
          unit: item.unit || (item.drugType ? 'vial' : 'piece'),
          category: item.category || item.drugType || '',
          maxQty: item.quantity || 1,
          specialties: new Set([specialty]),
          packs: new Set([pack.name]),
        });
      }
    }

    let rows = Array.from(byKey.values());
    if (unpricedOnly) rows = rows.filter((r) => !priced.has(`${r.code}|${r.kind}`));

    // Most-used first: an item in twenty packs is worth pricing carefully; one in
    // a single pack can wait.
    rows.sort((a, b) =>
      b.packs.size - a.packs.size || a.name.localeCompare(b.name));

    const effectiveFrom = new Date().toISOString().slice(0, 10);

    // Header names the importer already understands.
    const out = [
      ['code', 'name', 'kind', 'amount', 'effective from', 'unit', 'used in packs', 'specialties', 'max qty per pack', 'priced already'].join(','),
    ];

    for (const r of rows) {
      out.push([
        csv(r.code),
        csv(r.name),
        csv(r.kind),
        '',                       // amount — left blank deliberately, see the header note
        csv(effectiveFrom),
        csv(r.unit),
        csv(r.packs.size),
        csv(Array.from(r.specialties).sort().join('; ')),
        csv(r.maxQty),
        csv(priced.has(`${r.code}|${r.kind}`) ? 'yes' : 'no'),
      ].join(','));
    }

    process.stdout.write(out.join('\n') + '\n');

    const consumables = rows.filter((r) => r.kind === 'CONSUMABLE').length;
    const drugs = rows.filter((r) => r.kind === 'DRUG').length;
    process.stderr.write(
      `\n${rows.length} distinct items from ${packs.length} packs ` +
      `(${consumables} consumables, ${drugs} drugs).\n` +
      `${rows.filter((r) => priced.has(`${r.code}|${r.kind}`)).length} already have a price in force.\n` +
      `Fill in the "amount" column in naira, then upload at Settings > Price Master.\n`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
