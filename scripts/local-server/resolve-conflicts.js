#!/usr/bin/env node
/* eslint-disable no-console */
// =============================================================================
// Working through the conflicts the sync deliberately parked
// -----------------------------------------------------------------------------
//   node scripts/local-server/resolve-conflicts.js                    list them
//   node scripts/local-server/resolve-conflicts.js <id>               one, in full
//   node scripts/local-server/resolve-conflicts.js <id> --keep-local
//   node scripts/local-server/resolve-conflicts.js <id> --take-incoming
//
// QUARANTINE is a decision the system makes ON PURPOSE. Clinical content is
// never overwritten by a peer, and since 7 September a change that can never
// apply — two rows claiming one unique key — is parked here instead of being
// retried forever. Both of those are right.
//
// What was missing is the other half. The system produces these and had no way
// to clear them: the one open conflict on 7 September was resolved by writing
// UPDATE statements by hand against the live database, which is not something
// anybody should be doing twice, least of all against patient records.
//
// So: show what actually differs, field by field, and settle it either way.
//
// KEEPING LOCAL writes nothing to the row. The local version already stands;
// only the conflict is closed.
//
// TAKING INCOMING applies the peer's payload to the row, under
// orm.sync_applying so it does not journal straight back to the node it came
// from. Only the columns the payload carries are touched — a partial payload
// must not blank the fields it never mentioned.
//
// Read-only unless one of the two resolve flags is given.
// =============================================================================

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const ID = args.find((a) => !a.startsWith('--')) ?? null;
const KEEP_LOCAL = args.includes('--keep-local');
const TAKE_INCOMING = args.includes('--take-incoming');
const WHO = (() => {
  const i = args.indexOf('--by');
  return i >= 0 ? args[i + 1] : (process.env.USER || process.env.USERNAME || 'operator');
})();

if (KEEP_LOCAL && TAKE_INCOMING) {
  console.error('\nChoose one: --keep-local or --take-incoming.\n');
  process.exit(2);
}
if ((KEEP_LOCAL || TAKE_INCOMING) && !ID) {
  console.error('\nWhich conflict? Pass its id.\n');
  process.exit(2);
}

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

const LOCAL_URL = readEnvFile('.env.local').DATABASE_URL;
if (!LOCAL_URL) {
  console.error('\nNo DATABASE_URL in .env.local — run this on the theatre server.\n');
  process.exit(2);
}

/** Columns the sync layer owns; never a real difference in theatre data. */
const SYNC_COLS = new Set(['sync_version', 'sync_origin', 'sync_hlc']);

