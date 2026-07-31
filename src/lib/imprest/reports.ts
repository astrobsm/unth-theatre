// ============================================================
// Imprest reports — the figures
// ------------------------------------------------------------
// These builders were inside the reports route handler. They moved here when
// the Excel export was added, because the export must show EXACTLY the same
// numbers as the screen. The alternative — having the export route call the
// report route over HTTP — makes a function fetch itself, which is fragile on
// a serverless deployment and forwards cookies to do work it could simply do.
//
// Every figure is derived from the stored rows at request time rather than kept
// in a summary table, so a report can never disagree with the ledger it claims
// to summarise. All money stays integer kobo and is serialised as a number.
// ============================================================

import prisma from '@/lib/prisma';
import {
  ALL_QUARTERS,
  ExpenditureStatus,
  ImprestStatus,
  Quarter,
  STANDING_IMPREST_KOBO,
} from './enums';
import { daysUntilRetirementDue, quarterLabel, quarterOf } from './quarterlyRules';
import { serialize } from './serialize';

/** A refusal a report builder can raise, carrying the status the route returns. */
export class ReportError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ReportError';
  }
}

/** A duty scoped to one department only ever reports on that department. */
export type ReportScope = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Imprest register — every imprest for a period, with what became of it
// ---------------------------------------------------------------------------
export async function imprestRegister(sp: URLSearchParams, scope: Record<string, unknown>) {
  const financialYearId = sp.get('financialYearId') || undefined;
  const from = sp.get('from');
  const to = sp.get('to');

  const rows = await prisma.imprest.findMany({
    where: {
      deletedAt: null,
      ...scope,
      ...(financialYearId ? { financialYearId } : {}),
      ...(from || to
        ? { dateApproved: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    },
    include: {
      department: { select: { code: true, name: true } },
      receivingOfficer: { select: { fullName: true } },
      financialYear: { select: { label: true } },
      expenditures: { where: { deletedAt: null, status: { not: ExpenditureStatus.VOIDED } }, select: { totalCost: true } },
    },
    orderBy: { dateApproved: 'asc' },
  });

  const lines = rows.map((r) => {
    const spent = r.expenditures.reduce((s, e) => s + Number(e.totalCost), 0);
    return {
      id: r.id,
      imprestNumber: r.imprestNumber,
      dateApproved: r.dateApproved,
      department: r.department?.code ?? null,
      officer: r.receivingOfficer?.fullName ?? null,
      purpose: r.purpose,
      amountApproved: Number(r.amountApproved),
      amountReceived: Number(r.amountReceived),
      spent,
      balance: Number(r.amountReceived) - spent,
      status: r.status,
      expectedRetirementDate: r.expectedRetirementDate,
      // The figure that turns a register into an ageing report.
      daysOverdue: overdueDays(r.expectedRetirementDate, r.status),
    };
  });

  return serialize({
      kind: 'register',
      generatedAt: new Date(),
      lines,
      totals: {
        count: lines.length,
        approved: sum(lines, 'amountApproved'),
        received: sum(lines, 'amountReceived'),
        spent: sum(lines, 'spent'),
        balance: sum(lines, 'balance'),
        overdue: lines.filter((l) => l.daysOverdue > 0).length,
      },
  });
}

// ---------------------------------------------------------------------------
// Cash book — one imprest, every line, with a running balance
// ---------------------------------------------------------------------------
export async function cashBook(imprestId: string | null, scope: Record<string, unknown>) {
  if (!imprestId) {
    throw new ReportError(400, 'Which imprest?');
  }

  const imprest = await prisma.imprest.findFirst({
    where: { id: imprestId, deletedAt: null, ...scope },
    include: {
      department: { select: { code: true, name: true } },
      receivingOfficer: { select: { fullName: true } },
      expenditures: {
        where: { deletedAt: null },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        include: {
          category: { select: { name: true } },
          attachments: { where: { deletedAt: null }, select: { id: true } },
        },
      },
    },
  });
  if (!imprest) throw new ReportError(404, 'Imprest not found');

  // Running balance in the order the money actually moved.
  let running = Number(imprest.amountReceived);
  const lines = imprest.expenditures.map((e) => {
    const amount = e.status === ExpenditureStatus.VOIDED ? 0 : Number(e.totalCost);
    running -= amount;
    return {
      id: e.id,
      date: e.date,
      expenseNumber: e.expenseNumber,
      description: e.description,
      vendorName: e.vendorName,
      category: e.category?.name ?? null,
      paymentMethod: e.paymentMethod,
      paymentVoucherNumber: e.paymentVoucherNumber,
      chequeNumber: e.chequeNumber,
      bankReference: e.bankReference,
      receiptNumber: e.receiptNumber,
      hasReceipt: e.attachments.length > 0,
      amount,
      status: e.status,
      runningBalance: running,
    };
  });

  return serialize({
      kind: 'cash-book',
      generatedAt: new Date(),
      imprest: {
        id: imprest.id,
        imprestNumber: imprest.imprestNumber,
        purpose: imprest.purpose,
        department: imprest.department,
        officer: imprest.receivingOfficer?.fullName ?? null,
        amountReceived: Number(imprest.amountReceived),
        dateReceived: imprest.dateReceived,
      },
      lines,
      totals: {
        spent: lines.reduce((s, l) => s + l.amount, 0),
        closingBalance: running,
        linesWithoutReceipt: lines.filter((l) => !l.hasReceipt && l.status !== ExpenditureStatus.VOIDED).length,
      },
  });
}

// ---------------------------------------------------------------------------
// Outstanding retirements — the ageing list
// ---------------------------------------------------------------------------
export async function outstanding(scope: Record<string, unknown>) {
  const rows = await prisma.imprest.findMany({
    where: {
      deletedAt: null,
      ...scope,
      status: { in: [ImprestStatus.ACTIVE, ImprestStatus.PARTIALLY_RETIRED] },
    },
    include: {
      department: { select: { code: true } },
      receivingOfficer: { select: { fullName: true } },
      expenditures: { where: { deletedAt: null, status: { not: ExpenditureStatus.VOIDED } }, select: { totalCost: true } },
    },
    orderBy: { expectedRetirementDate: 'asc' },
  });

  const lines = rows.map((r) => {
    const spent = r.expenditures.reduce((s, e) => s + Number(e.totalCost), 0);
    return {
      id: r.id,
      imprestNumber: r.imprestNumber,
      officer: r.receivingOfficer?.fullName ?? null,
      department: r.department?.code ?? null,
      amountReceived: Number(r.amountReceived),
      spent,
      unretired: Number(r.amountReceived) - spent,
      expectedRetirementDate: r.expectedRetirementDate,
      daysOverdue: overdueDays(r.expectedRetirementDate, r.status),
    };
  });

  return serialize({
      kind: 'outstanding',
      generatedAt: new Date(),
      lines,
      totals: {
        count: lines.length,
        unretired: sum(lines, 'unretired'),
        overdue: lines.filter((l) => l.daysOverdue > 0).length,
        overdueValue: lines.filter((l) => l.daysOverdue > 0).reduce((s, l) => s + l.unretired, 0),
      },
  });
}

// ---------------------------------------------------------------------------
// Vendor register — who the unit actually pays
// ---------------------------------------------------------------------------
export async function vendorRegister() {
  // Grouped from the expenditure lines rather than the vendor table, because
  // the witness name on the line is what was actually paid.
  const lines = await prisma.expenditure.findMany({
    where: { deletedAt: null, status: { not: ExpenditureStatus.VOIDED } },
    select: { vendorName: true, vendorTin: true, totalCost: true, date: true },
  });

  const byVendor = new Map<string, { vendorName: string; tin: string | null; count: number; total: number; last: Date | null }>();
  for (const l of lines) {
    const key = l.vendorName.trim().toLowerCase();
    const row = byVendor.get(key) ?? { vendorName: l.vendorName, tin: l.vendorTin, count: 0, total: 0, last: null };
    row.count += 1;
    row.total += Number(l.totalCost);
    if (!row.last || (l.date && l.date > row.last)) row.last = l.date;
    byVendor.set(key, row);
  }

  const rows = Array.from(byVendor.values()).sort((a, b) => b.total - a.total);
  return serialize({
      kind: 'vendors',
      generatedAt: new Date(),
      lines: rows,
      totals: { vendors: rows.length, paid: rows.reduce((s, r) => s + r.total, 0) },
  });
}

// ---------------------------------------------------------------------------
// Quarterly position — the figures the retirement itself is built from
// ---------------------------------------------------------------------------
/**
 * One quarter of one financial year: what was released, what was spent, what is
 * left, whether the retirement has been certified, and what is still missing.
 *
 * The "outstanding receipts" count is the one that matters operationally — it
 * is the exact list that will block submission, so the officer sees it now
 * rather than at the moment they try to submit.
 */
export async function quarterlyPosition(sp: URLSearchParams, scope: Record<string, unknown>) {
  const financialYearId = sp.get('financialYearId') || undefined;
  const quarter = (sp.get('quarter') as Quarter | null) ?? quarterOf(new Date());

  const rows = await prisma.imprest.findMany({
    where: { deletedAt: null, ...scope, quarter, ...(financialYearId ? { financialYearId } : {}) },
    include: {
      financialYear: { select: { id: true, label: true } },
      department: { select: { code: true, name: true } },
      receivingOfficer: { select: { fullName: true } },
      expenditures: {
        where: { deletedAt: null, status: { not: ExpenditureStatus.VOIDED } },
        select: {
          id: true,
          expenseNumber: true,
          description: true,
          totalCost: true,
          date: true,
          category: { select: { id: true, name: true } },
          _count: { select: { attachments: { where: { deletedAt: null } } } },
        },
      },
      retirements: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          retirementNumber: true,
          status: true,
          currentStage: true,
          totalExpenditure: true,
          balanceReturned: true,
          refundDue: true,
          submittedAt: true,
          approvedAt: true,
        },
      },
    },
    orderBy: { dateApproved: 'asc' },
  });

  const imprests = rows.map((r) => {
    const spent = r.expenditures.reduce((s, e) => s + Number(e.totalCost), 0);
    const received = Number(r.amountReceived);
    const undocumented = r.expenditures.filter((e) => e._count.attachments === 0);
    const retirement = r.retirements[0] ?? null;
    return {
      id: r.id,
      imprestNumber: r.imprestNumber,
      quarter: r.quarter,
      financialYear: r.financialYear?.label ?? null,
      department: r.department?.code ?? null,
      officer: r.receivingOfficer?.fullName ?? null,
      status: r.status,
      amountApproved: Number(r.amountApproved),
      amountReceived: received,
      totalExpenditure: spent,
      balance: received - spent,
      expenditureCount: r.expenditures.length,
      // Lines with no receipt behind them — what will block submission.
      outstandingReceipts: undocumented.length,
      outstandingReceiptLines: undocumented.slice(0, 20).map((e) => ({
        id: e.id,
        expenseNumber: e.expenseNumber,
        description: e.description,
        amount: Number(e.totalCost),
      })),
      expectedRetirementDate: r.expectedRetirementDate,
      daysUntilRetirementDue: daysUntilRetirementDue(r.expectedRetirementDate),
      eligibleForNextQuarter: r.eligibleForNextQuarter,
      retirement,
    };
  });

  // Spending by category across the quarter, largest first.
  const byCategory = new Map<string, { category: string; count: number; total: number }>();
  for (const r of rows) {
    for (const e of r.expenditures) {
      const name = e.category?.name ?? 'Uncategorised';
      const row = byCategory.get(name) ?? { category: name, count: 0, total: 0 };
      row.count += 1;
      row.total += Number(e.totalCost);
      byCategory.set(name, row);
    }
  }

  return serialize({
      kind: 'quarterly',
      generatedAt: new Date(),
      quarter,
      quarterLabel: quarterLabel(quarter),
      financialYearId: financialYearId ?? null,
      imprests,
      categories: Array.from(byCategory.values()).sort((a, b) => b.total - a.total),
      totals: {
        imprests: imprests.length,
        received: sum(imprests, 'amountReceived'),
        spent: sum(imprests, 'totalExpenditure'),
        balance: sum(imprests, 'balance'),
        outstandingReceipts: sum(imprests, 'outstandingReceipts'),
        standingImprest: STANDING_IMPREST_KOBO,
      },
  });
}

