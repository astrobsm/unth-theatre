/**
 * The two pieces of the sync layer that must be provably correct.
 *
 * Everything else is plumbing that fails loudly. These two fail QUIETLY: a
 * clock that orders events wrongly, or a policy that overwrites the wrong
 * side, produces a database that looks healthy and contains the wrong record.
 */
import { describe, expect, it } from 'vitest';

import {
  HybridLogicalClock,
  MAX_DRIFT_MS,
  compareHlc,
  formatHlc,
  parseHlc,
} from './sync/hlc';
import {
  SURGERY_CLINICAL_COLUMNS,
  TABLE_POLICIES,
  decide,
  isSynced,
  policyFor,
  type IncomingChange,
} from './sync/syncPolicy';

const NODES = { thisNode: 'local-unth', cloudNode: 'cloud' };

describe('the clock survives a broken system clock', () => {
  it('keeps issuing increasing stamps when time jumps BACKWARDS a year', () => {
    // Exactly the router's observed failure: a clock a year adrift until it
    // reaches a time service. Under last-write-wins on wall time this would
    // silently win or lose every conflict for a year.
    let now = Date.parse('2026-08-09T12:00:00Z');
    const clock = new HybridLogicalClock('local-unth', () => now);

    const before = clock.tick();
    now = Date.parse('2025-09-11T09:00:00Z'); // the jump
    const after = clock.tick();

    expect(compareHlc(after, before)).toBeGreaterThan(0);
    expect(after.physical).toBe(before.physical); // physical held, counter moved
    expect(after.counter).toBe(before.counter + 1);
  });

  it('never issues the same stamp twice, even within one millisecond', () => {
    const now = 1_000_000;
    const clock = new HybridLogicalClock('n1', () => now);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(formatHlc(clock.tick()));
    expect(seen.size).toBe(500);
  });

  it('advances past a stamp it receives, so causality holds', () => {
    const now = 1_000;
    const local = new HybridLogicalClock('local-unth', () => now);
    const remote = { physical: 5_000, counter: 3, node: 'cloud' };

    const { stamp } = local.receive(remote);
    expect(compareHlc(stamp, remote)).toBeGreaterThan(0);
    // Anything stamped afterwards also sorts after the remote event.
    expect(compareHlc(local.tick(), remote)).toBeGreaterThan(0);
  });

  it('refuses to inherit a wildly wrong clock from a peer', () => {
    // Without the cap, one machine set to 2099 drags both nodes forward
    // permanently and every later comparison is meaningless.
    const now = Date.parse('2026-08-09T12:00:00Z');
    const local = new HybridLogicalClock('local-unth', () => now);
    const insane = { physical: now + MAX_DRIFT_MS * 10, counter: 0, node: 'cloud' };

    const { stamp, rejectedDrift } = local.receive(insane);
    expect(rejectedDrift).toBe(true);
    expect(stamp.physical).toBeLessThanOrEqual(now);
  });

  it('orders identically on both nodes when they stamp in the same millisecond', () => {
    // If the two sides disagreed about who won, they would converge to
    // different rows — the one failure a sync layer must never have.
    const a = { physical: 42, counter: 0, node: 'cloud' };
    const b = { physical: 42, counter: 0, node: 'local-unth' };
    expect(Math.sign(compareHlc(a, b))).toBe(-Math.sign(compareHlc(b, a)));
    expect(compareHlc(a, b)).not.toBe(0);
  });

  it('serialises so that plain string comparison matches compareHlc', () => {
    // The journal sorts by the string form in SQL; if the two orderings
    // disagreed, SQL would replay events out of order.
    const clock = new HybridLogicalClock('n1', (() => { let t = 1000; return () => (t += 7); })());
    const stamps = Array.from({ length: 50 }, () => clock.tick());
    for (let i = 1; i < stamps.length; i++) {
      expect(formatHlc(stamps[i]) > formatHlc(stamps[i - 1])).toBe(true);
    }
    expect(parseHlc(formatHlc(stamps[0]))).toEqual(stamps[0]);
  });
});

describe('the policy table', () => {
  it('refuses to sync a table nobody classified', () => {
    // The default must be silence, not a guess.
    expect(isSynced('some_table_nobody_thought_about')).toBe(false);
    const d = decide(
      { table: 'some_table_nobody_thought_about', op: 'UPDATE', baseVersion: 1, hlc: 'z', originNode: 'cloud' },
      { exists: true, version: 2, hlc: 'a' }, NODES);
    expect(d.action).toBe('IGNORE');
  });

  it('gives every classified table a stated reason', () => {
    for (const p of TABLE_POLICIES) {
      expect(p.why.length, p.table).toBeGreaterThan(20);
    }
  });

  it('classifies consent and operative records as quarantine, never LWW', () => {
    for (const t of ['post_op_notes', 'prescriptions', 'anaesthesia_consents', 'pre_op_visits']) {
      expect(policyFor(t)?.cls, t).toBe('QUARANTINE');
    }
  });
});

