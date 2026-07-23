/**
 * Merge duplicate anaesthetist accounts.
 * ------------------------------------------------------------------
 * Four anaesthetists each hold more than one user account (the same person was
 * registered several times). This keeps the account each actually signs in with
 * and removes the unused duplicates, repointing any data the duplicates carried
 * onto the keeper first so nothing is lost.
 *
 *   keeper  <- duplicates removed
 *   ANS004  <- ANS017, ANS018   Eri Charles Onyeka
 *   ANS020  <- ANS032, ANS033   Chigekwu Eze
 *   ANS021  <- ANS006           Ugwuanyi Samson Ejiofor
 *   ANS036  <- ANS034           Igbonekwu Chinemelum
 *
 * A full scan of all 127 foreign keys that reference users.id found the only
 * data on any duplicate is on ANS034: one emergency_surgery_alert, one
 * emergency_surgery_booking and one surgery, each via anesthetistId. Those are
 * repointed to ANS036; the other five duplicates are unreferenced.
 *
 *     node scripts/merge-duplicate-anaesthetists.js --dry-run
 *     node scripts/merge-duplicate-anaesthetists.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const MERGES = [
  { keep: 'ANS004', lose: ['ANS017', 'ANS018'], who: 'Eri Charles Onyeka' },
  { keep: 'ANS020', lose: ['ANS032', 'ANS033'], who: 'Chigekwu Eze' },
  { keep: 'ANS021', lose: ['ANS006'],           who: 'Ugwuanyi Samson Ejiofor' },
  { keep: 'ANS036', lose: ['ANS034'],           who: 'Igbonekwu Chinemelum' },
];

// Supabase's pooler intermittently refuses connections under script load.
async function withRetry(fn, label, attempts = 6) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const transient = /P1001|P1017|reach database|closed the connection/i.test(e.message || '');
      if (!transient || i === attempts) throw e;
      const wait = 800 * i;
      console.warn(`  [${label}] transient error (attempt ${i}/${attempts}), retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function main() {
  console.log(`Merging duplicate anaesthetists${DRY_RUN ? ' (DRY RUN)' : ''}...`);
  await withRetry(() => prisma.$connect(), 'connect');

  const codes = MERGES.flatMap((m) => [m.keep, ...m.lose]);
  const users = await withRetry(() => prisma.user.findMany({
    where: { staffCode: { in: codes } },
    select: { id: true, staffCode: true, fullName: true },
  }), 'load-users');
  const byCode = new Map(users.map((u) => [u.staffCode, u]));

  for (const code of codes) {
    if (!byCode.has(code)) throw new Error(`Account ${code} not found — mapping is stale, aborting.`);
  }

  // Discover the live set of references to every losing account, across all 127
  // FK columns, in a single round-trip. We repoint exactly what we find — no
  // hard-coded assumptions that could miss a row added since the audit.
  const fks = await withRetry(() => prisma.$queryRaw`
    SELECT tc.table_name AS child_table, kcu.column_name AS child_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'users' AND ccu.column_name = 'id' AND tc.table_schema = 'public'`, 'load-fks');

  const loserIds = MERGES.flatMap((m) => m.lose).map((c) => byCode.get(c).id);
  const idList = loserIds.map((id) => `'${id}'`).join(',');
  const scan = fks.map((fk) =>
    `SELECT '${fk.child_table}' AS t, '${fk.child_column}' AS c, "${fk.child_column}"::text AS uid, COUNT(*)::int AS n ` +
    `FROM "${fk.child_table}" WHERE "${fk.child_column}"::text IN (${idList}) GROUP BY "${fk.child_column}"`
  ).join('\nUNION ALL\n');
  const refs = await withRetry(() => prisma.$queryRawUnsafe(scan), 'fk-scan');

  const idToKeeper = new Map();
  for (const m of MERGES) for (const c of m.lose) idToKeeper.set(byCode.get(c).id, byCode.get(m.keep).id);

  console.log('\nReferences to repoint:');
  if (!refs.length) console.log('  (none)');
  for (const r of refs) console.log(`  ${r.t}.${r.c}: ${r.n} row(s)  ${r.uid} -> ${idToKeeper.get(r.uid)}`);

  if (DRY_RUN) {
    console.log('\nWould delete:');
    for (const m of MERGES) for (const c of m.lose) console.log(`  ${c}  ${byCode.get(c).fullName} (id ${byCode.get(c).id})`);
    console.log('\nDry run — nothing written.');
    return;
  }

  await withRetry(() => prisma.$transaction(async (tx) => {
    // 1. Repoint every referencing row onto the keeper.
    for (const r of refs) {
      const keeperId = idToKeeper.get(r.uid);
      const sql = `UPDATE "${r.t}" SET "${r.c}" = $1 WHERE "${r.c}"::text = $2`;
      const affected = await tx.$executeRawUnsafe(sql, keeperId, r.uid);
      console.log(`  repointed ${affected} row(s) in ${r.t}.${r.c}`);
    }

    // 2. Assert no losing account still has any reference.
    const recheck = await tx.$queryRawUnsafe(scan);
    if (recheck.length) {
      throw new Error(`Still-referenced after repoint: ${JSON.stringify(recheck)} — rolling back.`);
    }

    // 3. Delete the duplicates.
    const del = await tx.user.deleteMany({ where: { id: { in: loserIds } } });
    console.log(`  deleted ${del.count} duplicate account(s)`);
  }), 'merge-txn');

  console.log('\nMerge complete.');
}

main()
  .catch((e) => { console.error('Merge failed:', e.message || e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
