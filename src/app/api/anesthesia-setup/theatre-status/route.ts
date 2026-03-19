import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Get all theatres
    const theatres = await prisma.theatreSuite.findMany({
      select: {
        id: true,
        name: true,
        status: true,
      },
      orderBy: { name: 'asc' },
    });

    // Get setup logs for the date
    const setupLogs = await prisma.anesthesiaSetupLog.findMany({
      where: {
        setupDate: new Date(date),
      },
      include: {
        technician: {
          select: {
            fullName: true,
            staffCode: true,
          },
        },
        equipmentChecks: {
          where: {
            isFunctional: false,
          },
          select: {
            id: true,
            equipmentName: true,
            condition: true,
            malfunctionSeverity: true,
          },
        },
      },
      orderBy: { setupStartTime: 'desc' },
    });

    // Get allocations for the date with staff assignments
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const allocations = await prisma.theatreAllocation.findMany({
      where: {
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        scrubNurse: { select: { id: true, fullName: true, role: true } },
        circulatingNurse: { select: { id: true, fullName: true, role: true } },
        anaestheticTechnician: { select: { id: true, fullName: true, role: true } },
        anaesthetistConsultant: { select: { id: true, fullName: true, role: true } },
        anaesthetistSeniorRegistrar: { select: { id: true, fullName: true, role: true } },
        anaesthetistRegistrar: { select: { id: true, fullName: true, role: true } },
        cleaner: { select: { id: true, fullName: true, role: true } },
        porter: { select: { id: true, fullName: true, role: true } },
      },
    });

    // Create theatre status map
    const theatreStatus = theatres.map(theatre => {
      const setupLog = setupLogs.find(log => log.theatreId === theatre.id);
      const theatreAllocations = allocations.filter(a => a.theatreId === theatre.id);

      // Aggregate staff from allocations
      const staffAssignments = theatreAllocations.length > 0 ? {
        scrubNurse: theatreAllocations[0].scrubNurse?.fullName || null,
        circulatingNurse: theatreAllocations[0].circulatingNurse?.fullName || null,
        anaestheticTechnician: theatreAllocations[0].anaestheticTechnician?.fullName || null,
        anaesthetistConsultant: theatreAllocations[0].anaesthetistConsultant?.fullName || null,
        anaesthetistSeniorRegistrar: theatreAllocations[0].anaesthetistSeniorRegistrar?.fullName || null,
        anaesthetistRegistrar: theatreAllocations[0].anaesthetistRegistrar?.fullName || null,
        cleaner: theatreAllocations[0].cleaner?.fullName || null,
        porter: theatreAllocations[0].porter?.fullName || null,
        shift: theatreAllocations[0].shift || null,
        surgicalUnit: theatreAllocations[0].surgicalUnit || null,
        startTime: theatreAllocations[0].startTime || null,
        endTime: theatreAllocations[0].endTime || null,
      } : null;

      return {
        theatreId: theatre.id,
        theatreName: theatre.name,
        theatreStatus: theatre.status,
        hasSetupLog: !!setupLog,
        setupStatus: setupLog?.status || 'NOT_STARTED',
        isReady: setupLog?.isReady || false,
        technicianName: setupLog?.technician.fullName || null,
        technicianCode: setupLog?.technician.staffCode || null,
        setupStartTime: setupLog?.setupStartTime || null,
        readyTime: setupLog?.readyTime || null,
        locationName: setupLog?.locationName || null,
        locationAddress: setupLog?.locationAddress || null,
        latitude: setupLog?.latitude || null,
        longitude: setupLog?.longitude || null,
        locationAccuracy: setupLog?.locationAccuracy || null,
        distanceFromFacility: setupLog?.distanceFromFacility || null,
        malfunctioningEquipment: setupLog?.equipmentChecks.length || 0,
        blockingIssues: setupLog?.blockingIssues || null,
        setupNotes: setupLog?.setupNotes || null,
        durationMinutes: setupLog?.durationMinutes || null,
        staffAssignments,
        totalAllocations: theatreAllocations.length,
      };
    });

    // Count statistics
    const statistics = {
      totalTheatres: theatres.length,
      readyTheatres: theatreStatus.filter(t => t.isReady).length,
      inProgressTheatres: theatreStatus.filter(t => t.setupStatus === 'IN_PROGRESS').length,
      notStartedTheatres: theatreStatus.filter(t => t.setupStatus === 'NOT_STARTED').length,
      blockedTheatres: theatreStatus.filter(t => t.setupStatus === 'BLOCKED').length,
      totalMalfunctions: theatreStatus.reduce((sum, t) => sum + t.malfunctioningEquipment, 0),
    };

    return NextResponse.json({
      date,
      theatreStatus,
      statistics,
    });
  } catch (error) {
    console.error('Error fetching theatre readiness status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch theatre status' },
      { status: 500 }
    );
  }
}
