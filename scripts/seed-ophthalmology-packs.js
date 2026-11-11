/**
 * Seed the ophthalmology packs — consumables, drugs, and the anaesthesia sets.
 *
 *     node scripts/seed-ophthalmology-packs.js            # report what it would do
 *     node scripts/seed-ophthalmology-packs.js --write    # actually write
 *
 * EVERY PACK IS WRITTEN INACTIVE, and this script will not activate one.
 * SurgicalPack.isActive defaults to false and the schema calls it "draft until
 * an admin activates it" — that is the whole safety story here. The contents
 * were written to the shape of the hospital's shopping lists, but that
 * document covers ten specialties and no eye surgery, so none of this was
 * transcribed from it. An ophthalmologist reads each pack and activates it.
 *
 * Idempotent on (name, subspecialty, kind): a pack that already exists is left
 * exactly as it is, items included. It never edits or reactivates anything,
 * because the row it would overwrite may be one somebody has already corrected.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { PrismaClient } = require('@prisma/client');

const ROOT = path.resolve(__dirname, '..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

function loadTs(rel) {
  const file = path.join(ROOT, rel);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(js, file);
  return m.exports;
}

const { OPHTHALMOLOGY_PACKS, ANAESTHESIA_PREFIX } = loadTs('src/lib/packs/ophthalmologyPacks.ts');

const WRITE = process.argv.includes('--write');
const prisma = new PrismaClient();

(async () => {
  const consumable = OPHTHALMOLOGY_PACKS.filter((p) => p.kind === 'CONSUMABLE');
  const pharmacy = OPHTHALMOLOGY_PACKS.filter((p) => p.kind === 'PHARMACY');
  const anaesthesia = OPHTHALMOLOGY_PACKS.filter((p) => p.subspecialty.startsWith(ANAESTHESIA_PREFIX));

  console.log(`Packs to seed: ${OPHTHALMOLOGY_PACKS.length}`);
  console.log(`   consumable:  ${consumable.length}`);
  console.log(`   pharmacy:    ${pharmacy.length}`);
  console.log(`   of which anaesthesia sets: ${anaesthesia.length}`);
  console.log(`   items in all: ${OPHTHALMOLOGY_PACKS.reduce((n, p) => n + p.items.length, 0)}\n`);

  // ---- Hard stop: the subspecialty string must exist in surgical_units -----
  // Same reasoning as seed-procedures.js. The pack picker joins on this
  // string; a near-miss shows an empty picker and reports nothing.
  const units = await prisma.surgicalUnit.groupBy({ by: ['subspecialty'], _count: true });
  const known = new Set(units.map((u) => u.subspecialty));
  if (!known.has('Ophthalmology')) {
    console.error('REFUSING TO SEED: surgical_units has no "Ophthalmology".');
    console.error('It currently has:');
    for (const u of units) console.error(`   ${JSON.stringify(u.subspecialty)}  (${u._count} units)`);
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }
  console.log('surgical_units has Ophthalmology.\n');

  // ---- A pack named after no procedure can never be mapped ----------------
  // Not fatal: the procedures may simply not be seeded yet. But it is the
  // mistake that makes a pack invisible for ever, so it is said out loud.
  const procedures = await prisma.surgicalProcedure.findMany({
    where: { subspecialty: 'Ophthalmology' },
    select: { name: true },
  });
  const haveProcedure = new Set(procedures.map((p) => p.name));
  const orphans = [...new Set(
    OPHTHALMOLOGY_PACKS
      .filter((p) => !p.subspecialty.startsWith(ANAESTHESIA_PREFIX))
      .map((p) => p.name)
      .filter((n) => !haveProcedure.has(n))
  )];
  if (orphans.length) {
    console.warn(`WARNING: ${orphans.length} pack(s) are named after a procedure not in the database:`);
    for (const n of orphans) console.warn(`   ${n}`);
    console.warn('Run scripts/seed-procedures.js --write first if the catalogue is not seeded yet.\n');
  } else if (procedures.length) {
    console.log('Every procedure pack matches a seeded procedure name.\n');
  }

  // ---- What is already there ----------------------------------------------
  const existing = await prisma.surgicalPack.findMany({
    where: {
      OR: [
        { subspecialty: 'Ophthalmology' },
        { subspecialty: { startsWith: ANAESTHESIA_PREFIX } },
      ],
    },
    select: { name: true, subspecialty: true, kind: true, isActive: true },
  });
  const key = (p) => `${p.subspecialty}::${p.kind}::${p.name}`;
  const have = new Set(existing.map(key));
  const toAdd = OPHTHALMOLOGY_PACKS.filter((p) => !have.has(key(p)));

  console.log(`Already in the database: ${existing.length} (${existing.filter((p) => p.isActive).length} active)`);
  console.log(`New to add:              ${toAdd.length}\n`);

  if (!toAdd.length) {
    console.log('Nothing to do.');
    await prisma.$disconnect();
    return;
  }
  for (const p of toAdd) console.log(`   [${p.kind.padEnd(10)}] ${p.subspecialty} :: ${p.name} (${p.items.length} items)`);

  if (!WRITE) {
    console.log('\nDry run. Re-run with --write to apply.');
    await prisma.$disconnect();
    return;
  }

  let packs = 0;
  let items = 0;
  for (const [i, p] of toAdd.entries()) {
    await prisma.surgicalPack.create({
      data: {
        name: p.name,
        subspecialty: p.subspecialty,
        kind: p.kind,
        description: p.description,
        // DRAFT. Not a default being relied on — said here so that anyone
        // reading this script knows nothing it writes is live.
        isActive: false,
        sortOrder: i,
        createdByName: 'Catalogue seed',
        items: {
          create: p.items.map((it, n) => ({
            name: it.name,
            quantity: it.quantity,
            unit: it.unit,
            category: it.category ?? null,
            size: it.size ?? null,
            drugType: it.drugType ?? null,
            dosage: it.dosage ?? null,
            route: it.route ?? null,
            notes: it.notes ?? null,
            sortOrder: n,
          })),
        },
      },
    });
    packs++;
    items += p.items.length;
  }

  console.log(`\nWrote ${packs} packs and ${items} items, all INACTIVE.`);
  console.log('An ophthalmologist must review and activate each one before it is offered at booking.');
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
