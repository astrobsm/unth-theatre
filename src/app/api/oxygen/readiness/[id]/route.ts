import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - fetch a single oxygen readiness report by id
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const report = await prisma.oxygenReadinessReport.findUnique({
      where: { id: params.id },
      include: {
        reportedBy: { select: { id: true, fullName: true, role: true } },
        verifiedBy: { select: { id: true, fullName: true } },
      },
    });

    if (!report) {
      return NextResponse.json({ error: 'Readiness report not found' }, { status: 404 });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error('Error fetching oxygen readiness report:', error);
    return NextResponse.json({ error: 'Failed to fetch readiness report' }, { status: 500 });
  }
}
