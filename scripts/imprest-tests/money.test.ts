import { describe, expect, it } from 'vitest';
import {
  addKobo,
  amountInWords,
  formatNaira,
  formatNairaCompact,
  isValidKobo,
  koboToNaira,
  MoneyError,
  multiplyKobo,
  nairaToKobo,
  parseAmount,
  percentageOf,
  percentageRatio,
  subtractKobo,
  sumBy,
} from '../../src/lib/imprest/money';

describe('kobo validity', () => {
  it('accepts non-negative integers', () => {
    expect(isValidKobo(0)).toBe(true);
    expect(isValidKobo(125_075)).toBe(true);
  });

  it('rejects fractions, negatives and non-numbers', () => {
    expect(isValidKobo(1.5)).toBe(false);
    expect(isValidKobo(-1)).toBe(false);
    expect(isValidKobo('100')).toBe(false);
    expect(isValidKobo(Number.NaN)).toBe(false);
    expect(isValidKobo(Infinity)).toBe(false);
  });
});

describe('nairaToKobo', () => {
  it('converts whole and fractional Naira', () => {
    expect(nairaToKobo(1)).toBe(100);
    expect(nairaToKobo(1250.75)).toBe(125_075);
    expect(nairaToKobo(0)).toBe(0);
  });

  it('survives binary representation drift', () => {
    // 1.005 * 100 is 100.49999999999999 in IEEE-754.
    expect(nairaToKobo(1.005)).toBe(101);
    expect(nairaToKobo(0.07)).toBe(7);
    expect(nairaToKobo(8.115)).toBe(812);
  });

  it('rejects non-finite input', () => {
    expect(() => nairaToKobo(Number.NaN)).toThrow(MoneyError);
    expect(() => nairaToKobo(Infinity)).toThrow(MoneyError);
  });
});

describe('parseAmount', () => {
  it('accepts the shapes a cashier types', () => {
    expect(parseAmount('1250.75')).toBe(125_075);
    expect(parseAmount('1,250.75')).toBe(125_075);
    expect(parseAmount('₦1,250.75')).toBe(125_075);
    expect(parseAmount('N1250')).toBe(125_000);
    expect(parseAmount('  450 ')).toBe(45_000);
  });

  it('rejects malformed input rather than guessing', () => {
    expect(() => parseAmount('')).toThrow(MoneyError);
    expect(() => parseAmount('abc')).toThrow(MoneyError);
    expect(() => parseAmount('12.345')).toThrow(MoneyError);
    expect(() => parseAmount('-100')).toThrow(MoneyError);
  });
});

describe('formatting', () => {
  it('renders Naira with thousands separators', () => {
    expect(formatNaira(125_075)).toBe('₦1,250.75');
    expect(formatNaira(125_075, { withSymbol: false })).toBe('1,250.75');
    expect(formatNaira(125_000, { decimals: false })).toBe('₦1,250');
    expect(formatNaira(5)).toBe('₦0.05');
    expect(formatNaira(0)).toBe('₦0.00');
  });

  it('abbreviates large amounts for dashboard tiles', () => {
    expect(formatNairaCompact(125_000_000)).toBe('₦1.25m');
    expect(formatNairaCompact(85_000_000)).toBe('₦850.00k');
    expect(formatNairaCompact(45_000)).toBe('₦450.00');
  });
});

describe('arithmetic', () => {
  it('adds exactly where floats would drift', () => {
    // 0.1 + 0.2 !== 0.3 in floating point; in kobo it is exact.
    expect(addKobo(10, 20)).toBe(30);
    expect(addKobo(...Array.from({ length: 10 }, () => 10))).toBe(100);
  });

  it('allows a negative difference so overspend can be detected', () => {
    expect(subtractKobo(100, 250)).toBe(-150);
  });

  it('multiplies by a fractional quantity', () => {
    expect(multiplyKobo(50_000, 2.5)).toBe(125_000);
    expect(multiplyKobo(33_333, 3)).toBe(99_999);
  });

  it('computes percentages and ratios', () => {
    expect(percentageOf(100_000, 7.5)).toBe(7_500);
    expect(percentageRatio(25_000, 100_000)).toBe(25);
    expect(percentageRatio(1, 0)).toBe(0);
  });

  it('sums a projection', () => {
    const lines = [{ amount: 1_000 }, { amount: 2_500 }, { amount: 750 }];
    expect(sumBy(lines, (l) => l.amount)).toBe(4_250);
  });

  it('round-trips through Naira', () => {
    expect(koboToNaira(125_075)).toBe(1250.75);
  });
});

describe('amountInWords', () => {
  it('renders the forms printed on a payment voucher', () => {
    expect(amountInWords(0)).toBe('Zero Naira Only');
    expect(amountInWords(100)).toBe('One Naira Only');
    expect(amountInWords(125_075)).toBe(
      'One Thousand Two Hundred and Fifty Naira, Seventy-Five Kobo Only',
    );
    expect(amountInWords(50_000_000)).toBe('Five Hundred Thousand Naira Only');
  });

  it('handles the teens and the tens boundary', () => {
    expect(amountInWords(1_500)).toBe('Fifteen Naira Only');
    expect(amountInWords(2_000)).toBe('Twenty Naira Only');
    expect(amountInWords(2_100)).toBe('Twenty-One Naira Only');
    expect(amountInWords(11_300)).toBe('One Hundred and Thirteen Naira Only');
  });

  it('handles millions with a remainder', () => {
    expect(amountInWords(250_000_050)).toBe(
      'Two Million Five Hundred Thousand Naira, Fifty Kobo Only',
    );
  });
});
