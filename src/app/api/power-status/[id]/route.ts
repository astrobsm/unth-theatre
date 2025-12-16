import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/power-status/[id] - Get specific power status
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const powerStatus = await prisma.powerHouseStatus.findUnique({
      where: { id: params.id },
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
          include: {
            technician: {
              select: {
                id: true,
                fullName: true,
                staffCode: true,
              },
            },
            supervisor: {
              select: {
                id: true,
                fullName: true,
                staffCode: true,
              },
            },
          },
        },
        fuelConsumption: {
          orderBy: { consumptionDate: 'desc' },
          take: 10,
        },
      },
    });

    if (!powerStatus) {
      return NextResponse.json(
        { error: 'Power status not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ powerStatus });
  } catch (error) {
    console.error('Error fetching power status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch power status' },
      { status: 500 }
    );
  }
}

// PUT /api/power-status/[id] - Update power status
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'POWER_PLANT_OPERATOR' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    const powerStatus = await prisma.powerHouseStatus.update({
      where: { id: params.id },
      data: {
        ...body,
        ...(body.lastMaintenanceDate && { lastMaintenanceDate: new Date(body.lastMaintenanceDate) }),
        ...(body.nextMaintenanceDate && { nextMaintenanceDate: new Date(body.nextMaintenanceDate) }),
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
        action: 'UPDATE',
        tableName: 'PowerHouseStatus',
        recordId: params.id,
        changes: JSON.stringify(body),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    return NextResponse.json({ powerStatus });
  } catch (error) {
    console.error('Error updating power status:', error);
    return NextResponse.json(
      { error: 'Failed to update power status' },
      { status: 500 }
    );
  }
}
