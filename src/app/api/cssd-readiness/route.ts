import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/cssd-readiness - Get CSSD readiness reports
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    const where: any = {};
    if (date) {
      const targetDate = new Date(date);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      
      where.reportDate = {
        gte: targetDate,
        lt: nextDate,
      };
    }

    const reports = await prisma.cssdReadinessReport.findMany({
      where,
      include: {
        reportedBy: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
      },
      orderBy: { reportDate: 'desc' },
    });

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('Error fetching CSSD readiness reports:', error);
    // Return empty array instead of error if table doesn't exist yet
    return NextResponse.json({ reports: [] });
  }
}

// POST /api/cssd-readiness - Create CSSD readiness report
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'CSSD_STAFF' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      reportDate,
      shiftType,
      overallStatus,
      readinessPercentage,
      majorBundlesAvailable,
      minorBundlesAvailable,
      gownsAvailable,
      criticalShortages,
      equipmentIssues,
      actionTaken,
      notes,
    } = body;

    // Validate required fields
    if (!shiftType || !overallStatus || readinessPercentage == null) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const readinessReport = await prisma.cssdReadinessReport.create({
      data: {
        reportDate: reportDate ? new Date(reportDate) : new Date(),
        shiftType,
        overallStatus,
        readinessPercentage,
        majorBundlesAvailable: majorBundlesAvailable || 0,
        minorBundlesAvailable: minorBundlesAvailable || 0,
        gownsAvailable: gownsAvailable || 0,
        criticalShortages,
        equipmentIssues,
        actionTaken,
        reportedById: session.user.id,
        notes,
      },
      include: {
        reportedBy: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'CssdReadinessReport',
        recordId: readinessReport.id,
        changes: JSON.stringify({ overallStatus, shiftType, readinessPercentage }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    return NextResponse.json({ readinessReport }, { status: 201 });
  } catch (error) {
    console.error('Error creating CSSD readiness report:', error);
    return NextResponse.json(
      { error: 'Failed to create CSSD readiness report' },
      { status: 500 }
    );
  }
}
