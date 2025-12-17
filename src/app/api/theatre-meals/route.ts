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
    const date = searchParams.get('date');
    const mealType = searchParams.get('mealType');

    const where: any = {};
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.mealDate = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }
    if (mealType) {
      where.mealType = mealType;
    }

    const meals = await prisma.theatreMeal.findMany({
      where,
      include: {
        staffMember: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        preparedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        mealDate: 'desc',
      },
    });

    return NextResponse.json(meals);
  } catch (error) {
    console.error('Error fetching theatre meals:', error);
    return NextResponse.json({ meals: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    // If auto-generating meals for all logged-in staff
    if (data.autoGenerate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get all staff who have logged in today (you might need a login tracking table)
      // For now, we'll just allow manual creation
      return NextResponse.json({ error: 'Auto-generation not yet implemented' }, { status: 501 });
    }

    const meal = await prisma.theatreMeal.create({
      data: {
        mealDate: data.mealDate ? new Date(data.mealDate) : new Date(),
        mealType: data.mealType,
        staffMemberName: data.staffMemberName,
        staffMemberRole: data.staffMemberRole,
        staffMemberId: data.staffMemberId,
        mealRequested: data.mealRequested !== false,
        dietaryRestrictions: data.dietaryRestrictions,
        specialRequest: data.specialRequest,
        notes: data.notes,
      },
      include: {
        staffMember: {
          select: {
            fullName: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json(meal);
  } catch (error) {
    console.error('Error creating theatre meal:', error);
    return NextResponse.json({ error: 'Failed to create theatre meal' }, { status: 500 });
  }
}
