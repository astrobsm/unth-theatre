import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildRetirementSchedule,
  buildRetirementSummary,
  checkOverspend,
  computeExpenditureAmounts,
  computeImprestPosition,
  computeRunningBalances,
  computeVatOnNet,
  daysUntil,
  deriveImprestStatus,
  extractInclusiveVat,
  isRetirementOverdue,
} from '../../src/lib/imprest/calculations';
import { ExpenditureStatus, ImprestStatus } from '../../src/lib/imprest/enums';

const line = (overrides: Partial<{
  id: string;
  date: string;
  createdAt: string;
  amountPaid: number;
  status: ExpenditureStatus;
  deletedAt: string | null;
}> = {}) => ({
  id: 'e1',
  date: '2026-07-01',
  createdAt: '2026-07-01T09:00:00.000Z',
  amountPaid: 100_000,
  status: ExpenditureStatus.POSTED,
  deletedAt: null,
  ...overrides,
});

describe('computeExpenditureAmounts', () => {
  it('derives the total from quantity and unit cost', () => {
    const result = computeExpenditureAmounts({ quantity: 4, unitCost: 25_000 });
    expect(result.totalCost).toBe(100_000);
    expect(result.amountPaid).toBe(100_000);
    expect(result.netAmount).toBe(100_000);
  });

  it('honours an invoice total that differs from quantity × unit cost', () => {
    const result = computeExpenditureAmounts({
      quantity: 3,
      unitCost: 33_333,
      totalCostOverride: 100_000,
    });
    expect(result.totalCost).toBe(100_000);
  });

  it('deducts withholding tax from the vendor, not from the imprest', () => {
    const result = computeExpenditureAmounts({
      quantity: 1,
      unitCost: 100_000,
      withholdingTax: 5_000,
    });
    expect(result.amountPaid).toBe(100_000); // full charge against the imprest
    expect(result.netAmount).toBe(95_000); // what the vendor receives
  });

  it('refuses tax larger than the line itself', () => {
    expect(() =>
      computeExpenditureAmounts({ quantity: 1, unitCost: 1_000, withholdingTax: 2_000 }),
    ).toThrow(RangeError);
    expect(() =>
      computeExpenditureAmounts({ quantity: 1, unitCost: 1_000, vat: 2_000 }),
    ).toThrow(RangeError);
  });
});

describe('VAT helpers', () => {
  it('extracts VAT contained in an inclusive amount', () => {
    // ₦1,075 inclusive of 7.5% contains ₦75 of VAT.
    expect(extractInclusiveVat(107_500, 7.5)).toBe(7_500);
  });

  it('adds VAT on top of a net amount', () => {
    expect(computeVatOnNet(100_000, 7.5)).toBe(7_500);
  });
});

describe('computeImprestPosition', () => {
  it('counts posted, queried and retired lines but not voided or deleted ones', () => {
    const position = computeImprestPosition(
      { amountApproved: 1_000_000, amountReceived: 1_000_000 },
      [
        line({ amountPaid: 200_000, status: ExpenditureStatus.POSTED }),
        line({ amountPaid: 150_000, status: ExpenditureStatus.QUERIED }),
        line({ amountPaid: 100_000, status: ExpenditureStatus.RETIRED }),
        line({ amountPaid: 500_000, status: ExpenditureStatus.VOIDED }),
        line({ amountPaid: 300_000, deletedAt: '2026-07-02T00:00:00.000Z' }),
        line({ amountPaid: 50_000, status: ExpenditureStatus.DRAFT }),
      ],
    );

    expect(position.totalExpenditure).toBe(450_000);
    expect(position.balance).toBe(550_000);
    expect(position.transactionCount).toBe(3);
    expect(position.percentageUtilised).toBe(45);
    expect(position.isOverspent).toBe(false);
  });

  it('reports the undrawn portion of an approved imprest', () => {
    const position = computeImprestPosition(
      { amountApproved: 1_000_000, amountReceived: 600_000 },
      [],
    );
    expect(position.undrawnAmount).toBe(400_000);
    expect(position.percentageUtilised).toBe(0);
  });

  it('flags an overspent imprest', () => {
    const position = computeImprestPosition(
      { amountApproved: 100_000, amountReceived: 100_000 },
      [line({ amountPaid: 150_000 })],
    );
    expect(position.isOverspent).toBe(true);
    expect(position.balance).toBe(-50_000);
  });
});

