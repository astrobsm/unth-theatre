/**
 * Activate the ophthalmology packs — a deliberate, separate act.
 *
 *     node scripts/activate-ophthalmology-packs.js             # report
 *     node scripts/activate-ophthalmology-packs.js --write     # activate
 *     node scripts/activate-ophthalmology-packs.js --write --include-ga
 *
 * WHY THIS IS NOT IN THE SEED. seed-ophthalmology-packs.js cannot activate
 * anything, and a test asserts it never learns how. Writing a draft and
 * deciding it is fit to hand a patient are two different decisions by two
 * different people, and collapsing them into one script means the second one
 * stops being made.
 *
 * WHAT IT WILL NOT TOUCH. Only packs this repository's own seed data defines,
 * matched on (subspecialty, kind, name). A pack somebody wrote by hand is not
 * this script's business, and neither is one already active — it reports those
 * and leaves them, so a second run cannot quietly revert an edit.
 *
 * THE TWO GENERAL-ANAESTHESIA EYE SETS ARE HELD BACK BY DEFAULT.
 * "General anaesthesia (adult eye)" and "General anaesthesia (paediatric eye)"
 * sit beside the already-active "General" and "Paediatric" sets. Activating
 * them puts two things that read the same in front of an anaesthetist at the
 * start of a list, and the right fix is probably to fold the eye-specific
 * lines — a non-depolarising relaxant, atropine drawn up for the oculocardiac
 * reflex, antiemetics for squint — into the packs already in use. --include-ga
 * overrides this once that has been decided.
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
const INCLUDE_GA = process.argv.includes('--include-ga');
const prisma = new PrismaClient();

/** The sets held back unless --include-ga: they shadow packs already in use. */
const SHADOWING = [
  `${ANAESTHESIA_PREFIX}General anaesthesia (adult eye)`,
  `${ANAESTHESIA_PREFIX}General anaesthesia (paediatric eye)`,
];

(async () => {
  const wanted = OPHTHALMOLOGY_PACKS.filter(
    (p) => INCLUDE_GA || !SHADOWING.includes(p.subspecialty)
  );
  const held = OPHTHALMOLOGY_PACKS.length - wanted.length;

  console.log(`Packs defined in the seed data: ${OPHTHALMOLOGY_PACKS.length}`);
  console.log(`   to consider now:             ${wanted.length}`);
  if (held) console.log(`   held back (--include-ga):    ${held}  [the two GA eye sets]`);
  console.log('');

  const key = (p) => `${p.subspecialty}::${p.kind}::${p.name}`;
  const wantedKeys = new Set(wanted.map(key));

  const rows = await prisma.surgicalPack.findMany({
    where: {
      OR: [
        { subspecialty: 'Ophthalmology' },
        { subspecialty: { startsWith: ANAESTHESIA_PREFIX } },
      ],
    },
    select: { id: true, name: true, subspecialty: true, kind: true, isActive: true },
  });

  const mine = rows.filter((r) => wantedKeys.has(key(r)));
  const toActivate = mine.filter((r) => !r.isActive);
  const already = mine.filter((r) => r.isActive);
  const missing = [...wantedKeys].filter((k) => !rows.some((r) => key(r) === k));

  console.log(`Matched in the database: ${mine.length}`);
  console.log(`   already active:       ${already.length}  (left alone)`);
  console.log(`   to activate:          ${toActivate.length}`);
  if (missing.length) {
    console.warn(`\nWARNING: ${missing.length} defined pack(s) are not in the database:`);
    for (const k of missing) console.warn(`   ${k}`);
    console.warn('Run scripts/seed-ophthalmology-packs.js --write first.');
  }
  console.log('');
  for (const r of toActivate) console.log(`   [${r.kind.padEnd(10)}] ${r.subspecialty} :: ${r.name}`);

  if (!toActivate.length) {
    console.log('\nNothing to do.');
    await prisma.$disconnect();
    return;
  }

  if (!WRITE) {
    console.log('\nDry run. Re-run with --write to activate.');
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.surgicalPack.updateMany({
    where: { id: { in: toActivate.map((r) => r.id) } },
    data: { isActive: true },
  });

  console.log(`\nActivated ${result.count} packs. They are now offered at booking.`);
  if (held) {
    console.log(`${held} GA eye packs remain drafts; re-run with --include-ga to activate them too.`);
  }
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
