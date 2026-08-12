import { describe, it, expect } from 'vitest';
import {
  recalculate, costLine, resolveQuantity, formatNaira, EstimateError,
  SECTION_ORDER, type DraftLine,
} from '../../src/lib/estimates/calculate';

// A patient is quoted these figures and the hospital is held to them, so the
// tests below are mostly about the ways the arithmetic could be wrong QUIETLY.

const line = (over: Partial<DraftLine> = {}): DraftLine => ({
  section: 'SURGICAL_MATERIAL',
  kind: 'CONSUMABLE',
  description: 'Suture 2/0',
  unitPriceKobo: 150_000, // ₦1,500.00
  ...over,
});

describe('resolveQuantity', () => {
  it('defaults to one', () => {
    expect(resolveQuantity(line())).toBe(1);
  });

  it('multiplies frequency by duration for a prescribed drug', () => {
    // 3x daily for 5 days is 15 doses, and the document must show how.
    expect(resolveQuantity(line({ frequencyPerDay: 3, durationDays: 5 }))).toBe(15);
  });

  it('refuses frequency without duration', () => {
    // Half-entered rather than intended. Guessing the other half misprices it.
    expect(() => resolveQuantity(line({ frequencyPerDay: 3 }))).toThrow(EstimateError);
    expect(() => resolveQuantity(line({ durationDays: 5 }))).toThrow(EstimateError);
  });

  it('refuses zero and negative quantities', () => {
    expect(() => resolveQuantity(line({ quantity: 0 }))).toThrow(EstimateError);
    expect(() => resolveQuantity(line({ quantity: -2 }))).toThrow(EstimateError);
  });

  it('refuses fractional quantities', () => {
    expect(() => resolveQuantity(line({ quantity: 1.5 }))).toThrow(EstimateError);
  });
});

describe('costLine', () => {
  it('multiplies price by quantity in kobo', () => {
    expect(costLine(line({ quantity: 4 }))).toEqual({ quantity: 4, totalKobo: 600_000 });
  });

  it('refuses a fractional kobo price', () => {
    // Means someone divided upstream. Rounding here would hide it; the price
    // master is where it has to be fixed.
    expect(() => costLine(line({ unitPriceKobo: 150_000.5 }))).toThrow(EstimateError);
  });

  it('refuses a negative price', () => {
    expect(() => costLine(line({ unitPriceKobo: -100 }))).toThrow(EstimateError);
  });

  it('allows a genuinely free line', () => {
    // Zero is legitimate (donated item), so it costs rather than throws — but
    // recalculate warns, because it is usually a gap in the price master.
    expect(costLine(line({ unitPriceKobo: 0 })).totalKobo).toBe(0);
  });
});

