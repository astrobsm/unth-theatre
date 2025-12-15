import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only managers, chairmen, and admins can view fault alerts
    if (session.user.role !== 'THEATRE_MANAGER' && session.user.role !== 'THEATRE_CHAIRMAN' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Only Theatre Managers, Chairmen, and Admins can view fault alerts' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const priority = searchParams.get('priority');

    const alerts = await prisma.equipmentFaultAlert.findMany({
      where: {
        ...(status && { status: status as any }),
        ...(severity && { severity }),
        ...(priority && { priority: priority as any }),
      },
      include: {
        checkout: {
          select: {
            theatreId: true,
            shift: true,
            date: true,
          },
        },
      },
      orderBy: [
        { requiresImmediateAction: 'desc' },
        { severity: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('Error fetching fault alerts:', error);
    return NextResponse.json({ error: 'Failed to fetch fault alerts' }, { status: 500 });
  }
}
