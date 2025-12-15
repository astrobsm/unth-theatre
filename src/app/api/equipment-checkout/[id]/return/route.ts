import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const { items, returnNotes } = body;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'Items data is required for return' },
        { status: 400 }
      );
    }

    // Get the checkout
    const checkout = await prisma.equipmentCheckout.findUnique({
      where: { id },
      include: {
        items: true,
        storeKeeper: true,
      },
    });

    if (!checkout) {
      return NextResponse.json({ error: 'Checkout not found' }, { status: 404 });
    }

    if (checkout.status === 'RETURNED') {
      return NextResponse.json(
        { error: 'Equipment already returned' },
        { status: 400 }
      );
    }

    const faultyItems: any[] = [];
    const returnTime = new Date();

    // Update each item with return condition
    for (const itemData of items) {
      const item = await prisma.checkoutItem.findUnique({
        where: { id: itemData.id },
      });

      if (!item) continue;

      await prisma.checkoutItem.update({
        where: { id: itemData.id },
        data: {
          returnCondition: itemData.returnCondition,
          returnRemarks: itemData.returnRemarks,
          returnTime,
          isFaulty: itemData.returnCondition === 'FAULTY' || itemData.returnCondition === 'DAMAGED',
          faultDescription: itemData.faultDescription,
          faultSeverity: itemData.faultSeverity || 'MEDIUM',
        },
      });

      // Collect faulty items for alert
      if (itemData.returnCondition === 'FAULTY' || itemData.returnCondition === 'DAMAGED') {
        faultyItems.push({
          itemName: item.itemName,
          faultDescription: itemData.faultDescription || 'Equipment returned in faulty condition',
          severity: itemData.faultSeverity || 'HIGH',
        });
      }
    }

    // Update checkout status
    await prisma.equipmentCheckout.update({
      where: { id },
      data: {
        returnTime,
        returnNotes,
        returnedBy: session.user.name || 'Unknown',
        status: 'RETURNED',
      },
    });

    // Create RED ALERTS for faulty equipment
    if (faultyItems.length > 0) {
      // Get theatre manager and chairman to set notification flags
      const managers = await prisma.user.findMany({
        where: {
          role: {
            in: ['THEATRE_MANAGER', 'THEATRE_CHAIRMAN'],
          },
          status: 'APPROVED',
        },
      });

      const hasManager = managers.some(m => m.role === 'THEATRE_MANAGER');
      const hasChairman = managers.some(m => m.role === 'THEATRE_CHAIRMAN');

      for (const faultyItem of faultyItems) {
        // Create fault alert (managers will see this in Fault Alerts dashboard)
        await prisma.equipmentFaultAlert.create({
          data: {
            checkoutId: id,
            itemName: faultyItem.itemName,
            faultDescription: faultyItem.faultDescription,
            severity: faultyItem.severity,
            reportedBy: `${checkout.collectorName} (${checkout.collectorRole})`,
            reportedById: checkout.storeKeeperId,
            theatreId: checkout.theatreId,
            shift: checkout.shift,
            date: checkout.date,
            status: 'REPORTED',
            priority: faultyItem.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
            requiresImmediateAction: true,
            managerNotified: hasManager,
            chairmanNotified: hasChairman,
          },
        });
      }
    }

    // Get updated checkout with all data
    const updatedCheckout = await prisma.equipmentCheckout.findUnique({
      where: { id },
      include: {
        items: true,
        faultyAlerts: true,
        storeKeeper: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
      },
    });

    return NextResponse.json({
      checkout: updatedCheckout,
      faultyItemsCount: faultyItems.length,
      alertsCreated: faultyItems.length > 0,
    });
  } catch (error: any) {
    console.error('Error returning equipment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to return equipment' },
      { status: 500 }
    );
  }
}
