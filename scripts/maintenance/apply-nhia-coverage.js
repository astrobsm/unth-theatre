#!/usr/bin/env node
/* eslint-disable no-console */
// =============================================================================
// Setting the coverage flags from the NHIA Medicines Price List
// -----------------------------------------------------------------------------
//   node scripts/maintenance/apply-nhia-coverage.js            show, change nothing
//   node scripts/maintenance/apply-nhia-coverage.js --apply    write the flags
//   node scripts/maintenance/apply-nhia-coverage.js --unmatched  list what did not match
//
// Until the Authority's list arrived, every catalogue item in this
// application was flagged not-covered. That was deliberate: a wrong `true`
// sends an item to a counter that will refuse it with the patient already on
// the list. This reads the published list (April 2025) and sets the flags
// from a document instead.
//
// IT MATCHES CONSERVATIVELY AND SAYS SO. An exact name, or a spelling named
// explicitly in src/lib/payer/nhiaMatch.ts. No fuzzy scoring, no closest
// match, no substring rule -- "Ceftriaxone/Sulbactam" must not match
// "Ceftriaxone". Anything it cannot place is LEFT ALONE and listed, because
// an unmatched item routes where it already routes and costs a minute of
// somebody's attention, while a wrongly matched one costs a cancelled case.
//
// IT WILL NOT UNSET A FLAG SOMEBODY SET BY HAND. Where the catalogue already
// says covered and this run finds no match, the existing flag stands and the
// row is reported. The pharmacist with the circular in front of them knows
// something this file does not.
//
// RUN IT AGAIN WHEN THE LIST IS REVISED. The Authority says it reviews
// periodically; the last three were 2024, 2025. Replace the data file, run
// this, and read what changed.
// =============================================================================

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..', '..');
const APPLY = process.argv.includes('--apply');
const SHOW_UNMATCHED = process.argv.includes('--unmatched');

// The transcribed list and the matcher are TypeScript. This script runs under
// plain node on a server, so they are read through the compiled .next output
// when it exists and re-implemented here otherwise -- no: rather than keep two
// copies of a clinical list in step, the data is required through a tiny
// generated JSON that `npm run build` emits beside it.
const DATA = path.join(ROOT, 'scripts', 'maintenance', 'nhia-price-list.json');

function readEnv(key) {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const line = fs.readFileSync(full, 'utf8')
      .split(/\r?\n/).filter((l) => l.startsWith(`${key}=`)).pop();
    if (line) return line.slice(key.length + 1).replace(/^"|"$/g, '');
  }
  return null;
}

const FORM_WORDS = new Set([
  'injection', 'inj', 'tablet', 'tablets', 'tab', 'tabs', 'capsule', 'capsules',
  'caps', 'cap', 'syrup', 'suspension', 'solution', 'infusion', 'ampoule', 'amp',
  'vial', 'sachet', 'suppository', 'pessary', 'cream', 'ointment', 'gel', 'drops',
  'spray', 'powder', 'iv', 'im', 'oral',
]);

