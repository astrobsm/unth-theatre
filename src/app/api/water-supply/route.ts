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
      where.logDate = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    const waterLogs = await prisma.waterSupplyLog.findMany({
      where,
      include: {
        loggedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: {
        logDate: 'desc',
      },
    });

    return NextResponse.json(waterLogs);
  } catch (error) {
    console.error('Error fetching water supply logs:', error);
    return NextResponse.json({ waterLogs: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    const waterLog = await prisma.waterSupplyLog.create({
      data: {
        logDate: data.logDate ? new Date(data.logDate) : new Date(),
        shiftType: data.shiftType,
        mainWaterSupply: data.mainWaterSupply,
        boreholeActive: data.boreholeActive,
        tankWaterLevel: data.tankWaterLevel || 0,
        waterPressure: data.waterPressure,
        waterQuality: data.waterQuality,
        chlorineLevelTested: data.chlorineLevelTested || false,
        chlorineLevel: data.chlorineLevel,
        theatre1WaterOk: data.theatre1WaterOk || false,
        theatre2WaterOk: data.theatre2WaterOk || false,
        theatre3WaterOk: data.theatre3WaterOk || false,
        theatre4WaterOk: data.theatre4WaterOk || false,
        scrubSinksFunctional: data.scrubSinksFunctional !== false,
        leaksReported: data.leaksReported || false,
        leakLocations: data.leakLocations,
        blockagesReported: data.blockagesReported || false,
        blockageLocations: data.blockageLocations,
        maintenanceRequired: data.maintenanceRequired || false,
        maintenanceDetails: data.maintenanceDetails,
        overallStatus: data.overallStatus,
        actionTaken: data.actionTaken,
        notes: data.notes,
        loggedById: session.user.id,
      },
      include: {
        loggedBy: {
          select: {
            fullName: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json(waterLog);
  } catch (error) {
    console.error('Error creating water supply log:', error);
    return NextResponse.json({ error: 'Failed to create water supply log' }, { status: 500 });
  }
}
