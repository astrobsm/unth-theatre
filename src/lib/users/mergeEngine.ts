// ============================================================
// Carrying out a merge
// ------------------------------------------------------------
// The rules are in merge.ts and are proved there. This file is the part that
// needs a database: find everywhere the duplicate's id is written, count it,
// and -- when the administrator confirms -- move it.
//
// HOW THE SEARCH WORKS, AND WHY IT IS NOT A LIST.
//
// 93 tables reference `users` through a foreign key. At least as many again
// hold a user id in a plain column with no key behind it -- push_subscriptions,
// device_credentials, theatre_case_flows, every `*ById` on a handover. A
// hand-written list of those would be wrong within a month, and the way it
// would be wrong is silent: a merge that misses a table leaves rows pointing
// at an account that no longer exists.
//
// So this asks the database instead. Every column whose name ends in `Id` or
// `By` is a candidate; each is then tested for an EXACT match on the
// duplicate's id. A uuid does not occur by accident, so `patientId` and a
// `staffId` holding "SRG233" cost one count each and match nothing, while a
// column added next year is found without anybody remembering to add it here.
//
// The counts are gathered a few tables at a time rather than one query per
// column: 776 round trips to a cloud database is a minute of waiting, and the
// same work in a dozen statements is a second.
// ============================================================

import type { Prisma, PrismaClient } from '@prisma/client';
import {
  classifyColumn,
  blockingTables,
  blockedMessage,
  blanksFilledFrom,
  type MergeCount,
  type MergeableFields,
} from '@/lib/users/merge';

/** Prisma client or an interactive transaction -- both can run raw SQL. */
type Db = PrismaClient | Prisma.TransactionClient;

/** Postgres identifier quoting. These names come from the catalogue; still. */
const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;
/** Postgres string literal, for the table and column names we print back. */
const lit = (value: string) => `'${value.replace(/'/g, "''")}'`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Candidate {
  table: string;
  column: string;
  /** uuid columns need the parameter cast; text ones must not be. */
  isUuid: boolean;
}

let candidateCache: Candidate[] | null = null;

/**
 * Every column that could hold a user id, read from the catalogue.
 *
 * Cached for the life of the process: it changes only when a migration runs,
 * and a migration restarts the server.
 */
export async function candidateColumns(db: Db): Promise<Candidate[]> {
  if (candidateCache) return candidateCache;
  const rows = await db.$queryRawUnsafe<{ table_name: string; column_name: string; data_type: string }[]>(`
    select c.table_name, c.column_name, c.data_type
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
       and t.table_type = 'BASE TABLE'
     where c.table_schema = current_schema()
       and c.data_type in ('text', 'uuid', 'character varying')
       and (c.column_name like '%Id' or c.column_name like '%By')
     order by c.table_name, c.column_name
  `);
  candidateCache = rows.map((r) => ({
    table: r.table_name,
    column: r.column_name,
    isUuid: r.data_type === 'uuid',
  }));
  return candidateCache;
}

/** Only for tests and for a migration deploy to clear. */
export function forgetCandidateColumns(): void {
  candidateCache = null;
}

/**
 * One column's count.
 *
 * Written as its own `where` rather than a `count(*) filter` over the table so
 * that an index on the column is used where there is one. The busy tables --
 * audit_logs, notifications, surgeries -- all index the columns that name a
 * user, which is exactly where a full scan would have cost something.
 */
function fragment(c: Candidate): string {
  const param = c.isUuid ? '$1::uuid' : '$1';
  return `select ${lit(c.table)}::text as tbl, ${lit(c.column)}::text as col, count(*)::int as n
            from ${q(c.table)} where ${q(c.column)} = ${param}
          having count(*) > 0`;
}

/** Columns per statement. Small enough to plan, large enough to be quick. */
const COLUMNS_PER_QUERY = 40;

/**
 * Where is this account's id actually written?
 *
 * Returns only the places with at least one row, each already classified, so
 * the confirmation screen can say what the merge will do in the language of
 * work rather than of tables.
 */
