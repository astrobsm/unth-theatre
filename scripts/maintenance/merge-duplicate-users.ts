/**
 * Merge duplicate staff accounts, and clear imported onboarding submissions.
 * ============================================================================
 *
 *   npx tsx scripts/maintenance/merge-duplicate-users.ts report
 *   npx tsx scripts/maintenance/merge-duplicate-users.ts merge --apply
 *   npx tsx scripts/maintenance/merge-duplicate-users.ts delete-pending --apply
 *
 * Nothing is written without --apply. Every run writes a JSON backup first.
 *
 * WHO COUNTS AS A DUPLICATE
 *
 * Same normalised full name AND same phone number (last ten digits, so
 * "08031234567" and "+2348031234567" match). Both, not either:
 *
 *   Name alone is not enough. Two different members of staff can share a name,
 *   and merging them would fuse two people's clinical history into one record
 *   in a system used for audit and attribution.
 *
 *   Phone alone is worse. Measured on the live data, 53 numbers are shared but
 *   only 29 of those groups also share a name — the other 24 are different
 *   people on one handset. Merging those would be a serious error.
 *
 * Anything matching on only one of the two is REPORTED, never merged. A person
 * has to look at those.
 *
 * WHICH ACCOUNT SURVIVES
 *
 * The one with the most references across the database — the account that
 * actually did the work. Ties break towards the older account, then towards
 * the one with a staff code. The survivor also inherits any field it was
 * missing (email, phone, staff code, department) from the accounts being
 * merged in, so nothing is lost by choosing it.
 *
 * HOW REFERENCES MOVE
 *
 * 151 foreign-key columns point at users.id. Each is repointed to the
 * survivor. Where a unique constraint makes that impossible — both accounts
 * hold the same slot, say the same roster line — the duplicate's row is
 * dropped rather than the whole merge failing, and the count is reported. Each
 * group is one transaction: it completes or it does not happen.
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const [, , command, ...rest] = process.argv;
const APPLY = rest.includes('--apply');
const OUT_DIR = path.join(process.cwd(), '.maintenance-backups');

interface FkColumn { table: string; column: string }
interface Account {
  id: string; username: string; fullName: string; email: string | null;
  phoneNumber: string | null; staffCode: string | null; staffId: string | null;
  department: string | null; role: string; createdAt: Date; refs: number;
}
interface Group { key: string; keeper: Account; duplicates: Account[] }

/**
 * Say which database is about to be modified, before touching it.
 *
 * Prisma reads `.env`, NOT `.env.local`. On the hospital's local server the
 * local database URL lives in `.env.local` while `.env` still holds the cloud
 * credentials, so a bare `npx tsx ...` silently targets PRODUCTION CLOUD while
 * the operator believes they are working locally. That is a bad way to find
 * out you have deleted the wrong rows, so the target is printed every run and
 * a destructive command against a remote host has to be confirmed.
 */
function describeTarget(): { label: string; isLocal: boolean } {
  const url = process.env.DATABASE_URL ?? '';
  const m = /^postgres(?:ql)?:\/\/[^@]*@([^:/?]+)(?::(\d+))?\/([^?]+)/.exec(url);
  if (!m) return { label: '(DATABASE_URL not set or unrecognised)', isLocal: false };
  const [, host, port, db] = m;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  return { label: `${host}${port ? ':' + port : ''}/${db}`, isLocal };
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

function saveBackup(name: string, data: unknown): string {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}-${stamp()}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

/** Every foreign-key column that points at users.id. */
async function userForeignKeys(): Promise<FkColumn[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ table: string; column: string }>>(`
    select t.relname as table, a.attname as column
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_class rt on rt.oid = c.confrelid
    join pg_namespace n on n.oid = t.relnamespace
    join unnest(c.conkey) with ordinality as k(attnum, ord) on true
    join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
    where c.contype = 'f' and rt.relname = 'users' and n.nspname = 'public'
    order by 1, 2
  `);
  return rows;
}

/**
 * How many rows point at each of these accounts, across the whole database.
 *
 * One query per foreign-key column for ALL candidates at once, rather than per
 * column per user. The naive version is 151 columns x 69 accounts — ten
 * thousand round trips, which against a cloud database simply never finishes.
 */
