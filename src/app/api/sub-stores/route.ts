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
    const theatreNumber = searchParams.get('theatre');

    const where: any = {};
    if (theatreNumber) {
      where.theatreNumber = theatreNumber;
    }

    const subStores = await prisma.theatreSubStore.findMany({
      where,
      include: {
        managedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        morningCheckBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
        endOfDayCheckBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
        stockTransfers: {
          orderBy: {
            transferDate: 'desc',
          },
          take: 5,
        },
      },
      orderBy: {
        theatreNumber: 'asc',
      },
    });

    return NextResponse.json(subStores);
  } catch (error) {
    console.error('Error fetching sub-stores:', error);
    return NextResponse.json({ subStores: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    const subStore = await prisma.theatreSubStore.create({
      data: {
        theatreNumber: data.theatreNumber,
        itemName: data.itemName,
        itemCode: data.itemCode,
        category: data.category,
        currentStock: data.currentStock || 0,
        minimumStock: data.minimumStock || 10,
        maximumStock: data.maximumStock || 100,
        unit: data.unit,
        managedById: data.managedById || session.user.id,
        stockStatus: data.stockStatus || 'ADEQUATE',
        notes: data.notes,
      },
      include: {
        managedBy: {
          select: {
            fullName: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json(subStore);
  } catch (error) {
    console.error('Error creating sub-store item:', error);
    return NextResponse.json({ error: 'Failed to create sub-store item' }, { status: 500 });
  }
}
