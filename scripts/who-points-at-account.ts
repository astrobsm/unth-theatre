/**
 * WHO POINTS AT THIS ACCOUNT?
 *
 *     npx tsx scripts/who-points-at-account.ts crystalife
 *     npx tsx scripts/who-points-at-account.ts 0f2a1c3e-....
 *
 * Read only. There is no --apply and there is no write path. It opens the
 * node's own database, runs exactly the scan that the merge screen's preview
 * runs -- countReferences() from src/lib/users/mergeEngine, imported rather
 * than reimplemented -- and prints what it finds.
 *
 * WHY IT EXISTS. The merge preview answers the same question inside the app,
 * for an administrator with a browser. This answers it from the terminal of
 * the theatre server, where the node's Postgres is reachable and the browser
 * is not, and it is the thing to run when somebody asks "why can this account
 * not be deleted" before anybody decides to merge it.
 *
 * It also proves the scan against a real catalogue: the SQL is generated from
 * information_schema at run time, so a database is the only honest test of it.
 *
 * WHICH DATABASE. Resolved through scripts/lib/nodeDatabase.js, the same
 * module `npm run build` migrates with, and printed before anything is read.
 */

// `export {}` makes this a module rather than a script: without it every
// top-level name here would share one scope with scripts/import-price-list.ts,
// which binds the same ones. The names below are distinct as well, so the two
// files cannot collide even if that marker is ever lost in an edit.
export {};

// require, not import: nodeDatabase.js is CommonJS and shared with
// scripts/migrate-node-db.js, which `npm run build` runs as plain node.
const {
  describe: describeDatabase,
  resolveNodeDatabase: resolveDatabase,
} = require('./lib/nodeDatabase');

async function reportReferences() {
  const who = process.argv[2];
  if (!who || who === '--help' || who === '-h') {
    console.error('Usage: npx tsx scripts/who-points-at-account.ts <username|id>');
    process.exit(2);
  }

  const resolved = resolveDatabase();
  if (!resolved.url) {
    console.error('No DATABASE_URL anywhere. Nothing to read.');
    process.exit(1);
  }

  // Set BEFORE the Prisma singleton is imported, which is why the app modules
  // below are loaded with await import() rather than a static import.
  process.env.DATABASE_URL = resolved.url;
  if (resolved.isNodeLocal && resolved.directUrl) process.env.DIRECT_URL = resolved.directUrl;

  console.log('');
  console.log(`  database  : ${describeDatabase(resolved.url)}`);
  console.log(`  taken from: ${resolved.source}`);
  console.log('  READ ONLY. Nothing is written.');
  console.log('');

  const { default: prisma } = await import('../src/lib/prisma');
  const { countReferences, candidateColumns } = await import('../src/lib/users/mergeEngine');

  const user =
    (await prisma.user.findUnique({ where: { id: who } })) ??
    (await prisma.user.findFirst({ where: { username: { equals: who, mode: 'insensitive' } } }));

  if (!user) {
    console.error(`  No account with that username or id: ${who}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const columns = await candidateColumns(prisma);
  console.log(`  account   : ${user.fullName} (${user.username} · ${user.role} · ${user.status})`);
  console.log(`  id        : ${user.id}`);
  console.log(`  scanning  : ${columns.length} columns that could hold a user id`);
  console.log('');

  const started = Date.now();
  const counts = await countReferences(prisma, user.id);
  const took = ((Date.now() - started) / 1000).toFixed(1);

  if (counts.length === 0) {
    console.log('  Nothing anywhere points at this account. It can simply be deleted.');
  } else {
    const width = Math.max(...counts.map((c) => `${c.table}.${c.column}`.length));
    for (const c of counts) {
      const label = `${c.table}.${c.column}`.padEnd(width);
      const rows = String(c.rows === -1 ? '?' : c.rows).padStart(6);
      console.log(`  ${rows}  ${label}  ${c.disposition.toUpperCase()}`);
    }
    console.log('');
    const total = (d: string) =>
      counts.filter((c) => c.disposition === d).reduce((n, c) => n + Math.max(0, c.rows), 0);
    console.log(`  would move  : ${total('move')}`);
    console.log(`  would delete: ${total('drop')}   (credentials, never transferred)`);
    console.log(`  left alone  : ${total('freeze')}   (audit and replication pointers)`);
    const refused = counts.filter((c) => c.disposition === 'refuse');
    if (refused.length > 0) {
      console.log('');
      console.log(`  ${refused.length} column(s) STOP a merge until they are classified:`);
      refused.forEach((c) => console.log(`    ${c.table}.${c.column} — ${c.why}`));
    }
  }

  console.log('');
  console.log(`  scanned in ${took}s`);
  console.log('');
  await prisma.$disconnect();
}

reportReferences().catch(async (error) => {
  console.error('Failed:', error);
  process.exit(1);
});
