import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/cssd-inventory/[id] - Get specific inventory item
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const inventoryItem = await prisma.cssdInventory.findUnique({
      where: { id: params.id },
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
          include: {
            issuedBy: {
              select: {
                id: true,
                fullName: true,
                staffCode: true,
              },
            },
            surgery: {
              select: {
                id: true,
                procedureName: true,
                surgeryType: true,
              },
            },
          },
        },
        sterilizationLogs: {
          orderBy: { startedAt: 'desc' },
          include: {
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
        },
      },
    });

    if (!inventoryItem) {
      return NextResponse.json(
        { error: 'Inventory item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ inventoryItem });
  } catch (error) {
    console.error('Error fetching CSSD inventory item:', error);
    return NextResponse.json(
      { error: 'Failed to fetch CSSD inventory item' },
      { status: 500 }
    );
  }
}

// PUT /api/cssd-inventory/[id] - Update inventory item
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      availableQuantity,
      inUseQuantity,
      sterilizingQuantity,
      minimumStockLevel,
      expiryDate,
      location,
      supplierName,
      status,
      notes,
    } = body;

    const inventoryItem = await prisma.cssdInventory.update({
      where: { id: params.id },
      data: {
        ...(itemName && { itemName }),
        ...(itemCode && { itemCode }),
        ...(packType && { packType }),
        ...(surgicalUnit && { surgicalUnit }),
        ...(totalQuantity != null && { totalQuantity }),
        ...(availableQuantity != null && { availableQuantity }),
        ...(inUseQuantity != null && { inUseQuantity }),
        ...(sterilizingQuantity != null && { sterilizingQuantity }),
        ...(minimumStockLevel != null && { minimumStockLevel }),
        ...(expiryDate !== undefined && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
        ...(location !== undefined && { location }),
        ...(supplierName !== undefined && { supplierName }),
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
        updatedById: session.user.id,
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
        action: 'UPDATE',
        tableName: 'CssdInventory',
        recordId: params.id,
        changes: JSON.stringify(body),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    return NextResponse.json({ inventoryItem });
  } catch (error) {
    console.error('Error updating CSSD inventory item:', error);
    return NextResponse.json(
      { error: 'Failed to update CSSD inventory item' },
      { status: 500 }
    );
  }
}

// DELETE /api/cssd-inventory/[id] - Delete inventory item
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }

    const inventoryItem = await prisma.cssdInventory.findUnique({
      where: { id: params.id },
    });

    if (!inventoryItem) {
      return NextResponse.json(
        { error: 'Inventory item not found' },
        { status: 404 }
      );
    }

    await prisma.cssdInventory.delete({
      where: { id: params.id },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        tableName: 'CssdInventory',
        recordId: params.id,
        changes: JSON.stringify(inventoryItem),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting CSSD inventory item:', error);
    return NextResponse.json(
      { error: 'Failed to delete CSSD inventory item' },
      { status: 500 }
    );
  }
}
