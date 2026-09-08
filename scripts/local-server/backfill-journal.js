#!/usr/bin/env node
/* eslint-disable no-console */
// =============================================================================
// Journal the rows the capture trigger never saw
// -----------------------------------------------------------------------------
//   node scripts/local-server/backfill-journal.js              report only
//   node scripts/local-server/backfill-journal.js --apply      write the entries
//   node scripts/local-server/backfill-journal.js --table X    one table
//
// Enabling a trigger does not backfill history. Every row written before
// zz_sync_capture was switched on for its table carries sync_version = 0 and
// has no journal entry, so it has never been offered to the peer and never
// will be — it simply lives on whichever node it was typed into. That is how
// 30 PACU assessments came to exist on the theatre server and 17 of them
// nowhere else, and it is the same gap backfill-emergency-sync.js was written
// by hand to close for one table on 2 September.
//
// WHY NOT JUST TOUCH THE ROWS. The obvious move — UPDATE t SET x = x — does
// nothing. sync_capture() computes which columns actually changed, excluding
// sync_version, sync_origin, sync_hlc and updatedAt, and returns early when
// that set is empty: "an update that changed nothing of substance is not worth
// shipping". A no-op update is exactly that. So the entries are written
// directly, in the shape the trigger would have written them.
//
// WHAT IT WILL NOT DO. It journals only rows the PEER DOES NOT HAVE. A row
// present on both nodes is not stranded, and manufacturing an INSERT for it —
// base_version 0 against a peer holding a later version — would land as a
// conflict for a person to resolve, turning a non-problem into a queue of
// them. Those rows are reported and left alone.
//
// Read-only unless --apply is given.
// =============================================================================

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY_TABLE = (() => { const i = args.indexOf('--table'); return i >= 0 ? args[i + 1] : null; })();

function readEnvFile(name) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const local = readEnvFile('.env.local');
const cloud = readEnvFile('.env');
const LOCAL_URL = local.DATABASE_URL;
const CLOUD_URL = cloud.DIRECT_URL || cloud.DATABASE_URL;

if (!LOCAL_URL) { console.error('No DATABASE_URL in .env.local — is this the theatre server?'); process.exit(2); }
if (!CLOUD_URL) { console.error('No DATABASE_URL/DIRECT_URL in .env'); process.exit(2); }
if (LOCAL_URL === CLOUD_URL) { console.error('.env and .env.local name the SAME database.'); process.exit(2); }

/**
 * Tables the peer will accept. A journal entry for a table absent from the
 * policy comes back UNKNOWN_TABLE and sits unacknowledged forever, which is a
 * worse outcome than the row staying where it is.
 */
function policyTables() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'sync', 'syncPolicy.ts'), 'utf8');
  const out = new Set();
  const re = /table:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

const show = (u) => { try { const x = new URL(u); return `${x.hostname}${x.pathname}`; } catch { return '(unparseable)'; } };