async function countRefsBulk(
  fks: FkColumn[], userIds: string[]
): Promise<{ totals: Map<string, number>; holders: Map<string, Set<string>> }> {
  const totals = new Map<string, number>(userIds.map((id) => [id, 0]));
  // column key -> the user ids that actually appear in it. The merge uses this
  // to skip the ~110 columns that reference none of these accounts; without it
  // the run is 143 columns x 29 groups of round trips and never finishes.
  const holders = new Map<string, Set<string>>();
  if (!userIds.length) return { totals, holders };

  for (const fk of fks) {
    const rows = await prisma.$queryRawUnsafe<Array<{ uid: string; n: bigint }>>(
      `select "${fk.column}" as uid, count(*)::bigint as n
         from "${fk.table}" where "${fk.column}" = any($1::text[])
        group by 1`, userIds);
    if (!rows.length) continue;
    const key = `${fk.table}.${fk.column}`;
    holders.set(key, new Set(rows.map((r) => r.uid)));
    for (const r of rows) totals.set(r.uid, (totals.get(r.uid) ?? 0) + Number(r.n));
  }
  return { totals, holders };
}

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const normPhone = (s: string | null) => {
  const d = (s ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};

async function findGroups(fks: FkColumn[]): Promise<{ groups: Group[]; ambiguous: string[]; holders: Map<string, Set<string>> }> {
  const users = await prisma.user.findMany({
    where: { status: 'APPROVED' },
    select: {
      id: true, username: true, fullName: true, email: true, phoneNumber: true,
      staffCode: true, staffId: true, department: true, role: true, createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const byNamePhone = new Map<string, typeof users>();
  const byName = new Map<string, typeof users>();
  for (const u of users) {
    const n = normName(u.fullName);
    const p = normPhone(u.phoneNumber);
    byName.set(n, [...(byName.get(n) ?? []), u]);
    if (p) byNamePhone.set(`${n}|${p}`, [...(byNamePhone.get(`${n}|${p}`) ?? []), u]);
  }

  // Count references for every candidate in one pass, before grouping.
  const candidateIds = Array.from(byNamePhone.values())
    .filter((m) => m.length > 1)
    .flatMap((m) => m.map((u) => u.id));
  const { totals: refs, holders } = await countRefsBulk(fks, candidateIds);

  const groups: Group[] = [];
  for (const [key, members] of Array.from(byNamePhone.entries())) {
    if (members.length < 2) continue;

    const scored: Account[] = members.map((m) => ({ ...m, refs: refs.get(m.id) ?? 0 }));

    // The account that did the work wins. Ties go to the older account, then
    // to the one carrying a staff code.
    scored.sort((a, b) =>
      b.refs - a.refs ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      (b.staffCode ? 1 : 0) - (a.staffCode ? 1 : 0));

    groups.push({ key, keeper: scored[0], duplicates: scored.slice(1) });
  }

  // Same name but the phones differ or are missing: a person must decide.
  const merging = new Set(groups.flatMap((g) => [g.keeper.id, ...g.duplicates.map((d) => d.id)]));
  const ambiguous: string[] = [];
  for (const [name, members] of Array.from(byName.entries())) {
    if (members.length < 2) continue;
    if (members.every((m) => merging.has(m.id))) continue;
    ambiguous.push(`${name} — ${members.map((m) => `${m.username}(${normPhone(m.phoneNumber) || 'no phone'})`).join(', ')}`);
  }

  return { groups, ambiguous, holders };
}

async function report() {
  const fks = await userForeignKeys();
  console.log(`Foreign-key columns pointing at users.id: ${fks.length}`);
  const { groups, ambiguous } = await findGroups(fks);

  console.log(`\nMERGEABLE — same name AND phone: ${groups.length} groups\n`);
  let willDelete = 0;
  for (const g of groups) {
    console.log(`  ${g.keeper.fullName}`);
    console.log(`    KEEP   ${g.keeper.username.padEnd(24)} ${String(g.keeper.refs).padStart(5)} refs  ${g.keeper.role}`);
    for (const d of g.duplicates) {
      console.log(`    merge  ${d.username.padEnd(24)} ${String(d.refs).padStart(5)} refs  ${d.role}`);
      willDelete++;
    }
  }
  console.log(`\n  ${groups.length} survivors, ${willDelete} accounts merged away.`);

  if (ambiguous.length) {
    console.log(`\nNOT MERGED — same name, different or missing phone (${ambiguous.length}).`);
    console.log('These need a person to decide; the script will not guess.\n');
    for (const a of ambiguous) console.log(`  ${a}`);
  }

  const pending = await prisma.onboardingSubmission.count({ where: { status: 'PENDING' } });
  console.log(`\nPending onboarding submissions: ${pending}`);
  saveBackup('report', { groups, ambiguous, pending });
}

async function merge() {
  const fks = await userForeignKeys();
  const { groups, holders } = await findGroups(fks);
  if (!groups.length) { console.log('Nothing to merge.'); return; }

  const backup = saveBackup('users-before-merge', {
    groups,
    users: await prisma.user.findMany({
      where: { id: { in: groups.flatMap((g) => [g.keeper.id, ...g.duplicates.map((d) => d.id)]) } },
    }),
  });
  console.log(`Backup written: ${backup}`);
  if (!APPLY) { console.log('\nDRY RUN — pass --apply to perform the merge.'); return; }

  let moved = 0, dropped = 0, removed = 0;
  const collisions: string[] = [];

  for (const g of groups) {
    const dupIds = g.duplicates.map((d) => d.id);
    await prisma.$transaction(async (tx) => {
      for (const fk of fks) {
        const held = holders.get(`${fk.table}.${fk.column}`);
        if (!held || !dupIds.some((d) => held.has(d))) continue;

        // Try to move the whole column at once. A unique constraint means both
        // accounts already occupy the same slot, so the duplicate's row is
        // redundant — but an error inside a Postgres transaction aborts the
        // WHOLE transaction, so the attempt is wrapped in a savepoint and only
        // that statement is rolled back.
        await tx.$executeRawUnsafe('SAVEPOINT bulk_move');
        try {
          const n = await tx.$executeRawUnsafe(
            `update "${fk.table}" set "${fk.column}" = $1 where "${fk.column}" = any($2::text[])`,
            g.keeper.id, dupIds);
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT bulk_move');
          moved += n;
          continue;
        } catch {
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT bulk_move');
        }

        // Row by row, keeping what fits and dropping what collides.
        const rows = await tx.$queryRawUnsafe<Array<{ ctid: string }>>(
          `select ctid::text as ctid from "${fk.table}" where "${fk.column}" = any($1::text[])`,
          dupIds);
        for (const r of rows) {
          await tx.$executeRawUnsafe('SAVEPOINT one_row');
          try {
            await tx.$executeRawUnsafe(
              `update "${fk.table}" set "${fk.column}" = $1 where ctid = $2::tid`,
              g.keeper.id, r.ctid);
            await tx.$executeRawUnsafe('RELEASE SAVEPOINT one_row');
            moved++;
          } catch {
            await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT one_row');
            await tx.$executeRawUnsafe(
              `delete from "${fk.table}" where ctid = $1::tid`, r.ctid);
            dropped++;
            collisions.push(`${fk.table}.${fk.column} (${g.keeper.fullName})`);
          }
        }
      }

      // The survivor inherits anything it was missing, so choosing it on
      // reference count never loses a detail the other account carried.
      const fill: Record<string, string> = {};
      for (const field of ['email', 'phoneNumber', 'staffCode', 'staffId', 'department'] as const) {
        if (g.keeper[field]) continue;
        const donor = g.duplicates.find((d) => d[field]);
        if (donor) fill[field] = donor[field] as string;
      }

      // Delete FIRST, then fill. email, staffCode, staffId and username are
      // all unique: copying a value onto the survivor while the account that
      // holds it still exists is rejected by the index, which is exactly what
      // happened on the first run.
      await tx.user.deleteMany({ where: { id: { in: dupIds } } });
      removed += dupIds.length;

      if (Object.keys(fill).length) {
        await tx.user.update({ where: { id: g.keeper.id }, data: fill });
      }
    }, { timeout: 120_000 });

    console.log(`  merged ${g.keeper.fullName} <- ${g.duplicates.length} duplicate(s)`);
  }

  console.log(`\nDone. ${moved} references repointed, ${dropped} redundant rows dropped, ${removed} accounts removed.`);
}

async function deletePending() {
  const rows = await prisma.onboardingSubmission.findMany({ where: { status: 'PENDING' } });
  console.log(`Pending onboarding submissions: ${rows.length}`);
  if (!rows.length) return;

  const backup = saveBackup('pending-onboarding', rows);
  console.log(`Backup written: ${backup}`);
  if (!APPLY) { console.log('\nDRY RUN — pass --apply to delete.'); return; }

  const res = await prisma.onboardingSubmission.deleteMany({ where: { status: 'PENDING' } });
  console.log(`Deleted ${res.count} pending submission(s). Imported ones are untouched.`);
}

(async () => {
  const target = describeTarget();
  console.log(`
Database: ${target.label}${target.isLocal ? '  (local)' : '  (REMOTE)'}`);
  if (APPLY && !target.isLocal && process.env.ORM_CONFIRM_REMOTE !== 'yes') {
    console.error(`
This would MODIFY A REMOTE database, which is probably not what you meant if
you are on the hospital server. Prisma reads .env, not .env.local.

To target the local database:
    DB=$(grep -E '^DATABASE_URL=' .env.local | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')
    DATABASE_URL="$DB" npx tsx scripts/maintenance/merge-duplicate-users.ts ${command} --apply

If you really do mean the remote one, set ORM_CONFIRM_REMOTE=yes.`);
    process.exitCode = 2;
    return;
  }
  try {
    if (command === 'report') await report();
    else if (command === 'merge') await merge();
    else if (command === 'delete-pending') await deletePending();
    else {
      console.log('Usage: report | merge [--apply] | delete-pending [--apply]');
      process.exitCode = 2;
    }
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
