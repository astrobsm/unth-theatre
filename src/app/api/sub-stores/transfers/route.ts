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
    const transferType = searchParams.get('type');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');
    const search = searchParams.get('search');

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (transferType) {
      where.transferType = transferType;
    }

    if (theatreNumber) {
      where.OR = [
        { destTheatreNumber: theatreNumber },
        { sourceTheatreNumber: theatreNumber },
      ];
    }

    if (search) {
      where.itemName = { contains: search, mode: 'insensitive' };
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
            role: true,
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

    // Summary statistics
    const summary = {
      totalTransfers: transfers.length,
      pendingApproval: transfers.filter(t => t.status === 'REQUESTED').length,
      pendingIssue: transfers.filter(t => t.status === 'APPROVED').length,
      pendingReceive: transfers.filter(t => t.status === 'ISSUED').length,
      completed: transfers.filter(t => t.status === 'RECEIVED').length,
      cancelled: transfers.filter(t => t.status === 'CANCELLED').length,
      mainToSubstore: transfers.filter(t => t.transferType === 'MAIN_TO_SUBSTORE').length,
      interSubstore: transfers.filter(t => t.transferType === 'SUBSTORE_TO_SUBSTORE').length,
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

// Schema for main store -> sub-store transfer
const mainStoreTransferSchema = z.object({
  transferType: z.string().default('MAIN_TO_SUBSTORE'),
  theatreNumber: z.string().min(1, 'Theatre number is required'),
  items: z.array(z.object({
    itemId: z.string().min(1, 'Inventory item ID is required'),
    itemName: z.string().min(1),
    quantity: z.number().min(1, 'Quantity must be at least 1'),
    unit: z.string().optional(),
  })).min(1, 'At least one item is required'),
  notes: z.string().optional(),
});

// Schema for inter-substore transfer (between theatres)
const interSubstoreTransferSchema = z.object({
  transferType: z.literal('SUBSTORE_TO_SUBSTORE'),
  sourceTheatreNumber: z.string().min(1, 'Source theatre is required'),
  destTheatreNumber: z.string().min(1, 'Destination theatre is required'),
  items: z.array(z.object({
    sourceSubStoreId: z.string().min(1, 'Source sub-store item ID is required'),
    itemName: z.string().min(1),
    quantity: z.number().min(1, 'Quantity must be at least 1'),
    unit: z.string().optional(),
  })).min(1, 'At least one item is required'),
  notes: z.string().optional(),
});

// Create stock transfer
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = (session.user as any).role;
    const userId = (session.user as any).id;

    const body = await request.json();
    const transferType = body.transferType || 'MAIN_TO_SUBSTORE';

    // =============================================
    // INTER-SUBSTORE TRANSFER (Theatre -> Theatre)
    // ONLY Theatre Manager can authorize
    // =============================================
    if (transferType === 'SUBSTORE_TO_SUBSTORE') {
      if (!['THEATRE_MANAGER', 'ADMIN'].includes(userRole)) {
        return NextResponse.json({
          error: 'Only the Theatre Manager can authorize transfers between sub-stores.',
        }, { status: 403 });
      }

      const validatedData = interSubstoreTransferSchema.parse(body);

      if (validatedData.sourceTheatreNumber === validatedData.destTheatreNumber) {
        return NextResponse.json({
          error: 'Source and destination theatres must be different.',
        }, { status: 400 });
      }

      const results = [];
      const errors = [];

      for (const item of validatedData.items) {
        try {
          // Get source sub-store item
          const sourceItem = await prisma.theatreSubStore.findUnique({
            where: { id: item.sourceSubStoreId },
          });

          if (!sourceItem) {
            errors.push({ itemName: item.itemName, error: 'Source item not found' });
            continue;
          }

          if (sourceItem.theatreNumber !== validatedData.sourceTheatreNumber) {
            errors.push({ itemName: item.itemName, error: 'Item does not belong to source theatre' });
            continue;
          }

          if (sourceItem.currentStock < item.quantity) {
            errors.push({
              itemName: item.itemName,
              error: `Insufficient stock in source theatre. Available: ${sourceItem.currentStock}`,
            });
            continue;
          }

          // Find or create the destination sub-store item
          let destItem = await prisma.theatreSubStore.findFirst({
            where: {
              theatreNumber: validatedData.destTheatreNumber,
              itemName: sourceItem.itemName,
            },
          });

          if (!destItem) {
            destItem = await prisma.theatreSubStore.create({
              data: {
                theatreNumber: validatedData.destTheatreNumber,
                theatreName: `Theatre ${validatedData.destTheatreNumber.replace('THEATRE_', '')}`,
                itemName: sourceItem.itemName,
                itemCode: sourceItem.itemCode,
                category: sourceItem.category,
                currentStock: 0,
                minimumStock: sourceItem.minimumStock,
                maximumStock: sourceItem.maximumStock,
                unit: sourceItem.unit,
                unitPrice: sourceItem.unitPrice,
                batchNumber: sourceItem.batchNumber,
                expiryDate: sourceItem.expiryDate,
                managedById: sourceItem.managedById,
                stockStatus: 'OUT_OF_STOCK',
              },
            });
          }

          if (destItem.currentStock + item.quantity > destItem.maximumStock) {
            errors.push({
              itemName: item.itemName,
              error: `Would exceed max stock at destination. Current: ${destItem.currentStock}, Max: ${destItem.maximumStock}`,
            });
            continue;
          }

          // Deduct from source sub-store
          const newSourceStock = sourceItem.currentStock - item.quantity;
          await prisma.theatreSubStore.update({
            where: { id: sourceItem.id },
            data: {
              currentStock: newSourceStock,
              stockStatus: calculateStockStatus(newSourceStock, sourceItem.minimumStock),
            },
          });

          // Create transfer record (auto-approved by Theatre Manager)
          const transfer = await prisma.stockTransfer.create({
            data: {
              transferType: 'SUBSTORE_TO_SUBSTORE',
              fromMainStore: false,
              fromSubStoreId: sourceItem.id,
              sourceTheatreNumber: validatedData.sourceTheatreNumber,
              toSubStoreId: destItem.id,
              destTheatreNumber: validatedData.destTheatreNumber,
              itemName: sourceItem.itemName,
              quantityTransferred: item.quantity,
              unit: sourceItem.unit,
              requestedById: userId,
              approvedById: userId,
              approvedAt: new Date(),
              status: 'APPROVED',
              notes: validatedData.notes,
              transferDate: new Date(),
            },
          });

          results.push({
            transferId: transfer.id,
            itemName: sourceItem.itemName,
            quantity: item.quantity,
            from: validatedData.sourceTheatreNumber,
            to: validatedData.destTheatreNumber,
          });
        } catch (itemError: any) {
          errors.push({ itemName: item.itemName, error: itemError.message || 'Failed to process' });
        }
      }

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'INTER_SUBSTORE_TRANSFER',
            tableName: 'StockTransfer',
            recordId: 'BATCH',
            changes: JSON.stringify({
              transferType: 'SUBSTORE_TO_SUBSTORE',
              from: validatedData.sourceTheatreNumber,
              to: validatedData.destTheatreNumber,
              itemCount: validatedData.items.length,
              successCount: results.length,
              errorCount: errors.length,
              authorizedBy: (session.user as any).fullName,
              timestamp: new Date().toISOString(),
            }),
          },
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);
      }

      return NextResponse.json({
        success: errors.length === 0,
        message: `Transferred ${results.length} item(s) between sub-stores${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
        results,
        errors,
      }, { status: 201 });
    }

    // =============================================
    // MAIN STORE -> SUB-STORE TRANSFER
    // Theatre Manager, Store Keeper, or Admin
    // =============================================
    if (!['THEATRE_MANAGER', 'THEATRE_STORE_KEEPER', 'ADMIN'].includes(userRole)) {
      return NextResponse.json({
        error: 'Insufficient permissions. Only Theatre Manager or Store Keeper can create stock transfers from main store.',
      }, { status: 403 });
    }

    const validatedData = mainStoreTransferSchema.parse(body);
    const results = [];
    const errors = [];

    for (const item of validatedData.items) {
      try {
        // Verify main store inventory item exists and has sufficient stock
        const inventoryItem = await prisma.inventoryItem.findUnique({
          where: { id: item.itemId },
        });

        if (!inventoryItem) {
          errors.push({ itemName: item.itemName, error: 'Item not found in main store inventory' });
          continue;
        }

        if (inventoryItem.quantity < item.quantity) {
          errors.push({
            itemName: item.itemName,
            error: `Insufficient stock in main store. Available: ${inventoryItem.quantity}, Requested: ${item.quantity}`,
          });
          continue;
        }

        // Find or create the sub-store item for this theatre
        let subStoreItem = await prisma.theatreSubStore.findFirst({
          where: {
            theatreNumber: validatedData.theatreNumber,
            itemName: inventoryItem.name,
          },
        });

        if (!subStoreItem) {
          subStoreItem = await prisma.theatreSubStore.create({
            data: {
              theatreNumber: validatedData.theatreNumber,
              theatreName: `Theatre ${validatedData.theatreNumber.replace('THEATRE_', '')}`,
              itemName: inventoryItem.name,
              itemCode: inventoryItem.batchNumber || undefined,
              category: inventoryItem.category,
              currentStock: 0,
              minimumStock: 10,
              maximumStock: 100,
              unit: item.unit || 'pcs',
              unitPrice: inventoryItem.unitCostPrice,
              batchNumber: inventoryItem.batchNumber,
              expiryDate: inventoryItem.expiryDate,
              managedById: userId,
              stockStatus: 'OUT_OF_STOCK',
            },
          });
        }

        if (subStoreItem.currentStock + item.quantity > subStoreItem.maximumStock) {
          errors.push({
            itemName: item.itemName,
            error: `Would exceed max stock. Current: ${subStoreItem.currentStock}, Max: ${subStoreItem.maximumStock}, Requested: ${item.quantity}`,
          });
          continue;
        }

        // DEDUCT from main store inventory
        await prisma.inventoryItem.update({
          where: { id: item.itemId },
          data: {
            quantity: {
              decrement: item.quantity,
            },
          },
        });

        // Create transfer record
        const transfer = await prisma.stockTransfer.create({
          data: {
            transferType: 'MAIN_TO_SUBSTORE',
            fromMainStore: true,
            sourceInventoryId: item.itemId,
            toSubStoreId: subStoreItem.id,
            destTheatreNumber: validatedData.theatreNumber,
            itemName: inventoryItem.name,
            quantityTransferred: item.quantity,
            unit: item.unit || subStoreItem.unit,
            requestedById: userId,
            status: 'REQUESTED',
            notes: validatedData.notes,
            transferDate: new Date(),
          },
          include: {
            toSubStore: {
              select: {
                theatreNumber: true,
                theatreName: true,
                itemName: true,
                currentStock: true,
              },
            },
            requestedBy: {
              select: { fullName: true },
            },
          },
        });

        results.push({
          transferId: transfer.id,
          itemName: inventoryItem.name,
          quantity: item.quantity,
          mainStoreRemaining: inventoryItem.quantity - item.quantity,
          subStoreCurrentStock: subStoreItem.currentStock,
        });
      } catch (itemError: any) {
        errors.push({ itemName: item.itemName, error: itemError.message || 'Failed to process transfer' });
      }
    }

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'MAIN_STORE_TO_SUBSTORE_TRANSFER',
          tableName: 'StockTransfer',
          recordId: 'BATCH',
          changes: JSON.stringify({
            transferType: 'MAIN_TO_SUBSTORE',
            theatreNumber: validatedData.theatreNumber,
            itemCount: validatedData.items.length,
            successCount: results.length,
            errorCount: errors.length,
            transferredBy: (session.user as any).fullName,
            timestamp: new Date().toISOString(),
          }),
        },
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    return NextResponse.json({
      success: errors.length === 0,
      message: `Created ${results.length} transfer(s) from main store${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
      results,
      errors,
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

// Update transfer status (approve, issue, receive, cancel)
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

    const validActions = ['APPROVE', 'ISSUE', 'RECEIVE', 'CANCEL'];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be APPROVE, ISSUE, RECEIVE, or CANCEL' }, { status: 400 });
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

    // ===== AUTHORIZATION RULES =====

    // APPROVE: ONLY Theatre Manager can approve ANY transfer
    if (action === 'APPROVE') {
      if (!['THEATRE_MANAGER', 'ADMIN'].includes(userRole)) {
        return NextResponse.json({
          error: 'Only the Theatre Manager can approve stock transfers.',
        }, { status: 403 });
      }
      if (transfer.status !== 'REQUESTED') {
        return NextResponse.json({ error: 'Transfer must be in REQUESTED status to approve' }, { status: 400 });
      }
    }

    // ISSUE: Theatre Manager or Store Keeper
    if (action === 'ISSUE') {
      if (!['THEATRE_MANAGER', 'THEATRE_STORE_KEEPER', 'ADMIN'].includes(userRole)) {
        return NextResponse.json({
          error: 'Only Theatre Manager or Store Keeper can issue transfers.',
        }, { status: 403 });
      }
      if (transfer.status !== 'APPROVED') {
        return NextResponse.json({ error: 'Transfer must be APPROVED before it can be issued' }, { status: 400 });
      }
    }

    // RECEIVE: Scrub Nurse or Theatre Manager
    if (action === 'RECEIVE') {
      if (!['SCRUB_NURSE', 'THEATRE_MANAGER', 'ADMIN', 'CIRCULATING_NURSE'].includes(userRole)) {
        return NextResponse.json({
          error: 'Only Scrub Nurse, Circulating Nurse, or Theatre Manager can receive transfers.',
        }, { status: 403 });
      }
      if (transfer.status !== 'ISSUED') {
        return NextResponse.json({ error: 'Transfer must be ISSUED before it can be received' }, { status: 400 });
      }
    }

    // CANCEL
    if (action === 'CANCEL') {
      if (!['THEATRE_MANAGER', 'ADMIN'].includes(userRole) && transfer.requestedById !== userId) {
        return NextResponse.json({
          error: 'Only Theatre Manager or the requester can cancel transfers.',
        }, { status: 403 });
      }
      if (['RECEIVED', 'CANCELLED'].includes(transfer.status)) {
        return NextResponse.json({ error: 'Cannot cancel a completed or already cancelled transfer' }, { status: 400 });
      }
    }

    // ===== PERFORM STATUS UPDATE =====
    const updateData: any = {};

    switch (action) {
      case 'APPROVE':
        updateData.status = 'APPROVED';
        updateData.approvedById = userId;
        updateData.approvedAt = new Date();
        break;

      case 'ISSUE':
        updateData.status = 'ISSUED';
        updateData.issuedById = userId;
        updateData.issuedAt = new Date();
        break;

      case 'RECEIVE':
        updateData.status = 'RECEIVED';
        updateData.receivedById = userId;
        updateData.receivedAt = new Date();

        // Add stock to destination sub-store on receive
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
        break;

      case 'CANCEL':
        updateData.status = 'CANCELLED';

        // Restore main store stock if already deducted
        if (transfer.fromMainStore && transfer.sourceInventoryId) {
          try {
            await prisma.inventoryItem.update({
              where: { id: transfer.sourceInventoryId },
              data: {
                quantity: {
                  increment: transfer.quantityTransferred,
                },
              },
            });
          } catch (restoreError) {
            console.error('Failed to restore main store stock on cancel:', restoreError);
          }
        }

        // Restore source sub-store stock for inter-substore transfers
        if (transfer.transferType === 'SUBSTORE_TO_SUBSTORE' && transfer.fromSubStoreId) {
          try {
            const sourceSubStore = await prisma.theatreSubStore.findUnique({
              where: { id: transfer.fromSubStoreId },
            });
            if (sourceSubStore) {
              const restoredStock = sourceSubStore.currentStock + transfer.quantityTransferred;
              await prisma.theatreSubStore.update({
                where: { id: transfer.fromSubStoreId },
                data: {
                  currentStock: restoredStock,
                  stockStatus: calculateStockStatus(restoredStock, sourceSubStore.minimumStock),
                },
              });
            }
          } catch (restoreError) {
            console.error('Failed to restore source sub-store stock on cancel:', restoreError);
          }
        }
        break;
    }

    if (notes) {
      updateData.notes = transfer.notes ? `${transfer.notes}\n[${action}] ${notes}` : `[${action}] ${notes}`;
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
        requestedBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        issuedBy: { select: { fullName: true } },
        receivedBy: { select: { fullName: true } },
      },
    });

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: `TRANSFER_${action}`,
          tableName: 'StockTransfer',
          recordId: transferId,
          changes: JSON.stringify({
            action,
            transferType: transfer.transferType,
            previousStatus: transfer.status,
            newStatus: updateData.status,
            itemName: transfer.itemName,
            quantity: transfer.quantityTransferred,
            actionBy: (session.user as any).fullName,
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
