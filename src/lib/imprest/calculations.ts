/**
 * Ledger arithmetic.
 *
 * Everything the cash book computes lives here so the API, the offline client
 * and the PDF renderer produce byte-identical figures. If a number appears on
 * a printed retirement schedule, it was produced by a function in this file.
 */

import {
  ExpenditureStatus,
  FUND_CONSUMING_EXPENDITURE_STATUSES,
  ImprestStatus,
  SPENDABLE_IMPREST_STATUSES,
} from './enums';
import {
  addKobo,
  Kobo,
  percentageOf,
  percentageRatio,
  subtractKobo,
} from './money';
import type {
  Expenditure,
  Imprest,
  IsoDate,
  RetirementScheduleRow,
  RetirementSummary,
} from './types';

// ---------------------------------------------------------------------------
// Expenditure line arithmetic
// ---------------------------------------------------------------------------

export interface ExpenditureAmountsInput {
  quantity: number;
  unitCost: Kobo;
  /** Overrides `quantity × unitCost` when the vendor billed a different figure. */
  totalCostOverride?: Kobo | null;
  vat?: Kobo;
  withholdingTax?: Kobo;
}

export interface ExpenditureAmounts {
  totalCost: Kobo;
  vat: Kobo;
  withholdingTax: Kobo;
  /** What actually left the imprest — gross of VAT, net of tax withheld. */
  amountPaid: Kobo;
  /** Vendor's entitlement after withholding tax. */
  netAmount: Kobo;
}

/**
 * Derives the money columns of an expenditure line.
 *
 * Convention used here, matching Nigerian public-service practice:
 *   - `totalCost` is the VAT-inclusive invoice value.
 *   - `withholdingTax` is deducted at source and remitted separately, so the
 *     vendor receives `netAmount = totalCost − withholdingTax`.
 *   - `amountPaid` is the sum charged against the imprest, which equals
 *     `totalCost` — the withheld portion is still imprest money, merely
 *     payable to the tax authority rather than the vendor.
 */
export function computeExpenditureAmounts(
  input: ExpenditureAmountsInput,
): ExpenditureAmounts {
  const { quantity, unitCost, totalCostOverride, vat = 0, withholdingTax = 0 } = input;

  const computed = Math.round(unitCost * quantity);
  const totalCost =
    totalCostOverride !== undefined && totalCostOverride !== null
      ? totalCostOverride
      : computed;

  if (withholdingTax > totalCost) {
    throw new RangeError('Withholding tax cannot exceed the total cost of the line.');
  }
  if (vat > totalCost) {
    throw new RangeError('VAT cannot exceed the total cost of the line.');
  }

  return {
    totalCost,
    vat,
    withholdingTax,
    amountPaid: totalCost,
    netAmount: subtractKobo(totalCost, withholdingTax),
  };
}

/** VAT contained within a VAT-inclusive amount (default Nigerian rate 7.5%). */
export function extractInclusiveVat(inclusiveAmount: Kobo, rate = 7.5): Kobo {
  return Math.round((inclusiveAmount * rate) / (100 + rate));
}

/** VAT to add on top of a VAT-exclusive amount. */
export function computeVatOnNet(netAmount: Kobo, rate = 7.5): Kobo {
  return percentageOf(netAmount, rate);
}

export function computeWithholdingTax(baseAmount: Kobo, rate: number): Kobo {
  return percentageOf(baseAmount, rate);
}

// ---------------------------------------------------------------------------
// Imprest position
// ---------------------------------------------------------------------------

export interface ImprestPosition {
  amountApproved: Kobo;
  amountReceived: Kobo;
  totalExpenditure: Kobo;
  balance: Kobo;
  percentageUtilised: number;
  /** Approved but not yet drawn. */
  undrawnAmount: Kobo;
  transactionCount: number;
  isOverspent: boolean;
  isExhausted: boolean;
}

/** Only lines that actually consumed funds count toward the position. */
export function fundConsumingLines<T extends { status: ExpenditureStatus; deletedAt: string | null }>(
  expenditures: readonly T[],
): T[] {
  return expenditures.filter(
    (e) => e.deletedAt === null && FUND_CONSUMING_EXPENDITURE_STATUSES.includes(e.status),
  );
}

