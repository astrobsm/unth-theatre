import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

// Calculate stock status based on current stock and thresholds
function calculateStockStatus(currentStock: number, minimumStock: number): string {
  if (currentStock === 0) return 'OUT_OF_STOCK';
  if (currentStock <= minimumStock / 2) return 'CRITICAL';
  if (currentStock <= minimumStock) return 'LOW';
  return 'ADEQUATE';
}

// Get all stock transfers with filtering
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const theatreNumber = searchParams.get('theatre');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');
    const transferType = searchParams.get('type'); // 'TO_SUBSTORE' or 'FROM_SUBSTORE'

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (theatreNumber) {
      where.toSubStore = {
        theatreNumber,
      };
    }

    if (fromDate) {
      where.transferDate = {
        ...where.transferDate,
        gte: new Date(fromDate),
      };
    }

    if (toDate) {
      where.transferDate = {
        ...where.transferDate,
        lte: new Date(toDate),
      };
    }

    const transfers = await prisma.stockTransfer.findMany({
      where,
      include: {
        toSubStore: {
          select: {
            id: true,
            theatreNumber: true,
            theatreName: true,
            itemName: true,
            itemCode: true,
            category: true,
            currentStock: true,
            unit: true,
            managedBy: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        requestedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
        issuedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
        receivedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        transferDate: 'desc',
      },
    });

    // Group by status for dashboard
    const summary = {
      total: transfers.length,
      pending: transfers.filter(t => t.status === 'PENDING').length,
      approved: transfers.filter(t => t.status === 'APPROVED').length,
      inTransit: transfers.filter(t => t.status === 'IN_TRANSIT').length,
      received: transfers.filter(t => t.status === 'RECEIVED').length,
      cancelled: transfers.filter(t => t.status === 'CANCELLED').length,
      todayTransfers: transfers.filter(t => {
        const today = new Date();
        const transferDate = new Date(t.transferDate);
        return transferDate.toDateString() === today.toDateString();
      }).length,
    };

    return NextResponse.json({
      transfers,
      summary,
    });
  } catch (error) {
    console.error('Error fetching stock transfers:', error);
    return NextResponse.json({ error: 'Failed to fetch stock transfers' }, { status: 500 });
  }
}

// Schema for creating stock transfers
const createTransferSchema = z.object({
  subStoreId: z.string().min(1, 'Sub-store item is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  sourceInventoryId: z.string().optional(), // Main store inventory item ID
  notes: z.string().optional(),
  transferType: z.enum(['TO_SUBSTORE', 'RETURN_TO_MAIN']).default('TO_SUBSTORE'),
});

// Create new stock transfer - Theatre Manager transfers from main store to sub-store
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = (session.user as any).role;
    const userId = (session.user as any).id;

    // Only theatre managers, store keepers, and admins can create transfers
    if (!['THEATRE_MANAGER', 'THEATRE_STORE_KEEPER', 'ADMIN'].includes(userRole)) {
      return NextResponse.json({
        error: 'Insufficient permissions. Only Theatre Manager or Store Keeper can create stock transfers.',
      }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = createTransferSchema.parse(body);

    // Get the sub-store item
    const subStoreItem = await prisma.theatreSubStore.findUnique({
      where: { id: validatedData.subStoreId },
      include: {
        managedBy: {
          select: { id: true, fullName: true },
        },
      },
    });

    if (!subStoreItem) {
      return NextResponse.json({ error: 'Sub-store item not found' }, { status: 404 });
    }

    // Check if adding this quantity would exceed maximum stock
    const newStock = subStoreItem.currentStock + validatedData.quantity;
    if (newStock > subStoreItem.maximumStock) {
      return NextResponse.json({
        error: `Transfer would exceed maximum stock. Current: ${subStoreItem.currentStock}, Maximum: ${subStoreItem.maximumStock}`,
      }, { status: 400 });
    }

    // If source inventory is specified, check and deduct from main store
    if (validatedData.sourceInventoryId) {
      const sourceInventory = await prisma.inventoryItem.findUnique({
        where: { id: validatedData.sourceInventoryId },
      });

      if (!sourceInventory) {
        return NextResponse.json({ error: 'Source inventory item not found' }, { status: 404 });
      }

      if (sourceInventory.quantity < validatedData.quantity) {
        return NextResponse.json({
          error: `Insufficient stock in main store. Available: ${sourceInventory.quantity}`,
        }, { status: 400 });
      }

      // Deduct from main store
      await prisma.inventoryItem.update({
        where: { id: validatedData.sourceInventoryId },
        data: {
          quantity: {
            decrement: validatedData.quantity,
          },
        },
      });
    }

    // Create the stock transfer record
    const transfer = await prisma.stockTransfer.create({
      data: {
        toSubStoreId: validatedData.subStoreId,
        itemName: subStoreItem.itemName,
        quantityTransferred: validatedData.quantity,
        unit: subStoreItem.unit || 'units',
        status: 'REQUESTED',
        requestedById: userId,
        transferDate: new Date(),
        notes: validatedData.notes,
      },
      include: {
        toSubStore: {
          select: {
            theatreNumber: true,
            theatreName: true,
            itemName: true,
            category: true,
            managedBy: {
              select: { fullName: true },
            },
          },
        },
        requestedBy: {
          select: { fullName: true },
        },
      },
    });

    // Create audit log
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'CREATE_STOCK_TRANSFER',
          tableName: 'StockTransfer',
          recordId: transfer.id,
          changes: JSON.stringify({
            subStoreId: validatedData.subStoreId,
            theatreNumber: subStoreItem.theatreNumber,
            itemName: subStoreItem.itemName,
            quantity: validatedData.quantity,
            transferredBy: (session.user as any).fullName || (session.user as any).email,
            timestamp: new Date().toISOString(),
          }),
        },
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    return NextResponse.json({
      success: true,
      message: 'Stock transfer created successfully. Pending confirmation from receiving theatre.',
      transfer,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation error',
        details: error.errors,
      }, { status: 400 });
    }
    console.error('Error creating stock transfer:', error);
    return NextResponse.json({ error: 'Failed to create stock transfer' }, { status: 500 });
  }
}

