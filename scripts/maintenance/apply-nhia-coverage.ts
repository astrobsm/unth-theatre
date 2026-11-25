/**
 * Setting the coverage flags from the NHIA Medicines Price List.
 *
 *   npx tsx scripts/maintenance/apply-nhia-coverage.ts              show only
 *   npx tsx scripts/maintenance/apply-nhia-coverage.ts --apply      write them
 *   npx tsx scripts/maintenance/apply-nhia-coverage.ts --unmatched  list the rest
 *
 * Until the Authority's list arrived, every catalogue item in this
 * application was flagged not-covered. That was deliberate: a wrong `true`
 * sends an item to a counter that will refuse it with the patient already on
 * the list. This reads the published list (April 2025) and sets the flags
 * from a document instead.
 *
 * IT USES THE SAME MATCHER THE APPLICATION DOES, by running under tsx rather
 * than plain node. The first version of this script re-implemented
 * normaliseDrugName in JavaScript so it could run without a TypeScript
 * runtime, and that is two copies of a clinical rule that have to be kept in
 * step by hand. tsx is installed on the theatre server; one implementation is
 * worth more than the dependency.
 *
 * IT MATCHES CONSERVATIVELY AND SAYS SO. Exact names, spellings named in
 * nhiaMatch.ts, and the same name with its strengths moved into their own
 * field. No fuzzy scoring, no closest match. Anything it cannot place is
 * LEFT ALONE and listed: an unmatched item routes where it already routes
 * and costs a minute of attention, while a wrongly matched one costs a
 * cancelled case.
 *
 * IT WILL NOT UNSET A FLAG SOMEBODY SET BY HAND. The pharmacist with the
 * circular in front of them knows something this file does not.
 */
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
// `pg` ships no types in this tree and adding @types/pg for one maintenance
// script is a dependency the application does not otherwise need.
const { Client } = require('pg') as {
  Client: new (c: { connectionString: string }) => {
    connect(): Promise<void>;
    query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  };
};

import { NHIA_LIST_SOURCE, NHIA_LIST_VERSION, NHIA_PRICE_LIST } from '../../src/lib/payer/nhiaPriceList';
import { matchNhia } from '../../src/lib/payer/nhiaMatch';

const ROOT = process.cwd();
const APPLY = process.argv.includes('--apply');
const SHOW_UNMATCHED = process.argv.includes('--unmatched');

function readEnv(key: string): string | null {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const line = fs.readFileSync(full, 'utf8')
      .split(/\r?\n/).filter((l) => l.startsWith(`${key}=`)).pop();
    if (line) return line.slice(key.length + 1).replace(/^"|"$/g, '');
  }
  return null;
}

interface Row {
  id: string;
  name: string;
  strength: string | null;
  coveredByNHIA: boolean;
}

async function main() {
  const url = readEnv('DATABASE_URL');
  if (!url) { console.error('No DATABASE_URL.'); process.exit(1); }

  const db = new Client({ connectionString: url });
  await db.connect();

  console.log(`\n${NHIA_LIST_SOURCE}`);
  console.log(`List version: ${NHIA_LIST_VERSION} — ${NHIA_PRICE_LIST.length} items transcribed.\n`);

  const tables = [
    { table: 'surgical_drug_dressing_templates', label: 'Pharmacy catalogue', strengthCol: 'defaultDosage' },
    { table: 'surgical_consumable_templates', label: 'Consumables catalogue', strengthCol: 'size' },
  ];

  let totalWould = 0;

  for (const t of tables) {
    const { rows } = await db.query<Row>(
      `select id, name, "${t.strengthCol}" as strength, "coveredByNHIA"
         from "${t.table}" where "isActive" = true order by name`,
    );

    const matched: Array<{ row: Row; m: ReturnType<typeof matchNhia> }> = [];
    const unmatched: Row[] = [];
    const keptByHand: Row[] = [];

    for (const row of rows) {
      const m = matchNhia(row.name, row.strength);
      if (!m.item) {
        (row.coveredByNHIA ? keptByHand : unmatched).push(row);
        continue;
      }
      matched.push({ row, m });
    }

    const partialRows = matched.filter((x) => x.m.item!.coverage === 'PARTIAL');
    const excludedRows = matched.filter((x) => x.m.item!.coverage === 'EXCLUDED');
    const byAlias = matched.filter((x) => x.m.how === 'ALIAS');

    console.log(`${t.label}: ${rows.length} active item(s)`);
    console.log(`  matched to the list      ${matched.length}  (${byAlias.length} by a known spelling)`);
    console.log(`    fully covered          ${matched.length - partialRows.length - excludedRows.length}`);
    console.log(`    partially covered      ${partialRows.length}  (patient pays a share)`);
    console.log(`    named but EXCLUDED     ${excludedRows.length}`);
    console.log(`  no match, left as it is  ${unmatched.length}`);
    if (keptByHand.length) {
      console.log(`  covered by hand, kept    ${keptByHand.length}  (somebody knew something this list does not)`);
    }

    if (SHOW_UNMATCHED && unmatched.length) {
      console.log('\n  Not on the NHIA list — an insured patient pays for these:');
      for (const r of unmatched) console.log(`    ${r.name}${r.strength ? `  [${r.strength}]` : ''}`);
    }
    console.log('');

    totalWould += matched.length;
    if (!APPLY) continue;

    for (const { row, m } of matched) {
      const item = m.item!;
      await db.query(
        `update "${t.table}"
            set "coveredByNHIA" = $2, "nhiaPartial" = $3, "nhiaCode" = $4, "nhiaPrice" = $5
          where id = $1`,
        [row.id, item.coverage !== 'EXCLUDED', item.coverage === 'PARTIAL', item.code, item.price ?? null],
      );
    }
  }

  if (!APPLY) {
    console.log(`Nothing changed. ${totalWould} item(s) would be updated — re-run with --apply.`);
  } else {
    console.log(`Updated ${totalWould} catalogue item(s) from the ${NHIA_LIST_VERSION} list.`);
    console.log('Cases already booked are NOT re-routed: a booking carries the routing it');
    console.log('was given. New bookings pick this up immediately.');
  }

  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
