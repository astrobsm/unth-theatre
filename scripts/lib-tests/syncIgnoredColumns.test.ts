/**
 * A column may be ignored by the sync, or protected by it, but never both.
 *
 * WHY THIS MATTERS. sync_ignored_columns names columns whose change does not
 * by itself justify a journal entry — a sweeper's lastCheckedAt, say. The
 * trigger implements that by leaving them out of the diff, which also leaves
 * them out of changed_cols.
 *
 * decide() reads changed_cols for exactly one purpose: on an LWW table it
 * quarantines any incoming write that touches a PROTECTED_COLUMN, so a person
 * confirms it rather than a timestamp comparison. A column that was both
 * ignored and protected would therefore be invisible to that guard — the write
 * would apply automatically, and the protection would be gone without anything
 * failing or saying so.
 *
 * Neither list is long, and both are edited rarely, which is exactly the
 * condition in which nobody thinks to check the other one.
 *
 * THE VOLUME THIS EXISTS TO CONTROL, for context on why the ignore list is
 * worth having at all. On 23 September 2026 the emergency escalation runner
 * was stamping lastCheckedAt on 26 unresolved escalations every ~25 seconds.
 * In one half-hour window that produced 1,853 of the 2,502 journal entries the
 * theatre server had to apply — 74% of the stream — while the surgeries a
 * theatre was actually waiting for arrived at 21 per half hour behind them.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import { PROTECTED_COLUMNS, TABLE_POLICIES } from '../../src/lib/sync/syncPolicy';

const MIGRATIONS = path.join(__dirname, '../../prisma/migrations');
const SCHEMA = path.join(__dirname, '../../prisma/schema.prisma');

interface Ignored { table: string; column: string }

/** What the migrations register in sync_ignored_columns. */
function ignoredColumns(): Ignored[] {
  const out: Ignored[] = [];

  for (const dir of fs.readdirSync(MIGRATIONS).sort()) {
    const file = path.join(MIGRATIONS, dir, 'migration.sql');
    if (!fs.existsSync(file)) continue;
    const sql = fs.readFileSync(file, 'utf8').replace(/--[^\n]*/g, '');

    for (const stmt of sql.matchAll(
      /INSERT\s+INTO\s+sync_ignored_columns\s*\([^)]*\)\s*VALUES([\s\S]*?);/gi
    )) {
      for (const tuple of stmt[1].matchAll(/\(([^)]*)\)/g)) {
        const parts = tuple[1].split(',').map((p) => p.trim());
        // Only tuples of quoted literals are VALUES; an ON CONFLICT target
        // is also a parenthesised pair.
        if (!/^'.*'$/.test(parts[0] ?? '') || !/^'.*'$/.test(parts[1] ?? '')) continue;
        out.push({
          table: parts[0].replace(/^'|'$/g, ''),
          column: parts[1].replace(/^'|'$/g, ''),
        });
      }
    }
  }
  return out;
}

/** Every column the Prisma schema declares, as "table.column". */
function schemaColumns(): Set<string> {
  const sql = fs.readFileSync(SCHEMA, 'utf8');
  const out = new Set<string>();

  for (const m of sql.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const body = m[2];
    const mapped = body.match(/@@map\("([^"]+)"\)/);
    const table = mapped ? mapped[1] : m[1];
    for (const line of body.split('\n')) {
      const f = line.match(/^\s{2}(\w+)\s+(\w+)(\?)?(\[\])?\s*(.*)$/);
      if (!f) continue;
      if (/@relation\(/.test(f[5]) && !/@db\./.test(f[5])) continue;
      if (f[4]) continue;
      out.add(`${table}.${f[1]}`);
    }
  }
  return out;
}

describe('columns the sync ignores', () => {
  const ignored = ignoredColumns();
  const columns = schemaColumns();

  it('reads the migrations and the schema at all', () => {
    // Every assertion below is vacuous on an empty parse.
    expect(columns.size).toBeGreaterThan(500);
    expect(ignored.length).toBeGreaterThan(0);
  });

  it('never ignores a column that is also protected', () => {
    // The dangerous overlap. An ignored column is absent from changed_cols,
    // so decide() cannot see that a protected column was touched, and the
    // quarantine that should have asked a person never fires.
    const both = ignored
      .filter((i) => PROTECTED_COLUMNS[i.table]?.has(i.column))
      .map((i) => `${i.table}.${i.column}`)
      .sort();

    expect(both).toEqual([]);
  });

  it('only ignores columns that exist', () => {
    // A stale entry silently stops suppressing anything, so the flood it was
    // added to stop comes back with nothing to show it ever went away.
    const unknown = ignored
      .filter((i) => !columns.has(`${i.table}.${i.column}`))
      .map((i) => `${i.table}.${i.column}`)
      .sort();

    expect(unknown).toEqual([]);
  });

  it('only ignores columns on tables the sync knows about', () => {
    const classified = new Set(TABLE_POLICIES.map((p) => p.table));
    const strays = ignored
      .filter((i) => !classified.has(i.table))
      .map((i) => i.table)
      .sort();

    expect(strays).toEqual([]);
  });

  it('suppresses the escalation sweep that drowned the pull', () => {
    // The specific regression, by name. 1,853 entries in half an hour from 26
    // rows, none of them carrying a clinical fact.
    expect(
      ignored.some(
        (i) => i.table === 'emergency_delay_escalations' && i.column === 'lastCheckedAt'
      )
    ).toBe(true);
  });
});
