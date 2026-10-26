import { describe, it, expect } from 'vitest';
import {
  quoteFor,
  toKobo,
  formatNaira,
  quoteBreakdown,
  isMagnitude,
  MAGNITUDES,
  CONTINGENCY_RATE,
  type PriceableLine,
} from '../../src/lib/specialNeeds/pricing';

// This decides what a patient is asked to pay before an operation. The two
// ways of being wrong are not symmetrical: too high and a family cannot
// raise it in time, too low and they are asked for the difference at the
// theatre door with the patient already starved.

const line = (over: Partial<PriceableLine> = {}): PriceableLine => ({
  unitPrice: 100,
  quantity: 1,
  dispensedByPharmacy: false,
  name: 'Item',
  ...over,
});

describe('an unpriced line is never treated as free', () => {
  it.each([null, undefined, ''])('counts %s as unpriced, not zero', (price) => {
    const q = quoteFor([line({ unitPrice: price as never, name: 'Mesh' })]);
    expect(q.consumableSubtotalKobo).toBe(0);
    expect(q.unpricedLines).toEqual(['Mesh']);
    expect(q.complete).toBe(false);
  });

  it('refuses a negative or nonsense price rather than subtracting it', () => {
    for (const bad of [-50, 'abc', NaN]) {
      const q = quoteFor([line({ unitPrice: bad as never, name: 'Odd' })]);
      expect(q.totalKobo).toBe(0);
      expect(q.complete).toBe(false);
    }
  });

  it('still prices the lines it can, and says what it could not', () => {
    const q = quoteFor([
      line({ unitPrice: 500, quantity: 2, name: 'Suture' }),
      line({ unitPrice: null, name: 'Mesh' }),
    ]);
    expect(q.consumableSubtotalKobo).toBe(100000);
    expect(q.unpricedLines).toEqual(['Mesh']);
    expect(q.complete).toBe(false);
  });

  it('is complete when everything carries a price', () => {
    expect(quoteFor([line(), line()]).complete).toBe(true);
  });
});

describe('money is counted in whole kobo', () => {
  it('converts naira to kobo exactly', () => {
    expect(toKobo(1)).toBe(100);
    expect(toKobo('1250.50')).toBe(125050);
    expect(toKobo(0)).toBe(0);
  });

  it('does not drift over many lines', () => {
    // Thirty lines at 33.33 is where floats start disagreeing with the
    // receipt. 3333 kobo x 30 = 99990 kobo exactly, every time.
    const lines = Array.from({ length: 30 }, () => line({ unitPrice: '33.33' }));
    expect(quoteFor(lines).consumableSubtotalKobo).toBe(99990);
  });

  it('multiplies after rounding the unit, not before', () => {
    const q = quoteFor([line({ unitPrice: '10.005', quantity: 100 })]);
    // 10.005 rounds to 1001 kobo, x100 = 100100. Not 100050.
    expect(q.consumableSubtotalKobo).toBe(100100);
  });
});

describe('the two sides are kept apart', () => {
  it('sends pharmacy lines to the pharmacy subtotal', () => {
    const q = quoteFor([
      line({ unitPrice: 200, dispensedByPharmacy: true }),
      line({ unitPrice: 300, dispensedByPharmacy: false }),
    ]);
    expect(q.pharmacySubtotalKobo).toBe(20000);
    expect(q.consumableSubtotalKobo).toBe(30000);
  });
});

describe('the refundable contingency', () => {
  it('is ten per cent of consumables only', () => {
    const q = quoteFor([
      line({ unitPrice: 1000, dispensedByPharmacy: false }),
      line({ unitPrice: 1000, dispensedByPharmacy: true }),
    ]);
    expect(CONTINGENCY_RATE).toBe(0.1);
    expect(q.consumableContingencyKobo).toBe(10000);
  });

  it('is not charged on drugs', () => {
    // A surgeon calls for another suture mid-case; they do not call for an
    // ampoule nobody prescribed.
    const q = quoteFor([line({ unitPrice: 5000, dispensedByPharmacy: true })]);
    expect(q.consumableContingencyKobo).toBe(0);
  });

  it('rounds UP, so it is never short by a fraction', () => {
    // 1 kobo of consumables: 10% is 0.1 kobo. Rounding down leaves a
    // contingency that fails on the one line it was held for.
    const q = quoteFor([line({ unitPrice: '0.01' })]);
    expect(q.consumableContingencyKobo).toBe(1);
  });

  it('is included in the total', () => {
    const q = quoteFor([line({ unitPrice: 1000 })]);
    expect(q.totalKobo).toBe(q.consumableSubtotalKobo + q.consumableContingencyKobo + q.pharmacySubtotalKobo);
  });
});

describe('quantities', () => {
  it('multiplies by quantity', () => {
    expect(quoteFor([line({ unitPrice: 250, quantity: 4 })]).consumableSubtotalKobo).toBe(100000);
  });

  it('ignores a zero or negative quantity instead of subtracting', () => {
    for (const q of [0, -3]) {
      expect(quoteFor([line({ quantity: q })]).totalKobo).toBe(0);
    }
  });

  it('does not report a skipped zero-quantity line as unpriced', () => {
    // It was not ordered, so it is not missing a price.
    expect(quoteFor([line({ quantity: 0, unitPrice: null })]).unpricedLines).toEqual([]);
  });
});

describe('what the patient is shown', () => {
  it('formats naira with kobo', () => {
    expect(formatNaira(125050)).toBe('₦1,250.50');
    expect(formatNaira(0)).toBe('₦0.00');
  });

  it('shows the contingency as refundable', () => {
    const rows = quoteBreakdown(quoteFor([line({ unitPrice: 1000 })]));
    const row = rows.find((r) => /contingency/i.test(r.label));
    expect(row?.note).toMatch(/refunded/i);
  });

  it('ends with the total', () => {
    const rows = quoteBreakdown(quoteFor([line()]));
    expect(rows[rows.length - 1].label).toMatch(/total/i);
  });
});

describe('magnitudes', () => {
  it('includes super major', () => {
    expect(MAGNITUDES).toContain('SUPER_MAJOR');
    expect(MAGNITUDES).toHaveLength(4);
  });

  it('rejects anything else', () => {
    expect(isMagnitude('HUGE')).toBe(false);
    expect(isMagnitude(null)).toBe(false);
    expect(isMagnitude('MAJOR')).toBe(true);
  });
});

describe('an empty case', () => {
  it('quotes zero rather than failing', () => {
    const q = quoteFor([]);
    expect(q.totalKobo).toBe(0);
    expect(q.complete).toBe(true);
  });
});
