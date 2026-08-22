/**
 * Effective-dated prices. The property that matters: a bill raised in March
 * must still reprice to March's figures after the price list is updated in
 * June. Everything here exists to protect that.
 */
import { describe, expect, it } from 'vitest';

import {
  isEffective,
  isRealPriceChange,
  planSupersede,
  priceForCode,
  priceForItem,
  priceHistory,
  priceOn,
} from '../../src/lib/billing/pricing';

const t = (o: Record<string, unknown>) => ({
  id: 'x',
  code: 'THEATRE-MAJOR',
  name: 'Major theatre fee',
  kind: 'THEATRE',
  amount: 100_00,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  ...o,
}) as never;

describe('whether a price is in force', () => {
  it('applies from its start date inclusive', () => {
    expect(isEffective(t({ effectiveFrom: '2026-03-01' }), '2026-03-01')).toBe(true);
  });

  it('does not apply the day before it starts', () => {
    expect(isEffective(t({ effectiveFrom: '2026-03-01' }), '2026-02-28')).toBe(false);
  });

  it('stops on its end date exclusive', () => {
    // End-exclusive is what makes a handover produce exactly one winner.
    const p = t({ effectiveFrom: '2026-01-01', effectiveTo: '2026-04-01' });
    expect(isEffective(p, '2026-03-31')).toBe(true);
    expect(isEffective(p, '2026-04-01')).toBe(false);
  });

  it('an open-ended price is still in force years later', () => {
    expect(isEffective(t({ effectiveTo: null }), '2030-01-01')).toBe(true);
  });

  it('the time of day never decides which price applies', () => {
    const p = t({ effectiveFrom: '2026-03-01' });
    expect(isEffective(p, new Date('2026-03-01T00:00:01Z'))).toBe(true);
    expect(isEffective(p, new Date('2026-03-01T23:59:59Z'))).toBe(true);
  });
});

describe('picking the price for a date', () => {
  const march = t({ id: 'march', amount: 100_00, effectiveFrom: '2026-01-01', effectiveTo: '2026-04-01' });
  const june = t({ id: 'june', amount: 150_00, effectiveFrom: '2026-04-01', effectiveTo: null });

  it('a March bill reprices to the March figure even after June’s rise', () => {
    // This is the whole point of the module.
    expect(priceOn([march, june], '2026-03-15')?.amount).toBe(100_00);
  });

  it('and a bill raised today gets today’s figure', () => {
    expect(priceOn([march, june], '2026-06-15')?.amount).toBe(150_00);
  });

  it('the handover day has exactly one winner', () => {
    expect(priceOn([march, june], '2026-04-01')?.id).toBe('june');
  });

  it('returns null when nothing was in force yet', () => {
    expect(priceOn([march, june], '2025-12-31')).toBeNull();
  });

  it('when rows overlap, the one that started later wins', () => {
    // A correct supersede never produces this, but a hand-edited catalogue can,
    // and the answer must not depend on database row order.
    const older = t({ id: 'older', amount: 100_00, effectiveFrom: '2026-01-01' });
    const newer = t({ id: 'newer', amount: 200_00, effectiveFrom: '2026-02-01' });
    expect(priceOn([older, newer], '2026-03-01')?.id).toBe('newer');
    expect(priceOn([newer, older], '2026-03-01')?.id).toBe('newer');
  });
});

describe('looking a price up', () => {
  const rows = [
    t({ id: 'a', code: 'THEATRE-MAJOR', amount: 100_00 }),
    t({ id: 'b', code: 'THEATRE-MINOR', amount: 40_00 }),
    t({ id: 'c', code: 'ITEM', itemId: 'item-1', amount: 25_00 }),
  ];

  it('finds by code', () => {
    expect(priceForCode(rows, 'THEATRE-MINOR', '2026-06-01')?.amount).toBe(40_00);
  });

  it('finds by stock item', () => {
    expect(priceForItem(rows, 'item-1', '2026-06-01')?.amount).toBe(25_00);
  });

  it('returns null for something unpriced rather than guessing', () => {
    expect(priceForCode(rows, 'NOT-PRICED', '2026-06-01')).toBeNull();
    expect(priceForItem(rows, 'item-99', '2026-06-01')).toBeNull();
  });
});

describe('superseding a price', () => {
  const current = t({ id: 'current', amount: 100_00, effectiveFrom: '2026-01-01' });

  it('closes the old row exactly where the new one starts', () => {
    const plan = planSupersede({ current, newAmount: 150_00, effectiveFrom: '2026-07-01' });
    expect(plan.closeId).toBe('current');
    expect(plan.closeOn?.toISOString().slice(0, 10)).toBe('2026-07-01');
    expect(plan.openFrom.toISOString().slice(0, 10)).toBe('2026-07-01');
    expect(plan.openAmount).toBe(150_00);
  });

  it('leaves no gap and no overlap', () => {
    const plan = planSupersede({ current, newAmount: 150_00, effectiveFrom: '2026-07-01' });
    const closed = t({ id: 'current', amount: 100_00, effectiveFrom: '2026-01-01', effectiveTo: plan.closeOn });
    const opened = t({ id: 'new', amount: 150_00, effectiveFrom: plan.openFrom });
    // Exactly one price applies on the day of the change, and on either side.
    expect(priceOn([closed, opened], '2026-06-30')?.amount).toBe(100_00);
    expect(priceOn([closed, opened], '2026-07-01')?.amount).toBe(150_00);
  });

  it('pricing something for the first time closes nothing', () => {
    const plan = planSupersede({ current: null, newAmount: 90_00, effectiveFrom: '2026-07-01' });
    expect(plan.closeId).toBeNull();
    expect(plan.closeOn).toBeNull();
  });

  it('knows when a change is not a change', () => {
    expect(isRealPriceChange(current, 100_00)).toBe(false);
    expect(isRealPriceChange(current, 100_01)).toBe(true);
    expect(isRealPriceChange(null, 100_00)).toBe(true);
  });
});

describe('price history', () => {
  it('reads newest first', () => {
    const rows = [
      t({ id: 'old', amount: 80_00, effectiveFrom: '2025-01-01', effectiveTo: '2026-01-01' }),
      t({ id: 'new', amount: 150_00, effectiveFrom: '2026-07-01' }),
      t({ id: 'mid', amount: 100_00, effectiveFrom: '2026-01-01', effectiveTo: '2026-07-01' }),
    ];
    expect(priceHistory(rows, 'THEATRE-MAJOR').map((r) => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('ignores other codes', () => {
    const rows = [t({ id: 'a', code: 'A' }), t({ id: 'b', code: 'B' })];
    expect(priceHistory(rows, 'A')).toHaveLength(1);
  });
});
