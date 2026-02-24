import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET: Fetch today's booked cases grouped by theatre, plus call-up history
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const viewMode = searchParams.get('view') || 'cases'; // 'cases' or 'history'

    // Target date (default: today)
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    if (viewMode === 'history') {
      // Return call-up history
      const callUps = await prisma.patientCallUp.findMany({
        where: {
          invitedAt: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { invitedAt: 'desc' },
      });
      return NextResponse.json(callUps);
    }

    // Fetch today's booked surgeries (SCHEDULED status) with patient + theatre allocation info
    const surgeries = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: startOfDay, lte: endOfDay },
        status: { in: ['SCHEDULED', 'IN_HOLDING_AREA', 'READY_FOR_THEATRE'] },
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            folderNumber: true,
            age: true,
            gender: true,
            ward: true,
          },
        },
        surgeon: {
          select: { fullName: true },
        },
        patientCallUps: {
          where: {
            createdAt: { gte: startOfDay, lte: endOfDay },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ scheduledTime: 'asc' }],
    });

    // Fetch theatre allocations for today to get theatre assignments + nurse/porter
    const allocations = await prisma.theatreAllocation.findMany({
      where: {
        date: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        theatre: { select: { id: true, name: true } },
        scrubNurse: { select: { id: true, fullName: true } },
        circulatingNurse: { select: { id: true, fullName: true } },
        porter: { select: { id: true, fullName: true } },
      },
    });

    // Build lookup: surgeryId -> allocation
    const allocationBySurgery: Record<string, any> = {};
    const allocationByTheatreUnit: Record<string, any> = {};
    for (const alloc of allocations) {
      if (alloc.surgeryId) {
        allocationBySurgery[alloc.surgeryId] = alloc;
      }
      // Also index by theatre+unit for fallback match
      const key = `${alloc.theatreId}_${alloc.surgicalUnit || ''}`;
      allocationByTheatreUnit[key] = alloc;
    }

    // Also fetch rosters for today (nurses, porters assigned to theatres)
    const rosters = await prisma.roster.findMany({
      where: {
        date: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        user: { select: { id: true, fullName: true, role: true } },
        theatre: { select: { id: true, name: true } },
      },
    });

    // Build roster lookup by theatreId
    const rosterByTheatre: Record<string, any[]> = {};
    for (const r of rosters) {
      if (r.theatreId) {
        if (!rosterByTheatre[r.theatreId]) rosterByTheatre[r.theatreId] = [];
        rosterByTheatre[r.theatreId].push(r);
      }
    }

    // Group surgeries by theatre
    const theatreGroups: Record<string, any> = {};
    const unassigned: any[] = [];

    for (const surgery of surgeries) {
      const alloc = allocationBySurgery[surgery.id];
      const theatreName = alloc?.theatre?.name || 'Unassigned';
      const theatreId = alloc?.theatreId || null;

      // Find nurse and porter from allocation or roster
      let nurseName = alloc?.scrubNurse?.fullName || alloc?.circulatingNurse?.fullName || null;
      let nurseId = alloc?.scrubNurseId || alloc?.circulatingNurseId || null;
      let porterName = alloc?.porter?.fullName || null;
      let porterId = alloc?.porterId || null;

      // Fallback to roster
      if (theatreId && (!nurseName || !porterName)) {
        const rosterEntries = rosterByTheatre[theatreId] || [];
        if (!nurseName) {
          const nurse = rosterEntries.find((r: any) =>
            ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'].includes(r.user?.role)
          );
          if (nurse) {
            nurseName = nurse.user.fullName;
            nurseId = nurse.user.id;
          }
        }
        if (!porterName) {
          const porter = rosterEntries.find((r: any) => r.user?.role === 'PORTER');
          if (porter) {
            porterName = porter.user.fullName;
            porterId = porter.user.id;
          }
        }
      }

      const existingCallUp = surgery.patientCallUps?.[0] || null;

      const caseData = {
        surgeryId: surgery.id,
        patientName: surgery.patient.name,
        folderNumber: surgery.patient.folderNumber,
        age: surgery.patient.age,
        gender: surgery.patient.gender,
        ward: surgery.patient.ward,
        diagnosis: surgery.indication,
        procedureName: surgery.procedureName,
        surgicalUnit: surgery.unit,
        scheduledTime: surgery.scheduledTime,
        surgeonName: surgery.surgeonName || surgery.surgeon?.fullName || 'TBD',
        theatreName,
        theatreId,
        nurseName,
        nurseId,
        porterName,
        porterId,
        status: surgery.status,
        existingCallUp,
      };

      if (theatreName === 'Unassigned') {
        unassigned.push(caseData);
      } else {
        if (!theatreGroups[theatreName]) {
          theatreGroups[theatreName] = { theatreName, theatreId, cases: [] };
        }
        theatreGroups[theatreName].cases.push(caseData);
      }
    }

    return NextResponse.json({
      theatreGroups: Object.values(theatreGroups),
      unassigned,
      date: targetDate.toISOString(),
      totalCases: surgeries.length,
    });
  } catch (error) {
    console.error('Call for patient GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Invite or Reject a patient
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { surgeryId, action, rejectionReason } = body;

    if (!surgeryId || !action) {
      return NextResponse.json({ error: 'surgeryId and action are required' }, { status: 400 });
    }

    if (!['invite', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be "invite" or "reject"' }, { status: 400 });
    }

    // Get surgery details
    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      include: {
        patient: true,
        surgeon: { select: { fullName: true } },
      },
    });

    if (!surgery) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    // Get today's theatre allocation for this surgery
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const allocation = await prisma.theatreAllocation.findFirst({
      where: { surgeryId },
      include: {
        theatre: { select: { id: true, name: true } },
        scrubNurse: { select: { id: true, fullName: true } },
        circulatingNurse: { select: { id: true, fullName: true } },
        porter: { select: { id: true, fullName: true } },
      },
    });

    // Find nurse/porter from roster as fallback
    let nurseName = allocation?.scrubNurse?.fullName || allocation?.circulatingNurse?.fullName || null;
    let nurseId = allocation?.scrubNurseId || allocation?.circulatingNurseId || null;
    let porterName = allocation?.porter?.fullName || null;
    let porterId = allocation?.porterId || null;

    if (allocation?.theatreId && (!nurseName || !porterName)) {
      const rosters = await prisma.roster.findMany({
        where: {
          theatreId: allocation.theatreId,
          date: { gte: today, lte: endOfDay },
        },
        include: {
          user: { select: { id: true, fullName: true, role: true } },
        },
      });
      if (!nurseName) {
        const nurse = rosters.find(r => ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'].includes(r.user?.role));
        if (nurse) { nurseName = nurse.user.fullName; nurseId = nurse.user.id; }
      }
      if (!porterName) {
        const porter = rosters.find(r => r.user?.role === 'PORTER');
        if (porter) { porterName = porter.user.fullName; porterId = porter.user.id; }
      }
    }

    const theatreName = allocation?.theatre?.name || body.theatreName || 'Unassigned';
    const theatreId = allocation?.theatreId || body.theatreId || null;

    if (action === 'invite') {
      const callUp = await prisma.patientCallUp.create({
        data: {
          surgeryId,
          patientName: surgery.patient.name,
          folderNumber: surgery.patient.folderNumber,
          ward: surgery.patient.ward,
          age: surgery.patient.age,
          gender: surgery.patient.gender,
          diagnosis: surgery.indication,
          procedureName: surgery.procedureName,
          surgicalUnit: surgery.unit,
          theatreName,
          theatreId,
          assignedNurseName: nurseName,
          assignedNurseId: nurseId,
          assignedPorterName: porterName,
          assignedPorterId: porterId,
          surgeonName: surgery.surgeonName || surgery.surgeon?.fullName || 'N/A',
          status: 'INVITED',
          invitedById: session.user.id,
          invitedByName: session.user.name || 'Unknown',
        },
      });

      return NextResponse.json(callUp, { status: 201 });
    }

    if (action === 'reject') {
      if (!rejectionReason) {
        return NextResponse.json({ error: 'rejectionReason is required for rejection' }, { status: 400 });
      }

      const callUp = await prisma.patientCallUp.create({
        data: {
          surgeryId,
          patientName: surgery.patient.name,
          folderNumber: surgery.patient.folderNumber,
          ward: surgery.patient.ward,
          age: surgery.patient.age,
          gender: surgery.patient.gender,
          diagnosis: surgery.indication,
          procedureName: surgery.procedureName,
          surgicalUnit: surgery.unit,
          theatreName,
          theatreId,
          assignedNurseName: nurseName,
          assignedNurseId: nurseId,
          assignedPorterName: porterName,
          assignedPorterId: porterId,
          surgeonName: surgery.surgeonName || surgery.surgeon?.fullName || 'N/A',
          status: 'REJECTED',
          invitedById: session.user.id,
          invitedByName: session.user.name || 'Unknown',
          rejectedAt: new Date(),
          rejectedById: session.user.id,
          rejectedByName: session.user.name || 'Unknown',
          rejectionReason,
        },
      });

      return NextResponse.json(callUp, { status: 201 });
    }
  } catch (error) {
    console.error('Call for patient POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
