// ============================================================
// Imprest reference data
// ------------------------------------------------------------
// One call returning every list an imprest form needs — departments, financial
// years, budget heads, vote codes, cost centres, expense categories, vendors
// and the eligible receiving officers.
//
// Deliberately a single endpoint rather than eight: it is one cache entry for
// the offline layer, so a device that has opened any imprest form once can open
// every imprest form with no network.
// ============================================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireImprest } from '@/lib/imprest/access';
import { Permission } from '@/lib/imprest/permissions';
import { serialize } from '@/lib/imprest/serialize';

export const dynamic = 'force-dynamic';

const live = { deletedAt: null, isActive: true } as const;

export async function GET() {
  const guard = await requireImprest(Permission.REFERENCE_VIEW);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const [
      departments,
      financialYears,
      budgetHeads,
      voteCodes,
      costCentres,
      categories,
      vendors,
      officers,
    ] = await Promise.all([
      prisma.department.findMany({
        where: live,
        select: { id: true, code: true, name: true, office: true },
        orderBy: { name: 'asc' },
      }),
      prisma.financialYear.findMany({
        where: { deletedAt: null },
        select: { id: true, label: true, startDate: true, endDate: true, isCurrent: true, isClosed: true },
        orderBy: { startDate: 'desc' },
      }),
      prisma.budgetHead.findMany({
        where: live,
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      prisma.voteCode.findMany({
        where: live,
        select: { id: true, code: true, name: true, budgetHeadId: true },
        orderBy: { code: 'asc' },
      }),
      prisma.costCentre.findMany({
        where: live,
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      prisma.expenseCategory.findMany({
        where: live,
        select: { id: true, name: true, parentId: true, defaultBudgetHeadId: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.vendor.findMany({
        where: live,
        select: { id: true, name: true, phone: true, tin: true },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      // Anyone with an active imprest duty can hold funds; the receiving officer
      // is drawn from that list rather than from all staff.
      prisma.imprestRoleAssignment.findMany({
        where: { isActive: true, revokedAt: null },
        select: {
          designation: true,
          role: true,
          user: { select: { id: true, fullName: true, staffCode: true } },
        },
        orderBy: { assignedAt: 'desc' },
      }),
    ]);

    return NextResponse.json(
      serialize({
        departments,
        financialYears,
        budgetHeads,
        voteCodes,
        costCentres,
        categories,
        vendors,
        officers: officers.map((o) => ({
          id: o.user.id,
          fullName: o.user.fullName,
          staffCode: o.user.staffCode,
          designation: o.designation,
          role: o.role,
        })),
      })
    );
  } catch (error) {
    console.error('[imprest] reference load failed:', error);
    return NextResponse.json({ error: 'Failed to load imprest reference data' }, { status: 500 });
  }
}