describe('recalculate', () => {
  it('accepts an empty estimate', () => {
    // A DRAFT is created at booking before anyone has costed anything. That is
    // a valid state, not an error.
    const r = recalculate({ lines: [] });
    expect(r.subtotalKobo).toBe(0);
    expect(r.totalKobo).toBe(0);
    expect(r.sections).toEqual([]);
  });

  it('sums lines and groups them into sections', () => {
    const r = recalculate({
      lines: [
        line({ section: 'SURGICAL_FEE', kind: 'PROCEDURE', description: 'Surgeon', unitPriceKobo: 15_000_000 }),
        line({ section: 'SURGICAL_MATERIAL', unitPriceKobo: 100_000, quantity: 3 }),
        line({ section: 'SURGICAL_MATERIAL', description: 'Gauze', unitPriceKobo: 50_000, quantity: 2 }),
      ],
    });
    expect(r.subtotalKobo).toBe(15_000_000 + 300_000 + 100_000);
    expect(r.sections.map((s) => s.section)).toEqual(['SURGICAL_FEE', 'SURGICAL_MATERIAL']);
    expect(r.sections.find((s) => s.section === 'SURGICAL_MATERIAL')!.totalKobo).toBe(400_000);
    expect(r.sections.find((s) => s.section === 'SURGICAL_MATERIAL')!.lineCount).toBe(2);
  });

  it('orders sections for the printed document, not by input order', () => {
    const r = recalculate({
      lines: [
        line({ section: 'POSTOP_MEDICATION', kind: 'DRUG', description: 'Paracetamol' }),
        line({ section: 'PREOP_INVESTIGATION', kind: 'LABORATORY', description: 'FBC' }),
      ],
    });
    expect(r.lines.map((l) => l.section)).toEqual(['PREOP_INVESTIGATION', 'POSTOP_MEDICATION']);
  });

  it('preserves the caller ordering within a section', () => {
    // A clinician's drug list order carries meaning.
    const r = recalculate({
      lines: [
        line({ section: 'POSTOP_MEDICATION', kind: 'DRUG', description: 'First' }),
        line({ section: 'POSTOP_MEDICATION', kind: 'DRUG', description: 'Second' }),
        line({ section: 'POSTOP_MEDICATION', kind: 'DRUG', description: 'Third' }),
      ],
    });
    expect(r.lines.map((l) => l.description)).toEqual(['First', 'Second', 'Third']);
  });

  it('expands a per-day admission line by the expected stay', () => {
    const r = recalculate({
      lines: [line({ section: 'ADMISSION', kind: 'ADMISSION', description: 'Bed, female ward', unitPriceKobo: 500_000 })],
      admissionType: 'INPATIENT',
      expectedStayDays: 4,
    });
    expect(r.lines[0].quantity).toBe(4);
    expect(r.subtotalKobo).toBe(2_000_000);
  });

  it('does not override an explicit admission quantity', () => {
    const r = recalculate({
      lines: [line({ section: 'ADMISSION', kind: 'ADMISSION', unitPriceKobo: 500_000, quantity: 2 })],
      admissionType: 'INPATIENT',
      expectedStayDays: 9,
    });
    expect(r.lines[0].quantity).toBe(2);
  });

  it('warns when an inpatient has no length of stay', () => {
    const r = recalculate({ lines: [], admissionType: 'INPATIENT', expectedStayDays: 0 });
    expect(r.warnings.some((w) => /no expected length of stay/i.test(w))).toBe(true);
  });

  it('warns when a day case has a stay entered', () => {
    const r = recalculate({ lines: [], admissionType: 'DAY_CASE', expectedStayDays: 3 });
    expect(r.warnings.some((w) => /Day case/i.test(w))).toBe(true);
  });

  it('refuses an unknown section rather than dropping the charge', () => {
    // The section loop would silently omit it, and losing a charge is worse
    // than failing loudly.
    expect(() => recalculate({
      lines: [line({ section: 'INVENTED_SECTION' as never })],
    })).toThrow(/Unknown estimate section/);
  });

  it('computes a percentage deposit and floors it', () => {
    // 33% of ₦1,000.01 is 33,000.33 kobo. Flooring means the deposit is never a
    // kobo more than the stated percentage.
    const r = recalculate({
      lines: [line({ unitPriceKobo: 100_001 })],
      depositPercent: 33,
    });
    expect(r.depositKobo).toBe(33_000);
  });

  it('lets an explicit deposit win over a percentage', () => {
    const r = recalculate({
      lines: [line({ unitPriceKobo: 1_000_000 })],
      depositPercent: 50,
      depositKobo: 250_000,
    });
    expect(r.depositKobo).toBe(250_000);
  });

  it('caps a deposit at the total and says so', () => {
    const r = recalculate({
      lines: [line({ unitPriceKobo: 100_000 })],
      depositKobo: 500_000,
    });
    expect(r.depositKobo).toBe(100_000);
    expect(r.warnings.some((w) => /capped/i.test(w))).toBe(true);
  });

  it('rejects a deposit percentage outside 0-100', () => {
    expect(() => recalculate({ lines: [], depositPercent: 120 })).toThrow(EstimateError);
    expect(() => recalculate({ lines: [], depositPercent: -1 })).toThrow(EstimateError);
  });

  it('does NOT subtract the deposit from the total', () => {
    // The deposit is what is asked for up front; the total is what is owed.
    // Netting them would understate the bill on the document.
    const r = recalculate({
      lines: [line({ unitPriceKobo: 1_000_000 })],
      depositKobo: 400_000,
    });
    expect(r.subtotalKobo).toBe(1_000_000);
    expect(r.totalKobo).toBe(1_000_000);
    expect(r.depositKobo).toBe(400_000);
  });

  it('warns about overridden prices and missing reasons', () => {
    const r = recalculate({
      lines: [
        line({ priceOverridden: true, overrideReason: 'Agreed with finance' }),
        line({ description: 'Mesh', priceOverridden: true }),
      ],
    });
    expect(r.warnings.some((w) => /overridden by hand/i.test(w))).toBe(true);
    expect(r.warnings.some((w) => /Override without a reason: Mesh/.test(w))).toBe(true);
  });

  it('warns about zero-priced lines', () => {
    const r = recalculate({ lines: [line({ unitPriceKobo: 0 })] });
    expect(r.warnings.some((w) => /priced at zero/i.test(w))).toBe(true);
  });

  it('carries provenance through untouched', () => {
    // Provenance explains a figure later; it must never be used to re-price.
    const from = new Date('2026-08-01T00:00:00Z');
    const r = recalculate({
      lines: [line({ tariffId: 't-1', tariffCode: 'SUT-20', priceEffectiveFrom: from })],
    });
    expect(r.lines[0].tariffId).toBe('t-1');
    expect(r.lines[0].tariffCode).toBe('SUT-20');
    expect(r.lines[0].priceEffectiveFrom).toBe(from);
  });

  it('is deterministic — same input, same figures', () => {
    // The whole point of a pure engine: a recomputation months later must
    // reproduce what the patient was told.
    const lines = [
      line({ section: 'SURGICAL_FEE', kind: 'PROCEDURE', unitPriceKobo: 15_000_000 }),
      line({ section: 'POSTOP_MEDICATION', kind: 'DRUG', unitPriceKobo: 12_500, frequencyPerDay: 3, durationDays: 5 }),
    ];
    const a = recalculate({ lines, expectedStayDays: 3, admissionType: 'INPATIENT', depositPercent: 30 });
    const b = recalculate({ lines, expectedStayDays: 3, admissionType: 'INPATIENT', depositPercent: 30 });
    expect(a.subtotalKobo).toBe(b.subtotalKobo);
    expect(a.depositKobo).toBe(b.depositKobo);
    expect(a.lines.map((l) => l.totalKobo)).toEqual(b.lines.map((l) => l.totalKobo));
  });

  it('handles a realistic full estimate', () => {
    const r = recalculate({
      lines: [
        line({ section: 'PREOP_INVESTIGATION', kind: 'LABORATORY', description: 'FBC', unitPriceKobo: 350_000 }),
        line({ section: 'PREOP_INVESTIGATION', kind: 'LABORATORY', description: 'Grouping & cross-match', unitPriceKobo: 500_000 }),
        line({ section: 'SURGICAL_FEE', kind: 'PROCEDURE', description: 'Herniorrhaphy', unitPriceKobo: 15_000_000 }),
        line({ section: 'ANAESTHESIA_FEE', kind: 'ANAESTHESIA', description: 'Spinal', unitPriceKobo: 7_500_000 }),
        line({ section: 'THEATRE', kind: 'THEATRE', description: 'Theatre charge, major', unitPriceKobo: 8_000_000 }),
        line({ section: 'SURGICAL_MATERIAL', description: 'Mesh', unitPriceKobo: 4_500_000 }),
        line({ section: 'ADMISSION', kind: 'ADMISSION', description: 'Bed', unitPriceKobo: 500_000 }),
        line({ section: 'POSTOP_MEDICATION', kind: 'DRUG', description: 'Ceftriaxone', unitPriceKobo: 120_000, frequencyPerDay: 2, durationDays: 5 }),
      ],
      admissionType: 'INPATIENT',
      expectedStayDays: 3,
      depositPercent: 50,
    });

    // 350k + 500k + 15m + 7.5m + 8m + 4.5m + (500k x 3) + (120k x 10)
    const expected = 350_000 + 500_000 + 15_000_000 + 7_500_000 + 8_000_000
      + 4_500_000 + 1_500_000 + 1_200_000;
    expect(r.subtotalKobo).toBe(expected);
    expect(r.depositKobo).toBe(Math.floor(expected / 2));
    expect(r.lines.find((l) => l.description === 'Ceftriaxone')!.quantity).toBe(10);
    expect(r.lines.find((l) => l.description === 'Bed')!.quantity).toBe(3);
  });
});

describe('formatNaira', () => {
  it('renders kobo as naira with two places', () => {
    expect(formatNaira(150_000)).toBe('₦1,500.00');
    expect(formatNaira(1)).toBe('₦0.01');
    expect(formatNaira(0)).toBe('₦0.00');
    expect(formatNaira(1_234_567)).toBe('₦12,345.67');
  });
});

describe('SECTION_ORDER', () => {
  it('has no duplicates', () => {
    expect(new Set(SECTION_ORDER).size).toBe(SECTION_ORDER.length);
  });
});
