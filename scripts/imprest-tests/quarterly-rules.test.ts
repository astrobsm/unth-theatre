/**
 * The Financial Regulations rules that gate public money.
 *
 * Written in the same style as the suites that shipped with the imprest system,
 * and run by the same runner.
 */
import { describe, expect, it } from 'vitest';

import {
  quarterOf,
  quarterRange,
  quarterLabel,
  canRaiseQuarterlyImprest,
  checkStandingImprestAmount,
  findExpendituresWithoutDocuments,
  canSubmitRetirement,
  computeRetirementPosition,
  releasesNextQuarter,
  isRetirementLocked,
  isImprestLocked,
  daysUntilRetirementDue,
  isOpenImprest,
} from './quarterlyRules';
import { ImprestStatus, Quarter, RetirementStatus, STANDING_IMPREST_KOBO, WorkflowStage } from './enums';

const imprest = (o: Partial<Parameters<typeof canRaiseQuarterlyImprest>[0]['existing'][0]> = {}) => ({
  id: 'i1',
  imprestNumber: 'IMP/2026/0001',
  quarter: Quarter.Q1,
  financialYearId: 'fy2026',
  status: ImprestStatus.ACTIVE,
  eligibleForNextQuarter: false,
  ...o,
});

describe('quarters', () => {
  it('places each month in its quarter', () => {
    expect(quarterOf('2026-01-15')).toBe(Quarter.Q1);
    expect(quarterOf('2026-03-31')).toBe(Quarter.Q1);
    expect(quarterOf('2026-04-01')).toBe(Quarter.Q2);
    expect(quarterOf('2026-07-01')).toBe(Quarter.Q3);
    expect(quarterOf('2026-10-01')).toBe(Quarter.Q4);
    expect(quarterOf('2026-12-31')).toBe(Quarter.Q4);
  });

  it('reads the quarter in WAT, not in the timezone of the machine', () => {
    // A date-only string is parsed as UTC midnight. Reading the month locally
    // put the first day of a quarter in the previous one on any workstation
    // west of UTC, which is how a release approved on 1 April was filed against
    // the quarter it was meant to replace. These assert the WAT answer, so they
    // fail on a machine set to Lagos, London or Los Angeles alike.
    expect(quarterOf('2026-04-01')).toBe(Quarter.Q2);
    expect(quarterOf('2026-07-01')).toBe(Quarter.Q3);
    expect(quarterOf('2026-10-01')).toBe(Quarter.Q4);
    expect(quarterOf('2026-01-01')).toBe(Quarter.Q1);

    // The last instant of a quarter in WAT still belongs to it, though the same
    // moment is already the next quarter in UTC.
    expect(quarterOf(new Date('2026-03-31T23:30:00.000+01:00'))).toBe(Quarter.Q1);
    // And the first instant of the next one, an hour before UTC agrees.
    expect(quarterOf(new Date('2026-04-01T00:30:00.000+01:00'))).toBe(Quarter.Q2);
  });

  it('gives the calendar bounds of a quarter', () => {
    const q1 = quarterRange(Quarter.Q1, 2026);
    expect(q1.start.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(q1.end.toISOString().slice(0, 10)).toBe('2026-03-31');

    const q4 = quarterRange(Quarter.Q4, 2026);
    expect(q4.start.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(q4.end.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('names quarters the way the paperwork does', () => {
    expect(quarterLabel(Quarter.Q1, '2026')).toBe('First Quarter 2026');
    expect(quarterLabel(Quarter.Q4)).toBe('Fourth Quarter');
  });
});

describe('releasing a quarterly imprest', () => {
  it('allows the first imprest of a year', () => {
    expect(canRaiseQuarterlyImprest({ quarter: Quarter.Q1, financialYearId: 'fy2026', existing: [] }).allowed).toBe(true);
  });

  it('refuses a second imprest for a quarter already open', () => {
    const r = canRaiseQuarterlyImprest({
      quarter: Quarter.Q1,
      financialYearId: 'fy2026',
      existing: [imprest()],
    });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('QUARTER_ALREADY_OPEN');
    expect(r.message).toContain('IMP/2026/0001');
  });

  it('refuses the next quarter while the previous is unretired', () => {
    const r = canRaiseQuarterlyImprest({
      quarter: Quarter.Q2,
      financialYearId: 'fy2026',
      existing: [imprest({ quarter: Quarter.Q1, eligibleForNextQuarter: false })],
    });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('PREVIOUS_NOT_RETIRED');
  });

  it('allows the next quarter once the previous is retired and approved', () => {
    const r = canRaiseQuarterlyImprest({
      quarter: Quarter.Q2,
      financialYearId: 'fy2026',
      existing: [imprest({ quarter: Quarter.Q1, status: ImprestStatus.FULLY_RETIRED, eligibleForNextQuarter: true })],
    });
    expect(r.allowed).toBe(true);
  });

  it('does not count a closed or cancelled imprest as outstanding', () => {
    expect(isOpenImprest({ status: ImprestStatus.CLOSED })).toBe(false);
    expect(isOpenImprest({ status: ImprestStatus.CANCELLED })).toBe(false);
    expect(isOpenImprest({ status: ImprestStatus.ACTIVE })).toBe(true);
    expect(isOpenImprest({ status: ImprestStatus.PARTIALLY_RETIRED })).toBe(true);
  });

  it('reopening a quarter is allowed once its imprest is retired', () => {
    const r = canRaiseQuarterlyImprest({
      quarter: Quarter.Q1,
      financialYearId: 'fy2026',
      existing: [imprest({ status: ImprestStatus.FULLY_RETIRED, eligibleForNextQuarter: true })],
    });
    expect(r.allowed).toBe(true);
  });
});

describe('the standing imprest is a fixed sum', () => {
  it('accepts the standing amount exactly', () => {
    expect(checkStandingImprestAmount(STANDING_IMPREST_KOBO).allowed).toBe(true);
  });

  it('accepts less than the standing amount', () => {
    expect(checkStandingImprestAmount(25_000_000).allowed).toBe(true);
  });

  it('refuses more than ₦500,000', () => {
    const r = checkStandingImprestAmount(STANDING_IMPREST_KOBO + 1);
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('EXCEEDS_STANDING_IMPREST');
    expect(r.message).toContain('500,000');
  });

  it('refuses zero or negative', () => {
    expect(checkStandingImprestAmount(0).allowed).toBe(false);
    expect(checkStandingImprestAmount(-100).allowed).toBe(false);
  });
});

// "Expenditure may never exceed the imprest" is checkOverspend's rule, covered
// by calculations.test.ts. It is deliberately not duplicated here.

describe('every expenditure needs a supporting document', () => {
  const line = (o = {}) => ({ id: 'e1', expenseNumber: 'E-001', description: 'x', attachmentCount: 1, status: 'POSTED', ...o });

  it('passes when every line has one', () => {
    expect(canSubmitRetirement([line(), line({ id: 'e2', expenseNumber: 'E-002' })]).allowed).toBe(true);
  });

  it('names the lines that do not', () => {
    const r = canSubmitRetirement([line(), line({ id: 'e2', expenseNumber: 'E-002', attachmentCount: 0 })]);
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('MISSING_DOCUMENTS');
    expect(r.message).toContain('E-002');
  });

  it('ignores voided lines, which are not being retired', () => {
    const missing = findExpendituresWithoutDocuments([line({ attachmentCount: 0, status: 'VOIDED' })]);
    expect(missing).toHaveLength(0);
  });

  it('refuses a retirement with nothing on it', () => {
    const r = canSubmitRetirement([]);
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('NO_EXPENDITURE');
  });

  it('summarises rather than listing dozens', () => {
    const many = Array.from({ length: 9 }, (_, i) => line({ id: `e${i}`, expenseNumber: `E-${i}`, attachmentCount: 0 }));
    const r = canSubmitRetirement(many);
    expect(r.message).toContain('4 more');
  });
});

describe('opening imprest less expenditure equals balance', () => {
  it('computes a refund when money is left unreturned', () => {
    const p = computeRetirementPosition({ openingImprest: 50_000_000, totalExpenditure: 38_750_000 });
    expect(p.balance).toBe(11_250_000);
    expect(p.refundDue).toBe(11_250_000);
    expect(p.fullyAccounted).toBe(false);
  });

  it('clears the refund once the cash is handed back', () => {
    const p = computeRetirementPosition({
      openingImprest: 50_000_000,
      totalExpenditure: 38_750_000,
      balanceReturned: 11_250_000,
    });
    expect(p.refundDue).toBe(0);
    expect(p.fullyAccounted).toBe(true);
  });

  it('shows no refund when the imprest is fully spent', () => {
    const p = computeRetirementPosition({ openingImprest: 50_000_000, totalExpenditure: 50_000_000 });
    expect(p.balance).toBe(0);
    expect(p.refundDue).toBe(0);
    expect(p.fullyAccounted).toBe(true);
  });

  it('never reports a negative refund', () => {
    // More returned than was left over — an overpayment, not a negative debt.
    const p = computeRetirementPosition({
      openingImprest: 50_000_000,
      totalExpenditure: 40_000_000,
      balanceReturned: 12_000_000,
    });
    expect(p.refundDue).toBe(0);
  });
});

describe('what releases the next quarter', () => {
  it('releases it when the imprest is fully retired and the retirement approved', () => {
    expect(
      releasesNextQuarter({
        retirementStatus: RetirementStatus.APPROVED,
        imprestStatus: ImprestStatus.FULLY_RETIRED,
      })
    ).toBe(true);
  });

  it('does NOT release it on an approved PARTIAL retirement', () => {
    // Retiring a tenth of the float and having that certified must not open
    // the next quarter while the officer still holds the rest.
    expect(
      releasesNextQuarter({
        retirementStatus: RetirementStatus.APPROVED,
        imprestStatus: ImprestStatus.PARTIALLY_RETIRED,
      })
    ).toBe(false);
  });

  it('does not release it while the retirement is still under review', () => {
    expect(
      releasesNextQuarter({
        retirementStatus: RetirementStatus.UNDER_REVIEW,
        imprestStatus: ImprestStatus.FULLY_RETIRED,
      })
    ).toBe(false);
  });

  it('does not release it on a rejected retirement', () => {
    expect(
      releasesNextQuarter({
        retirementStatus: RetirementStatus.REJECTED,
        imprestStatus: ImprestStatus.FULLY_RETIRED,
      })
    ).toBe(false);
  });

  it('still counts a completed retirement, not only a freshly approved one', () => {
    expect(
      releasesNextQuarter({
        retirementStatus: RetirementStatus.COMPLETED,
        imprestStatus: ImprestStatus.FULLY_RETIRED,
      })
    ).toBe(true);
  });
});

describe('approved records are closed', () => {
  it('locks once Management has approved', () => {
    expect(isRetirementLocked(RetirementStatus.APPROVED)).toBe(true);
    expect(isRetirementLocked(RetirementStatus.COMPLETED)).toBe(true);
  });

  it('leaves a draft or queried retirement editable', () => {
    expect(isRetirementLocked(RetirementStatus.DRAFT)).toBe(false);
    expect(isRetirementLocked(RetirementStatus.QUERIED)).toBe(false);
    expect(isRetirementLocked(RetirementStatus.UNDER_REVIEW)).toBe(false);
  });

  it('locks on the workflow stage too', () => {
    expect(isRetirementLocked(RetirementStatus.DRAFT, WorkflowStage.APPROVED)).toBe(true);
  });

  it('locks a retired or cancelled imprest', () => {
    expect(isImprestLocked(ImprestStatus.FULLY_RETIRED)).toBe(true);
    expect(isImprestLocked(ImprestStatus.CANCELLED)).toBe(true);
    expect(isImprestLocked(ImprestStatus.ACTIVE)).toBe(false);
  });
});

describe('retirement due dates', () => {
  it('counts days remaining', () => {
    expect(daysUntilRetirementDue('2026-08-10', new Date('2026-08-01T09:00:00Z'))).toBe(9);
  });

  it('goes negative once overdue', () => {
    expect(daysUntilRetirementDue('2026-07-25', new Date('2026-08-01T09:00:00Z'))).toBe(-7);
  });

  it('returns null when no date is set', () => {
    expect(daysUntilRetirementDue(null)).toBeNull();
  });
});
