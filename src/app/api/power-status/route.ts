import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/power-status - Get current and historical power status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const latest = searchParams.get('latest') === 'true';

    if (latest) {
      // Get the most recent status
      const latestStatus = await prisma.powerHouseStatus.findFirst({
        orderBy: { createdAt: 'desc' },
        include: {
          operator: {
            select: {
              id: true,
              fullName: true,
              staffCode: true,
            },
          },
          maintenanceLogs: {
            orderBy: { maintenanceDate: 'desc' },
            take: 5,
          },
        },
      });

      return NextResponse.json({ status: latestStatus });
    }

    // Get all statuses
    const statuses = await prisma.powerHouseStatus.findMany({
      include: {
        operator: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ statuses });
  } catch (error) {
    console.error('Error fetching power status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch power status' },
      { status: 500 }
    );
  }
}

// POST /api/power-status - Create new power status entry
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
      currentSource,
      mainsPowerStatus,
      generatorStatus,
      solarStatus,
      upsStatus,
      mainsVoltage,
      mainsFrequency,
      generatorVoltage,
      generatorFrequency,
      dieselLevel,
      dieselCapacity,
      dieselQuantity,
      generatorRuntime,
      generatorLoadPercent,
      solarCharge,
      solarOutput,
      upsBatteryLevel,
      upsRuntime,
      criticalAlerts,
      warningAlerts,
      lastMaintenanceDate,
      nextMaintenanceDate,
      notes,
    } = body;

    // Validate required fields
    if (!currentSource || !dieselLevel || !dieselCapacity || !dieselQuantity) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const status = await prisma.powerHouseStatus.create({
      data: {
        currentSource,
        mainsPowerStatus: mainsPowerStatus || 'INACTIVE',
        generatorStatus: generatorStatus || 'INACTIVE',
        solarStatus: solarStatus || 'INACTIVE',
        upsStatus: upsStatus || 'INACTIVE',
        mainsVoltage,
        mainsFrequency,
        generatorVoltage,
        generatorFrequency,
        dieselLevel,
        dieselCapacity,
        dieselQuantity,
        generatorRuntime,
        generatorLoadPercent,
        solarCharge,
        solarOutput,
        upsBatteryLevel,
        upsRuntime,
        criticalAlerts,
        warningAlerts,
        lastMaintenanceDate: lastMaintenanceDate ? new Date(lastMaintenanceDate) : null,
        nextMaintenanceDate: nextMaintenanceDate ? new Date(nextMaintenanceDate) : null,
        operatorId: session.user.id,
        notes,
      },
      include: {
        operator: {
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
        tableName: 'PowerHouseStatus',
        recordId: status.id,
        changes: JSON.stringify({ currentSource, dieselLevel }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    return NextResponse.json({ status }, { status: 201 });
  } catch (error) {
    console.error('Error creating power status:', error);
    return NextResponse.json(
      { error: 'Failed to create power status' },
      { status: 500 }
    );
  }
}
