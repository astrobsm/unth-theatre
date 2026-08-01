/**
 * Splitting money. The property that matters is not "the percentages look
 * right" — it is that the shares sum back to the total, exactly, for every
 * total and every set of rules. A kobo lost per invoice is a ledger that never
 * reconciles and nobody can say why.
 */
import { describe, expect, it } from 'vitest';

import {
  BASIS_POINTS_TOTAL,
  basisPointsToPercent,
  distribute,
  distributeInvoice,
  percentToBasisPoints,
  sumShares,
  validateRules,
} from './revenue';

const rule = (accountId: string, bp: number) => ({ accountId, shareBasisPoints: bp });

describe('an exact split', () => {
  it('divides a clean amount cleanly', () => {
    const shares = distribute(100_00, [rule('a', 5000), rule('b', 5000)]);
    expect(shares.map((s) => s.amount)).toEqual([50_00, 50_00]);
  });

  it('THE case: three ways on ₦100 loses nothing', () => {
    // 10000 / 3 = 3333.33 each. Rounding each down loses a kobo.
    const shares = distribute(100_00, [rule('a', 3333), rule('b', 3333), rule('c', 3334)]);
    expect(sumShares(shares)).toBe(100_00);
  });

  it('sums exactly for an awkward total and awkward shares', () => {
    const shares = distribute(7_777, [rule('a', 3333), rule('b', 3333), rule('c', 3334)]);
    expect(sumShares(shares)).toBe(7_777);
  });

  it('sums exactly across a hundred consecutive totals', () => {
    // The property, exhaustively — this is the test that would catch a
    // regression in the remainder handling.
    for (let total = 0; total < 100; total += 1) {
      const shares = distribute(total, [rule('a', 1667), rule('b', 3333), rule('c', 5000)]);
      expect(sumShares(shares)).toBe(total);
    }
  });

  it('gives the leftover kobo to whoever was rounded down hardest', () => {
    // a loses 0.67 to flooring, b loses 0.33 — a is compensated first.
    const shares = distribute(1, [rule('a', 6667), rule('b', 3333)]);
    expect(shares.find((s) => s.accountId === 'a')!.amount).toBe(1);
    expect(shares.find((s) => s.accountId === 'b')!.amount).toBe(0);
  });

  it('is deterministic when remainders tie', () => {
    const first = distribute(1, [rule('b', 5000), rule('a', 5000)]);
    const second = distribute(1, [rule('a', 5000), rule('b', 5000)]);
    const winner = (s: ReturnType<typeof distribute>) => s.find((x) => x.amount === 1)!.accountId;
    expect(winner(first)).toBe(winner(second));
  });
});

describe('edge cases that would otherwise strand money', () => {
  it('zero distributes as zero, not as an error', () => {
    const shares = distribute(0, [rule('a', 5000), rule('b', 5000)]);
    expect(sumShares(shares)).toBe(0);
    expect(shares).toHaveLength(2);
  });

  it('no rules distributes nothing rather than throwing', () => {
    expect(distribute(500, [])).toHaveLength(0);
  });

  it('rules that total zero pay out nothing rather than dividing by zero', () => {
    const shares = distribute(500, [rule('a', 0), rule('b', 0)]);
    expect(sumShares(shares)).toBe(0);
  });

  it('shares that do not total 100% still distribute the whole amount', () => {
    // Otherwise a mis-set rule silently leaves money unallocated.
    const shares = distribute(900, [rule('a', 3000), rule('b', 6000)]);
    expect(sumShares(shares)).toBe(900);
  });

  it('refuses a fractional amount outright', () => {
    expect(() => distribute(10.5, [rule('a', 10000)])).toThrow();
  });

  it('handles a refund — a negative total — and still sums exactly', () => {
    const shares = distribute(-7_777, [rule('a', 3333), rule('b', 6667)]);
    expect(sumShares(shares)).toBe(-7_777);
  });

  it('one account takes everything', () => {
    const shares = distribute(12_345, [rule('hospital', BASIS_POINTS_TOTAL)]);
    expect(shares[0].amount).toBe(12_345);
  });
});

