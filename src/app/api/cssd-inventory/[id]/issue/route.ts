import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/cssd-inventory/[id]/issue - Issue sterile materials for surgery
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
    const { surgeryId, quantityIssued, issuedToTheatre, purpose, notes } = body;

    if (!quantityIssued) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get inventory item
    const inventoryItem = await prisma.cssdInventory.findUnique({
      where: { id: params.id },
    });

    if (!inventoryItem) {
      return NextResponse.json(
        { error: 'Inventory item not found' },
        { status: 404 }
      );
    }

    // Check if enough quantity available
    if (inventoryItem.availableQuantity < quantityIssued) {
      return NextResponse.json(
        { error: 'Insufficient quantity available' },
        { status: 400 }
      );
    }

    // Check if item is available
    if (inventoryItem.status !== 'AVAILABLE') {
      return NextResponse.json(
        { error: 'Item is not available for use' },
        { status: 400 }
      );
    }

    // Create usage history
    const usageHistory = await prisma.cssdUsageHistory.create({
      data: {
        inventoryId: params.id,
        surgeryId: surgeryId || null,
        quantityIssued,
        issuedToTheatre: issuedToTheatre || null,
        issuedById: session.user.id,
        purpose,
        notes,
      },
      include: {
        inventory: true,
        surgery: surgeryId ? {
          select: {
            id: true,
            procedureName: true,
            surgeryType: true,
            patient: {
              select: {
                name: true,
              },
            },
          },
        } : undefined,
        issuedBy: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
      },
    });

    // Update inventory quantities
    const updatedInventory = await prisma.cssdInventory.update({
      where: { id: params.id },
      data: {
        availableQuantity: inventoryItem.availableQuantity - quantityIssued,
        inUseQuantity: inventoryItem.inUseQuantity + quantityIssued,
        status: 'IN_USE',
        updatedById: session.user.id,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'CssdUsageHistory',
        recordId: usageHistory.id,
        changes: JSON.stringify({ quantityIssued, surgeryId, issuedToTheatre, purpose }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    return NextResponse.json({ usageHistory, updatedInventory });
  } catch (error) {
    console.error('Error issuing CSSD material:', error);
    return NextResponse.json(
      { error: 'Failed to issue CSSD material' },
      { status: 500 }
    );
  }
}