export function computeImprestPosition(
  imprest: Pick<Imprest, 'amountApproved' | 'amountReceived'>,
  expenditures: readonly Pick<Expenditure, 'amountPaid' | 'status' | 'deletedAt'>[],
): ImprestPosition {
  const counted = fundConsumingLines(expenditures);
  const totalExpenditure = addKobo(...counted.map((e) => e.amountPaid));
  const balance = subtractKobo(imprest.amountReceived, totalExpenditure);

  return {
    amountApproved: imprest.amountApproved,
    amountReceived: imprest.amountReceived,
    totalExpenditure,
    balance,
    percentageUtilised: percentageRatio(totalExpenditure, imprest.amountReceived),
    undrawnAmount: Math.max(0, subtractKobo(imprest.amountApproved, imprest.amountReceived)),
    transactionCount: counted.length,
    isOverspent: balance < 0,
    isExhausted: balance <= 0,
  };
}

/**
 * Walks the ledger in posting order and stamps each line with the balance
 * remaining afterwards — the "Running Total" column of the cash book.
 */
export function computeRunningBalances<
  T extends Pick<Expenditure, 'id' | 'date' | 'amountPaid' | 'status' | 'deletedAt' | 'createdAt'>,
>(amountReceived: Kobo, expenditures: readonly T[]): Array<T & { runningBalance: Kobo; cumulativeSpend: Kobo }> {
  const ordered = [...expenditures].sort(compareLedgerOrder);

  let cumulative = 0;
  return ordered.map((entry) => {
    const counts =
      entry.deletedAt === null && FUND_CONSUMING_EXPENDITURE_STATUSES.includes(entry.status);
    if (counts) cumulative += entry.amountPaid;
    return {
      ...entry,
      cumulativeSpend: cumulative,
      runningBalance: amountReceived - cumulative,
    };
  });
}

/** Ledger order: by transaction date, then by insertion time for same-day lines. */
export function compareLedgerOrder(
  a: Pick<Expenditure, 'date' | 'createdAt'>,
  b: Pick<Expenditure, 'date' | 'createdAt'>,
): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.createdAt === b.createdAt) return 0;
  return a.createdAt < b.createdAt ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Overspend validation
// ---------------------------------------------------------------------------

export interface OverspendCheck {
  allowed: boolean;
  code: 'OK' | 'IMPREST_NOT_SPENDABLE' | 'EXCEEDS_IMPREST' | 'WARNING_THRESHOLD';
  message: string;
  balanceBefore: Kobo;
  balanceAfter: number;
  percentageUtilisedAfter: number;
  /** True when the line is legal but crosses the configured warning threshold. */
  isWarning: boolean;
}

/**
 * Guards a proposed expenditure against the imprest's remaining balance.
 *
 * `previousAmount` lets an edit be checked correctly: the line's existing
 * value is credited back before the new value is charged, so raising a
 * ₦1,000 line to ₦1,200 tests ₦200 of headroom rather than ₦1,200.
 */
export function checkOverspend(params: {
  imprestStatus: ImprestStatus;
  amountReceived: Kobo;
  currentExpenditure: Kobo;
  proposedAmount: Kobo;
  previousAmount?: Kobo;
  enforceBlock?: boolean;
  warningThresholdPercent?: number;
}): OverspendCheck {
  const {
    imprestStatus,
    amountReceived,
    currentExpenditure,
    proposedAmount,
    previousAmount = 0,
    enforceBlock = true,
    warningThresholdPercent = 90,
  } = params;

  const balanceBefore = subtractKobo(amountReceived, currentExpenditure);
  const projectedSpend = currentExpenditure - previousAmount + proposedAmount;
  const balanceAfter = amountReceived - projectedSpend;
  const percentageUtilisedAfter = percentageRatio(Math.max(0, projectedSpend), amountReceived);

  if (!SPENDABLE_IMPREST_STATUSES.includes(imprestStatus)) {
    return {
      allowed: false,
      code: 'IMPREST_NOT_SPENDABLE',
      message: `Expenditure cannot be posted against an imprest with status "${imprestStatus}".`,
      balanceBefore,
      balanceAfter,
      percentageUtilisedAfter,
      isWarning: false,
    };
  }

  if (balanceAfter < 0 && enforceBlock) {
    return {
      allowed: false,
      code: 'EXCEEDS_IMPREST',
      message:
        'This expenditure would exceed the imprest value. ' +
        'Reduce the amount or obtain a supplementary imprest before posting.',
      balanceBefore,
      balanceAfter,
      percentageUtilisedAfter,
      isWarning: false,
    };
  }

  if (percentageUtilisedAfter >= warningThresholdPercent) {
    return {
      allowed: true,
      code: 'WARNING_THRESHOLD',
      message: `The imprest will be ${percentageUtilisedAfter.toFixed(1)}% utilised after this entry.`,
      balanceBefore,
      balanceAfter,
      percentageUtilisedAfter,
      isWarning: true,
    };
  }

  return {
    allowed: true,
    code: 'OK',
    message: 'Within the available imprest balance.',
    balanceBefore,
    balanceAfter,
    percentageUtilisedAfter,
    isWarning: false,
  };
}