// ---------------------------------------------------------------------------
// Annual summary — the four quarters side by side
// ---------------------------------------------------------------------------
export async function annualSummary(sp: URLSearchParams, scope: Record<string, unknown>) {
  const financialYearId = sp.get('financialYearId') || undefined;

  const rows = await prisma.imprest.findMany({
    where: { deletedAt: null, ...scope, ...(financialYearId ? { financialYearId } : {}) },
    include: {
      financialYear: { select: { id: true, label: true } },
      expenditures: {
        where: { deletedAt: null, status: { not: ExpenditureStatus.VOIDED } },
        select: { totalCost: true },
      },
      retirements: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { status: true, refundDue: true },
      },
    },
  });

  const quarters = ALL_QUARTERS.map((q) => {
    const inQuarter = rows.filter((r) => r.quarter === q);
    const received = inQuarter.reduce((s, r) => s + Number(r.amountReceived), 0);
    const spent = inQuarter.reduce(
      (s, r) => s + r.expenditures.reduce((t, e) => t + Number(e.totalCost), 0),
      0
    );
    const retired = inQuarter.filter((r) => r.eligibleForNextQuarter).length;
    return {
      quarter: q,
      label: quarterLabel(q),
      imprests: inQuarter.length,
      received,
      spent,
      balance: received - spent,
      utilisation: received > 0 ? Math.round((spent / received) * 100) : 0,
      retiredAndApproved: retired,
      refundDue: inQuarter.reduce((s, r) => s + Number(r.retirements[0]?.refundDue ?? 0), 0),
    };
  });

  return serialize({
      kind: 'annual',
      generatedAt: new Date(),
      financialYear: rows[0]?.financialYear?.label ?? null,
      financialYearId: financialYearId ?? null,
      quarters,
      totals: {
        received: sum(quarters, 'received'),
        spent: sum(quarters, 'spent'),
        balance: sum(quarters, 'balance'),
        refundDue: sum(quarters, 'refundDue'),
        annualEntitlement: STANDING_IMPREST_KOBO * 4,
      },
  });
}

