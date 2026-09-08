import { describe, it, expect } from 'vitest';
import { applyEntry, type TxRunner } from '../../src/lib/sync/applyEntry';
import type { JournalEntryWire } from '../../src/lib/sync/transport';

/**
 * A collision on a SECONDARY unique key.
 *
 * surgery_drafts holds one unfinished booking per user — userId is UNIQUE —
 * and the sync policy files it as LWW. But LWW compared the incoming row
 * against the row with the SAME id, and in a userId collision there is no such
 * row: decide() answered "New row. APPLY", the insert violated
 * surgery_drafts_userId_key, and the entry failed identically on every retry.
 * 180 entries were retried 522 times each against 16 users and could not have
 * succeeded on any attempt.
 *
 * The fake below records the SQL it is asked to run, which is the only way to
 * assert the two things that matter: that the loser is deleted, and that it is
 * deleted in the same breath as the winner is written.
 */

interface Recorded { sql: string; values: unknown[] }

function fakeDb(opts: {
  /** The row already holding the unique key, if any. */
  rival?: { id: string; sync_version: number | null; sync_hlc: string | null } | null;
  /** A row under the incoming id, if any. */
  existing?: { sync_version: number | null; sync_hlc: string | null } | null;
  /** The secondary unique index this table carries. */
  uniqueCols?: string[];
  /** The table's real columns; defaults to whatever the payload mentions. */
  columns?: string[];
}) {
  const log: Recorded[] = [];
  const rival = opts.rival ?? null;
  const existing = opts.existing ?? null;
  const uniqueCols = opts.uniqueCols ?? ['userId'];
  const columns = opts.columns ?? ['id', 'userId', 'step', 'ptNumber', 'name'];

  const query = async (sql: string, ...values: unknown[]): Promise<unknown> => {
    log.push({ sql, values });
    if (sql.includes('from sync_applied')) return [];
    // The unique-index discovery.
    if (sql.includes('pg_index')) return [{ cols: uniqueCols }];
    // The rival lookup: joins the table against jsonb_populate_record.
    if (sql.includes('jsonb_populate_record') && sql.includes('sync_hlc')) {
      return rival ? [rival] : [];
    }
    if (sql.includes('information_schema.columns')) {
      return columns.map((column_name) => ({ column_name }));
    }
    // The by-id lookup at the top of applyEntry.
    if (sql.trimStart().startsWith('select sync_version, sync_hlc from')) {
      return existing ? [existing] : [];
    }
    return [];
  };

  const db: TxRunner = {
    $queryRawUnsafe: query as TxRunner['$queryRawUnsafe'],
    $executeRawUnsafe: (async (sql: string, ...values: unknown[]) => {
      log.push({ sql, values });
      return 1;
    }) as TxRunner['$executeRawUnsafe'],
    $transaction: async <T,>(fn: (tx: never) => Promise<T>) => fn(db as never),
  };
  return { db, log };
}

const draft = (id: string, hlc: string): JournalEntryWire => ({
  id: '11111111-1111-1111-1111-111111111111',
  table: 'surgery_drafts',
  rowId: id,
  op: 'INSERT',
  baseVersion: 0,
  newVersion: 1,
  hlc,
  originNode: 'cloud',
  payload: { id, userId: 'user-1', step: 'patient' },
  changedColumns: null,
  omittedColumns: null,
  omittedDigest: null,
});

const deletes = (log: Recorded[]) =>
  log.filter((r) => /^\s*delete from/i.test(r.sql));
const inserts = (log: Recorded[]) =>
  log.filter((r) => /^\s*insert into "surgery_drafts"/i.test(r.sql));

