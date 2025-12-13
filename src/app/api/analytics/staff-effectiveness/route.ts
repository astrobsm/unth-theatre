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
    const staffId = searchParams.get('staffId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const role = searchParams.get('role');

    // Build date filter
    const dateFilter = startDate && endDate ? {
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    } : {};

    // Cleaning logs
    const cleaningLogs = await prisma.theatreCleaningLog.findMany({
      where: {
        ...(staffId && { cleanerId: staffId }),
        ...dateFilter,
        ...(role === 'CLEANER' && !staffId && {}),
      },
      include: {
        cleaner: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
        theatre: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    // Transport logs
    const transportLogs = await prisma.patientTransportLog.findMany({
      where: {
        ...(staffId && { porterId: staffId }),
        ...dateFilter,
        ...(role === 'PORTER' && !staffId && {}),
      },
      include: {
        porter: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
        patient: {
          select: {
            name: true,
            folderNumber: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    // Other duty logs
    const dutyLogs = await prisma.staffDutyLog.findMany({
      where: {
        ...(staffId && { staffId }),
        ...dateFilter,
        ...(role && role !== 'CLEANER' && role !== 'PORTER' && { staffRole: role as any }),
      },
      include: {
        staff: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
            role: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    // Calculate statistics
    const cleaningStats = {
      total: cleaningLogs.length,
      completed: cleaningLogs.filter(log => log.status === 'COMPLETED').length,
      inProgress: cleaningLogs.filter(log => log.status === 'IN_PROGRESS').length,
      averageDuration: cleaningLogs
        .filter(log => log.durationMinutes)
        .reduce((sum, log) => sum + (log.durationMinutes || 0), 0) / 
        (cleaningLogs.filter(log => log.durationMinutes).length || 1),
      totalMinutes: cleaningLogs.reduce((sum, log) => sum + (log.durationMinutes || 0), 0),
    };

    const transportStats = {
      total: transportLogs.length,
      completed: transportLogs.filter(log => log.status === 'COMPLETED').length,
      inProgress: transportLogs.filter(log => log.status === 'IN_PROGRESS').length,
      averageDuration: transportLogs
        .filter(log => log.durationMinutes)
        .reduce((sum, log) => sum + (log.durationMinutes || 0), 0) / 
        (transportLogs.filter(log => log.durationMinutes).length || 1),
      totalMinutes: transportLogs.reduce((sum, log) => sum + (log.durationMinutes || 0), 0),
    };

    const dutyStats = {
      total: dutyLogs.length,
      completed: dutyLogs.filter(log => log.status === 'COMPLETED').length,
      inProgress: dutyLogs.filter(log => log.status === 'IN_PROGRESS').length,
      averageDuration: dutyLogs
        .filter(log => log.durationMinutes)
        .reduce((sum, log) => sum + (log.durationMinutes || 0), 0) / 
        (dutyLogs.filter(log => log.durationMinutes).length || 1),
      totalMinutes: dutyLogs.reduce((sum, log) => sum + (log.durationMinutes || 0), 0),
      byType: dutyLogs.reduce((acc, log) => {
        acc[log.dutyType] = (acc[log.dutyType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    // Staff performance rankings
    const staffPerformance = await prisma.user.findMany({
      where: {
        role: { in: ['CLEANER', 'PORTER'] },
        status: 'APPROVED',
      },
      select: {
        id: true,
        fullName: true,
        staffCode: true,
        role: true,
        cleaningLogs: {
          where: {
            status: 'COMPLETED',
            ...dateFilter,
          },
          select: {
            durationMinutes: true,
            qualityRating: true,
          },
        },
        transportLogs: {
          where: {
            status: 'COMPLETED',
            ...dateFilter,
          },
          select: {
            durationMinutes: true,
          },
        },
        dutyLogs: {
          where: {
            status: 'COMPLETED',
            ...dateFilter,
          },
          select: {
            durationMinutes: true,
            qualityRating: true,
          },
        },
      },
    });

    const staffStats = staffPerformance.map(staff => {
      const totalTasks = staff.cleaningLogs.length + staff.transportLogs.length + staff.dutyLogs.length;
      const totalMinutes = [
        ...staff.cleaningLogs,
        ...staff.transportLogs,
        ...staff.dutyLogs,
      ].reduce((sum, log) => sum + (log.durationMinutes || 0), 0);

      const ratings = [
        ...staff.cleaningLogs.map(log => log.qualityRating),
        ...staff.dutyLogs.map(log => log.qualityRating),
      ].filter(Boolean) as number[];

      const averageRating = ratings.length > 0 
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length 
        : null;

      return {
        id: staff.id,
        name: staff.fullName,
        staffCode: staff.staffCode,
        role: staff.role,
        totalTasks,
        totalHours: (totalMinutes / 60).toFixed(2),
        averageRating: averageRating ? averageRating.toFixed(1) : 'N/A',
        cleaningTasks: staff.cleaningLogs.length,
        transportTasks: staff.transportLogs.length,
        otherDuties: staff.dutyLogs.length,
      };
    }).sort((a, b) => b.totalTasks - a.totalTasks);

    return NextResponse.json({
      cleaningLogs,
      transportLogs,
      dutyLogs,
      statistics: {
        cleaning: cleaningStats,
        transport: transportStats,
        duties: dutyStats,
      },
      staffPerformance: staffStats,
    });
  } catch (error) {
    console.error('Error fetching staff analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}
