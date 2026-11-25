#!/usr/bin/env node
/* eslint-disable no-console */
// =============================================================================
// Clearing the policy-review conflict backlog
// -----------------------------------------------------------------------------
//   node scripts/local-server/clear-policy-conflicts.js            show, change nothing
//   node scripts/local-server/clear-policy-conflicts.js --apply    close them
//
// WHAT HAPPENED. On 25 November the theatre server held 13,023 parked
// conflicts. 12,964 were four policy-review tables, accruing at about 2,200 a
// day since the round opened on 19 November, and every one said the same
// thing: "row X already holds this row's unique key".
//
// Both nodes had independently created a row for the same reviewer. The row
// counts matched exactly on the two databases, so these were never two
// competing answers -- they were one answer that had been minted twice, and
// every keystroke on the cloud collided with the local copy and was parked
// again.
//
// The CAUSE is fixed in src/lib/sync/applyEntry.ts: for tables where the
// natural key is the identity, the authoritative node's row now takes the key
// and the duplicate is displaced, once, with the loser snapshotted. This
// script clears what accumulated before that.
//
// WHY CLOSING THEM IS SAFE, and it is worth being exact. Each of these
// conflict rows is a RECORD of a decision already taken: the journal entry was
// marked applied as QUARANTINE in the same transaction, so nothing is waiting
// on it and no data is held hostage. The incoming payload is kept in the row
// itself either way -- this changes `status`, it does not delete anything.
//
// WHAT IT WILL NOT TOUCH. Only the four tables below, and only OPEN rows. The
// conflicts that are somebody's actual decision -- a surgery, a user, the PACU
// assessments, the team check-ins -- are left exactly where they are, which is
// the entire point: they were invisible underneath this.
// =============================================================================

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..', '..');
const APPLY = process.argv.includes('--apply');

/**
 * The tables this clears. Kept here as a literal rather than imported from
 * the TypeScript, because this script runs under plain node on the server --
 * and a list somebody has to keep in step is better than a build step on a
 * machine that has to work at two in the morning. syncPolicy.ts carries the
 * same names in KEY_IS_IDENTITY, and a test asserts the two agree.
 */
const TABLES = [
  'policy_participations',
  'policy_section_responses',
  'policy_general_responses',
  'policy_decision_item_responses',
];

function readEnv(key) {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const line = fs.readFileSync(full, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.startsWith(`${key}=`))
      .pop();
    if (line) return line.slice(key.length + 1).replace(/^"|"$/g, '');
  }
  return null;
}

async function main() {
  // The LOCAL database, always. This clears the theatre server's own parked
  // conflicts; the cloud keeps its own and is not touched from here.
  const url = readEnv('DATABASE_URL');
  if (!url) {
    console.error('No DATABASE_URL in .env.local or .env.');
    process.exit(1);
  }

  const db = new Client({ connectionString: url });
  await db.connect();

  try {
    const { rows: before } = await db.query(
      `select table_name, count(*)::int as n
         from sync_conflicts
        where status = 'OPEN' and table_name = any($1)
        group by table_name
        order by n desc`,
      [TABLES],
    );

    const { rows: others } = await db.query(
      `select table_name, count(*)::int as n
         from sync_conflicts
        where status = 'OPEN' and not (table_name = any($1))
        group by table_name
        order by n desc`,
      [TABLES],
    );

    const total = before.reduce((n, r) => n + r.n, 0);

    console.log(`\nPolicy-review conflicts open on this node: ${total}`);
    for (const r of before) console.log(`  ${r.table_name.padEnd(32)} ${r.n}`);

    const otherTotal = others.reduce((n, r) => n + r.n, 0);
    console.log(`\nEverything else, which this script leaves alone: ${otherTotal}`);
    for (const r of others) console.log(`  ${r.table_name.padEnd(32)} ${r.n}`);

    if (!APPLY) {
      console.log('\nNothing changed. Re-run with --apply to close the policy ones.');
      return;
    }
    if (total === 0) {
      console.log('\nNothing to close.');
      return;
    }

    // RESOLVED_KEEP_LOCAL is the honest label: the local row stood at the
    // time, which is exactly what a quarantine means. The reason says why
    // nobody looked at them one by one, because somebody reading this row in
    // a year deserves to know it was a sweep and not a judgement.
    const { rowCount } = await db.query(
      `update sync_conflicts
          set status = 'RESOLVED_KEEP_LOCAL',
              reason = coalesce(reason, '')
                || ' [Closed in bulk on 25 November 2026: the same record held under two '
                || 'row ids on the two nodes, re-raised on every edit. Row counts matched '
                || 'exactly, so these were duplicates rather than disagreements. The cause '
                || 'is fixed in applyEntry.ts; the incoming payload is kept on this row.]'
        where status = 'OPEN' and table_name = any($1)`,
      [TABLES],
    );

    console.log(`\nClosed ${rowCount} conflict(s).`);
    console.log(`${otherTotal} conflict(s) on other tables are still open and now readable.`);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
