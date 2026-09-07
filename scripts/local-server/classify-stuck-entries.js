#!/usr/bin/env node
/* eslint-disable no-console */
// =============================================================================
// Why is an entry stuck, and is it safe to let go of?
// -----------------------------------------------------------------------------
//   node scripts/local-server/classify-stuck-entries.js            summary
//   node scripts/local-server/classify-stuck-entries.js --detail   per-row diffs
//   node scripts/local-server/classify-stuck-entries.js --table X  one table only
//
// The push endpoint applies each entry inside its own savepoint, so an entry
// that cannot be applied simply gets no result — and the sender, correctly,
// sends it again. That is the no-loss rule working as designed, and it is also
// how a queue stops moving: an entry failing on a UNIQUE violation fails the
// same way forever, and on 7 September ~894 changes sat behind a handful of
// them for five days.
//
// The remedy is to stop retrying what can never apply. But "stop retrying"
// means acknowledging a change WITHOUT writing it to the cloud, and that is
// only safe when the cloud already holds the same values. Where it holds
// different ones, discarding the local change loses theatre data.
//
// So this script does not fix anything. It answers the question the fix
// depends on, per row, against both databases:
//
//   IDENTICAL   cloud already holds these values — acknowledging loses nothing
//   DIFFERENT   cloud holds a DIFFERENT row under the same key — a person must
//               decide, and the fields that differ are printed
//   MISSING     nothing on the cloud — this should apply; it is stuck on
//               something else
//
// Read-only. It opens both databases and writes to neither.
// =============================================================================

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..', '..');

const args = process.argv.slice(2);
const DETAIL = args.includes('--detail');
const ONLY_TABLE = (() => {
  const i = args.indexOf('--table');
  return i >= 0 ? args[i + 1] : null;
})();
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? Number(args[i + 1]) : 400;
})();

/** KEY=value out of a dotenv file; absent file -> {}. */
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

// Same resolution the running app uses: .env.local is the node's own database,
// .env is the cloud. Getting these the wrong way round would compare a
// database with itself and report everything identical, so they are named
// explicitly rather than inferred.
const local = readEnvFile('.env.local');
const cloud = readEnvFile('.env');

const LOCAL_URL = local.DATABASE_URL;
const CLOUD_URL = cloud.DIRECT_URL || cloud.DATABASE_URL;

if (!LOCAL_URL) { console.error('No DATABASE_URL in .env.local — is this the theatre server?'); process.exit(2); }
if (!CLOUD_URL) { console.error('No DATABASE_URL/DIRECT_URL in .env'); process.exit(2); }
if (LOCAL_URL === CLOUD_URL) { console.error('.env and .env.local name the SAME database; nothing to compare.'); process.exit(2); }

const show = (u) => { try { const x = new URL(u); return `${x.hostname}${x.pathname}`; } catch { return '(unparseable)'; } };

/** Columns the sync layer owns; never a real difference in theatre data. */
const SYNC_COLS = new Set(['sync_version', 'sync_origin', 'sync_hlc']);

/** Compare a journal payload against the row the cloud actually holds. */
function diffRow(payload, cloudRow) {
  const diffs = [];
  for (const [k, v] of Object.entries(payload || {})) {
    if (SYNC_COLS.has(k)) continue;
    if (!(k in cloudRow)) continue;          // column absent on the peer
    const a = norm(v);
    const b = norm(cloudRow[k]);
    if (a !== b) diffs.push({ column: k, local: a, cloud: b });
  }
  return diffs;
}

/** Compare by value, not by representation: dates and numerics differ in form. */
function norm(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  // Timestamps arrive as '2026-09-02 10:07:05.124+00' from one side and as an
  // ISO string from the other. Same instant, different spelling.
  const asDate = Date.parse(s);
  if (!Number.isNaN(asDate) && /\d{4}-\d{2}-\d{2}/.test(s)) return new Date(asDate).toISOString();
  return s;
}