(async () => {
  const l = new Client({ connectionString: LOCAL_URL, connectionTimeoutMillis: 20000 });
  const c = new Client({ connectionString: CLOUD_URL, connectionTimeoutMillis: 30000 });
  await l.connect();
  await c.connect();

  console.log(`\nBackfilling the sync journal  (${APPLY ? 'APPLY — this writes' : 'dry run'})`);
  console.log(`  local : ${show(LOCAL_URL)}`);
  console.log(`  cloud : ${show(CLOUD_URL)}\n`);

  try {
    const allowed = policyTables();

    // Tables that carry the trigger. Anything else was never meant to replicate.
    const { rows: triggered } = await l.query(
      `select distinct event_object_table as t
         from information_schema.triggers
        where trigger_name = 'zz_sync_capture'
        order by 1`);

    const tables = triggered.map((r) => r.t)
      .filter((t) => (ONLY_TABLE ? t === ONLY_TABLE : true))
      .filter((t) => allowed.has(t));

    // Columns held back from a payload, per the same table the trigger reads.
    const { rows: omitRows } = await l.query('select table_name, column_name from sync_omitted_columns');
    const omitted = new Map();
    for (const r of omitRows) {
      if (!omitted.has(r.table_name)) omitted.set(r.table_name, []);
      omitted.get(r.table_name).push(r.column_name);
    }

    let totalStranded = 0;
    let totalWritten = 0;
    const report = [];

    for (const table of tables) {
      const { rows: cnt } = await l.query(
        `select count(*)::int as n from "${table}" where sync_version = 0`);
      const uncaptured = cnt[0].n;
      if (uncaptured === 0) continue;

      // Which of those the peer already holds. Asked in one round trip per
      // table rather than one per row: these lists run to thousands.
      const { rows: ids } = await l.query(
        `select id::text as id from "${table}" where sync_version = 0`);
      const idList = ids.map((r) => r.id);

      let present = new Set();
      try {
        const { rows: found } = await c.query(
          `select id::text as id from "${table}" where id = any($1::text[])`, [idList]);
        present = new Set(found.map((r) => r.id));
      } catch (err) {
        report.push({ table, uncaptured, stranded: null, note: `cloud unreadable: ${err.message.slice(0, 60)}` });
        continue;
      }

      const stranded = idList.filter((id) => !present.has(id));
      totalStranded += stranded.length;
      report.push({ table, uncaptured, stranded: stranded.length });

      if (!APPLY || stranded.length === 0) continue;

      // Written exactly as the trigger would have written it: op INSERT,
      // base_version 0, a fresh HLC, this node as origin, and the omitted
      // columns stripped from the payload with a digest left in their place.
      const omit = omitted.get(table) ?? [];
      const payloadExpr = omit.length
        ? `(to_jsonb(t) - ${omit.map((_, i) => `$${i + 2}`).join(' - ')})`
        : 'to_jsonb(t)';
      const digestExpr = omit.length
        ? `encode(digest(coalesce(${omit.map((c) => `t."${c}"`).join(" || '|' || ")}, ''), 'sha256'), 'hex')`
        : 'NULL';

      const params = [stranded, ...omit];
      const sql = `
        WITH ins AS (
          INSERT INTO sync_journal
            (table_name, row_id, op, base_version, new_version, hlc, origin_node,
             payload, omitted_cols, omitted_digest)
          SELECT '${table}', t.id::text, 'INSERT', 0, 1, sync_next_hlc(), sync_node_id(),
                 ${payloadExpr},
                 ${omit.length ? `ARRAY[${omit.map((_, i) => `$${i + 2}`).join(',')}]::text[]` : 'NULL'},
                 ${digestExpr}
            FROM "${table}" t
           WHERE t.id::text = ANY($1::text[])
          RETURNING row_id, hlc
        )
        UPDATE "${table}" u
           SET sync_version = 1, sync_origin = sync_node_id(), sync_hlc = ins.hlc
          FROM ins
         WHERE u.id::text = ins.row_id`;

      // The UPDATE fires zz_sync_capture, which finds only sync_* columns
      // changed and returns early without a second entry. That is the same
      // rule that makes a no-op touch useless, working in our favour here.
      const res = await l.query(sql, params);
      totalWritten += res.rowCount ?? 0;
      console.log(`  journalled ${res.rowCount} of ${table}`);
    }

    console.log('\nTABLE                                 UNCAPTURED   STRANDED (not on cloud)');
    console.log('------------------------------------  ----------   -----------------------');
    for (const r of report.sort((a, b) => (b.stranded ?? 0) - (a.stranded ?? 0))) {
      const s = r.stranded === null ? r.note : String(r.stranded);
      console.log(`${r.table.padEnd(36)}  ${String(r.uncaptured).padStart(10)}   ${s}`);
    }
    if (report.length === 0) console.log('(nothing uncaptured in any policy table)');

    console.log(`\n${totalStranded} row${totalStranded === 1 ? '' : 's'} exist only on this server.`);
    if (APPLY) {
      console.log(`${totalWritten} journal entr${totalWritten === 1 ? 'y' : 'ies'} written. The worker will ship them on its next cycle.`);
    } else if (totalStranded > 0) {
      console.log('Re-run with --apply to journal them.');
    }
    console.log();
  } finally {
    await l.end().catch(() => {});
    await c.end().catch(() => {});
  }
})().catch((e) => { console.error('\nFAILED:', e.message, '\n'); process.exit(1); });
