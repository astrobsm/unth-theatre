import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/power-maintenance - Get maintenance logs
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statusId = searchParams.get('statusId');
    const type = searchParams.get('type');

    const where: any = {};
    if (statusId) where.statusId = statusId;
    if (type) where.maintenanceType = type;

    const logs = await prisma.powerMaintenanceLog.findMany({
      where,
      include: {
        status: {
          select: {
            id: true,
            currentSource: true,
          },
        },
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
      orderBy: { maintenanceDate: 'desc' },
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Error fetching maintenance logs:', error);
    // Return empty array instead of error if table doesn't exist yet
    return NextResponse.json({ logs: [] });
  }
}

// POST /api/power-maintenance - Create maintenance log
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
      maintenanceType,
      maintenanceDate,
      componentServiced,
      workPerformed,
      partsReplaced,
      partsCost,
      supervisorId,
      nextServiceDate,
      maintenanceStatus,
      notes,
    } = body;

    // Validate required fields
    if (!statusId || !maintenanceType || !componentServiced || !workPerformed) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const maintenanceLog = await prisma.powerMaintenanceLog.create({
      data: {
        statusId,
        maintenanceType,
        maintenanceDate: maintenanceDate ? new Date(maintenanceDate) : new Date(),
        componentServiced,
        workPerformed,
        partsReplaced: partsReplaced || null,
        partsCost: partsCost || null,
        technicianId: session.user.id,
        supervisorId: supervisorId || null,
        nextServiceDate: nextServiceDate ? new Date(nextServiceDate) : null,
        maintenanceStatus: maintenanceStatus || 'COMPLETED',
        notes,
      },
      include: {
        status: {
          select: {
            id: true,
            currentSource: true,
          },
        },
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
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'PowerMaintenanceLog',
        recordId: maintenanceLog.id,
        changes: JSON.stringify({ maintenanceType, componentServiced }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    return NextResponse.json({ maintenanceLog }, { status: 201 });
  } catch (error) {
    console.error('Error creating maintenance log:', error);
    return NextResponse.json(
      { error: 'Failed to create maintenance log' },
      { status: 500 }
    );
  }
}