const trunc = (v, n = 48) => {
  const s = v === null ? 'NULL' : String(v);
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

(async () => {
  const l = new Client({ connectionString: LOCAL_URL, connectionTimeoutMillis: 15000 });
  const c = new Client({ connectionString: CLOUD_URL, connectionTimeoutMillis: 20000 });

  console.log('\nComparing stuck entries against the cloud');
  console.log(`  local : ${show(LOCAL_URL)}`);
  console.log(`  cloud : ${show(CLOUD_URL)}\n`);

  await l.connect();
  await c.connect();

  try {
    const where = ONLY_TABLE ? 'and table_name = $2' : '';
    const params = ONLY_TABLE ? [LIMIT, ONLY_TABLE] : [LIMIT];
    const { rows: stuck } = await l.query(
      `select id::text, table_name, row_id, op, attempts, payload
         from sync_journal
        where ack_at is null ${where}
        order by attempts desc, hlc
        limit $1`, params);

    if (!stuck.length) { console.log('Nothing unsent. The queue is clear.\n'); return; }

    console.log(`${stuck.length} unsent entr${stuck.length === 1 ? 'y' : 'ies'} to classify.\n`);

    // Which columns the cloud actually has, per table, asked once each.
    const colsOf = new Map();
    async function cloudColumns(table) {
      if (colsOf.has(table)) return colsOf.get(table);
      const { rows } = await c.query(
        `select column_name from information_schema.columns
          where table_schema = current_schema() and table_name = $1`, [table]);
      const set = new Set(rows.map((r) => r.column_name));
      colsOf.set(table, set);
      return set;
    }

    const verdicts = [];
    for (const e of stuck) {
      const cols = await cloudColumns(e.table_name);
      if (cols.size === 0) {
        verdicts.push({ ...e, verdict: 'NO_SUCH_TABLE', diffs: [] });
        continue;
      }
      let cloudRow = null;
      try {
        const { rows } = await c.query(
          `select * from "${e.table_name}" where id = $1 limit 1`, [e.row_id]);
        cloudRow = rows[0] ?? null;
      } catch (err) {
        verdicts.push({ ...e, verdict: 'QUERY_FAILED', diffs: [], note: err.message });
        continue;
      }

      if (!cloudRow) {
        // Not present under this id. If the payload carries a surgeryId, the
        // UNIQUE violation means the cloud holds a DIFFERENT row for the same
        // surgery — which is the case that cannot be resolved automatically.
        const sid = e.payload && (e.payload.surgeryId ?? e.payload.surgery_id);
        if (sid) {
          const { rows } = await c.query(
            `select * from "${e.table_name}" where "surgeryId" = $1 limit 1`, [sid]).catch(() => ({ rows: [] }));
          if (rows[0]) {
            verdicts.push({
              ...e, verdict: 'RIVAL_ROW', rivalId: rows[0].id,
              diffs: diffRow(e.payload, rows[0]),
            });
            continue;
          }
        }
        verdicts.push({ ...e, verdict: 'MISSING', diffs: [] });
        continue;
      }

      const diffs = diffRow(e.payload, cloudRow);
      verdicts.push({ ...e, verdict: diffs.length ? 'DIFFERENT' : 'IDENTICAL', diffs });
    }

    // ── Summary ────────────────────────────────────────────────────────────
    const byVerdict = new Map();
    for (const v of verdicts) {
      const k = v.verdict;
      if (!byVerdict.has(k)) byVerdict.set(k, []);
      byVerdict.get(k).push(v);
    }

    const EXPLAIN = {
      IDENTICAL: 'cloud already holds these values — acknowledging loses nothing',
      DIFFERENT: 'cloud holds the same row with DIFFERENT values — a person must decide',
      RIVAL_ROW: 'cloud has another row under the same surgeryId — this is the UNIQUE violation',
      MISSING: 'not on the cloud at all — should apply; stuck on something else',
      NO_SUCH_TABLE: 'the cloud has no such table — it is running older code',
      QUERY_FAILED: 'could not be read from the cloud',
    };

    console.log('VERDICT        COUNT  MEANING');
    console.log('-------------  -----  -------------------------------------------------');
    for (const k of ['IDENTICAL', 'RIVAL_ROW', 'DIFFERENT', 'MISSING', 'NO_SUCH_TABLE', 'QUERY_FAILED']) {
      const list = byVerdict.get(k);
      if (!list) continue;
      console.log(`${k.padEnd(13)}  ${String(list.length).padStart(5)}  ${EXPLAIN[k]}`);
    }

    console.log('\nBy table:');
    const byTable = new Map();
    for (const v of verdicts) {
      const t = byTable.get(v.table_name) ?? {};
      t[v.verdict] = (t[v.verdict] ?? 0) + 1;
      byTable.set(v.table_name, t);
    }
    for (const [table, counts] of [...byTable].sort((a, b) =>
      Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0))) {
      const parts = Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ');
      console.log(`  ${table.padEnd(30)} ${parts}`);
    }

    if (DETAIL) {
      console.log('\n── What actually differs ───────────────────────────────────────');
      for (const v of verdicts) {
        if (v.verdict !== 'DIFFERENT' && v.verdict !== 'RIVAL_ROW') continue;
        console.log(`\n${v.table_name}/${v.row_id}  (${v.verdict}, ${v.attempts} attempts)`);
        if (v.rivalId) console.log(`  cloud row under the same surgeryId: ${v.rivalId}`);
        if (!v.diffs.length) { console.log('  no field-level differences'); continue; }
        for (const d of v.diffs.slice(0, 12)) {
          console.log(`  ${d.column.padEnd(24)} local=${trunc(d.local)}`);
          console.log(`  ${''.padEnd(24)} cloud=${trunc(d.cloud)}`);
        }
        if (v.diffs.length > 12) console.log(`  … and ${v.diffs.length - 12} more columns`);
      }
    } else {
      const needDetail = (byVerdict.get('DIFFERENT')?.length ?? 0) + (byVerdict.get('RIVAL_ROW')?.length ?? 0);
      if (needDetail) console.log(`\n${needDetail} entr${needDetail === 1 ? 'y needs' : 'ies need'} a decision. Re-run with --detail to see the differing fields.`);
    }
    console.log();
  } finally {
    await l.end().catch(() => {});
    await c.end().catch(() => {});
  }
})().catch((e) => { console.error('\nFAILED:', e.message, '\n'); process.exit(1); });
