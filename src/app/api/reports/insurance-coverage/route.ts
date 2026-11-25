/**
 * GET /api/reports/insurance-coverage?from=&to=
 *
 * Of everything the theatre asked the schemes to cover in this window, how
 * much did they take, how much came back, and what keeps coming back?
 *
 * The arithmetic is in src/lib/payer/coverageSummary.ts and is pure; this
 * route only reads the rows. Withdrawn lines are excluded there, not here,
 * so the rule is in one place.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { roleAllowed } from '@/lib/roleGroups';
import { summariseCoverage, type SummaryRow } from '@/lib/payer/coverageSummary';
import type { PayerCategory } from '@/lib/payer/categories';
import type { FulfilmentUnit } from '@/lib/payer/routing';

export const dynamic = 'force-dynamic';

/**
 * Who may read it.
 *
 * Management, the theatre's own officers, and the two pharmacies. The NHIA
 * desk in particular: the list of items that keep coming back is theirs to
 * act on, and a report they cannot open is a report nobody acts on.
 */
const MAY_READ = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC',
  'NHIA_PHARMACY', 'PHARMACIST', 'HEAD_OF_PHARMACY',
  'ACCOUNTANT', 'BILLING_OFFICER',
];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? null;
  if (!roleAllowed(role, MAY_READ)) {
    return NextResponse.json({ error: 'Not authorised to read this report.' }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const from = sp.get('from');
  const to = sp.get('to');

  // A window is required. Without one this counts every case the hospital
  // has ever booked, which is a slow query and an unreadable answer.
  if (!from || !to) {
    return NextResponse.json(
      { error: 'Give a date range: from and to.' },
      { status: 400 },
    );
  }

  const scheduledDate = {
    gte: new Date(from),
    lte: new Date(`${to}T23:59:59.999Z`),
  };

  const [cases, unspecifiedCases, consumables, drugs] = await Promise.all([
    prisma.surgery.count({
      where: { scheduledDate, payerCategory: { in: ['NHIA', 'NHIS', 'CEmONC'] } },
    }),
    prisma.surgery.count({ where: { scheduledDate, payerCategory: 'UNSPECIFIED' } }),
    prisma.surgeryConsumableRequest.findMany({
      where: { surgery: { scheduledDate, payerCategory: { in: ['NHIA', 'NHIS', 'CEmONC'] } } },
      select: {
        name: true, quantity: true, status: true, routedTo: true,
        reassignedFrom: true, reassignReason: true, coverageNote: true,
        surgery: { select: { payerCategory: true } },
      },
      take: 20000,
    }),
    prisma.surgeryDrugDressingRequest.findMany({
      where: { surgery: { scheduledDate, payerCategory: { in: ['NHIA', 'NHIS', 'CEmONC'] } } },
      select: {
        name: true, quantity: true, status: true, routedTo: true,
        reassignedFrom: true, reassignReason: true, coverageNote: true,
        surgery: { select: { payerCategory: true } },
      },
      take: 20000,
    }),
  ]);

  const toRow = (list: 'CONSUMABLE' | 'PHARMACY') => (r: {
    name: string; quantity: number; status: string; routedTo: string;
    reassignedFrom: string | null; reassignReason: string | null;
    surgery: { payerCategory: string } | null;
  }): SummaryRow => ({
    list,
    name: r.name,
    quantity: r.quantity,
    status: r.status,
    routedTo: r.routedTo as FulfilmentUnit,
    reassignedFrom: (r.reassignedFrom ?? null) as FulfilmentUnit | null,
    reassignReason: r.reassignReason,
    payerCategory: (r.surgery?.payerCategory ?? 'UNSPECIFIED') as PayerCategory,
  });

  const rows: SummaryRow[] = [
    ...consumables.map(toRow('CONSUMABLE')),
    ...drugs.map(toRow('PHARMACY')),
  ];

  // Lines nobody has classified either way. Each one is a patient paying for
  // something the scheme may well have carried, so it is reported as its own
  // number rather than folded into "not covered".
  const unclassified = [...consumables, ...drugs]
    .filter((r) => (r.coverageNote ?? '').includes('NHIA Pharmacy to confirm')).length;

  return NextResponse.json({
    from,
    to,
    ...summariseCoverage(rows, {
      insuredCases: cases,
      unspecifiedCases,
      unclassified,
    }),
  });
}
