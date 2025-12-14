import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET - Get all checkouts
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const theatreId = searchParams.get('theatreId');
    const date = searchParams.get('date');
    const technicianId = searchParams.get('technicianId');

    const where: any = {};
    
    if (status) where.status = status;
    if (theatreId) where.theatreId = theatreId;
    if (date) where.date = new Date(date);
    if (technicianId) where.technicianId = technicianId;

    const checkouts = await prisma.equipmentCheckout.findMany({
      where,
      include: {
        technician: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
        items: {
          include: {
            inventoryItem: true,
          },
        },
        faultyAlerts: {
          where: {
            status: {
              not: 'CLOSED',
            },
          },
        },
      },
      orderBy: {
        checkoutTime: 'desc',
      },
    });

    return NextResponse.json({ checkouts });
  } catch (error: any) {
    console.error('Error fetching checkouts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch checkouts' },
      { status: 500 }
    );
  }
}

// POST - Create new checkout
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only anaesthetic technicians and admins can checkout equipment
    if (session.user.role !== 'ANAESTHETIC_TECHNICIAN' && session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only anaesthetic technicians and admins can checkout equipment' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { theatreId, shift, date, items, checkoutNotes } = body;

    if (!theatreId || !shift || !date || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'Theatre, shift, date, and items are required' },
        { status: 400 }
      );
    }

    // Create checkout with items
    const checkout = await prisma.equipmentCheckout.create({
      data: {
        technicianId: session.user.id,
        technicianName: session.user.name || 'Unknown',
        theatreId,
        shift,
        date: new Date(date),
        checkoutNotes,
        status: 'CHECKED_OUT',
        items: {
          create: items.map((item: any) => ({
            inventoryItemId: item.inventoryItemId,
            itemName: item.itemName,
            itemCategory: item.itemCategory,
            quantity: item.quantity || 1,
            serialNumber: item.serialNumber,
            checkoutCondition: item.checkoutCondition || 'FUNCTIONAL',
            checkoutRemarks: item.checkoutRemarks,
          })),
        },
      },
      include: {
        items: true,
        technician: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
      },
    });

    return NextResponse.json({ checkout }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating checkout:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout' },
      { status: 500 }
    );
  }
}
