import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    const where: any = {};
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.reportDate = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    const readinessReports = await prisma.oxygenReadinessReport.findMany({
      where,
      include: {
        reportedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        verifiedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        reportDate: 'desc',
      },
    });

    return NextResponse.json(readinessReports);
  } catch (error) {
    console.error('Error fetching oxygen readiness reports:', error);
    return NextResponse.json({ readinessReports: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    const readinessReport = await prisma.oxygenReadinessReport.create({
      data: {
        reportDate: data.reportDate ? new Date(data.reportDate) : new Date(),
        shiftType: data.shiftType,
        centralOxygenPressure: data.centralOxygenPressure,
        centralOxygenStatus: data.centralOxygenStatus,
        cylinderBankLevel: data.cylinderBankLevel || 0,
        backupCylindersCount: data.backupCylindersCount || 0,
        backupCylindersStatus: data.backupCylindersStatus,
        manifoldSystemOk: data.manifoldSystemOk !== false,
        pipelineIntegrityOk: data.pipelineIntegrityOk !== false,
        theatre1OxygenOk: data.theatre1OxygenOk || false,
        theatre1Pressure: data.theatre1Pressure,
        theatre2OxygenOk: data.theatre2OxygenOk || false,
        theatre2Pressure: data.theatre2Pressure,
        theatre3OxygenOk: data.theatre3OxygenOk || false,
        theatre3Pressure: data.theatre3Pressure,
        theatre4OxygenOk: data.theatre4OxygenOk || false,
        theatre4Pressure: data.theatre4Pressure,
        recoveryRoomOxygenOk: data.recoveryRoomOxygenOk || false,
        recoveryRoomPressure: data.recoveryRoomPressure,
        alarmSystemFunctional: data.alarmSystemFunctional !== false,
        lowPressureAlarmOk: data.lowPressureAlarmOk !== false,
        highPressureAlarmOk: data.highPressureAlarmOk !== false,
        predictedShortage: data.predictedShortage || false,
        shortageEstimatedTime: data.shortageEstimatedTime,
        shortageReason: data.shortageReason,
        lastMaintenanceDate: data.lastMaintenanceDate ? new Date(data.lastMaintenanceDate) : undefined,
        nextMaintenanceDate: data.nextMaintenanceDate ? new Date(data.nextMaintenanceDate) : undefined,
        maintenanceRequired: data.maintenanceRequired || false,
        maintenanceDetails: data.maintenanceDetails,
        overallReadiness: data.overallReadiness,
        criticalIssues: data.criticalIssues,
        actionTaken: data.actionTaken,
        recommendations: data.recommendations,
        notes: data.notes,
        reportedById: session.user.id,
      },
      include: {
        reportedBy: {
          select: {
            fullName: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json(readinessReport);
  } catch (error) {
    console.error('Error creating oxygen readiness report:', error);
    return NextResponse.json({ error: 'Failed to create readiness report' }, { status: 500 });
  }
}
