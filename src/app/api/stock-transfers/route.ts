import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const transfers = await prisma.stockTransfer.findMany({
      where,
      include: {
        toSubStore: {
          select: {
            id: true,
            theatreNumber: true,
            itemName: true,
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

    return NextResponse.json(transfers);
  } catch (error) {
    console.error('Error fetching stock transfers:', error);
    return NextResponse.json({ transfers: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    const transfer = await prisma.stockTransfer.create({
      data: {
        transferDate: data.transferDate ? new Date(data.transferDate) : new Date(),
        toSubStoreId: data.toSubStoreId,
        itemName: data.itemName,
        quantityTransferred: data.quantityTransferred,
        unit: data.unit,
        requestedById: session.user.id,
        status: 'REQUESTED',
        notes: data.notes,
      },
      include: {
        toSubStore: true,
        requestedBy: {
          select: {
            fullName: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json(transfer);
  } catch (error) {
    console.error('Error creating stock transfer:', error);
    return NextResponse.json({ error: 'Failed to create stock transfer' }, { status: 500 });
  }
}