// ---------------------------------------------------------------------------
// Retirement
// ---------------------------------------------------------------------------

export interface ScheduleSourceRow {
  date: IsoDate;
  createdAt: string;
  voucherNumber: string | null;
  receiptNumber: string | null;
  vendorName: string;
  description: string;
  budgetHeadCode: string | null;
  amountPaid: Kobo;
  remarks: string | null;
  status: ExpenditureStatus;
  deletedAt: string | null;
}

/**
 * Compiles every counted expenditure into the numbered retirement schedule,
 * carrying a running total down the page exactly as a hand-written schedule does.
 */
export function buildRetirementSchedule(
  expenditures: readonly ScheduleSourceRow[],
): RetirementScheduleRow[] {
  const counted = fundConsumingLines(expenditures).sort(compareLedgerOrder);

  let runningTotal = 0;
  return counted.map((entry, index) => {
    runningTotal = addKobo(runningTotal, entry.amountPaid);
    return {
      serialNumber: index + 1,
      date: entry.date,
      voucherNumber: entry.voucherNumber ?? '—',
      receiptNumber: entry.receiptNumber ?? '—',
      vendor: entry.vendorName,
      particulars: entry.description,
      budgetHead: entry.budgetHeadCode ?? '—',
      amount: entry.amountPaid,
      runningTotal,
      remarks: entry.remarks ?? '',
    };
  });
}

export interface RetirementSummaryInput {
  amountReceived: Kobo;
  expenditures: readonly {
    amountPaid: Kobo;
    vendorName: string;
    status: ExpenditureStatus;
    deletedAt: string | null;
    attachmentCount: number;
  }[];
  retirementDate: IsoDate;
}

export function buildRetirementSummary(
  input: RetirementSummaryInput,
): Omit<RetirementSummary, 'preparedBy' | 'checkedBy' | 'approvedBy'> {
  const counted = fundConsumingLines(input.expenditures);
  const totalExpenditure = addKobo(...counted.map((e) => e.amountPaid));

  const vendors = new Set(
    counted.map((e) => e.vendorName.trim().toLowerCase()).filter((name) => name.length > 0),
  );
  const receiptCount = counted.reduce((sum, e) => sum + e.attachmentCount, 0);

  return {
    amountReceived: input.amountReceived,
    totalExpenditure,
    balanceReturned: subtractKobo(input.amountReceived, totalExpenditure),
    receiptCount,
    vendorCount: vendors.size,
    expenditureCount: counted.length,
    retirementDate: input.retirementDate,
  };
}

/**
 * Derives the imprest status implied by its retirement position.
 * Terminal statuses (CLOSED, CANCELLED) are never overwritten.
 */
export function deriveImprestStatus(params: {
  current: ImprestStatus;
  totalExpenditure: Kobo;
  /** Expenditure accounted for by retirements that have reached APPROVED or CLOSED. */
  totalRetired: Kobo;
}): ImprestStatus {
  const { current, totalExpenditure, totalRetired } = params;

  if (current === ImprestStatus.CLOSED || current === ImprestStatus.CANCELLED) return current;
  if (current === ImprestStatus.DRAFT) return ImprestStatus.DRAFT;

  if (totalRetired <= 0) return ImprestStatus.ACTIVE;
  // Fully retired once every kobo drawn has been accounted for on an approved schedule.
  if (totalExpenditure > 0 && totalRetired >= totalExpenditure) {
    return ImprestStatus.FULLY_RETIRED;
  }
  return ImprestStatus.PARTIALLY_RETIRED;
}

// ---------------------------------------------------------------------------
// Retirement due dates
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** Whole days from `today` until `dueDate`; negative once overdue. */
export function daysUntil(dueDate: IsoDate, today: Date = new Date()): number {
  const due = Date.parse(`${dueDate}T00:00:00.000Z`);
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((due - now) / MS_PER_DAY);
}

export function isRetirementOverdue(
  imprest: Pick<Imprest, 'expectedRetirementDate' | 'status'>,
  today: Date = new Date(),
): boolean {
  if (
    imprest.status === ImprestStatus.FULLY_RETIRED ||
    imprest.status === ImprestStatus.CLOSED ||
    imprest.status === ImprestStatus.CANCELLED ||
    imprest.status === ImprestStatus.DRAFT
  ) {
    return false;
  }
  return daysUntil(imprest.expectedRetirementDate, today) < 0;
}

/** Adds calendar days to an ISO date, returning an ISO date. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