describe('computeRunningBalances', () => {
  it('walks the ledger in date then insertion order', () => {
    const rows = computeRunningBalances(1_000_000, [
      line({ id: 'b', date: '2026-07-05', amountPaid: 100_000 }),
      line({ id: 'a', date: '2026-07-01', amountPaid: 250_000 }),
      line({
        id: 'c',
        date: '2026-07-05',
        createdAt: '2026-07-05T14:00:00.000Z',
        amountPaid: 50_000,
      }),
    ]);

    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(rows.map((r) => r.runningBalance)).toEqual([750_000, 650_000, 600_000]);
    expect(rows[2]?.cumulativeSpend).toBe(400_000);
  });

  it('carries the balance across a voided line without consuming funds', () => {
    const rows = computeRunningBalances(500_000, [
      line({ id: 'a', amountPaid: 100_000 }),
      line({ id: 'b', date: '2026-07-02', amountPaid: 999_999, status: ExpenditureStatus.VOIDED }),
      line({ id: 'c', date: '2026-07-03', amountPaid: 50_000 }),
    ]);
    expect(rows.map((r) => r.runningBalance)).toEqual([400_000, 400_000, 350_000]);
  });
});

describe('checkOverspend', () => {
  const base = {
    imprestStatus: ImprestStatus.ACTIVE,
    amountReceived: 1_000_000,
    currentExpenditure: 800_000,
  };

  it('permits a line inside the balance', () => {
    const result = checkOverspend({ ...base, proposedAmount: 100_000 });
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('WARNING_THRESHOLD');
    expect(result.balanceAfter).toBe(100_000);
  });

  it('blocks a line that would exceed the imprest', () => {
    const result = checkOverspend({ ...base, proposedAmount: 300_000 });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('EXCEEDS_IMPREST');
    expect(result.balanceAfter).toBe(-100_000);
  });

  it('allows the overspend through when the block is disabled', () => {
    const result = checkOverspend({ ...base, proposedAmount: 300_000, enforceBlock: false });
    expect(result.allowed).toBe(true);
  });

  it('credits back the previous value when checking an edit', () => {
    // Raising an existing ₦300,000 line to ₦350,000 needs only ₦50,000 of headroom.
    const result = checkOverspend({
      ...base,
      proposedAmount: 350_000,
      previousAmount: 300_000,
    });
    expect(result.allowed).toBe(true);
    expect(result.balanceAfter).toBe(150_000);
  });

  it('refuses to post against a non-spendable imprest', () => {
    const result = checkOverspend({
      ...base,
      imprestStatus: ImprestStatus.CLOSED,
      proposedAmount: 1_000,
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('IMPREST_NOT_SPENDABLE');
  });

  it('warns once utilisation crosses the configured threshold', () => {
    const result = checkOverspend({
      ...base,
      currentExpenditure: 0,
      proposedAmount: 950_000,
      warningThresholdPercent: 90,
    });
    expect(result.isWarning).toBe(true);
    expect(result.percentageUtilisedAfter).toBe(95);
  });
});

describe('buildRetirementSchedule', () => {
  const source = (overrides = {}) => ({
    date: '2026-07-01',
    createdAt: '2026-07-01T09:00:00.000Z',
    voucherNumber: 'PV/001',
    receiptNumber: 'R-001',
    vendorName: 'Ugo Ventures',
    description: 'Reams of A4 paper',
    budgetHeadCode: '2201',
    amountPaid: 100_000,
    remarks: null,
    status: ExpenditureStatus.POSTED,
    deletedAt: null,
    ...overrides,
  });

  it('numbers the schedule and carries a running total', () => {
    const schedule = buildRetirementSchedule([
      source({ date: '2026-07-03', amountPaid: 50_000 }),
      source({ date: '2026-07-01', amountPaid: 100_000 }),
      source({ date: '2026-07-05', amountPaid: 25_000 }),
    ]);

    expect(schedule.map((r) => r.serialNumber)).toEqual([1, 2, 3]);
    expect(schedule.map((r) => r.runningTotal)).toEqual([100_000, 150_000, 175_000]);
  });

  it('substitutes an em dash for missing references', () => {
    const [row] = buildRetirementSchedule([
      source({ voucherNumber: null, receiptNumber: null, budgetHeadCode: null }),
    ]);
    expect(row?.voucherNumber).toBe('—');
    expect(row?.receiptNumber).toBe('—');
    expect(row?.budgetHead).toBe('—');
    expect(row?.remarks).toBe('');
  });

  it('excludes voided and deleted lines from the schedule', () => {
    const schedule = buildRetirementSchedule([
      source(),
      source({ status: ExpenditureStatus.VOIDED }),
      source({ deletedAt: '2026-07-04T00:00:00.000Z' }),
    ]);
    expect(schedule).toHaveLength(1);
  });
});

describe('buildRetirementSummary', () => {
  it('summarises spend, balance, receipts and distinct vendors', () => {
    const summary = buildRetirementSummary({
      amountReceived: 1_000_000,
      retirementDate: '2026-07-31',
      expenditures: [
        { amountPaid: 300_000, vendorName: 'Ugo Ventures', status: ExpenditureStatus.POSTED, deletedAt: null, attachmentCount: 2 },
        { amountPaid: 200_000, vendorName: 'ugo ventures', status: ExpenditureStatus.POSTED, deletedAt: null, attachmentCount: 1 },
        { amountPaid: 150_000, vendorName: 'Chidi Stores', status: ExpenditureStatus.POSTED, deletedAt: null, attachmentCount: 1 },
        { amountPaid: 999_999, vendorName: 'Ghost Ltd', status: ExpenditureStatus.VOIDED, deletedAt: null, attachmentCount: 0 },
      ],
    });

    expect(summary.totalExpenditure).toBe(650_000);
    expect(summary.balanceReturned).toBe(350_000);
    expect(summary.expenditureCount).toBe(3);
    expect(summary.receiptCount).toBe(4);
    // Vendor names are matched case-insensitively, so this is two vendors.
    expect(summary.vendorCount).toBe(2);
  });
});

describe('deriveImprestStatus', () => {
  it('never overrides a terminal status', () => {
    expect(
      deriveImprestStatus({
        current: ImprestStatus.CLOSED,
        totalExpenditure: 100,
        totalRetired: 0,
      }),
    ).toBe(ImprestStatus.CLOSED);
    expect(
      deriveImprestStatus({
        current: ImprestStatus.CANCELLED,
        totalExpenditure: 0,
        totalRetired: 0,
      }),
    ).toBe(ImprestStatus.CANCELLED);
  });

  it('moves through active, partial and full retirement', () => {
    const at = (totalRetired: number) =>
      deriveImprestStatus({
        current: ImprestStatus.ACTIVE,
        totalExpenditure: 500_000,
        totalRetired,
      });

    expect(at(0)).toBe(ImprestStatus.ACTIVE);
    expect(at(200_000)).toBe(ImprestStatus.PARTIALLY_RETIRED);
    expect(at(500_000)).toBe(ImprestStatus.FULLY_RETIRED);
  });
});

describe('retirement due dates', () => {
  const today = new Date('2026-07-30T10:00:00.000Z');

  it('counts whole days to the due date', () => {
    expect(daysUntil('2026-08-04', today)).toBe(5);
    expect(daysUntil('2026-07-30', today)).toBe(0);
    expect(daysUntil('2026-07-25', today)).toBe(-5);
  });

  it('flags an overdue active imprest', () => {
    expect(
      isRetirementOverdue(
        { expectedRetirementDate: '2026-07-25', status: ImprestStatus.ACTIVE },
        today,
      ),
    ).toBe(true);
  });

  it('does not chase a retired or draft imprest', () => {
    for (const status of [
      ImprestStatus.FULLY_RETIRED,
      ImprestStatus.CLOSED,
      ImprestStatus.CANCELLED,
      ImprestStatus.DRAFT,
    ]) {
      expect(
        isRetirementOverdue({ expectedRetirementDate: '2020-01-01', status }, today),
      ).toBe(false);
    }
  });

  it('adds days across a month boundary', () => {
    expect(addDays('2026-07-30', 5)).toBe('2026-08-04');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
