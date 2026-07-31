// ============================================================
// Imprest reports — Excel export
// ------------------------------------------------------------
// The same figures the JSON reports return, written to a workbook. Kept beside
// the reports route rather than inside it because the two answer different
// questions: the report route feeds a screen, this one produces a file an
// accountant opens, prints and files.
//
// ExcelJS is already a dependency (the roster templates use it), so no new
// package is introduced. Money is written as a real number in naira with an
// accounting format, not as a pre-formatted string — an auditor who cannot
// total a column has been handed a picture of a report rather than a report.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireImprest } from '@/lib/imprest/access';
import { Permission } from '@/lib/imprest/permissions';
import { buildReport, ReportError } from '@/lib/imprest/reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Kobo to naira, as a number Excel can sum. */
const naira = (kobo: number | null | undefined) => Number(kobo ?? 0) / 100;

const MONEY_FORMAT = '#,##0.00';

interface Column {
  header: string;
  key: string;
  width?: number;
  money?: boolean;
}

/** Column layout per report kind. The order here is the order in the sheet. */
const LAYOUTS: Record<string, { title: string; columns: Column[]; rowsFrom: string }> = {
  quarterly: {
    title: 'Quarterly Retirement',
    rowsFrom: 'imprests',
    columns: [
      { header: 'Imprest No.', key: 'imprestNumber', width: 18 },
      { header: 'Quarter', key: 'quarter', width: 10 },
      { header: 'Financial year', key: 'financialYear', width: 14 },
      { header: 'Department', key: 'department', width: 14 },
      { header: 'Officer', key: 'officer', width: 22 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Approved (₦)', key: 'amountApproved', width: 16, money: true },
      { header: 'Received (₦)', key: 'amountReceived', width: 16, money: true },
      { header: 'Expenditure (₦)', key: 'totalExpenditure', width: 16, money: true },
      { header: 'Balance (₦)', key: 'balance', width: 16, money: true },
      { header: 'Lines', key: 'expenditureCount', width: 8 },
      { header: 'Missing receipts', key: 'outstandingReceipts', width: 16 },
      { header: 'Retire by', key: 'expectedRetirementDate', width: 14 },
      { header: 'Days to due', key: 'daysUntilRetirementDue', width: 12 },
    ],
  },
  annual: {
    title: 'Annual Summary',
    rowsFrom: 'quarters',
    columns: [
      { header: 'Quarter', key: 'label', width: 20 },
      { header: 'Imprests', key: 'imprests', width: 10 },
      { header: 'Received (₦)', key: 'received', width: 16, money: true },
      { header: 'Spent (₦)', key: 'spent', width: 16, money: true },
      { header: 'Balance (₦)', key: 'balance', width: 16, money: true },
      { header: 'Utilised %', key: 'utilisation', width: 12 },
      { header: 'Retired & approved', key: 'retiredAndApproved', width: 18 },
      { header: 'Refund due (₦)', key: 'refundDue', width: 16, money: true },
    ],
  },
  categories: {
    title: 'Category Analysis',
    rowsFrom: 'lines',
    columns: [
      { header: 'Category', key: 'category', width: 28 },
      { header: 'Lines', key: 'count', width: 10 },
      { header: 'Total (₦)', key: 'total', width: 18, money: true },
      { header: 'Share %', key: 'share', width: 10 },
    ],
  },
  register: {
    title: 'Imprest Register',
    rowsFrom: 'lines',
    columns: [
      { header: 'Imprest No.', key: 'imprestNumber', width: 18 },
      { header: 'Date approved', key: 'dateApproved', width: 14 },
      { header: 'Department', key: 'department', width: 14 },
      { header: 'Officer', key: 'officer', width: 22 },
      { header: 'Purpose', key: 'purpose', width: 34 },
      { header: 'Approved (₦)', key: 'amountApproved', width: 16, money: true },
      { header: 'Received (₦)', key: 'amountReceived', width: 16, money: true },
      { header: 'Spent (₦)', key: 'spent', width: 16, money: true },
      { header: 'Balance (₦)', key: 'balance', width: 16, money: true },
      { header: 'Status', key: 'status', width: 18 },
    ],
  },
  'cash-book': {
    title: 'Expense Register',
    rowsFrom: 'lines',
    columns: [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Ref', key: 'expenseNumber', width: 22 },
      { header: 'Description', key: 'description', width: 36 },
      { header: 'Vendor', key: 'vendorName', width: 24 },
      { header: 'PV No.', key: 'paymentVoucherNumber', width: 14 },
      { header: 'Receipt', key: 'receiptNumber', width: 14 },
      // The cash book calls this `amount`, not `totalCost` — a voided line
      // contributes zero to the running balance, and that is the figure the
      // book has to show.
      { header: 'Amount (₦)', key: 'amount', width: 16, money: true },
      { header: 'Running balance (₦)', key: 'runningBalance', width: 18, money: true },
    ],
  },
  outstanding: {
    title: 'Outstanding Retirements',
    rowsFrom: 'lines',
    columns: [
      { header: 'Imprest No.', key: 'imprestNumber', width: 18 },
      { header: 'Officer', key: 'officer', width: 22 },
      { header: 'Department', key: 'department', width: 14 },
      { header: 'Received (₦)', key: 'amountReceived', width: 16, money: true },
      { header: 'Spent (₦)', key: 'spent', width: 16, money: true },
      { header: 'Unretired (₦)', key: 'unretired', width: 16, money: true },
      { header: 'Retire by', key: 'expectedRetirementDate', width: 14 },
      { header: 'Days overdue', key: 'daysOverdue', width: 13 },
    ],
  },
  receipts: {
    title: 'Receipt Register',
    rowsFrom: 'lines',
    columns: [
      { header: 'Imprest No.', key: 'imprestNumber', width: 18 },
      { header: 'Qtr', key: 'quarter', width: 7 },
      { header: 'Expense Ref', key: 'expenseNumber', width: 22 },
      { header: 'Particulars', key: 'description', width: 34 },
      { header: 'Vendor', key: 'vendorName', width: 24 },
      { header: 'Amount (₦)', key: 'amount', width: 16, money: true },
      { header: 'Receipt No.', key: 'receiptNumber', width: 14 },
      { header: 'Document', key: 'fileName', width: 26 },
      { header: 'Type', key: 'kind', width: 14 },
      { header: 'Checksum', key: 'checksum', width: 16 },
      { header: 'Captured', key: 'capturedAt', width: 14 },
    ],
  },
  audit: {
    title: 'Audit Report',
    rowsFrom: 'lines',
    columns: [
      { header: 'When', key: 'at', width: 18 },
      { header: 'Action', key: 'action', width: 14 },
      { header: 'Entity', key: 'entity', width: 14 },
      { header: 'Record', key: 'record', width: 22 },
      { header: 'Officer', key: 'actor', width: 22 },
      { header: 'Duty', key: 'role', width: 18 },
      { header: 'Changed', key: 'changed', width: 46 },
      { header: 'Reason', key: 'reason', width: 34 },
      { header: 'IP', key: 'ipAddress', width: 16 },
    ],
  },
  vendors: {
    title: 'Supplier Analysis',
    rowsFrom: 'lines',
    columns: [
      { header: 'Supplier', key: 'vendorName', width: 30 },
      { header: 'TIN', key: 'tin', width: 18 },
      { header: 'Transactions', key: 'count', width: 13 },
      { header: 'Total paid (₦)', key: 'total', width: 18, money: true },
      { header: 'Last paid', key: 'last', width: 14 },
    ],
  },
};

export async function GET(request: NextRequest) {
  const guard = await requireImprest(Permission.REPORT_EXPORT);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const kind = sp.get('kind') ?? 'quarterly';
  const layout = LAYOUTS[kind];
  if (!layout) {
    return NextResponse.json(
      { error: `No export is defined for "${kind}".`, available: Object.keys(LAYOUTS) },
      { status: 400 }
    );
  }

  // A department-scoped duty only ever exports its own department.
  const scope = guard.actor.departmentId ? { departmentId: guard.actor.departmentId } : {};

  try {
    // The same builder the screen uses. Calling it directly rather than
    // fetching this app's own report endpoint keeps the workbook and the screen
    // provably identical — and avoids a serverless function calling itself.
    const report = await buildReport(kind, sp, scope);
    const rows: Record<string, unknown>[] = Array.isArray(report[layout.rowsFrom])
      ? (report[layout.rowsFrom] as Record<string, unknown>[])
      : [];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'UNTH Theatre — Imprest';
    wb.created = new Date();
    const ws = wb.addWorksheet(layout.title.slice(0, 31));

    // Title block. An exported sheet that does not say what it is, for which
    // period, and when it was produced is not evidence of anything.
    ws.mergeCells(1, 1, 1, layout.columns.length);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = 'UNIVERSITY OF NIGERIA TEACHING HOSPITAL, ITUKU-OZALLA';
    titleCell.font = { bold: true, size: 12 };
    titleCell.alignment = { horizontal: 'center' };

    ws.mergeCells(2, 1, 2, layout.columns.length);
    const subCell = ws.getCell(2, 1);
    subCell.value =
      `${layout.title}` +
      (report.quarterLabel ? ` — ${report.quarterLabel}` : '') +
      (report.financialYear ? ` — ${report.financialYear}` : '');
    subCell.font = { bold: true, size: 11 };
    subCell.alignment = { horizontal: 'center' };

    ws.mergeCells(3, 1, 3, layout.columns.length);
    const genCell = ws.getCell(3, 1);
    genCell.value = `Generated ${new Date().toLocaleString('en-GB')} by ${guard.actor.fullName ?? 'system'}`;
    genCell.font = { size: 9, italic: true };
    genCell.alignment = { horizontal: 'center' };

    const headerRow = ws.getRow(5);
    layout.columns.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      ws.getColumn(i + 1).width = c.width ?? 16;
    });
    headerRow.commit();

    rows.forEach((row, r) => {
      const sheetRow = ws.getRow(6 + r);
      layout.columns.forEach((c, i) => {
        const cell = sheetRow.getCell(i + 1);
        const raw = row[c.key];
        if (c.money) {
          cell.value = naira(raw as number);
          cell.numFmt = MONEY_FORMAT;
        } else if (raw instanceof Date || (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw))) {
          cell.value = new Date(raw as string).toLocaleDateString('en-GB');
        } else {
          cell.value = (raw as string | number | null) ?? '';
        }
      });
      sheetRow.commit();
    });

    // Totals, as SUM formulas rather than baked-in numbers — a reader can see
    // what is being added, and the figure survives a filtered re-sort.
    if (rows.length > 0) {
      const totalRow = ws.getRow(6 + rows.length);
      totalRow.getCell(1).value = 'TOTAL';
      totalRow.font = { bold: true };
      layout.columns.forEach((c, i) => {
        if (!c.money) return;
        const col = ws.getColumn(i + 1).letter;
        totalRow.getCell(i + 1).value = { formula: `SUM(${col}6:${col}${5 + rows.length})` };
        totalRow.getCell(i + 1).numFmt = MONEY_FORMAT;
      });
      totalRow.commit();
    }

    ws.views = [{ state: 'frozen', ySplit: 5 }];
    ws.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: 5, column: layout.columns.length },
    };

    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `${layout.title.replace(/\s+/g, '-').toLowerCase()}-${stamp}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof ReportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[imprest] report export failed:', error);
    return NextResponse.json({ error: 'Failed to export the report' }, { status: 500 });
  }
}
