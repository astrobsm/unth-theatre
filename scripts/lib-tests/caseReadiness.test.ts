import { describe, it, expect } from 'vitest';
import { readinessOf, readinessTone, type CaseDeposit } from '../../src/lib/specialNeeds/readiness';

// Read by the surgeon's dashboard, the anaesthetist's and the nurses'. The
// failure this guards is three screens answering the same question
// differently, so a case is wheeled in on one team's understanding and
// turned away on another's.

const side = (status: 'UNPAID' | 'PAID' | 'WAIVED', packedAt: Date | null = null) => ({
  status,
  packedAt,
});

const deposit = (c: CaseDeposit['consumable'], p: CaseDeposit['pharmacy']): CaseDeposit => ({
  consumable: c,
  pharmacy: p,
});

const NOW = new Date('2026-10-25T06:00:00Z');

describe('ready means paid AND packed, on both sides', () => {
  it('is ready only when all four are true', () => {
    const r = readinessOf(deposit(side('PAID', NOW), side('PAID', NOW)));
    expect(r.ready).toBe(true);
    expect(r.state).toBe('READY');
    expect(r.outstanding).toEqual([]);
  });

  it('a waiver counts as settled', () => {
    // A waived deposit is a decision somebody made, not an unpaid bill.
    const r = readinessOf(deposit(side('WAIVED', NOW), side('WAIVED', NOW)));
    expect(r.ready).toBe(true);
  });

  it('paid but not packed is NOT ready', () => {
    // The patient would wait at the door.
    const r = readinessOf(deposit(side('PAID', NOW), side('PAID', null)));
    expect(r.ready).toBe(false);
    expect(r.state).toBe('AWAITING_PACKING');
    expect(r.outstanding.join(' ')).toMatch(/Pharmacy pack/);
  });

  it('packed but not paid is NOT ready', () => {
    // The store is holding a pack nobody has paid for.
    const r = readinessOf(deposit(side('UNPAID', NOW), side('PAID', NOW)));
    expect(r.ready).toBe(false);
    expect(r.outstanding.join(' ')).toMatch(/Consumable deposit not paid/);
  });
});

describe('what is reported, and to whom it sends people', () => {
  it('does not report packing against an unpaid side', () => {
    // "Pack not made up" on an unpaid case sends the surgeon to the store,
    // who will rightly send them to the cashier.
    const r = readinessOf(deposit(side('UNPAID', null), side('UNPAID', null)));
    expect(r.outstanding.some((o) => /not yet made up/.test(o))).toBe(false);
    expect(r.outstanding).toHaveLength(2);
  });

  it('reports packing once the money is in', () => {
    const r = readinessOf(deposit(side('PAID', null), side('PAID', null)));
    expect(r.outstanding.every((o) => /not yet made up/.test(o))).toBe(true);
  });

  it('names both sides separately, because different people chase them', () => {
    const r = readinessOf(deposit(side('UNPAID', null), side('PAID', NOW)));
    expect(r.outstanding.join(' ')).toMatch(/Consumable/);
    expect(r.outstanding.join(' ')).not.toMatch(/Pharmacy deposit not paid/);
  });
});

describe('no record at all is its own answer', () => {
  it('reports NOT_SET rather than unpaid', () => {
    // Unpaid means send the patient to the cashier. Not set means nobody
    // priced the case. Showing "unpaid" sends relatives to a desk that
    // cannot help them.
    for (const empty of [null, undefined]) {
      const r = readinessOf(empty as never);
      expect(r.state).toBe('NOT_SET');
      expect(r.ready).toBe(false);
      expect(r.summary).not.toMatch(/not paid/i);
    }
  });
});

describe('the badge colour is decided in one place', () => {
  it.each([
    ['READY', 'green'],
    ['AWAITING_PACKING', 'amber'],
    ['AWAITING_PAYMENT', 'red'],
    ['AWAITING_BOTH', 'red'],
    ['NOT_SET', 'grey'],
  ] as const)('%s is %s', (state, tone) => {
    expect(readinessTone(state)).toBe(tone);
  });

  it('never shows green for anything that is not ready', () => {
    const notReady = ['AWAITING_PACKING', 'AWAITING_PAYMENT', 'AWAITING_BOTH', 'NOT_SET'] as const;
    for (const s of notReady) expect(readinessTone(s)).not.toBe('green');
  });
});

describe('every state carries a usable summary', () => {
  it.each([
    [deposit(side('PAID', NOW), side('PAID', NOW))],
    [deposit(side('PAID', null), side('PAID', null))],
    [deposit(side('UNPAID', null), side('UNPAID', null))],
    [deposit(side('UNPAID', null), side('PAID', NOW))],
  ])('case %#', (d) => {
    const r = readinessOf(d);
    expect(r.summary.length).toBeGreaterThan(10);
    // A dashboard line that says nothing is a dashboard line nobody reads.
    expect(r.summary).not.toBe('');
    if (!r.ready) expect(r.outstanding.length).toBeGreaterThan(0);
  });
});
