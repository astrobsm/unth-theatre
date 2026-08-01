// ============================================================
// Theatre supply chain and billing reports
// ------------------------------------------------------------
// Thin: authorisation, and turning a builder's refusal into a status code. The
// figures live in lib/stock/reports so the same numbers reach a screen and an
// export without this route calling itself.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireStock } from '@/lib/stock/access';
import { buildStockReport, STOCK_REPORT_KINDS, StockReportError } from '@/lib/stock/reports';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireStock('view');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const kind = sp.get('kind') ?? 'consumption';

  const known = [...STOCK_REPORT_KINDS, 'reconciliation'];
  if (!known.includes(kind as never)) {
    return NextResponse.json({ error: `Unknown report "${kind}".`, available: known }, { status: 400 });
  }

  try {
    return NextResponse.json(await buildStockReport(kind, sp));
  } catch (error) {
    if (error instanceof StockReportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[stock] report failed:', error);
    return NextResponse.json({ error: 'Failed to produce the report' }, { status: 500 });
  }
}