// Update transfer status (approve, receive, cancel)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { transferId, action, notes } = body;

    if (!transferId || !action) {
      return NextResponse.json({ error: 'Transfer ID and action are required' }, { status: 400 });
    }

    const validActions = ['APPROVE', 'RECEIVE', 'CANCEL', 'IN_TRANSIT'];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const transfer = await prisma.stockTransfer.findUnique({
      where: { id: transferId },
      include: {
        toSubStore: true,
      },
    });

    if (!transfer) {
      return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
    }

    const userRole = (session.user as any).role;
    const userId = (session.user as any).id;

    // Permission checks based on action
    if (action === 'APPROVE' && !['THEATRE_MANAGER', 'THEATRE_STORE_KEEPER', 'ADMIN'].includes(userRole)) {
      return NextResponse.json({ error: 'Only Theatre Manager can approve transfers' }, { status: 403 });
    }

    if (action === 'RECEIVE' && !['SCRUB_NURSE', 'THEATRE_MANAGER', 'ADMIN'].includes(userRole)) {
      return NextResponse.json({ error: 'Only Scrub Nurse or Theatre Manager can receive transfers' }, { status: 403 });
    }

    // Map action to status
    const statusMap: { [key: string]: string } = {
      APPROVE: 'APPROVED',
      RECEIVE: 'RECEIVED',
      CANCEL: 'CANCELLED',
      IN_TRANSIT: 'IN_TRANSIT',
    };

    const updateData: any = {
      status: statusMap[action],
    };

    if (notes) {
      updateData.notes = transfer.notes ? `${transfer.notes}\n${notes}` : notes;
    }

    if (action === 'RECEIVE') {
      updateData.receivedById = userId;
      updateData.receivedAt = new Date();

      // Update sub-store stock when received
      const newStock = transfer.toSubStore.currentStock + transfer.quantityTransferred;
      const newStockStatus = calculateStockStatus(newStock, transfer.toSubStore.minimumStock);

      await prisma.theatreSubStore.update({
        where: { id: transfer.toSubStoreId },
        data: {
          currentStock: newStock,
          stockStatus: newStockStatus,
          lastRestocked: new Date(),
        },
      });
    }

    const updatedTransfer = await prisma.stockTransfer.update({
      where: { id: transferId },
      data: updateData,
      include: {
        toSubStore: {
          select: {
            theatreNumber: true,
            theatreName: true,
            itemName: true,
            currentStock: true,
            stockStatus: true,
          },
        },
      },
    });

    // Create audit log
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: `TRANSFER_${action}`,
          tableName: 'StockTransfer',
          recordId: transferId,
          changes: JSON.stringify({
            action,
            previousStatus: transfer.status,
            newStatus: statusMap[action],
            updatedBy: (session.user as any).fullName || (session.user as any).email,
            timestamp: new Date().toISOString(),
          }),
        },
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    return NextResponse.json({
      success: true,
      message: `Transfer ${action.toLowerCase()}d successfully`,
      transfer: updatedTransfer,
    });
  } catch (error) {
    console.error('Error updating stock transfer:', error);
    return NextResponse.json({ error: 'Failed to update stock transfer' }, { status: 500 });
  }
}
