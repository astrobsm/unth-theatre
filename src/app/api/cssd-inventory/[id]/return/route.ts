import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/cssd-inventory/[id]/return - Return used materials for reprocessing
export async function POST(
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
    const { usageHistoryId, quantityReturned, notes } = body;

    if (!usageHistoryId || !quantityReturned) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get usage history record
    const usageHistory = await prisma.cssdUsageHistory.findUnique({
      where: { id: usageHistoryId },
      include: { inventory: true },
    });

    if (!usageHistory) {
      return NextResponse.json(
        { error: 'Usage history not found' },
        { status: 404 }
      );
    }

    if (usageHistory.returnedAt) {
      return NextResponse.json(
        { error: 'Materials already returned' },
        { status: 400 }
      );
    }

    if (quantityReturned > usageHistory.quantityIssued) {
      return NextResponse.json(
        { error: 'Cannot return more than issued quantity' },
        { status: 400 }
      );
    }

    // Update usage history
    const updatedUsageHistory = await prisma.cssdUsageHistory.update({
      where: { id: usageHistoryId },
      data: {
        quantityReturned,
        returnedById: session.user.id,
        returnedAt: new Date(),
        notes: notes ? `${usageHistory.notes || ''}\nReturn: ${notes}` : usageHistory.notes,
      },
      include: {
        returnedBy: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
      },
    });

    // Update inventory - move from inUse to sterilizing
    const inventoryItem = usageHistory.inventory;
    const updatedInventory = await prisma.cssdInventory.update({
      where: { id: params.id },
      data: {
        inUseQuantity: inventoryItem.inUseQuantity - quantityReturned,
        sterilizingQuantity: inventoryItem.sterilizingQuantity + quantityReturned,
        status: 'AWAITING_STERILIZATION',
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
        tableName: 'CssdUsageHistory',
        recordId: updatedUsageHistory.id,
        changes: JSON.stringify({ quantityReturned, returnedAt: new Date() }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    return NextResponse.json({ updatedUsageHistory, updatedInventory });
  } catch (error) {
    console.error('Error returning CSSD material:', error);
    return NextResponse.json(
      { error: 'Failed to return CSSD material' },
      { status: 500 }
    );
  }
}