describe('splitting a whole invoice', () => {
  const rulesByKind = {
    THEATRE: [rule('hospital', 10000)],
    CONSUMABLE: [rule('hospital', 3000), rule('pharmacy', 7000)],
  };

  it('splits each charge kind by its own rules', () => {
    const shares = distributeInvoice({
      lines: [
        { kind: 'THEATRE', lineTotal: 50_000 },
        { kind: 'CONSUMABLE', lineTotal: 10_000 },
      ],
      rulesByKind,
      fallbackAccountId: 'hospital',
    });
    expect(sumShares(shares)).toBe(60_000);
  });

  it('sends a consignment line to its vendor, not to the generic rule', () => {
    const shares = distributeInvoice({
      lines: [{ kind: 'CONSUMABLE', lineTotal: 25_000, vendorAccountId: 'vendor-ginos' }],
      rulesByKind,
      fallbackAccountId: 'hospital',
    });
    expect(shares).toHaveLength(1);
    expect(shares[0].accountId).toBe('vendor-ginos');
    expect(shares[0].amount).toBe(25_000);
  });

  it('a charge kind with no rule goes to the hospital rather than nowhere', () => {
    const shares = distributeInvoice({
      lines: [{ kind: 'OXYGEN', lineTotal: 4_000 }],
      rulesByKind,
      fallbackAccountId: 'hospital',
    });
    expect(sumShares(shares)).toBe(4_000);
    expect(shares[0].accountId).toBe('hospital');
  });

  it('the whole invoice is always fully distributed', () => {
    const lines = [
      { kind: 'THEATRE', lineTotal: 150_000 },
      { kind: 'CONSUMABLE', lineTotal: 33_333 },
      { kind: 'CONSUMABLE', lineTotal: 12_121, vendorAccountId: 'vendor-a' },
      { kind: 'ANAESTHESIA', lineTotal: 7_777 },
      { kind: 'CSSD', lineTotal: 999 },
    ];
    const shares = distributeInvoice({ lines, rulesByKind, fallbackAccountId: 'hospital' });
    const invoiceTotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    expect(sumShares(shares)).toBe(invoiceTotal);
  });

  it('merges an account appearing under the same kind twice', () => {
    const shares = distributeInvoice({
      lines: [
        { kind: 'THEATRE', lineTotal: 1_000 },
        { kind: 'THEATRE', lineTotal: 2_000 },
      ],
      rulesByKind,
      fallbackAccountId: 'hospital',
    });
    expect(shares).toHaveLength(1);
    expect(shares[0].amount).toBe(3_000);
  });

  it('an empty invoice distributes nothing', () => {
    expect(distributeInvoice({ lines: [], rulesByKind, fallbackAccountId: 'hospital' })).toHaveLength(0);
  });
});

describe('warning about mis-set rules', () => {
  it('accepts a set totalling exactly 100%', () => {
    expect(validateRules([rule('a', 2500), rule('b', 7500)]).valid).toBe(true);
  });

  it('warns when they fall short, and says by how much', () => {
    const v = validateRules([rule('a', 3000), rule('b', 6000)]);
    expect(v.valid).toBe(false);
    expect(v.message).toContain('90.00%');
  });

  it('warns when they exceed 100%', () => {
    const v = validateRules([rule('a', 6000), rule('b', 6000)]);
    expect(v.valid).toBe(false);
    expect(v.message).toContain('120.00%');
  });
});

describe('percentages for people', () => {
  it('converts both ways without drift', () => {
    expect(basisPointsToPercent(2550)).toBe(25.5);
    expect(percentToBasisPoints(25.5)).toBe(2550);
    expect(percentToBasisPoints(basisPointsToPercent(3333))).toBe(3333);
  });
});