/** Compare by value, not representation: dates and numerics differ in form. */
function norm(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  const t = Date.parse(s);
  if (!Number.isNaN(t) && /^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(t).toISOString();
  return s;
}

const trunc = (v, n = 46) => {
  const s = v === null ? '(none)' : String(v);
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

function differences(incoming, local) {
  const out = [];
  const keys = new Set([...Object.keys(incoming ?? {}), ...Object.keys(local ?? {})]);
  for (const k of keys) {
    if (SYNC_COLS.has(k)) continue;
    const a = norm(incoming?.[k]);
    const b = norm(local?.[k]);
    if (a !== b) out.push({ column: k, incoming: a, local: b });
  }
  return out.sort((x, y) => x.column.localeCompare(y.column));
}

(async () => {
  const db = new Client({ connectionString: LOCAL_URL, connectionTimeoutMillis: 20000 });
  await db.connect();

  try {
    // ── List ───────────────────────────────────────────────────────────────
    if (!ID) {
      const { rows } = await db.query(
        `select id, table_name, row_id, sync_class, left(reason, 70) as reason, created_at
           from sync_conflicts where status = 'OPEN' order by created_at`);
      if (!rows.length) { console.log('\nNo open conflicts.\n'); return; }

      console.log(`\n${rows.length} open conflict${rows.length === 1 ? '' : 's'}:\n`);
      for (const r of rows) {
        console.log(`  ${r.id}`);
        console.log(`    ${r.table_name}/${r.row_id}  (${r.sync_class})`);
        console.log(`    ${r.reason}`);
        console.log(`    raised ${new Date(r.created_at).toLocaleString('en-GB')}`);
        console.log();
      }
      console.log('Pass an id to see what differs, then --keep-local or --take-incoming.\n');
      return;
    }

    const { rows: found } = await db.query(
      `select * from sync_conflicts where id = $1::uuid`, [ID]);
    if (!found.length) { console.log('\nNo conflict with that id.\n'); return; }
    const c = found[0];

    // The stored snapshot is what the row looked like when it was parked. The
    // row may have moved on since, and resolving against a stale picture is
    // how somebody discards an edit made in the meantime — so the CURRENT row
    // is read and shown too.
    let current = null;
    try {
      const { rows } = await db.query(
        `select * from "${c.table_name}" where id = $1 limit 1`, [c.row_id]);
      current = rows[0] ?? null;
    } catch { /* table may be gone; handled below */ }

    console.log(`\n${c.table_name}/${c.row_id}`);
    console.log(`  status ${c.status} · ${c.sync_class} · raised ${new Date(c.created_at).toLocaleString('en-GB')}`);
    console.log(`  ${c.reason}\n`);

    if (!current) {
      console.log('  The row is no longer in this database. Taking the incoming version would');
      console.log('  re-create it; keeping local would leave it absent.\n');
    }

    const diffs = differences(c.incoming, current ?? c.local_snapshot);
    if (!diffs.length) {
      console.log('  Nothing differs any more — the two sides now agree.');
      console.log('  Either resolution closes it without changing anything.\n');
    } else {
      console.log(`  ${diffs.length} field${diffs.length === 1 ? '' : 's'} differ:\n`);
      console.log(`  ${'COLUMN'.padEnd(24)} ${'INCOMING (peer)'.padEnd(48)} LOCAL (now)`);
      console.log(`  ${'-'.repeat(24)} ${'-'.repeat(48)} ${'-'.repeat(30)}`);
      for (const d of diffs) {
        console.log(`  ${d.column.padEnd(24)} ${trunc(d.incoming).padEnd(48)} ${trunc(d.local)}`);
      }
      console.log();
    }

    if (!KEEP_LOCAL && !TAKE_INCOMING) {
      console.log('  Re-run with --keep-local or --take-incoming to settle it.\n');
      return;
    }

    // ── Resolve ────────────────────────────────────────────────────────────
    if (c.status !== 'OPEN') {
      console.log(`  Already ${c.status}. Nothing done.\n`);
      return;
    }

    await db.query('BEGIN');
    try {
      if (TAKE_INCOMING) {
        const payload = c.incoming ?? {};
        // Only the columns the payload actually carries, and only those the
        // table really has. A partial payload must not blank what it never
        // mentioned, and a key from the peer is an identifier in the SQL
        // below — it is matched against the catalogue, never interpolated raw.
        const { rows: cols } = await db.query(
          `select column_name from information_schema.columns
            where table_schema = 'public' and table_name = $1`, [c.table_name]);
        const real = new Set(cols.map((r) => r.column_name));
        const keys = Object.keys(payload).filter((k) => real.has(k) && k !== 'id' && !SYNC_COLS.has(k));

        if (!keys.length) {
          console.log('  The incoming payload has nothing this table can store. Closing it only.\n');
        } else {
          await db.query(`SET LOCAL "orm.sync_applying" = 'on'`);
          const sets = keys.map((k) => `"${k}" = inc."${k}"`).join(', ');
          const sql = current
            ? `UPDATE "${c.table_name}" t SET ${sets}
                 FROM jsonb_populate_record(null::"${c.table_name}", $1::jsonb) inc
                WHERE t.id = $2`
            : `INSERT INTO "${c.table_name}"
                 SELECT * FROM jsonb_populate_record(null::"${c.table_name}", $1::jsonb)`;
          await db.query(sql, current ? [JSON.stringify(payload), c.row_id] : [JSON.stringify(payload)]);
          console.log(`  Applied ${keys.length} field${keys.length === 1 ? '' : 's'} from the peer.`);
        }
      } else {
        console.log('  Local version kept. The row was not touched.');
      }

      await db.query(
        `update sync_conflicts
            set status = $2, resolved_at = now(), resolved_by = $3, resolution_note = $4
          where id = $1::uuid`,
        [ID,
         TAKE_INCOMING ? 'RESOLVED_TAKE_INCOMING' : 'RESOLVED_KEEP_LOCAL',
         WHO,
         `Settled with resolve-conflicts.js on ${new Date().toISOString()}`]);

      await db.query('COMMIT');
      console.log('  Conflict closed.\n');
    } catch (e) {
      await db.query('ROLLBACK');
      console.error(`\nFAILED, nothing changed: ${e.message.split('\n')[0]}\n`);
      process.exitCode = 1;
    }
  } finally {
    await db.end().catch(() => {});
  }
})().catch((e) => { console.error('\nFAILED:', e.message, '\n'); process.exit(1); });
