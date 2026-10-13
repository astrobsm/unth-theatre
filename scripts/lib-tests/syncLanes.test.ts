/**
 * The priority lane, and the three things that make it safe.
 *
 * On 13 October the theatre server returned after three weeks and had 4,787
 * entries to pull. Ten were that morning's cases. Because the journal is
 * ordered strictly by hybrid logical clock, those ten — being the newest —
 * sat at the very back, behind 2,319 consumable requests, 547 radio messages
 * and 431 audit logs. A surgeon watched "No cases booked for this date" for
 * twenty minutes while chatter was delivered first.
 *
 * The lane fixes that by draining a short list of tables ahead of the rest.
 * It rests on three premises, and this suite holds each of them:
 *
 *   The lane's tables must ACTUALLY REPLICATE. A priority table that is not
 *   captured is a fast lane with nothing in it, and the symptom is identical
 *   to the lane working perfectly.
 *
 *   The lane must stay SHORT. Every table added dilutes it, and a lane
 *   containing everything is the old queue with extra steps.
 *
 *   Parents must travel WITH their children. A surgery arriving before its
 *   patient fails a foreign key and parks in sync_deferred — which recovers,
 *   but a lane that parks is not a fast lane.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  PRIORITY_TABLES, PRIORITY_TABLE_NAMES, laneOf, isPriorityTable, parseLane,
  PRIORITY_BATCH, BULK_BATCH,
} from '../../src/lib/sync/lanes';
import { TABLE_POLICIES } from '../../src/lib/sync/syncPolicy';

const MIGRATIONS = path.join(__dirname, '../../prisma/migrations');

/** Tables some migration switches capture on for. Mirrors syncCapture.test.ts. */
function capturedTables(): Set<string> {
  const captured = new Set<string>();
  for (const dir of fs.readdirSync(MIGRATIONS).sort()) {
    const file = path.join(MIGRATIONS, dir, 'migration.sql');
    if (!fs.existsSync(file)) continue;
    const sql = fs.readFileSync(file, 'utf8').replace(/--[^\n]*/g, '');
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

describe('the premises the lane rests on', () => {
  const captured = capturedTables();
  const classified = new Set(TABLE_POLICIES.map((p) => p.table));

  it('reads the migrations and the policy at all', () => {
    expect(captured.size).toBeGreaterThan(10);
    expect(classified.size).toBeGreaterThan(20);
  });

  it('every priority table is classified for sync', () => {
    const unclassified = PRIORITY_TABLE_NAMES.filter((t) => !classified.has(t)).sort();
    expect(unclassified).toEqual([]);
  });

  it('every priority table actually has capture switched on', () => {
    // THE IMPORTANT ONE. A table in the lane whose triggers were never
    // enabled, or were later dropped, produces an empty fast lane — and an
    // empty fast lane looks exactly like a fast lane that is working.
    const notCaptured = PRIORITY_TABLE_NAMES.filter((t) => !captured.has(t)).sort();
    expect(notCaptured).toEqual([]);
  });

  it('carries the parent of surgeries', () => {
    // surgeries has a foreign key to patients. Without patients in the lane,
    // a surgery can arrive first, fail, and park — turning the fast lane into
    // the slow one for the exact rows it exists to hurry.
    expect(PRIORITY_TABLE_NAMES).toContain('patients');
    expect(PRIORITY_TABLE_NAMES).toContain('surgeries');
  });

  it('stays short enough to mean something', () => {
    // A lane containing everything is the old queue with extra steps. Eight
    // is a generous ceiling; the failure it guards against is the slow
    // accumulation of "while we are here, this is important too".
    expect(PRIORITY_TABLE_NAMES.length).toBeLessThanOrEqual(8);
  });

  it('excludes the tables that caused the problem', () => {
    // Named explicitly, because these are exactly what somebody would be
    // tempted to add next. They are the volume, not the urgency — they are
    // what the lane exists to overtake.
    for (const bulk of [
      'surgery_consumable_requests', 'radio_announcements', 'audit_logs',
      'surgery_drafts', 'rosters', 'announcements', 'notifications',
    ]) {
      expect(PRIORITY_TABLE_NAMES, `${bulk} must not be in the priority lane`)
        .not.toContain(bulk);
    }
  });

  it('gives a reason for every table in it', () => {
    // The list grows by accretion unless each entry has to justify itself.
    for (const t of PRIORITY_TABLES) {
      expect(t.why.length, `${t.table} has no stated reason`).toBeGreaterThan(40);
    }
  });

  it('names each table once', () => {
    expect(PRIORITY_TABLE_NAMES.length).toBe(new Set(PRIORITY_TABLE_NAMES).size);
  });
});

describe('sorting a table into a lane', () => {
  it('routes the clinical tables to priority', () => {
    expect(laneOf('surgeries')).toBe('priority');
    expect(laneOf('patients')).toBe('priority');
    expect(isPriorityTable('emergency_surgery_bookings')).toBe(true);
  });

  it('routes everything else to bulk', () => {
    expect(laneOf('radio_announcements')).toBe('bulk');
    expect(laneOf('surgery_consumable_requests')).toBe('bulk');
    expect(laneOf('a_table_that_does_not_exist')).toBe('bulk');
    expect(isPriorityTable('audit_logs')).toBe(false);
  });
});

describe('the lane parameter on the wire', () => {
  it('accepts the two real lanes', () => {
    expect(parseLane('priority')).toBe('priority');
    expect(parseLane('bulk')).toBe('bulk');
  });

  it('refuses anything else rather than guessing', () => {
    // A typo silently treated as "bulk" would disable the priority pull and
    // look identical to it working, which is the worst way for this to fail.
    for (const bad of ['Priority', 'PRIORITY', 'urgent', '', null, undefined, 1, {}]) {
      expect(parseLane(bad), `${String(bad)} should not parse`).toBeNull();
    }
  });
});

describe('batch sizes', () => {
  it('gives each lane a usable budget', () => {
    expect(PRIORITY_BATCH).toBeGreaterThan(0);
    expect(BULK_BATCH).toBeGreaterThan(0);
  });

  it('does not starve bulk', () => {
    // Bulk is where the volume is. Starving it would move the backlog rather
    // than clear it, and the chatter does eventually matter.
    expect(BULK_BATCH).toBeGreaterThanOrEqual(PRIORITY_BATCH);
  });
});
