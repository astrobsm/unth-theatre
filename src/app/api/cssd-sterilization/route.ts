import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/cssd-sterilization - List sterilization logs
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const inventoryId = searchParams.get('inventoryId');

    const where: any = {};
    if (inventoryId) where.inventoryId = inventoryId;

    const logs = await prisma.cssdSterilizationLog.findMany({
      where,
      include: {
        inventory: {
          select: {
            id: true,
            itemName: true,
            itemCode: true,
            packType: true,
          },
        },
        operator: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
        verifiedBy: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Error fetching sterilization logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sterilization logs' },
      { status: 500 }
    );
  }
}

// POST /api/cssd-sterilization - Create sterilization log
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
      inventoryId,
      batchNumber,
      sterilizationMethod,
      quantity,
      startedAt,
      completedAt,
      temperature,
      pressure,
      cycleTime,
      biologicalIndicator,
      chemicalIndicator,
      verifiedById,
      status,
      failureReason,
      notes,
    } = body;

    // Validate required fields
    if (!inventoryId || !sterilizationMethod || !batchNumber || !quantity) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify inventory item exists
    const inventoryItem = await prisma.cssdInventory.findUnique({
      where: { id: inventoryId },
    });

    if (!inventoryItem) {
      return NextResponse.json(
        { error: 'Inventory item not found' },
        { status: 404 }
      );
    }

    const sterilizationLog = await prisma.cssdSterilizationLog.create({
      data: {
        inventoryId,
        batchNumber,
        sterilizationMethod,
        quantity,
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        completedAt: completedAt ? new Date(completedAt) : null,
        temperature,
        pressure,
        cycleTime,
        biologicalIndicator: biologicalIndicator || false,
        chemicalIndicator: chemicalIndicator || false,
        operatorId: session.user.id,
        verifiedById,
        status: status || 'IN_PROGRESS',
        failureReason,
        notes,
      },
      include: {
        inventory: {
          select: {
            id: true,
            itemName: true,
            itemCode: true,
          },
        },
        operator: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
        verifiedBy: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
      },
    });

    // Update inventory status to AVAILABLE after sterilization and update expiry if provided
    await prisma.cssdInventory.update({
      where: { id: inventoryId },
      data: {
        status: 'AVAILABLE',
        lastSterilizedDate: startedAt ? new Date(startedAt) : new Date(),
        sterilizingQuantity: Math.max(0, inventoryItem.sterilizingQuantity - quantity),
        availableQuantity: inventoryItem.availableQuantity + quantity,
        updatedById: session.user.id,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'CssdSterilizationLog',
        recordId: sterilizationLog.id,
        changes: JSON.stringify({ sterilizationMethod, batchNumber, quantity, inventoryId }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    return NextResponse.json({ sterilizationLog }, { status: 201 });
  } catch (error) {
    console.error('Error creating sterilization log:', error);
    return NextResponse.json(
      { error: 'Failed to create sterilization log' },
      { status: 500 }
    );
  }
}
