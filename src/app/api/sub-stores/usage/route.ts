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

// Get usage logs with filtering
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const theatreNumber = searchParams.get('theatre');
    const surgeryId = searchParams.get('surgeryId');
    const usedById = searchParams.get('usedById');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');
    const verified = searchParams.get('verified');
    const subStoreId = searchParams.get('subStoreId');

    const where: any = {};

    if (theatreNumber) {
      where.subStore = {
        theatreNumber,
      };
    }

    if (surgeryId) {
      where.surgeryId = surgeryId;
    }

    if (usedById) {
      where.usedById = usedById;
    }

    if (subStoreId) {
      where.subStoreId = subStoreId;
    }

    if (verified === 'true') {
      where.verifiedById = { not: null };
    } else if (verified === 'false') {
      where.verifiedById = null;
    }

    if (fromDate) {
      where.usedAt = {
        ...where.usedAt,
        gte: new Date(fromDate),
      };
    }

    if (toDate) {
      where.usedAt = {
        ...where.usedAt,
        lte: new Date(toDate),
      };
    }

    const usageLogs = await prisma.subStoreUsageLog.findMany({
      where,
      include: {
        subStore: {
          select: {
            id: true,
            theatreNumber: true,
            theatreName: true,
            itemName: true,
            itemCode: true,
            category: true,
            unit: true,
            unitPrice: true,
            currentStock: true,
          },
        },
        usedBy: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
            role: true,
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
      orderBy: {
        usedAt: 'desc',
      },
    });

    // Calculate summary statistics
    const totalUsed = usageLogs.reduce((sum, log) => sum + log.quantityUsed, 0);
    const totalReturned = usageLogs.reduce((sum, log) => sum + (log.quantityReturned || 0), 0);
    const totalWasted = usageLogs.reduce((sum, log) => sum + (log.quantityWasted || 0), 0);
    const totalCost = usageLogs.reduce((sum, log) => {
      const price = log.subStore.unitPrice ? Number(log.subStore.unitPrice) : 0;
      return sum + ((log.quantityUsed - (log.quantityReturned || 0)) * price);
    }, 0);

    const summary = {
      totalLogs: usageLogs.length,
      totalUsed,
      totalReturned,
      totalWasted,
      netUsed: totalUsed - totalReturned,
      estimatedCost: totalCost,
      verified: usageLogs.filter(l => l.verifiedById).length,
      pending: usageLogs.filter(l => !l.verifiedById).length,
      todayLogs: usageLogs.filter(l => {
        const today = new Date();
        return new Date(l.usedAt).toDateString() === today.toDateString();
      }).length,
    };

    // Group by surgery for surgery-specific view
    const bySurgery = usageLogs.reduce((acc: any, log) => {
      if (log.surgeryId) {
        if (!acc[log.surgeryId]) {
          acc[log.surgeryId] = {
            surgeryId: log.surgeryId,
            patientName: log.patientName,
            items: [],
            totalUsed: 0,
            totalCost: 0,
          };
        }
        acc[log.surgeryId].items.push(log);
        acc[log.surgeryId].totalUsed += log.quantityUsed - (log.quantityReturned || 0);
        const itemPrice = log.subStore.unitPrice ? Number(log.subStore.unitPrice) : 0;
        acc[log.surgeryId].totalCost += (log.quantityUsed - (log.quantityReturned || 0)) * itemPrice;
      }
      return acc;
    }, {});

    return NextResponse.json({
      logs: usageLogs,
      summary,
      bySurgery: Object.values(bySurgery),
    });
  } catch (error) {
    console.error('Error fetching usage logs:', error);
    return NextResponse.json({ error: 'Failed to fetch usage logs' }, { status: 500 });
  }
}

