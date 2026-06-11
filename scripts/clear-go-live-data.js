/* eslint-disable */
/**
 * Go-live data clear.
 *
 * Deletes (production-safe, FK-correct):
 *   1. ALL surgeries (every status/date) and every row that transitively
 *      depends on a surgery (prescriptions, medication tracking, timings,
 *      WHO checklists, transport logs, pre-op reviews, emergency bookings…).
 *      NOTE: because every prescription (anaesthetic + post-op) has a
 *      required surgeryId, deleting all surgeries removes ALL prescriptions
 *      regardless of date.
 *   2. Disciplinary queries created before today (local midnight).
 *
 * Behaviour:
 *   - Default = DRY RUN. Prints per-table counts of what WOULD be deleted.
 *   - Always writes a JSON backup of surgeries, both prescription tables and
 *     the targeted disciplinary queries into exports/ before any delete.
 *   - Pass --execute to actually perform the deletion (single transaction).
 *
 * Usage:
 *   node scripts/clear-go-live-data.js            # dry run + backup
 *   node scripts/clear-go-live-data.js --execute  # backup + delete
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Prefer the direct (non-pgbouncer) connection for this admin task so the
// interactive transaction works reliably. Fall back to DATABASE_URL.
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const text = fs.readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(DIRECT_URL|DATABASE_URL)\s*=\s*(.+)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {}
}
loadEnv();

const adminUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: adminUrl ? { db: { url: adminUrl } } : undefined,
});
const EXECUTE = process.argv.includes('--execute');

const now = new Date();
const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

function q(id) {
  return `'${String(id).replace(/'/g, "''")}'`;
}
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function selectColIn(table, selectCol, whereCol, values) {
  const result = new Set();
  for (const part of chunk(values, 1000)) {
    if (part.length === 0) continue;
    const sql = `SELECT DISTINCT "${selectCol}" AS v FROM "${table}" WHERE "${whereCol}" IN (${part
      .map(q)
      .join(',')}) AND "${selectCol}" IS NOT NULL`;
    const rows = await prisma.$queryRawUnsafe(sql);
    for (const r of rows) result.add(r.v);
  }
  return [...result];
}

async function main() {
  console.log(`\n=== Go-live data clear (${EXECUTE ? 'EXECUTE' : 'DRY RUN'}) ===`);
  console.log(`"Before today" boundary: ${startOfToday.toISOString()}\n`);

  // ---------------------------------------------------------------
  // 1. Build the foreign-key dependency graph (public schema)
  // ---------------------------------------------------------------
  const fkRows = await prisma.$queryRawUnsafe(`
    SELECT
      tc.table_name      AS child_table,
      kcu.column_name    AS child_column,
      ccu.table_name     AS parent_table,
      ccu.column_name    AS parent_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  `);

  const edges = fkRows.map((r) => ({
    child: r.child_table,
    childCol: r.child_column,
    parent: r.parent_table,
    parentCol: r.parent_column,
  }));
  const edgesByParent = new Map();
  for (const e of edges) {
    if (!edgesByParent.has(e.parent)) edgesByParent.set(e.parent, []);
    edgesByParent.get(e.parent).push(e);
  }

  // ---------------------------------------------------------------
  // 2. Collect every row id transitively dependent on a surgery (BFS)
  // ---------------------------------------------------------------
  const collected = new Map(); // table -> Set(ids)

  const allSurgeries = await prisma.$queryRawUnsafe(`SELECT id FROM "surgeries"`);
  collected.set('surgeries', new Set(allSurgeries.map((r) => r.id)));

  const queue = ['surgeries'];
  while (queue.length) {
    const parentTable = queue.shift();
    const parentIds = [...collected.get(parentTable)];
    if (parentIds.length === 0) continue;
    for (const e of edgesByParent.get(parentTable) || []) {
      // Values of the referenced parent column for the collected parent rows.
      const parentKeyVals =
        e.parentCol === 'id'
          ? parentIds
          : await selectColIn(parentTable, e.parentCol, 'id', parentIds);
      if (parentKeyVals.length === 0) continue;

      const childIds = await selectColIn(e.child, 'id', e.childCol, parentKeyVals);
      if (childIds.length === 0) continue;

      let set = collected.get(e.child);
      if (!set) {
        set = new Set();
        collected.set(e.child, set);
      }
      let added = false;
      for (const id of childIds) {
        if (!set.has(id)) {
          set.add(id);
          added = true;
        }
      }
      if (added) queue.push(e.child);
    }
  }

  // ---------------------------------------------------------------
  // 3. Disciplinary queries before today (independent of surgeries)
  // ---------------------------------------------------------------
  const discRows = await prisma.$queryRawUnsafe(
    `SELECT id FROM "disciplinary_queries" WHERE "createdAt" < $1`,
    startOfToday
  );
  const disciplinaryIds = discRows.map((r) => r.id);

  // ---------------------------------------------------------------
  // 4. Report
  // ---------------------------------------------------------------
  const tables = [...collected.keys()].filter((t) => collected.get(t).size > 0);
  console.log('Rows to delete (surgery dependency graph):');
  let total = 0;
  for (const t of tables.sort()) {
    const c = collected.get(t).size;
    total += c;
    console.log(`  ${t.padEnd(40)} ${c}`);
  }
  console.log(`  ${'disciplinary_queries (before today)'.padEnd(40)} ${disciplinaryIds.length}`);
  total += disciplinaryIds.length;
  console.log(`  ${'—'.repeat(45)}`);
  console.log(`  TOTAL rows: ${total}\n`);

  // ---------------------------------------------------------------
  // 5. Backup to JSON (always, before any delete)
  // ---------------------------------------------------------------
  const exportsDir = path.join(__dirname, '..', 'exports');
  fs.mkdirSync(exportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  async function dump(name, sql, params = []) {
    const rows = params.length
      ? await prisma.$queryRawUnsafe(sql, ...params)
      : await prisma.$queryRawUnsafe(sql);
    const file = path.join(exportsDir, `golive-backup-${name}-${stamp}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify(rows, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
    );
    console.log(`  backup: ${path.basename(file)} (${rows.length} rows)`);
    return rows.length;
  }

  console.log('Writing backups…');
  await dump('surgeries', `SELECT * FROM "surgeries"`);
  await dump('anesthetic_prescriptions', `SELECT * FROM "anesthetic_prescriptions"`);
  await dump('postop_prescriptions', `SELECT * FROM "postop_prescriptions"`);
  await dump(
    'disciplinary_queries',
    `SELECT * FROM "disciplinary_queries" WHERE "createdAt" < $1`,
    [startOfToday]
  );
  console.log('');

  if (!EXECUTE) {
    console.log('DRY RUN complete. No rows deleted. Re-run with --execute to delete.\n');
    return;
  }

  // ---------------------------------------------------------------
  // 6. Determine delete order (children before parents) and delete
  // ---------------------------------------------------------------
  const collectedTables = new Set(tables);
  const childrenOf = new Map();
  for (const t of collectedTables) childrenOf.set(t, new Set());
  for (const e of edges) {
    if (
      collectedTables.has(e.parent) &&
      collectedTables.has(e.child) &&
      e.parent !== e.child
    ) {
      childrenOf.get(e.parent).add(e.child);
    }
  }
  const order = [];
  const remaining = new Set(collectedTables);
  while (remaining.size) {
    let progress = false;
    for (const t of [...remaining]) {
      const kids = [...childrenOf.get(t)].filter((c) => remaining.has(c));
      if (kids.length === 0) {
        order.push(t);
        remaining.delete(t);
        progress = true;
      }
    }
    if (!progress) {
      // Cycle fallback — append the rest (self-references delete fine in bulk).
      for (const t of remaining) order.push(t);
      remaining.clear();
    }
  }

  console.log('Deleting (in dependency order) inside a transaction…');
  await prisma.$transaction(
    async (tx) => {
      for (const t of order) {
        const ids = [...collected.get(t)];
        let deleted = 0;
        for (const part of chunk(ids, 1000)) {
          const sql = `DELETE FROM "${t}" WHERE "id" IN (${part.map(q).join(',')})`;
          deleted += await tx.$executeRawUnsafe(sql);
        }
        console.log(`  deleted ${String(deleted).padStart(6)} from ${t}`);
      }
      if (disciplinaryIds.length) {
        let deleted = 0;
        for (const part of chunk(disciplinaryIds, 1000)) {
          const sql = `DELETE FROM "disciplinary_queries" WHERE "id" IN (${part
            .map(q)
            .join(',')})`;
          deleted += await tx.$executeRawUnsafe(sql);
        }
        console.log(`  deleted ${String(deleted).padStart(6)} from disciplinary_queries`);
      }
    },
    { timeout: 120000 }
  );

  console.log('\n✓ Deletion complete.\n');
}

main()
  .catch((e) => {
    console.error('\n✗ Error — no changes committed (transaction rolled back if mid-delete):');
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
