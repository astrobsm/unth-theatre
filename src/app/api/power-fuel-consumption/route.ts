import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/power-fuel-consumption - Get fuel consumption records
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statusId = searchParams.get('statusId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const where: any = {};
    if (statusId) where.statusId = statusId;
    if (startDate || endDate) {
      where.consumptionDate = {};
      if (startDate) where.consumptionDate.gte = new Date(startDate);
      if (endDate) where.consumptionDate.lte = new Date(endDate);
    }

    const records = await prisma.powerFuelConsumption.findMany({
      where,
      include: {
        status: {
          select: {
            id: true,
            currentSource: true,
            generatorStatus: true,
          },
        },
        recordedBy: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
      },
      orderBy: { consumptionDate: 'desc' },
    });

    return NextResponse.json({ records });
  } catch (error) {
    console.error('Error fetching fuel consumption records:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fuel consumption records' },
      { status: 500 }
    );
  }
}

// POST /api/power-fuel-consumption - Create fuel consumption record
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
      statusId,
      dieselConsumed,
      generatorRunHours,
      averageLoad,
      notes,
    } = body;

    // Validate required fields
    if (!statusId || dieselConsumed == null || generatorRunHours == null) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const fuelLog = await prisma.powerFuelConsumption.create({
      data: {
        statusId,
        dieselConsumed,
        generatorRunHours,
        averageLoad,
        recordedById: session.user.id,
        notes,
      },
      include: {
        status: {
          select: {
            id: true,
            currentSource: true,
            generatorStatus: true,
          },
        },
        recordedBy: {
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
        tableName: 'PowerFuelConsumption',
        recordId: fuelLog.id,
        changes: JSON.stringify({ dieselConsumed, generatorRunHours }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    return NextResponse.json({ fuelLog }, { status: 201 });
  } catch (error) {
    console.error('Error creating fuel consumption record:', error);
    return NextResponse.json(
      { error: 'Failed to create fuel consumption record' },
      { status: 500 }
    );
  }
}
