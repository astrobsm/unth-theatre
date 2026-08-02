/**
 * Seed the surgical procedure catalogue.
 *
 *     node scripts/seed-procedures.js            # report what it would do
 *     node scripts/seed-procedures.js --write    # actually write
 *
 * Idempotent: (subspecialty, slug) is unique, so re-running adds only what is
 * genuinely new and never duplicates. It does NOT overwrite a name a user has
 * edited, and it never touches a USER_ADDED row.
 *
 * BEFORE writing anything it checks every subspecialty string in the catalogue
 * against surgical_units. A near-miss there ("ENT" instead of "ENT
 * (Otorhinolaryngology)") produces a dropdown that is silently empty for that
 * specialty, with no error anywhere — so the check is a hard stop, not a
 * warning.
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

const catalogue = loadTs('src/lib/procedures/catalogue.ts');
const normalise = loadTs('src/lib/procedures/normalise.ts');

const WRITE = process.argv.includes('--write');
const prisma = new PrismaClient();

(async () => {
  const entries = catalogue.allEntries();
  console.log(`Catalogue: ${entries.length} procedures across ${catalogue.SUBSPECIALTIES.length} subspecialties\n`);

  // ---- Hard stop: subspecialty strings must exist in surgical_units --------
  const units = await prisma.surgicalUnit.groupBy({ by: ['subspecialty'], _count: true });
  const known = new Set(units.map((u) => u.subspecialty));
  const unknown = catalogue.SUBSPECIALTIES.filter((s) => !known.has(s));

  if (unknown.length) {
    console.error('REFUSING TO SEED. These catalogue subspecialties do not exist in surgical_units:');
    for (const s of unknown) console.error(`   ${JSON.stringify(s)}`);
    console.error('\nsurgical_units currently has:');
    for (const u of units) console.error(`   ${JSON.stringify(u.subspecialty)}  (${u._count} units)`);
    console.error('\nThe dropdown joins on this string. A mismatch shows an empty picker with no error.');
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }
  console.log(`All ${catalogue.SUBSPECIALTIES.length} subspecialties match surgical_units.\n`);

  // ---- Slug collisions inside the catalogue itself -------------------------
  const bySub = new Map();
  let collisions = 0;
  for (const e of entries) {
    const slug = normalise.procedureSlug(e.name);
    const key = `${e.subspecialty}::${slug}`;
    if (bySub.has(key)) {
      collisions++;
      console.error(`   collision in ${e.subspecialty}: "${bySub.get(key)}" and "${e.name}"`);
    } else {
      bySub.set(key, e.name);
    }
  }
  if (collisions) {
    console.error(`\nREFUSING TO SEED: ${collisions} entries collide after normalisation.`);
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }

  // ---- What is already there ----------------------------------------------
  const existing = await prisma.surgicalProcedure.findMany({
    select: { subspecialty: true, slug: true, source: true },
  });
  const have = new Set(existing.map((r) => `${r.subspecialty}::${r.slug}`));
  const toAdd = entries.filter((e) => !have.has(`${e.subspecialty}::${normalise.procedureSlug(e.name)}`));

  console.log(`Already in the database: ${existing.length}`);
  console.log(`   of which user-added:  ${existing.filter((r) => r.source === 'USER_ADDED').length}`);
  console.log(`New to add:              ${toAdd.length}\n`);

  const perSub = {};
  for (const e of toAdd) perSub[e.subspecialty] = (perSub[e.subspecialty] || 0) + 1;
  for (const s of catalogue.SUBSPECIALTIES) {
    console.log(`   ${String(perSub[s] || 0).padStart(4)}  ${s}`);
  }

  if (!toAdd.length) {
    console.log('\nNothing to do.');
    await prisma.$disconnect();
    return;
  }

  if (!WRITE) {
    console.log('\nDry run. Re-run with --write to apply.');
    await prisma.$disconnect();
    return;
  }

  // createMany + skipDuplicates so a concurrent run cannot produce an error,
  // and so a partially seeded database completes rather than failing.
  const result = await prisma.surgicalProcedure.createMany({
    data: toAdd.map((e) => ({
      name: e.name,
      subspecialty: e.subspecialty,
      slug: normalise.procedureSlug(e.name),
      category: e.category || null,
      source: 'CATALOGUE',
      isEmergency: !!e.emergency,
    })),
    skipDuplicates: true,
  });

  console.log(`\nWrote ${result.count} procedures.`);

  const total = await prisma.surgicalProcedure.count();
  console.log(`Catalogue now holds ${total} procedures.`);
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
