// ============================================================
// Quarterly standing imprest — the rules that gate public money
// ------------------------------------------------------------
// Nigerian Civil Service Financial Regulations govern when a standing imprest
// may be released, what may be charged against it, and when it is considered
// retired. Those rules live here as pure functions rather than inside route
// handlers, for two reasons:
//
//   • they are the part most worth testing, and a rule buried in a handler is
//     only ever tested through HTTP;
//   • the same rule has to be enforced server-side AND shown in the UI before
//     the officer wastes effort. One definition, two callers.
//
// Every amount is integer kobo. Nothing here rounds, and nothing returns a
// float.
// ============================================================

import { ImprestStatus, Quarter, RetirementStatus, STANDING_IMPREST_KOBO, WorkflowStage } from './enums';

// ---------------------------------------------------------------------------
// Quarters
// ---------------------------------------------------------------------------

/**
 * The theatre and its paperwork run on WAT, not on the machine's timezone.
 *
 * Kept as a plain offset because Nigeria has no daylight saving: WAT is UTC+1
 * all year, so there is no rule to look up and nothing to get wrong.
 */
const WAT_OFFSET_MINUTES = 60;

/**
 * The quarter a date falls in, judged in WAT. Q1 = January–March.
 *
 * The month is read in WAT rather than in the machine's local timezone, and
 * both kinds of caller need that.
 *
 * A date-only string such as '2026-04-01' is parsed as UTC midnight. Reading it
 * with getMonth() asked the machine's timezone, so anywhere west of UTC the
 * first day of a quarter fell back into the previous one — 1 April filed as Q1.
 * That never showed on a machine set to WAT, and never on Vercel, which runs
 * UTC; it appeared the moment the date was read on a workstation set to a
 * western timezone. Since the quarter is written into the imprest record, a
 * release approved on the first of April would have been filed against the
 * quarter that was supposed to have been retired already.
 *
 * The pages that pass a live `new Date()` want the quarter it is *in Enugu*,
 * which is the same answer. Reading those in UTC would have been wrong for the
 * hour after midnight WAT on four days of the year.
 */
export function quarterOf(date: Date | string): Quarter {
  const wat = new Date(new Date(date).getTime() + WAT_OFFSET_MINUTES * 60_000);
  const month = wat.getUTCMonth(); // 0-11, in WAT
  if (month < 3) return Quarter.Q1;
  if (month < 6) return Quarter.Q2;
  if (month < 9) return Quarter.Q3;
  return Quarter.Q4;
}

/** Calendar bounds of a quarter, for filtering and for the retirement due date. */
export function quarterRange(quarter: Quarter, year: number): { start: Date; end: Date } {
  const firstMonth = { Q1: 0, Q2: 3, Q3: 6, Q4: 9 }[quarter];
  return {
    start: new Date(Date.UTC(year, firstMonth, 1)),
    end: new Date(Date.UTC(year, firstMonth + 3, 0, 23, 59, 59, 999)),
  };
}

export function quarterLabel(quarter: Quarter, yearLabel?: string): string {
  const names = { Q1: 'First', Q2: 'Second', Q3: 'Third', Q4: 'Fourth' };
  return `${names[quarter]} Quarter${yearLabel ? ` ${yearLabel}` : ''}`;
}

// ---------------------------------------------------------------------------
// Rule results
// ---------------------------------------------------------------------------

export interface RuleResult {
  allowed: boolean;
  /** Machine-readable so the UI can react; the message is what a person reads. */
  code?: string;
  message?: string;
}

const ok: RuleResult = { allowed: true };
const deny = (code: string, message: string): RuleResult => ({ allowed: false, code, message });

// ---------------------------------------------------------------------------
// Releasing a quarterly imprest
// ---------------------------------------------------------------------------

export interface ExistingImprest {
  id: string;
  imprestNumber: string;
  quarter: Quarter | null;
  financialYearId: string;
  status: ImprestStatus | string;
  eligibleForNextQuarter: boolean;
}

/** An imprest still in play — not yet retired, closed or cancelled. */
export function isOpenImprest(imprest: { status: ImprestStatus | string }): boolean {
  return (
    imprest.status === ImprestStatus.DRAFT ||
    imprest.status === ImprestStatus.ACTIVE ||
    imprest.status === ImprestStatus.PARTIALLY_RETIRED
  );
}

/**
 * May a standing imprest be raised for this quarter?
 *
 * Two regulations combine here:
 *   • only one active imprest per quarter, and
 *   • the previous quarter's imprest must be fully retired AND approved before
 *     the next is released.
 *
 * The second is the one that actually bites: it is what stops an officer
 * carrying an unretired float from one quarter into the next.
 */
export function canRaiseQuarterlyImprest(params: {
  quarter: Quarter;
  financialYearId: string;
  existing: ExistingImprest[];
}): RuleResult {
  const { quarter, financialYearId, existing } = params;

  const sameQuarter = existing.find(
    (i) => i.quarter === quarter && i.financialYearId === financialYearId && isOpenImprest(i)
  );
  if (sameQuarter) {
    return deny(
      'QUARTER_ALREADY_OPEN',
      `${sameQuarter.imprestNumber} is already open for ${quarterLabel(quarter)}. Only one standing imprest may be active per quarter.`
    );
  }

  // Any earlier imprest still unretired blocks the release, whichever quarter
  // it belongs to — an outstanding float is an outstanding float.
  const unretired = existing.filter((i) => isOpenImprest(i) && !i.eligibleForNextQuarter);
  if (unretired.length > 0) {
    const names = unretired.map((i) => i.imprestNumber).join(', ');
    return deny(
      'PREVIOUS_NOT_RETIRED',
      `${names} has not been fully retired and approved. A new quarterly imprest cannot be released until it is.`
    );
  }

  return ok;
}

