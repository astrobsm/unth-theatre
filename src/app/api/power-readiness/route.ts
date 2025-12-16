import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/power-readiness - Get power house readiness reports
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

    const reports = await prisma.powerReadinessReport.findMany({
      where,
      include: {
        reportedBy: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
        approvedBy: {
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
    console.error('Error fetching power readiness reports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch power readiness reports' },
      { status: 500 }
    );
  }
}

// POST /api/power-readiness - Create power house readiness report
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'POWER_PLANT_OPERATOR' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      reportDate,
      shiftType,
      overallStatus,
      mainsPowerAvailable,
      generatorAvailable,
      solarAvailable,
      upsAvailable,
      dieselAvailable,
      dieselPercentage,
      estimatedRuntimeHours,
      criticalIssues,
      actionTaken,
      notes,
    } = body;

    // Validate required fields
    if (!shiftType || !overallStatus || dieselPercentage == null) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const readinessReport = await prisma.powerReadinessReport.create({
      data: {
        reportDate: reportDate ? new Date(reportDate) : new Date(),
        shiftType,
        overallStatus,
        mainsPowerAvailable: mainsPowerAvailable ?? false,
        generatorAvailable: generatorAvailable ?? false,
        solarAvailable: solarAvailable ?? false,
        upsAvailable: upsAvailable ?? false,
        dieselAvailable: dieselAvailable ?? false,
        dieselPercentage,
        estimatedRuntimeHours,
        criticalIssues,
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
        approvedBy: {
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
        tableName: 'PowerReadinessReport',
        recordId: readinessReport.id,
        changes: JSON.stringify({ overallStatus, shiftType }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    return NextResponse.json({ readinessReport }, { status: 201 });
  } catch (error) {
    console.error('Error creating power readiness report:', error);
    return NextResponse.json(
      { error: 'Failed to create power readiness report' },
      { status: 500 }
    );
  }
}