// Schema for logging consumable usage
const usageLogSchema = z.object({
  subStoreId: z.string().min(1, 'Sub-store item is required'),
  surgeryId: z.string().optional(),
  patientName: z.string().optional(),
  patientId: z.string().optional(),
  quantityUsed: z.number().min(1, 'Quantity must be at least 1'),
  quantityReturned: z.number().min(0).default(0),
  quantityWasted: z.number().min(0).default(0),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

// Bulk usage log schema for logging multiple items at once
const bulkUsageLogSchema = z.object({
  surgeryId: z.string().optional(),
  patientName: z.string().optional(),
  patientId: z.string().optional(),
  items: z.array(z.object({
    subStoreId: z.string().min(1),
    quantityUsed: z.number().min(1),
    quantityReturned: z.number().min(0).default(0),
    quantityWasted: z.number().min(0).default(0),
    reason: z.string().optional(),
    notes: z.string().optional(),
  })).min(1, 'At least one item is required'),
});

// Log consumable usage - Scrub Nurse logs items used during surgery
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = (session.user as any).role;
    const userId = (session.user as any).id;

    // Scrub nurses, theatre managers, and admins can log usage
    if (!['SCRUB_NURSE', 'THEATRE_MANAGER', 'ADMIN', 'CIRCULATING_NURSE'].includes(userRole)) {
      return NextResponse.json({
        error: 'Insufficient permissions. Only Scrub Nurse or Circulating Nurse can log consumable usage.',
      }, { status: 403 });
    }

    const body = await request.json();

    // Check if it's a bulk request
    if (body.items && Array.isArray(body.items)) {
      const validatedData = bulkUsageLogSchema.parse(body);
      const results = [];
      const errors = [];

      for (const item of validatedData.items) {
        try {
          // Get sub-store item
          const subStoreItem = await prisma.theatreSubStore.findUnique({
            where: { id: item.subStoreId },
          });

          if (!subStoreItem) {
            errors.push({ subStoreId: item.subStoreId, error: 'Item not found' });
            continue;
          }

          // Check if enough stock
          if (subStoreItem.currentStock < item.quantityUsed) {
            errors.push({
              subStoreId: item.subStoreId,
              itemName: subStoreItem.itemName,
              error: `Insufficient stock. Available: ${subStoreItem.currentStock}`,
            });
            continue;
          }

          // Create usage log
          const usageLog = await prisma.subStoreUsageLog.create({
            data: {
              subStoreId: item.subStoreId,
              theatreNumber: subStoreItem.theatreNumber,
              theatreName: subStoreItem.theatreName,
              surgeryId: validatedData.surgeryId,
              patientName: validatedData.patientName,
              itemName: subStoreItem.itemName,
              quantityUsed: item.quantityUsed,
              quantityReturned: item.quantityReturned,
              quantityWasted: item.quantityWasted,
              wasteReason: item.reason,
              usageNotes: item.notes,
              usedById: userId,
              usedByName: (session.user as any).fullName || (session.user as any).email || 'Unknown',
              usedAt: new Date(),
            },
          });

          // Update sub-store stock (deduct used, add back returned)
          const netUsed = item.quantityUsed - item.quantityReturned;
          const newStock = subStoreItem.currentStock - netUsed;
          const newStockStatus = calculateStockStatus(newStock, subStoreItem.minimumStock);

          await prisma.theatreSubStore.update({
            where: { id: item.subStoreId },
            data: {
              currentStock: Math.max(0, newStock),
              stockStatus: newStockStatus,
            },
          });

          results.push({
            success: true,
            itemName: subStoreItem.itemName,
            usageLogId: usageLog.id,
            quantityUsed: netUsed,
            newStock,
          });
        } catch (itemError) {
          errors.push({ subStoreId: item.subStoreId, error: 'Failed to process item' });
        }
      }

      // Create audit log for bulk usage
      try {
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'BULK_LOG_USAGE',
            tableName: 'SubStoreUsageLog',
            recordId: validatedData.surgeryId || 'BULK',
            changes: JSON.stringify({
              surgeryId: validatedData.surgeryId,
              patientName: validatedData.patientName,
              itemCount: validatedData.items.length,
              successCount: results.length,
              errorCount: errors.length,
              loggedBy: (session.user as any).fullName || (session.user as any).email,
              timestamp: new Date().toISOString(),
            }),
          },
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);
      }

      return NextResponse.json({
        success: errors.length === 0,
        message: `Logged ${results.length} items successfully${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
        results,
        errors,
      });
    }

    // Single item usage log
    const validatedData = usageLogSchema.parse(body);

    // Get sub-store item
    const subStoreItem = await prisma.theatreSubStore.findUnique({
      where: { id: validatedData.subStoreId },
    });

    if (!subStoreItem) {
      return NextResponse.json({ error: 'Sub-store item not found' }, { status: 404 });
    }

    // Check if enough stock
    if (subStoreItem.currentStock < validatedData.quantityUsed) {
      return NextResponse.json({
        error: `Insufficient stock. Available: ${subStoreItem.currentStock}, Requested: ${validatedData.quantityUsed}`,
      }, { status: 400 });
    }

    // Create usage log
    const usageLog = await prisma.subStoreUsageLog.create({
      data: {
        subStoreId: validatedData.subStoreId,
        theatreNumber: subStoreItem.theatreNumber,
        theatreName: subStoreItem.theatreName,
        surgeryId: validatedData.surgeryId,
        patientName: validatedData.patientName,
        itemName: subStoreItem.itemName,
        quantityUsed: validatedData.quantityUsed,
        quantityReturned: validatedData.quantityReturned,
        quantityWasted: validatedData.quantityWasted,
        wasteReason: validatedData.reason,
        usageNotes: validatedData.notes,
        usedById: userId,
        usedByName: (session.user as any).fullName || (session.user as any).email || 'Unknown',
        usedAt: new Date(),
      },
      include: {
        subStore: {
          select: {
            theatreNumber: true,
            itemName: true,
            category: true,
            unit: true,
          },
        },
        usedBy: {
          select: {
            fullName: true,
            staffCode: true,
          },
        },
      },
    });

    // Update sub-store stock
    const netUsed = validatedData.quantityUsed - validatedData.quantityReturned;
    const newStock = subStoreItem.currentStock - netUsed;
    const newStockStatus = calculateStockStatus(newStock, subStoreItem.minimumStock);

    await prisma.theatreSubStore.update({
      where: { id: validatedData.subStoreId },
      data: {
        currentStock: Math.max(0, newStock),
        stockStatus: newStockStatus,
      },
    });

    // Create audit log
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'LOG_USAGE',
          tableName: 'SubStoreUsageLog',
          recordId: usageLog.id,
          changes: JSON.stringify({
            subStoreId: validatedData.subStoreId,
            itemName: subStoreItem.itemName,
            theatreNumber: subStoreItem.theatreNumber,
            quantityUsed: validatedData.quantityUsed,
            quantityReturned: validatedData.quantityReturned,
            netUsed,
            previousStock: subStoreItem.currentStock,
            newStock,
            surgeryId: validatedData.surgeryId,
            patientName: validatedData.patientName,
            loggedBy: (session.user as any).fullName || (session.user as any).email,
            timestamp: new Date().toISOString(),
          }),
        },
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    // Check if stock is low and needs restock
    if (newStockStatus === 'LOW' || newStockStatus === 'CRITICAL' || newStockStatus === 'OUT_OF_STOCK') {
      // Could trigger notification here for theatre manager
      console.log(`⚠️ Low stock alert: ${subStoreItem.itemName} in Theatre ${subStoreItem.theatreNumber} - Stock: ${newStock} (${newStockStatus})`);
    }

    return NextResponse.json({
      success: true,
      message: 'Usage logged successfully',
      usageLog,
      stockUpdate: {
        previousStock: subStoreItem.currentStock,
        netUsed,
        newStock,
        stockStatus: newStockStatus,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation error',
        details: error.errors,
      }, { status: 400 });
    }
    console.error('Error logging usage:', error);
    return NextResponse.json({ error: 'Failed to log usage' }, { status: 500 });
  }
}

// Verify usage log (Theatre Manager or Senior Nurse verification)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = (session.user as any).role;
    const userId = (session.user as any).id;

    // Only theatre managers and admins can verify usage logs
    if (!['THEATRE_MANAGER', 'ADMIN', 'SENIOR_NURSE'].includes(userRole)) {
      return NextResponse.json({
        error: 'Insufficient permissions. Only Theatre Manager or Senior Nurse can verify usage logs.',
      }, { status: 403 });
    }

    const body = await request.json();
    const { usageLogId, action, adjustedQuantity, notes } = body;

    if (!usageLogId || !action) {
      return NextResponse.json({ error: 'Usage log ID and action are required' }, { status: 400 });
    }

    const validActions = ['VERIFY', 'DISPUTE', 'ADJUST'];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const usageLog = await prisma.subStoreUsageLog.findUnique({
      where: { id: usageLogId },
      include: {
        subStore: true,
      },
    });

    if (!usageLog) {
      return NextResponse.json({ error: 'Usage log not found' }, { status: 404 });
    }

    if (usageLog.verifiedById) {
      return NextResponse.json({ error: 'Usage log already verified' }, { status: 400 });
    }

    const updateData: any = {};

    if (action === 'VERIFY') {
      updateData.verifiedById = userId;
      updateData.verifiedAt = new Date();
    } else if (action === 'ADJUST' && adjustedQuantity !== undefined) {
      // Adjust quantity and recalculate stock
      const difference = usageLog.quantityUsed - adjustedQuantity;
      updateData.quantityUsed = adjustedQuantity;
      updateData.verifiedById = userId;
      updateData.verifiedAt = new Date();
      updateData.usageNotes = usageLog.usageNotes 
        ? `${usageLog.usageNotes}\nAdjusted from ${usageLog.quantityUsed} to ${adjustedQuantity}. ${notes || ''}`
        : `Adjusted from ${usageLog.quantityUsed} to ${adjustedQuantity}. ${notes || ''}`;

      // Update sub-store stock with difference
      if (difference !== 0) {
        await prisma.theatreSubStore.update({
          where: { id: usageLog.subStoreId },
          data: {
            currentStock: {
              increment: difference, // Add back if reduced, deduct if increased
            },
          },
        });
      }
    } else if (action === 'DISPUTE') {
      updateData.usageNotes = usageLog.usageNotes
        ? `${usageLog.usageNotes}\nDISPUTED: ${notes || 'No reason provided'}`
        : `DISPUTED: ${notes || 'No reason provided'}`;
    }

    const updatedLog = await prisma.subStoreUsageLog.update({
      where: { id: usageLogId },
      data: updateData,
      include: {
        subStore: {
          select: {
            theatreNumber: true,
            itemName: true,
          },
        },
        usedBy: {
          select: { fullName: true },
        },
        verifiedBy: {
          select: { fullName: true },
        },
      },
    });

    // Create audit log
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: `USAGE_LOG_${action}`,
          tableName: 'SubStoreUsageLog',
          recordId: usageLogId,
          changes: JSON.stringify({
            action,
            previousQuantity: usageLog.quantityUsed,
            newQuantity: adjustedQuantity,
            verifiedBy: (session.user as any).fullName || (session.user as any).email,
            timestamp: new Date().toISOString(),
          }),
        },
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    return NextResponse.json({
      success: true,
      message: `Usage log ${action.toLowerCase()}d successfully`,
      usageLog: updatedLog,
    });
  } catch (error) {
    console.error('Error verifying usage log:', error);
    return NextResponse.json({ error: 'Failed to verify usage log' }, { status: 500 });
  }
}