export async function countReferences(db: Db, userId: string): Promise<MergeCount[]> {
  const candidates = await candidateColumns(db);
  // A uuid column cannot hold an id that is not one, and asking would be an
  // error rather than a zero.
  const usable = candidates.filter((c) => !c.isUuid || UUID.test(userId));
  const found: MergeCount[] = [];

  for (let i = 0; i < usable.length; i += COLUMNS_PER_QUERY) {
    const slice = usable.slice(i, i + COLUMNS_PER_QUERY);
    const sql = slice.map(fragment).join('\nunion all\n');
    let rows: { tbl: string; col: string; n: number }[];
    try {
      rows = await db.$queryRawUnsafe<{ tbl: string; col: string; n: number }[]>(sql, userId);
    } catch (error) {
      // One unreadable column must not hide the rest, but it must not pass
      // unnoticed either: it is reported as a refusal, which stops the merge.
      console.error('[users] reference scan failed for a batch:', error);
      for (const c of slice) {
        found.push({
          table: c.table,
          column: c.column,
          rows: -1,
          disposition: 'refuse',
          why: 'This column could not be read, so what it holds is unknown.',
        });
      }
      continue;
    }
    for (const r of rows) {
      // The plan carries its own table and column, so they are not repeated.
      found.push({ rows: r.n, ...classifyColumn(r.tbl, r.col) });
    }
  }

  // Busiest first: an administrator reads the top of this list, not the end.
  return found.sort((a, b) => b.rows - a.rows);
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string }; message?: string };
  return (
    e?.meta?.code === '23505' ||
    e?.code === '23505' ||
    /duplicate key value|unique constraint/i.test(e?.message ?? '')
  );
}

interface MoveResult {
  moved: number;
  /** Rows the keeper already had, which cannot exist twice. */
  folded: number;
}

/**
 * Move one column's rows, folding away the ones that would collide.
 *
 * The collision is real and common: both accounts were granted the same
 * module, or both appear on the same roster line. A unique index refuses the
 * second, and the right answer is to drop the duplicate's row -- the keeper
 * already has what it said.
 */
async function moveColumn(
  tx: Prisma.TransactionClient,
  table: string,
  column: string,
  loseId: string,
  keepId: string,
  isUuid: boolean,
): Promise<MoveResult> {
  const cast = isUuid ? '::uuid' : '';
  const set = `update ${q(table)} set ${q(column)} = $1${cast} where ${q(column)} = $2${cast}`;

  await tx.$executeRawUnsafe('savepoint merge_bulk');
  try {
    const moved = await tx.$executeRawUnsafe(set, keepId, loseId);
    await tx.$executeRawUnsafe('release savepoint merge_bulk');
    return { moved, folded: 0 };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await tx.$executeRawUnsafe('rollback to savepoint merge_bulk');
  }

  const rows = await tx.$queryRawUnsafe<{ ctid: string }[]>(
    `select ctid::text as ctid from ${q(table)} where ${q(column)} = $1${cast}`,
    loseId,
  );
  let moved = 0;
  let folded = 0;
  for (const row of rows) {
    await tx.$executeRawUnsafe('savepoint merge_row');
    try {
      await tx.$executeRawUnsafe(
        `update ${q(table)} set ${q(column)} = $1${cast} where ctid = $2::tid`,
        keepId,
        row.ctid,
      );
      await tx.$executeRawUnsafe('release savepoint merge_row');
      moved += 1;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await tx.$executeRawUnsafe('rollback to savepoint merge_row');
      await tx.$executeRawUnsafe(`delete from ${q(table)} where ctid = $1::tid`, row.ctid);
      folded += 1;
    }
  }
  return { moved, folded };
}

export interface MergeOutcome {
  ok: boolean;
  error?: string;
  moved: number;
  folded: number;
  dropped: number;
  frozen: number;
  /** What was filled in on the keeper from the account folded in. */
  filled: string[];
  tables: { table: string; column: string; rows: number; disposition: string }[];
}

/** Thrown inside the transaction so that nothing written stands. */
class MergeBlocked extends Error {}

export interface MergeRequest {
  prisma: PrismaClient;
  keepId: string;
  loseId: string;
  adminId: string;
  adminName?: string;
}

/**
 * Fold one account into another, or change nothing at all.
 *
 * Everything happens in one transaction, including the delete at the end. If
 * the database refuses any part of it -- a foreign key this scan did not find,
 * a constraint nobody remembered -- the whole merge is undone and the two
 * accounts are exactly as they were. A half-merged person is the one outcome
 * worth more than the feature.
 */