// ---------------------------------------------------------------------------
// Category analysis — what the money actually goes on
// ---------------------------------------------------------------------------
export async function categoryAnalysis(sp: URLSearchParams, scope: Record<string, unknown>) {
  const financialYearId = sp.get('financialYearId') || undefined;
  const quarter = (sp.get('quarter') as Quarter | null) ?? undefined;

  const lines = await prisma.expenditure.findMany({
    where: {
      deletedAt: null,
      status: { not: ExpenditureStatus.VOIDED },
      imprest: {
        deletedAt: null,
        ...scope,
        ...(quarter ? { quarter } : {}),
        ...(financialYearId ? { financialYearId } : {}),
      },
    },
    select: {
      totalCost: true,
      category: { select: { id: true, name: true } },
      imprest: { select: { quarter: true } },
    },
  });

  const byCategory = new Map<
    string,
    { category: string; count: number; total: number; byQuarter: Record<string, number> }
  >();
  for (const l of lines) {
    const name = l.category?.name ?? 'Uncategorised';
    const row =
      byCategory.get(name) ?? { category: name, count: 0, total: 0, byQuarter: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 } };
    row.count += 1;
    row.total += Number(l.totalCost);
    if (l.imprest?.quarter) row.byQuarter[l.imprest.quarter] += Number(l.totalCost);
    byCategory.set(name, row);
  }

  const rows = Array.from(byCategory.values()).sort((a, b) => b.total - a.total);
  const grand = rows.reduce((s, r) => s + r.total, 0);

  return serialize({
      kind: 'categories',
      generatedAt: new Date(),
      quarter: quarter ?? null,
      // Share of total spend, so the report reads without a calculator.
      lines: rows.map((r) => ({ ...r, share: grand > 0 ? Math.round((r.total / grand) * 1000) / 10 : 0 })),
      totals: { categories: rows.length, spent: grand },
  });
}