const change = (over: Partial<IncomingChange> = {}): IncomingChange => ({
  table: 'surgeries', op: 'UPDATE', baseVersion: 5, hlc: 'B', originNode: 'cloud', ...over,
});

describe('deciding what to do with an incoming change', () => {
  it('applies anything for a row we do not hold', () => {
    expect(decide(change(), null, NODES).action).toBe('APPLY');
  });

  it('applies when the sender was working from our current version', () => {
    expect(decide(change({ baseVersion: 5 }), { exists: true, version: 5, hlc: 'A' }, NODES).action).toBe('APPLY');
  });

  it('ignores a delete for a row we never had', () => {
    expect(decide(change({ op: 'DELETE' }), null, NODES).action).toBe('IGNORE');
  });

  it('ignores a change already superseded locally', () => {
    expect(decide(change({ baseVersion: 2, hlc: 'A' }), { exists: true, version: 9, hlc: 'B' }, NODES).action)
      .toBe('IGNORE');
  });
});

describe('conflicts, by class', () => {
  const conflicting = { exists: true, version: 9, hlc: 'A' };

  it('unions concurrent inserts on an append-only table', () => {
    expect(decide(change({ table: 'theatre_milestones', op: 'INSERT', hlc: 'B' }), conflicting, NODES).action)
      .toBe('APPLY');
  });

  it('flags an UPDATE on an append-only table as a misclassification', () => {
    // Silently applying it would hide that the table is not what we declared.
    const d = decide(change({ table: 'audit_logs', op: 'UPDATE', hlc: 'B' }), conflicting, NODES);
    expect(d.action).toBe('QUARANTINE');
    expect(d.reason).toContain('classification');
  });

  it('lets the cloud win on identity, and refuses the local side', () => {
    expect(decide(change({ table: 'users', originNode: 'cloud', hlc: 'B' }), conflicting, NODES).action)
      .toBe('APPLY');
    expect(decide(change({ table: 'users', originNode: 'local-unth', hlc: 'Z' }), conflicting, NODES).action)
      .toBe('IGNORE');
  });

  it('never overwrites clinical content, whichever side is newer', () => {
    for (const hlc of ['A', 'Z']) {
      expect(decide(change({ table: 'post_op_notes', hlc }), conflicting, NODES).action).toBe('QUARANTINE');
    }
  });

  it('resolves administrative conflicts by clock', () => {
    expect(decide(change({ table: 'theatre_allocations', hlc: 'Z' }), conflicting, NODES).action).toBe('APPLY');
    expect(decide(change({ table: 'theatre_allocations', hlc: 'A' }), { exists: true, version: 9, hlc: 'B' }, NODES).action)
      .toBe('IGNORE');
  });

  it('quarantines a clinical COLUMN even on an administrative table', () => {
    // surgeries is LWW because scheduling churn dominates, but a haemoglobin
    // or a consent flag on that row is a clinical claim and must not be
    // overwritten by a node that merely stamped later.
    const d = decide(
      change({ table: 'surgeries', hlc: 'Z', changedColumns: ['recentHb'] }), conflicting, NODES);
    expect(d.action).toBe('QUARANTINE');

    // ...while a pure scheduling change on the same table still resolves.
    expect(decide(change({ table: 'surgeries', hlc: 'Z', changedColumns: ['scheduledTime'] }), conflicting, NODES).action)
      .toBe('APPLY');
  });

  it('lists the clinical columns that trigger that exception', () => {
    for (const c of ['recentHb', 'consentFileData', 'consentCompletedAt', 'potassium']) {
      expect(SURGERY_CLINICAL_COLUMNS.has(c), c).toBe(true);
    }
    expect(SURGERY_CLINICAL_COLUMNS.has('scheduledTime')).toBe(false);
  });
});

describe('both nodes reach the same answer', () => {
  it('never applies a change on one side that the other would ignore', () => {
    // Convergence check: for an LWW row, exactly one direction applies.
    const local = { exists: true, version: 4, hlc: '000000000001000:000000:local-unth' };
    const fromCloud = change({ table: 'theatre_allocations', baseVersion: 3, hlc: '000000000002000:000000:cloud' });

    const atLocal = decide(fromCloud, local, NODES);
    const mirrored = decide(
      { ...fromCloud, hlc: local.hlc, originNode: 'local-unth', baseVersion: 3 },
      { exists: true, version: 4, hlc: fromCloud.hlc }, { thisNode: 'cloud', cloudNode: 'cloud' });

    expect(atLocal.action).toBe('APPLY');
    expect(mirrored.action).toBe('IGNORE');
  });
});
