import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET - Fetch daily blood requirements summary
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    // Get all blood requests for the day
    const bloodRequests = await prisma.bloodRequest.findMany({
      where: {
        scheduledSurgeryDate: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          not: 'CANCELLED',
        },
      },
      include: {
        surgery: {
          include: {
            patient: true,
            surgeon: {
              select: {
                fullName: true,
              },
            },
          },
        },
        patient: true,
        requestedBy: {
          select: {
            fullName: true,
            role: true,
          },
        },
        acknowledgedBy: {
          select: {
            fullName: true,
          },
        },
        preparedBy: {
          select: {
            fullName: true,
          },
        },
      },
      orderBy: [
        { isEmergency: 'desc' },
        { priorityLevel: 'asc' },
        { surgery: { scheduledTime: 'asc' } },
      ],
    });

    // Calculate summary statistics
    const summary = {
      totalRequests: bloodRequests.length,
      totalUnitsRequested: bloodRequests.reduce((sum, req) => sum + req.unitsRequested, 0),
      emergencyRequests: bloodRequests.filter(req => req.isEmergency).length,
      byStatus: {
        requested: bloodRequests.filter(req => req.status === 'REQUESTED').length,
        acknowledged: bloodRequests.filter(req => req.status === 'ACKNOWLEDGED').length,
        inPreparation: bloodRequests.filter(req => req.status === 'IN_PREPARATION').length,
        ready: bloodRequests.filter(req => req.status === 'READY').length,
        delivered: bloodRequests.filter(req => req.status === 'DELIVERED').length,
      },
      byBloodType: {} as Record<string, number>,
      byUrgency: {
        routine: bloodRequests.filter(req => req.urgency === 'ROUTINE').length,
        urgent: bloodRequests.filter(req => req.urgency === 'URGENT').length,
        emergency: bloodRequests.filter(req => req.urgency === 'EMERGENCY').length,
      },
    };

    // Count by blood type
    bloodRequests.forEach(req => {
      const bloodType = `${req.bloodType}${req.rhFactor}`;
      summary.byBloodType[bloodType] = (summary.byBloodType[bloodType] || 0) + req.unitsRequested;
    });

    return NextResponse.json({
      date,
      summary,
      requests: bloodRequests,
    });
  } catch (error) {
    console.error('Error fetching daily blood requirements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch daily blood requirements' },
      { status: 500 }
    );
  }
}
