// ============================================================
// Imprest reports
// ------------------------------------------------------------
// The registers the unit is actually asked for: the imprest register, a cash
// book for one imprest, outstanding retirements, and a vendor register.
//
// Every figure is derived from the stored rows at request time rather than kept
// in a summary table, so a report can never disagree with the ledger it claims
// to summarise. All money stays integer kobo and is serialised as a number.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireImprest } from '@/lib/imprest/access';
import { Permission } from '@/lib/imprest/permissions';
import { ExpenditureStatus, ImprestStatus } from '@/lib/imprest/enums';
import { serialize } from '@/lib/imprest/serialize';

export const dynamic = 'force-dynamic';

type ReportKind = 'register' | 'cash-book' | 'outstanding' | 'vendors';

export async function GET(request: NextRequest) {
  const guard = await requireImprest(Permission.REPORT_VIEW);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const kind = (sp.get('kind') ?? 'register') as ReportKind;

  // A department-scoped duty only ever reports on its own department.
  const scope = guard.actor.departmentId ? { departmentId: guard.actor.departmentId } : {};

  try {
    switch (kind) {
      case 'cash-book':
        return await cashBook(sp.get('imprestId'), scope);
      case 'outstanding':
        return await outstanding(scope);
      case 'vendors':
        return await vendorRegister();
      case 'register':
      default:
        return await imprestRegister(sp, scope);
    }
  } catch (error) {
    console.error('[imprest] report failed:', error);
    return NextResponse.json({ error: 'Failed to produce the report' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Imprest register — every imprest for a period, with what became of it
// ---------------------------------------------------------------------------
async function imprestRegister(sp: URLSearchParams, scope: Record<string, unknown>) {
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

  return NextResponse.json(
    serialize({
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
    })
  );
}

// ---------------------------------------------------------------------------
// Cash book — one imprest, every line, with a running balance
// ---------------------------------------------------------------------------
async function cashBook(imprestId: string | null, scope: Record<string, unknown>) {
  if (!imprestId) {
    return NextResponse.json({ error: 'Which imprest?' }, { status: 400 });
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
  if (!imprest) return NextResponse.json({ error: 'Imprest not found' }, { status: 404 });

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
      receiptNumber: e.receiptNumber,
      hasReceipt: e.attachments.length > 0,
      amount,
      status: e.status,
      runningBalance: running,
    };
  });

  return NextResponse.json(
    serialize({
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
    })
  );
}

// ---------------------------------------------------------------------------
// Outstanding retirements — the ageing list
// ---------------------------------------------------------------------------
async function outstanding(scope: Record<string, unknown>) {
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

  return NextResponse.json(
    serialize({
      kind: 'outstanding',
      generatedAt: new Date(),
      lines,
      totals: {
        count: lines.length,
        unretired: sum(lines, 'unretired'),
        overdue: lines.filter((l) => l.daysOverdue > 0).length,
        overdueValue: lines.filter((l) => l.daysOverdue > 0).reduce((s, l) => s + l.unretired, 0),
      },
    })
  );
}

// ---------------------------------------------------------------------------
// Vendor register — who the unit actually pays
// ---------------------------------------------------------------------------
async function vendorRegister() {
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
  return NextResponse.json(
    serialize({
      kind: 'vendors',
      generatedAt: new Date(),
      lines: rows,
      totals: { vendors: rows.length, paid: rows.reduce((s, r) => s + r.total, 0) },
    })
  );
}

// ---------------------------------------------------------------------------

function sum<T extends Record<string, unknown>>(rows: T[], key: keyof T): number {
  return rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
}

/** Days past the retirement date, or 0 when not yet due or already retired. */
function overdueDays(expected: Date | null, status: string): number {
  if (!expected) return 0;
  if (status === ImprestStatus.FULLY_RETIRED || status === ImprestStatus.CLOSED || status === ImprestStatus.CANCELLED) {
    return 0;
  }
  const diff = Date.now() - new Date(expected).getTime();
  return diff <= 0 ? 0 : Math.floor(diff / 86_400_000);
}