describe('a draft that collides with another user row', () => {
  it('deletes the older draft and writes the newer one', async () => {
    // Incoming HLC is later than the rival's, so the incoming draft wins.
    const { db, log } = fakeDb({
      rival: { id: 'local-draft', sync_version: 3, sync_hlc: '2026-09-05T10:00:00Z-000' },
    });

    const res = await applyEntry(db, draft('cloud-draft', '2026-09-07T10:00:00Z-000'),
      'cloud', 'theatre', new Map());

    expect(res.decision).toBe('APPLY');
    const removed = deletes(log);
    expect(removed).toHaveLength(1);
    expect(removed[0].values).toContain('local-draft');
    // And the winner really is written, not merely the loser removed.
    expect(inserts(log)).toHaveLength(1);
  });

  it('removes the loser BEFORE inserting the winner', async () => {
    // Order is not cosmetic: the insert hits the very unique index this path
    // exists to clear if the delete has not happened yet.
    const { db, log } = fakeDb({
      rival: { id: 'local-draft', sync_version: 1, sync_hlc: '2026-09-01T10:00:00Z-000' },
    });
    await applyEntry(db, draft('cloud-draft', '2026-09-07T10:00:00Z-000'),
      'cloud', 'theatre', new Map());

    const delIdx = log.findIndex((r) => /^\s*delete from/i.test(r.sql));
    const insIdx = log.findIndex((r) => /^\s*insert into "surgery_drafts"/i.test(r.sql));
    expect(delIdx).toBeGreaterThanOrEqual(0);
    expect(insIdx).toBeGreaterThan(delIdx);
  });

  it('keeps the local draft and discards the incoming one when local is newer', async () => {
    const { db, log } = fakeDb({
      rival: { id: 'local-draft', sync_version: 9, sync_hlc: '2026-09-09T10:00:00Z-000' },
    });

    const res = await applyEntry(db, draft('cloud-draft', '2026-09-01T10:00:00Z-000'),
      'cloud', 'theatre', new Map());

    expect(res.decision).toBe('IGNORE');
    // Nothing is removed and nothing is written: the local row stands.
    expect(deletes(log)).toHaveLength(0);
    expect(inserts(log)).toHaveLength(0);
  });

  it('never deletes anything when there is no rival', async () => {
    // The ordinary path must be untouched by any of this.
    const { db, log } = fakeDb({ rival: null });
    const res = await applyEntry(db, draft('cloud-draft', '2026-09-07T10:00:00Z-000'),
      'cloud', 'theatre', new Map());

    expect(res.decision).toBe('APPLY');
    expect(deletes(log)).toHaveLength(0);
    expect(inserts(log)).toHaveLength(1);
  });

  it('suppresses capture, so resolving a collision does not ship back', async () => {
    const { db, log } = fakeDb({
      rival: { id: 'local-draft', sync_version: 1, sync_hlc: '2026-09-01T10:00:00Z-000' },
    });
    await applyEntry(db, draft('cloud-draft', '2026-09-07T10:00:00Z-000'),
      'cloud', 'theatre', new Map());

    const applying = log.findIndex((r) => r.sql.includes("'orm.sync_applying','on'"));
    const delIdx = log.findIndex((r) => /^\s*delete from/i.test(r.sql));
    expect(applying).toBeGreaterThanOrEqual(0);
    // The delete must be inside the suppressed block, not before it.
    expect(delIdx).toBeGreaterThan(applying);
  });
});

describe('a collision on a table that is not LWW', () => {
  it('is quarantined rather than resolved by timestamp', async () => {
    // patients is QUARANTINE class. Two rows claiming one identity on clinical
    // content is a person's decision, not a comparison's — and it must not be
    // silently deleted the way a superseded draft is.
    const entry: JournalEntryWire = {
      ...draft('cloud-patient', '2026-09-07T10:00:00Z-000'),
      table: 'patients',
      payload: { id: 'cloud-patient', ptNumber: 'PT1', name: 'A' },
    };
    const { db, log } = fakeDb({
      rival: { id: 'local-patient', sync_version: 1, sync_hlc: '2026-09-01T10:00:00Z-000' },
      uniqueCols: ['ptNumber'],
    });

    const res = await applyEntry(db, entry, 'cloud', 'theatre', new Map());

    expect(res.decision).toBe('QUARANTINE');
    expect(res.reason).toMatch(/unique key/i);
    expect(deletes(log)).toHaveLength(0);
  });
});
