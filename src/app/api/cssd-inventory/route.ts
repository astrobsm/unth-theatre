import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/cssd-inventory - List all CSSD inventory items
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const surgicalUnit = searchParams.get('surgicalUnit');

    const where: any = {};
    if (status) where.status = status;
    if (surgicalUnit) where.surgicalUnit = surgicalUnit;

    const inventory = await prisma.cssdInventory.findMany({
      where,
      include: {
        updatedBy: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
        usageHistory: {
          orderBy: { issuedAt: 'desc' },
          take: 5,
          include: {
            issuedBy: {
              select: {
                id: true,
                fullName: true,
                staffCode: true,
              },
            },
          },
        },
        sterilizationLogs: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          include: {
            operator: {
              select: {
                id: true,
                fullName: true,
                staffCode: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ inventory });
  } catch (error) {
    console.error('Error fetching CSSD inventory:', error);
    return NextResponse.json(
      { error: 'Failed to fetch CSSD inventory' },
      { status: 500 }
    );
  }
}

// POST /api/cssd-inventory - Create new inventory item
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
      itemName,
      itemCode,
      packType,
      surgicalUnit,
      totalQuantity,
      minimumStockLevel,
      expiryDate,
      location,
      supplierName,
      notes,
    } = body;

    // Validate required fields
    if (!itemName || !itemCode || !packType || !surgicalUnit || totalQuantity == null) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const inventoryItem = await prisma.cssdInventory.create({
      data: {
        itemName,
        itemCode,
        packType,
        surgicalUnit,
        totalQuantity,
        availableQuantity: totalQuantity,
        inUseQuantity: 0,
        sterilizingQuantity: 0,
        minimumStockLevel: minimumStockLevel || 5,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        location: location || null,
        supplierName: supplierName || null,
        status: 'AVAILABLE',
        updatedById: session.user.id,
        notes,
      },
      include: {
        updatedBy: {
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
        tableName: 'CssdInventory',
        recordId: inventoryItem.id,
        changes: JSON.stringify({ itemName, itemCode, packType, totalQuantity }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    return NextResponse.json({ inventoryItem }, { status: 201 });
  } catch (error) {
    console.error('Error creating CSSD inventory item:', error);
    return NextResponse.json(
      { error: 'Failed to create CSSD inventory item' },
      { status: 500 }
    );
  }
}