// ---------------------------------------------------------------------------

export function sum<T extends Record<string, unknown>>(rows: T[], key: keyof T): number {
  return rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
}

/** Days past the retirement date, or 0 when not yet due or already retired. */
export function overdueDays(expected: Date | null, status: string): number {
  if (!expected) return 0;
  if (status === ImprestStatus.FULLY_RETIRED || status === ImprestStatus.CLOSED || status === ImprestStatus.CANCELLED) {
    return 0;
  }
  const diff = Date.now() - new Date(expected).getTime();
  return diff <= 0 ? 0 : Math.floor(diff / 86_400_000);
}

// ---------------------------------------------------------------------------
// Receipt register — the evidence bundle, listed
// ---------------------------------------------------------------------------
/**
 * Every supporting document held, with the expenditure it belongs to and its
 * content hash. An auditor reconciles the physical bundle against this list;
 * the checksum is what lets them prove a file has not been swapped since it
 * was captured.
 */
export async function receiptRegister(sp: URLSearchParams, scope: ReportScope) {
  const quarter = (sp.get('quarter') as Quarter | null) ?? undefined;
  const financialYearId = sp.get('financialYearId') || undefined;

  const rows = await prisma.attachment.findMany({
    where: {
      deletedAt: null,
      expenditure: {
        deletedAt: null,
        imprest: {
          deletedAt: null,
          ...scope,
          ...(quarter ? { quarter } : {}),
          ...(financialYearId ? { financialYearId } : {}),
        },
      },
    },
    select: {
      id: true,
      kind: true,
      fileName: true,
      mimeType: true,
      byteSize: true,
      checksum: true,
      capturedAt: true,
      createdAt: true,
      expenditure: {
        select: {
          expenseNumber: true,
          description: true,
          vendorName: true,
          totalCost: true,
          receiptNumber: true,
          imprest: { select: { imprestNumber: true, quarter: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const lines = rows.map((a) => ({
    id: a.id,
    imprestNumber: a.expenditure?.imprest?.imprestNumber ?? null,
    quarter: a.expenditure?.imprest?.quarter ?? null,
    expenseNumber: a.expenditure?.expenseNumber ?? null,
    description: a.expenditure?.description ?? null,
    vendorName: a.expenditure?.vendorName ?? null,
    amount: Number(a.expenditure?.totalCost ?? 0),
    receiptNumber: a.expenditure?.receiptNumber ?? null,
    kind: a.kind,
    fileName: a.fileName,
    mimeType: a.mimeType,
    byteSize: a.byteSize,
    // Truncated: the full 64 characters are unreadable on a printed register,
    // and the first 12 are ample to spot a substitution against the record.
    checksum: a.checksum ? a.checksum.slice(0, 12) : null,
    capturedAt: a.capturedAt,
  }));

  return serialize({
    kind: 'receipts',
    generatedAt: new Date(),
    quarter: quarter ?? null,
    lines,
    totals: {
      receipts: lines.length,
      documented: sum(lines, 'amount'),
      bytes: sum(lines, 'byteSize'),
    },
  });
}

// ---------------------------------------------------------------------------
// Audit report — who did what, from where
// ---------------------------------------------------------------------------
export async function auditReport(sp: URLSearchParams) {
  const from = sp.get('from');
  const to = sp.get('to');
  const entity = sp.get('entity');

  const rows = await prisma.imprestAuditLog.findMany({
    where: {
      ...(entity ? { entity: entity as never } : {}),
      ...(from || to
        ? { occurredAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    },
    orderBy: { occurredAt: 'desc' },
    // An audit report is read, not scrolled forever; the date filter is how a
    // reader narrows it rather than an unbounded dump.
    take: 1000,
    select: {
      id: true,
      occurredAt: true,
      action: true,
      entity: true,
      entityLabel: true,
      actorName: true,
      actorRole: true,
      reason: true,
      notes: true,
      ipAddress: true,
      changes: true,
    },
  });

  const lines = rows.map((r) => ({
    id: r.id,
    at: r.occurredAt,
    action: r.action,
    entity: r.entity,
    record: r.entityLabel,
    actor: r.actorName,
    role: r.actorRole,
    reason: r.reason,
    notes: r.notes,
    ipAddress: r.ipAddress,
    // Rendered as "field: from → to" so the register reads without expanding JSON.
    changed: summariseChanges(r.changes),
  }));

  return serialize({
    kind: 'audit',
    generatedAt: new Date(),
    lines,
    totals: {
      entries: lines.length,
      overrides: lines.filter((l) => l.action === 'REOPEN').length,
    },
  });
}

/** `{field:{from,to}}` as a short human sentence. */
function summariseChanges(changes: unknown): string | null {
  if (!changes || typeof changes !== 'object') return null;
  const parts: string[] = [];
  for (const [field, delta] of Object.entries(changes as Record<string, unknown>)) {
    if (delta && typeof delta === 'object' && 'to' in (delta as Record<string, unknown>)) {
      const d = delta as { from?: unknown; to?: unknown };
      parts.push(`${field}: ${d.from ?? '—'} → ${d.to ?? '—'}`);
    }
  }
  return parts.length > 0 ? parts.join('; ') : null;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export const REPORT_KINDS = [
  'register',
  'cash-book',
  'outstanding',
  'vendors',
  'quarterly',
  'annual',
  'categories',
  'receipts',
  'audit',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/**
 * Produce a report. Both the JSON route and the Excel export come through
 * here, which is what guarantees the workbook and the screen agree.
 */
export async function buildReport(
  kind: string,
  sp: URLSearchParams,
  scope: ReportScope
): Promise<Record<string, unknown>> {
  // `serialize` is typed as returning `unknown` — it converts BigInt to number,
  // a change TypeScript cannot express as a mapped type. The shape is otherwise
  // exactly what each builder assembled, so the cast is asserting what the code
  // above already shows.
  return (await dispatch(kind, sp, scope)) as Record<string, unknown>;
}

async function dispatch(kind: string, sp: URLSearchParams, scope: ReportScope): Promise<unknown> {
  switch (kind) {
    case 'cash-book':
      return await cashBook(sp.get('imprestId'), scope);
    case 'outstanding':
      return await outstanding(scope);
    case 'vendors':
      return await vendorRegister();
    case 'quarterly':
      return await quarterlyPosition(sp, scope);
    case 'annual':
      return await annualSummary(sp, scope);
    case 'categories':
      return await categoryAnalysis(sp, scope);
    case 'receipts':
      return await receiptRegister(sp, scope);
    case 'audit':
      return await auditReport(sp);
    case 'register':
    default:
      return await imprestRegister(sp, scope);
  }
}
