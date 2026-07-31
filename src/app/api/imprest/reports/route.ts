// ============================================================
// Imprest reports
// ------------------------------------------------------------
// The registers the unit is actually asked for: the imprest register, a cash
// book for one imprest, outstanding retirements, a vendor register, and the
// quarterly / annual / category views the Financial Regulations cycle needs.
//
// The figures themselves live in lib/imprest/reports so the Excel export can
// produce the same numbers without this route fetching itself. What is left
// here is authorisation, scoping and turning a builder's refusal into a status
// code.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireImprest } from '@/lib/imprest/access';
import { Permission } from '@/lib/imprest/permissions';
import { buildReport, ReportError, REPORT_KINDS } from '@/lib/imprest/reports';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireImprest(Permission.REPORT_VIEW);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const kind = sp.get('kind') ?? 'register';
  if (!(REPORT_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json(
      { error: `Unknown report "${kind}".`, available: REPORT_KINDS },
      { status: 400 }
    );
  }

  // A department-scoped duty only ever reports on its own department.
  const scope = guard.actor.departmentId ? { departmentId: guard.actor.departmentId } : {};

  try {
    return NextResponse.json(await buildReport(kind, sp, scope));
  } catch (error) {
    // A builder's own refusal is better worded than anything invented here.
    if (error instanceof ReportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[imprest] report failed:', error);
    return NextResponse.json({ error: 'Failed to produce the report' }, { status: 500 });
  }
}
