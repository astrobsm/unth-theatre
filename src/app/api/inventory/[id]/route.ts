import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

// GET single inventory item by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    const item = await prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        supplyRecords: {
          orderBy: {
            suppliedDate: 'desc',
          },
          take: 10,
        },
        maintenanceLogs: {
          orderBy: {
            scheduledDate: 'desc',
          },
          take: 10,
        },
        maintenanceAlerts: {
          where: {
            status: 'PENDING',
          },
        },
        surgeryItems: {
          include: {
            surgery: {
              select: {
                id: true,
                procedureName: true,
                scheduledDate: true,
                status: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 20,
        },
        theatreSetupItems: {
          include: {
            setup: {
              select: {
                id: true,
                setupDate: true,
                theatreId: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 20,
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    return NextResponse.json({ error: 'Failed to fetch inventory item' }, { status: 500 });
  }
}

// PUT update inventory item
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allowed roles can update inventory
    const allowedRoles = ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_STORE_KEEPER'];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json();

    // Check if item exists
    const existingItem = await prisma.inventoryItem.findUnique({
      where: { id },
    });

    if (!existingItem) {
      return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });
    }

    const {
      name,
      category,
      description,
      unitCostPrice,
      quantity,
      reorderLevel,
      supplier,
      // Equipment fields
      halfLife,
      depreciationRate,
      deviceId,
      maintenanceIntervalDays,
      lastMaintenanceDate,
      nextMaintenanceDate,
      // Consumable fields
      manufacturingDate,
      expiryDate,
      batchNumber,
    } = body;

    const updateData: any = {};

    if (name) updateData.name = name;
    if (category) updateData.category = category;
    if (description !== undefined) updateData.description = description;
    if (unitCostPrice !== undefined) updateData.unitCostPrice = unitCostPrice;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (reorderLevel !== undefined) updateData.reorderLevel = reorderLevel;
    if (supplier !== undefined) updateData.supplier = supplier;

    // Equipment-specific fields
    if (halfLife !== undefined) updateData.halfLife = halfLife;
    if (depreciationRate !== undefined) updateData.depreciationRate = depreciationRate;
    if (deviceId !== undefined) updateData.deviceId = deviceId;
    if (maintenanceIntervalDays !== undefined) updateData.maintenanceIntervalDays = maintenanceIntervalDays;
    if (lastMaintenanceDate !== undefined) {
      updateData.lastMaintenanceDate = lastMaintenanceDate ? new Date(lastMaintenanceDate) : null;
    }
    if (nextMaintenanceDate !== undefined) {
      updateData.nextMaintenanceDate = nextMaintenanceDate ? new Date(nextMaintenanceDate) : null;
    }

    // Consumable-specific fields
    if (manufacturingDate !== undefined) {
      updateData.manufacturingDate = manufacturingDate ? new Date(manufacturingDate) : null;
    }
    if (expiryDate !== undefined) {
      updateData.expiryDate = expiryDate ? new Date(expiryDate) : null;
    }
    if (batchNumber !== undefined) updateData.batchNumber = batchNumber;

    const updatedItem = await prisma.inventoryItem.update({
      where: { id },
      data: updateData,
    });

    // Log the update
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'inventory_items',
        recordId: id,
        changes: JSON.stringify(updateData),
      },
    });

    return NextResponse.json(updatedItem);
  } catch (error) {
    console.error('Error updating inventory item:', error);
    return NextResponse.json({ error: 'Failed to update inventory item' }, { status: 500 });
  }
}

// PATCH for partial updates (quantity adjustments)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_STORE_KEEPER', 'SCRUB_NURSE'];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json();
    const { quantityChange, reason } = body;

    if (quantityChange === undefined) {
      return NextResponse.json({ error: 'quantityChange is required' }, { status: 400 });
    }

    const existingItem = await prisma.inventoryItem.findUnique({
      where: { id },
    });

    if (!existingItem) {
      return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });
    }

    const newQuantity = existingItem.quantity + quantityChange;
    if (newQuantity < 0) {
      return NextResponse.json({ error: 'Insufficient stock' }, { status: 400 });
    }

    const updatedItem = await prisma.inventoryItem.update({
      where: { id },
      data: { quantity: newQuantity },
    });

    // Log the adjustment
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'QUANTITY_ADJUSTMENT',
        tableName: 'inventory_items',
        recordId: id,
        changes: JSON.stringify({
          previousQuantity: existingItem.quantity,
          quantityChange,
          newQuantity,
          reason: reason || 'Manual adjustment',
        }),
      },
    });

    return NextResponse.json(updatedItem);
  } catch (error) {
    console.error('Error adjusting inventory quantity:', error);
    return NextResponse.json({ error: 'Failed to adjust quantity' }, { status: 500 });
  }
}

// DELETE inventory item
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only ADMIN and THEATRE_MANAGER can delete inventory items
    if (!['ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;

    const existingItem = await prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        surgeryItems: true,
        theatreSetupItems: true,
        checkoutItems: true,
      },
    });

    if (!existingItem) {
      return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });
    }

    // Check if item has been used in surgeries or setups
    const hasUsage = 
      existingItem.surgeryItems.length > 0 ||
      existingItem.theatreSetupItems.length > 0 ||
      existingItem.checkoutItems.length > 0;

    if (hasUsage) {
      return NextResponse.json(
        { 
          error: 'Cannot delete item that has been used in surgeries, theatre setups, or checkouts. Consider setting quantity to 0 instead.' 
        },
        { status: 400 }
      );
    }

    // Delete related records first
    await prisma.$transaction(async (tx) => {
      await tx.supplyRecord.deleteMany({ where: { itemId: id } });
      await tx.maintenanceLog.deleteMany({ where: { itemId: id } });
      await tx.maintenanceAlert.deleteMany({ where: { itemId: id } });

      await tx.inventoryItem.delete({ where: { id } });

      // Log the deletion
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'DELETE',
          tableName: 'inventory_items',
          recordId: id,
          changes: JSON.stringify({ deletedItem: existingItem.name }),
        },
      });
    });

    return NextResponse.json({ message: 'Inventory item deleted successfully' });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    return NextResponse.json({ error: 'Failed to delete inventory item' }, { status: 500 });
  }
}