/** The standing imprest is a fixed sum; anything else needs separate approval. */
export function checkStandingImprestAmount(amountApproved: number): RuleResult {
  if (amountApproved > STANDING_IMPREST_KOBO) {
    return deny(
      'EXCEEDS_STANDING_IMPREST',
      `The quarterly standing imprest is ₦${(STANDING_IMPREST_KOBO / 100).toLocaleString()}. A larger sum requires separate approval from Hospital Management.`
    );
  }
  if (amountApproved <= 0) {
    return deny('INVALID_AMOUNT', 'The imprest amount must be greater than zero.');
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Spending against it
// ---------------------------------------------------------------------------
//
// "Total expenditure may never exceed the imprest" is NOT defined here. It
// already lives in calculations.checkOverspend, which the posting route calls
// and which also refuses to spend against a retired or cancelled imprest. A
// second copy of that rule would only be a second thing to keep in step.

// ---------------------------------------------------------------------------
// Retiring it
// ---------------------------------------------------------------------------

export interface ExpenditureForRetirement {
  id: string;
  expenseNumber: string;
  description: string;
  attachmentCount: number;
  status: string;
}

/**
 * Every expenditure must carry at least one supporting document before the
 * retirement may be submitted. Returns the offending lines so the officer is
 * told exactly which receipts are missing, not merely that some are.
 */
export function findExpendituresWithoutDocuments(
  lines: ExpenditureForRetirement[]
): ExpenditureForRetirement[] {
  return lines.filter((l) => l.status !== 'VOIDED' && l.attachmentCount === 0);
}

export function canSubmitRetirement(lines: ExpenditureForRetirement[]): RuleResult {
  if (lines.length === 0) {
    return deny('NO_EXPENDITURE', 'There is no expenditure to retire.');
  }
  const missing = findExpendituresWithoutDocuments(lines);
  if (missing.length > 0) {
    const listed = missing.slice(0, 5).map((m) => m.expenseNumber).join(', ');
    const more = missing.length > 5 ? ` and ${missing.length - 5} more` : '';
    return deny(
      'MISSING_DOCUMENTS',
      `${missing.length} expenditure line(s) have no supporting document: ${listed}${more}. Every line must carry a receipt, invoice or voucher before retirement can be submitted.`
    );
  }
  return ok;
}

export interface RetirementPosition {
  /** What was released to the officer. */
  openingImprest: number;
  totalExpenditure: number;
  /** Opening less expenditure — what should remain. */
  balance: number;
  /** Cash actually handed back. */
  balanceReturned: number;
  /** Still owed by the officer. Never negative. */
  refundDue: number;
  /** True when the imprest is exhausted or fully accounted for. */
  fullyAccounted: boolean;
}

/**
 * Opening imprest, less total expenditure, equals balance. Anything unreturned
 * is a refund due from the officer — the figure Accounts chases.
 */
export function computeRetirementPosition(params: {
  openingImprest: number;
  totalExpenditure: number;
  balanceReturned?: number;
}): RetirementPosition {
  const { openingImprest, totalExpenditure, balanceReturned = 0 } = params;
  const balance = openingImprest - totalExpenditure;
  const refundDue = Math.max(0, balance - balanceReturned);
  return {
    openingImprest,
    totalExpenditure,
    balance,
    balanceReturned,
    refundDue,
    fullyAccounted: refundDue === 0,
  };
}

/**
 * Does certifying this retirement release the NEXT quarter's imprest?
 *
 * The regulation is "fully retired AND approved", and both halves matter. An
 * approved PARTIAL retirement is not enough — otherwise an officer could retire
 * a tenth of the float, have that certified, and open the next quarter still
 * holding the rest.
 */
export function releasesNextQuarter(params: {
  retirementStatus: RetirementStatus | string;
  imprestStatus: ImprestStatus | string;
}): boolean {
  const approved =
    params.retirementStatus === RetirementStatus.APPROVED ||
    params.retirementStatus === RetirementStatus.COMPLETED ||
    params.retirementStatus === RetirementStatus.CLOSED;
  return approved && params.imprestStatus === ImprestStatus.FULLY_RETIRED;
}

// ---------------------------------------------------------------------------
// Locking
// ---------------------------------------------------------------------------

/**
 * Once Management has approved a retirement its figures are closed. Reopening
 * is an administrative act with a reason, not an ordinary edit — an approved
 * retirement that can still be altered is not a record, it is a draft.
 */
export function isRetirementLocked(status: RetirementStatus | string, stage?: WorkflowStage | string): boolean {
  return (
    status === RetirementStatus.APPROVED ||
    status === RetirementStatus.COMPLETED ||
    status === RetirementStatus.CLOSED ||
    stage === WorkflowStage.APPROVED ||
    stage === WorkflowStage.COMPLETED
  );
}

/** Imprests whose expenditure can no longer be edited. */
export function isImprestLocked(status: ImprestStatus | string): boolean {
  return (
    status === ImprestStatus.FULLY_RETIRED ||
    status === ImprestStatus.CLOSED ||
    status === ImprestStatus.CANCELLED
  );
}

// ---------------------------------------------------------------------------
// Retirement due dates
// ---------------------------------------------------------------------------

/**
 * Days remaining before the retirement is due. Negative once overdue, which is
 * what the dashboard shows in red.
 */
export function daysUntilRetirementDue(expected: Date | string | null, now: Date = new Date()): number | null {
  if (!expected) return null;
  const due = new Date(expected).getTime();
  const today = new Date(now.toISOString().slice(0, 10)).getTime();
  return Math.round((due - today) / 86_400_000);
}