export async function mergeUserInto({
  prisma,
  keepId,
  loseId,
  adminId,
  adminName,
}: MergeRequest): Promise<MergeOutcome> {
  const empty: MergeOutcome = { ok: false, moved: 0, folded: 0, dropped: 0, frozen: 0, filled: [], tables: [] };

  const [keeper, loser] = await Promise.all([
    prisma.user.findUnique({ where: { id: keepId } }),
    prisma.user.findUnique({ where: { id: loseId } }),
  ]);
  if (!keeper) return { ...empty, error: 'The account you chose to keep no longer exists.' };
  if (!loser) return { ...empty, error: 'The account you chose to fold in no longer exists.' };

  const candidates = await candidateColumns(prisma);
  const isUuid = (table: string, column: string) =>
    candidates.find((c) => c.table === table && c.column === column)?.isUuid ?? false;

  const fill = blanksFilledFrom(keeper as MergeableFields, loser as MergeableFields);

  let counts: MergeCount[] = [];
  let moved = 0;
  let folded = 0;
  let dropped = 0;
  let frozen = 0;

  try {
    await prisma.$transaction(
      async (tx) => {
        // THE SCAN HAPPENS INSIDE THE TRANSACTION, on the same snapshot the
        // moves will use. Counted outside it, a row written in the second
        // between the two would be left behind pointing at an account that no
        // longer exists -- and for a soft reference nothing would complain.
        counts = await countReferences(tx, loseId);
        const blocked = blockingTables(counts);
        if (blocked.length > 0) throw new MergeBlocked(blockedMessage(blocked));

        // Written before anything moves, while both accounts still exist to be
        // described. An audit entry that cannot say what was merged into what
        // is not one.
        await tx.auditLog.create({
          data: {
            userId: adminId,
            action: 'MERGE_USER',
            tableName: 'users',
            recordId: loseId,
            changes: JSON.stringify({
              keptId: keepId,
              keptUsername: keeper.username,
              mergedId: loseId,
              mergedUsername: loser.username,
              mergedFullName: loser.fullName,
              mergedRole: loser.role,
              mergedStatus: loser.status,
              references: counts.map((c) => `${c.table}.${c.column}=${c.rows}`),
              filled: Object.keys(fill),
              mergedBy: adminName ?? adminId,
            }),
          },
        });

        for (const c of counts) {
          if (c.disposition === 'freeze') {
            frozen += c.rows;
            continue;
          }
          if (c.disposition === 'drop') {
            const cast = isUuid(c.table, c.column) ? '::uuid' : '';
            dropped += await tx.$executeRawUnsafe(
              `delete from ${q(c.table)} where ${q(c.column)} = $1${cast}`,
              loseId,
            );
            continue;
          }
          const result = await moveColumn(tx, c.table, c.column, loseId, keepId, isUuid(c.table, c.column));
          moved += result.moved;
          folded += result.folded;
        }

        // The duplicate goes only after everything has let go of it. If
        // anything still has not, this throws and the whole merge is undone.
        await tx.user.delete({ where: { id: loseId } });

        // Fields are filled AFTER the delete so a unique staff code or email
        // moving across cannot collide with the row it came from.
        if (Object.keys(fill).length > 0) {
          await tx.user.update({ where: { id: keepId }, data: fill });
        }
      },
      { timeout: 180_000, maxWait: 20_000 },
    );
  } catch (error: unknown) {
    // A table nobody has classified is a refusal, not a failure: nothing was
    // written, and the message names what has to be decided.
    if (error instanceof MergeBlocked) {
      return { ...empty, tables: counts, error: error.message };
    }
    const code = (error as { code?: string })?.code;
    console.error('[users] merge failed:', keepId, loseId, error);
    return {
      ...empty,
      tables: counts,
      error:
        code === 'P2003'
          ? 'The database refused: something still references that account, and it was not in the scan. Nothing was changed.'
          : 'The merge was undone and nothing was changed. The server log has the detail.',
    };
  }

  return {
    ok: true,
    moved,
    folded,
    dropped,
    frozen,
    filled: Object.keys(fill),
    tables: counts.map((c) => ({ table: c.table, column: c.column, rows: c.rows, disposition: c.disposition })),
  };
}
