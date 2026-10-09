// ============================================================
// GET /api/analytics/case-mix?from=&to= — how many of what size
// ------------------------------------------------------------
// Operative workload banded Minor / Intermediate / Major / Supermajor, broken
// down by month, subspecialty and unit, over any window.
//
// The banding is not straightforward and lib/analytics/caseMix.ts explains
// why: ORM holds an assessed complexity class on cases that were written up,
// and a booking magnitude on nearly all of them, and the two differ in
// coverage and in banding. Every case is counted and every figure says which
// source it came from.
//
// Cancelled cases are excluded. A case-mix report describes work performed;
// counting an operation that never happened would overstate it, and that is
// the direction an audit report must not err in.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { buildCaseMix, type CaseMixInput } from '@/lib/analytics/caseMix';

export const dynamic = 'force-dynamic';

const MAY_READ = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC',
];

/**
 * The widest window worth serving in one request.
 *
 * Five years covers any audit cycle a hospital runs. Past that the query is
 * being used as an export, and the right answer is a narrower window rather
 * than a slower page.
 */
const MAX_WINDOW_DAYS = 366 * 5;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!MAY_READ.includes((session.user.role ?? '').toUpperCase())) {
    return NextResponse.json(
      { error: 'Theatre management and administrators only.' }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;

  // Defaults to the last twelve months, which is the question most people
  // open this page to ask.
  const to = sp.get('to') ? new Date(`${sp.get('to')}T23:59:59.999Z`) : new Date();
  const from = sp.get('from')
    ? new Date(`${sp.get('from')}T00:00:00.000Z`)
    : new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), to.getUTCDate()));

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json(
      { error: 'Dates must be YYYY-MM-DD.' }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json(
      { error: 'The start date is after the end date.' }, { status: 400 });
  }
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (days > MAX_WINDOW_DAYS) {
    return NextResponse.json(
      { error: `That window is ${Math.round(days / 365)} years. Ask for five or fewer.` },
      { status: 400 });
  }

  try {
    const rows = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: from, lte: to },
        // Work performed, not work planned and abandoned.
        status: { not: 'CANCELLED' },
      },
      select: {
        scheduledDate: true, subspecialty: true, unit: true,
        complexityClass: true, magnitude: true,
      },
      // No take limit: a count is wrong if it is truncated, and a hospital's
      // five-year case list is tens of thousands of narrow rows, not millions.
    });

    const result = buildCaseMix(rows as CaseMixInput[]);

    return NextResponse.json({
      ...result,
      window: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      },
      note: 'Cancelled cases are excluded. Where a case has no assessed complexity, its '
        + 'booking magnitude is used instead and counted under "from booking" — and a case '
        + 'with neither is shown as Unclassified rather than left out.',
    });
  } catch (error) {
    return apiError('analytics/case-mix', error);
  }
}
