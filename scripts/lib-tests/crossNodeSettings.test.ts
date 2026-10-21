/**
 * Settings one person changes expecting another node to obey.
 *
 * radio_settings shipped without replication and the failure was completely
 * silent. The slider moved. The cloud's own players obeyed it. The corridor
 * speaker in theatre — served by the theatre server, reading the theatre
 * server's own row — carried on at full volume, and nothing anywhere
 * reported a fault, because nothing had failed. Every part worked; the two
 * halves had simply never been introduced.
 *
 * That is the shape of the bug this file exists for: a table written on one
 * node and READ ON ANOTHER, where forgetting `sync_enable_table` produces no
 * error, no log line and no missing feature — just a control that does
 * nothing to the room it names.
 *
 * Add a table here whenever somebody sets it in one place and expects it to
 * take effect in another.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import { TABLE_POLICIES } from '../../src/lib/sync/syncPolicy';

const MIGRATIONS = path.join(__dirname, '../../prisma/migrations');

/**
 * Tables a human changes on one node intending another node to follow.
 *
 * Each says who sets it and who has to obey, because that sentence is the
 * test: if it is true, the table must replicate.
 */
const MUST_REACH_THE_OTHER_NODE: Array<{ table: string; why: string }> = [
  {
    table: 'radio_settings',
    why: 'Set from anywhere — the point is turning the theatre down from home — '
      + 'and read by the radio players the theatre server serves.',
  },
];

/** Tables some migration switches capture on for. Mirrors syncCapture.test.ts. */
function capturedTables(): Set<string> {
  const captured = new Set<string>();
  for (const dir of fs.readdirSync(MIGRATIONS).sort()) {
    const file = path.join(MIGRATIONS, dir, 'migration.sql');
    if (!fs.existsSync(file)) continue;
    const sql = fs.readFileSync(file, 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/--[^\n]*/g, '');
    if (sql.includes('sync_enable_table')) {
      for (const m of sql.matchAll(/sync_enable_table\(\s*'([a-z_]+)'\s*\)/g)) captured.add(m[1]);
      for (const b of sql.matchAll(/ARRAY\s*\[([^\]]*)\]/gi)) {
        for (const l of b[1].matchAll(/'([a-z_]+)'/g)) captured.add(l[1]);
      }
    }
    for (const d of sql.matchAll(
      /DROP\s+TRIGGER\s+IF\s+EXISTS\s+zz_sync_capture(?:_del)?\s+ON\s+"?([a-z_]+)"?/gi
    )) captured.delete(d[1]);
  }
  return captured;
}

describe('settings that must cross between nodes', () => {
  const captured = capturedTables();
  const classified = new Map(TABLE_POLICIES.map((p) => [p.table, p.cls]));

  it('reads the migrations and the policy at all', () => {
    // Every assertion below passes vacuously on an empty parse.
    expect(captured.size).toBeGreaterThan(10);
    expect(classified.size).toBeGreaterThan(20);
  });

  for (const { table, why } of MUST_REACH_THE_OTHER_NODE) {
    it(`${table} replicates — ${why}`, () => {
      expect(captured.has(table), `${table} has no sync_enable_table call`).toBe(true);
    });

    it(`${table} is classified for the merge`, () => {
      // Captured but unclassified is its own silent fault: rows travel and
      // the merge has no rule for them.
      expect(classified.has(table), `${table} is missing from TABLE_POLICIES`).toBe(true);
    });

    it(`${table} resolves by last write`, () => {
      // A setting is not append-only history and neither node owns it: the
      // useful answer is simply the most recent one. CLOUD_AUTHORITATIVE
      // would mean the theatre could never adjust its own volume.
      expect(classified.get(table)).toBe('LWW');
    });
  }
});
