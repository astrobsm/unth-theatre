/**
 * The financial authority rule, and the thing it depends on staying true.
 *
 * WHY THIS SUITE EXISTS. ORM's billing tables do not replicate between the
 * theatre server and the cloud. That was never a decision anybody recorded —
 * it is simply what happens to a table nobody classified, and the audit of
 * 27 September 2026 found it by checking every table against syncPolicy rather
 * than by reading anything.
 *
 * lib/financial/authority.ts now states the rule out loud: one node is
 * authoritative for each financial operation, because the tables do not
 * replicate. That reasoning is only sound WHILE they do not replicate.
 *
 * The dangerous change is therefore not someone editing the rule. It is
 * someone adding `invoices` to TABLE_POLICIES for a perfectly good reason,
 * without knowing that a file somewhere else justifies single-node authority
 * on the grounds that it is absent. The rule would still read correctly and
 * would no longer be true.
 *
 * So the two are tied together here. Make a financial table replicate and this
 * fails by name, and whoever did it has to come and revisit the authority rule
 * — which is the conversation worth forcing.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
  FINANCIAL_AUTHORITY, checkAuthority, describeAuthority, __resetNodeCache,
  type FinancialOperation,
} from '../../src/lib/financial/authority';
import { TABLE_POLICIES } from '../../src/lib/sync/syncPolicy';

const OPS = Object.keys(FINANCIAL_AUTHORITY) as FinancialOperation[];

/**
 * Tables the authority rule assumes are single-node because they do not
 * replicate. Stock is the exception and is listed separately below.
 */
const ASSUMED_UNREPLICATED = [
  'invoices',
  'invoice_payments',
  'revenue_distributions',
  'tariffs',
];

describe('the financial authority rule', () => {
  it('declares every operation with a table and a reason', () => {
    // A rule with no stated reason is a rule nobody can evaluate later, which
    // is how the unwritten one got there.
    expect(OPS.length).toBeGreaterThan(0);
    for (const op of OPS) {
      const rule = FINANCIAL_AUTHORITY[op];
      expect(rule.table, `${op} has no table`).toBeTruthy();
      expect(rule.why.length, `${op} has no reason worth reading`).toBeGreaterThan(40);
    }
  });

  it('only enforces what cannot break a theatre list', () => {
    // Enforcement refuses work. Refusing an invoice or a cash receipt on the
    // theatre server would stop a hospital that is currently functioning, to
    // satisfy an architectural preference. Only the operations that move money
    // outward, or that can only ever arrive at the cloud, are refused.
    const enforced = OPS.filter((op) => FINANCIAL_AUTHORITY[op].enforcement === 'ENFORCED');
    expect(enforced.sort()).toEqual(['CONFIRM_GATEWAY_PAYMENT', 'SETTLE_DISTRIBUTION']);
  });

  it('never enforces an operation that happens in the operating theatre', () => {
    // The property behind the previous test, stated so it survives someone
    // deciding to add a third enforced operation.
    for (const op of ['RESERVE_STOCK', 'RECORD_CONSUMPTION'] as FinancialOperation[]) {
      expect(FINANCIAL_AUTHORITY[op].enforcement, `${op} must not be enforced`).toBe('REPORTED');
      expect(FINANCIAL_AUTHORITY[op].scope, `${op} must work on either node`).toBe('EITHER');
    }
  });
});

describe('the assumption the rule rests on', () => {
  const replicated = new Set(TABLE_POLICIES.map((p) => p.table));

  it('reads the sync policy at all', () => {
    // Vacuous otherwise, and a silently empty policy would make every
    // assertion below pass while proving nothing.
    expect(replicated.size).toBeGreaterThan(20);
    expect(replicated.has('surgeries')).toBe(true);
  });

  it('the billing tables still do not replicate', () => {
    // THE IMPORTANT ONE. If this fails, someone has classified a billing table
    // for sync, and lib/financial/authority.ts is now justifying single-node
    // authority with a premise that is no longer true. Revisit the rule before
    // silencing this.
    const nowReplicated = ASSUMED_UNREPLICATED.filter((t) => replicated.has(t)).sort();
    expect(nowReplicated).toEqual([]);
  });

  it('stock movements DO replicate, which is what makes EITHER safe for stock', () => {
    // The other half. Reserving and consuming stock is allowed on both nodes
    // precisely because the quantities travel as an append-only ledger. Remove
    // that and the permission stops being safe.
    const movements = TABLE_POLICIES.find((p) => p.table === 'stock_movements');
    expect(movements, 'stock_movements is no longer replicated').toBeDefined();
    expect(movements!.cls).toBe('APPEND_ONLY');
  });
});

describe('deciding on a real node', () => {
  beforeEach(() => { __resetNodeCache(); });

  // These run against whatever database the test environment has, which in CI
  // is none. thisNodeKind() answers UNKNOWN there, and UNKNOWN is a meaningful
  // case in its own right: a database that cannot say which node it is.
  it('refuses an enforced operation when the node is unknown', async () => {
    const d = await checkAuthority('SETTLE_DISTRIBUTION');
    if (d.node === 'UNKNOWN') {
      expect(d.allowed).toBe(false);
      expect(d.correctNode).toBe(false);
      expect(d.reason).toMatch(/does not know which node/i);
    } else {
      // A real node answered; the decision must still be internally consistent.
      expect(d.correctNode).toBe(d.node === 'CLOUD');
    }
  });

  it('allows a reported breach, but still says it is a breach', async () => {
    // The distinction the whole design turns on. An operation that is being
    // tolerated is not the same as one that is correct, and a caller must be
    // able to tell them apart in order to record the difference.
    const d = await checkAuthority('SET_TARIFF');
    if (!d.correctNode) {
      expect(d.allowed).toBe(true);
      expect(d.reason).toBeTruthy();
    }
  });

  it('always allows stock work, wherever it runs', async () => {
    for (const op of ['RESERVE_STOCK', 'RECORD_CONSUMPTION'] as FinancialOperation[]) {
      const d = await checkAuthority(op);
      expect(d.allowed, `${op} was refused`).toBe(true);
      expect(d.correctNode, `${op} was called a breach`).toBe(true);
    }
  });

  it('describes every operation for an operator', async () => {
    const report = await describeAuthority();
    expect(report.operations).toHaveLength(OPS.length);
    for (const o of report.operations) {
      expect(o.why.length).toBeGreaterThan(40);
      expect(['CLOUD_ONLY', 'LOCAL_ONLY', 'EITHER']).toContain(o.scope);
    }
  });
});
