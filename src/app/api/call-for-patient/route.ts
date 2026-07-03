import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { triggerRadio, speak3 } from '@/lib/radioEvents';

export const dynamic = 'force-dynamic';

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
        // Latest pre-op visit determines whether the patient is cleared for surgery.
        preOperativeVisits: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { overallStatus: true },
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

    // Resolve theatre names for surgeries that carry a theatre chosen at booking
    // time (Surgery.theatreId → TheatreSuite) even when no allocation row exists.
    // Without this, such cases all fall into the "Unassigned" bucket.
    const suiteIds = Array.from(
      new Set(
        surgeries
          .map((s) => s.theatreId)
          .filter((id): id is string => !!id)
      )
    );
    const suiteNameById: Record<string, string> = {};
    if (suiteIds.length > 0) {
      const suites = await prisma.theatreSuite.findMany({
        where: { id: { in: suiteIds } },
        select: { id: true, name: true },
      });
      for (const suite of suites) {
        suiteNameById[suite.id] = suite.name;
      }
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

    // Porters available to be selected as patient transporters at invite time.
    const porters = await prisma.user.findMany({
      where: { role: 'PORTER', status: 'APPROVED' },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });

    // Group surgeries by theatre
    const theatreGroups: Record<string, any> = {};
    const unassigned: any[] = [];

    for (const surgery of surgeries) {
      const alloc = allocationBySurgery[surgery.id];
      // Resolve theatre: prefer the explicit allocation, then the theatre chosen
      // at booking (Surgery.theatreId → TheatreSuite), then the free-text
      // operating location. Only truly unassigned cases land in "Unassigned".
      const theatreId = alloc?.theatreId || surgery.theatreId || null;
      const theatreName =
        alloc?.theatre?.name ||
        (surgery.theatreId ? suiteNameById[surgery.theatreId] : null) ||
        surgery.location ||
        'Unassigned';

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

      // A patient is cleared for surgery once the latest pre-operative visit
      // assessment marks them CLEARED. Day cases and emergency surgeries are
      // exempt — they can be invited without a pre-operative visit clearance.
      const cleared =
        surgery.isDayCase === true ||
        surgery.surgeryType === 'EMERGENCY' ||
        surgery.preOperativeVisits?.[0]?.overallStatus === 'CLEARED';

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
        cleared,
        isDayCase: surgery.isDayCase === true,
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
      porters,
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
    const { surgeryId, action, rejectionReason, porterNames } = body;

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

    // Porters chosen at invite time (transporters) override the roster default.
    if (action === 'invite' && Array.isArray(porterNames) && porterNames.length > 0) {
      porterName = porterNames.filter((n: any) => typeof n === 'string' && n.trim()).join(', ');
      porterId = null; // multiple porters — no single FK
    }

    if (action === 'invite') {
      // Only patients cleared at the pre-operative assessment may be invited —
      // except day cases and emergency surgeries, which do not require a
      // pre-operative visit clearance.
      if (!surgery.isDayCase && surgery.surgeryType !== 'EMERGENCY') {
        const latestVisit = await prisma.preOperativeVisit.findFirst({
          where: { surgeryId },
          orderBy: { createdAt: 'desc' },
          select: { overallStatus: true },
        });
        if (latestVisit?.overallStatus !== 'CLEARED') {
          return NextResponse.json(
            {
              error:
                'Patient is not cleared for surgery. Complete the pre-operative assessment and clear the patient before inviting.',
            },
            { status: 400 }
          );
        }
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
          status: 'INVITED',
          invitedById: session.user.id,
          invitedByName: session.user.name || 'Unknown',
        },
      });

      // Theatre radio: call the patient up (spoken three times).
      const porterLine = porterName ? ` Porter ${porterName}, please dispatch to the ward.` : '';
      const callMsg = `Calling patient ${surgery.patient.name}, folder number ${surgery.patient.folderNumber}, for ${surgery.procedureName} in ${theatreName}.${porterLine}`;
      await triggerRadio({
        category: 'WORKFLOW',
        title: `Patient call-up — ${surgery.patient.name}`,
        message: speak3(callMsg),
        priority: 78,
        urgency: 'HIGH',
        location: theatreName,
        triggeredById: session.user.id,
        metadata: { source: 'PatientCallUp', surgeryId, kind: 'patient_callup', tripleRepeat: true },
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