/** Must stay identical to normaliseDrugName in src/lib/payer/nhiaMatch.ts. */
function normalise(raw) {
  const base = String(raw ?? '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[(),.;:/\\[\]{}"]/g, ' ')
    .replace(/[+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (base === '') return '';
  const kept = base.split(' ').filter((w) => !FORM_WORDS.has(w));
  return (kept.length ? kept : base.split(' ')).join(' ').trim();
}

async function main() {
  if (!fs.existsSync(DATA)) {
    console.error(`No ${path.relative(ROOT, DATA)}.`);
    console.error('Run: npm run build:nhia-list   (or node scripts/maintenance/export-nhia-list.js)');
    process.exit(1);
  }
  const { version, source, aliases, items } = JSON.parse(fs.readFileSync(DATA, 'utf8'));

  const byName = new Map();
  for (const item of items) {
    const key = normalise(item.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(item);
  }

  const match = (name, strength) => {
    const key = normalise(name);
    if (!key) return null;
    let rows = byName.get(key);
    let how = 'EXACT';
    if (!rows && aliases[key]) { rows = byName.get(normalise(aliases[key])); how = 'ALIAS'; }
    if (!rows || !rows.length) return null;
    if (rows.length === 1) return { how, item: rows[0] };

    const want = String(strength ?? '').toLowerCase().replace(/\s+/g, '');
    if (want) {
      const narrowed = rows.filter((r) => {
        const have = String(r.strength ?? '').toLowerCase().replace(/\s+/g, '');
        return have && (have.includes(want) || want.includes(have));
      });
      if (narrowed.length === 1) return { how, item: narrowed[0] };
    }
    // Cheapest, so an automatic run never overstates what the scheme owes.
    return { how, item: [...rows].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0] };
  };

  const url = readEnv('DATABASE_URL');
  if (!url) { console.error('No DATABASE_URL.'); process.exit(1); }
  const db = new Client({ connectionString: url });
  await db.connect();

  console.log(`\n${source}`);
  console.log(`List version: ${version} — ${items.length} medicines and consumables transcribed.\n`);

  const tables = [
    { table: 'surgical_drug_dressing_templates', label: 'Pharmacy catalogue', strength: 'defaultDosage' },
    { table: 'surgical_consumable_templates', label: 'Consumables catalogue', strength: 'size' },
  ];

  let totalWould = 0;
  for (const t of tables) {
    const { rows } = await db.query(
      `select id, name, "${t.strength}" as strength, "coveredByNHIA", "nhiaCode"
         from "${t.table}" where "isActive" = true order by name`,
    );

    const matched = [];
    const unmatched = [];
    const alreadySetByHand = [];

    for (const row of rows) {
      const m = match(row.name, row.strength);
      if (!m) {
        if (row.coveredByNHIA) alreadySetByHand.push(row);
        else unmatched.push(row);
        continue;
      }
      matched.push({ row, ...m });
    }

    const covered = matched.filter((m) => m.item.coverage !== 'EXCLUDED');
    const excludedRows = matched.filter((m) => m.item.coverage === 'EXCLUDED');
    const partialRows = matched.filter((m) => m.item.coverage === 'PARTIAL');

    console.log(`${t.label}: ${rows.length} active item(s)`);
    console.log(`  matched to the list      ${matched.length}`);
    console.log(`    fully covered          ${covered.length - partialRows.length}`);
    console.log(`    partially covered      ${partialRows.length}  (patient pays a share)`);
    console.log(`    named but EXCLUDED     ${excludedRows.length}`);
    console.log(`  no match, left as it is  ${unmatched.length}`);
    if (alreadySetByHand.length) {
      console.log(`  covered by hand, kept    ${alreadySetByHand.length}  (somebody knew something this list does not)`);
    }

    if (SHOW_UNMATCHED && unmatched.length) {
      console.log('\n  Not on the NHIA list — the patient pays for these:');
      for (const r of unmatched) console.log(`    ${r.name}${r.strength ? ` (${r.strength})` : ''}`);
    }
    console.log('');

    totalWould += matched.length;

    if (!APPLY) continue;

    for (const m of matched) {
      const isCovered = m.item.coverage !== 'EXCLUDED';
      await db.query(
        `update "${t.table}"
            set "coveredByNHIA" = $2,
                "nhiaPartial"   = $3,
                "nhiaCode"      = $4,
                "nhiaPrice"     = $5
          where id = $1`,
        [m.row.id, isCovered, m.item.coverage === 'PARTIAL', m.item.code, m.item.price ?? null],
      );
    }
  }

  if (!APPLY) {
    console.log(`Nothing changed. ${totalWould} item(s) would be updated — re-run with --apply.`);
  } else {
    console.log(`Updated ${totalWould} catalogue item(s) from the ${version} list.`);
    console.log('Existing cases are NOT re-routed. A booking carries the routing it was');
    console.log('given; new bookings pick this up immediately.');
  }

  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
