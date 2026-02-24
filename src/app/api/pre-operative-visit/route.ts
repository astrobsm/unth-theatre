import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PreOpVisitStatus } from '@prisma/client';

// GET: Fetch pre-operative visits (by date, surgeryId, or status)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const surgeryId = searchParams.get('surgeryId');
    const statusParam = searchParams.get('status');
    const viewMode = searchParams.get('view') || 'visits'; // 'visits' or 'pending-surgeries'

    // Target date: default is tomorrow (pre-op visits happen night before)
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    if (!dateParam) {
      targetDate.setDate(targetDate.getDate() + 1); // Default: tomorrow's cases
    }
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Mode 1: Fetch pending surgeries that need pre-op visits
    if (viewMode === 'pending-surgeries') {
      const surgeries = await prisma.surgery.findMany({
        where: {
          scheduledDate: { gte: startOfDay, lte: endOfDay },
          status: { in: ['SCHEDULED', 'IN_HOLDING_AREA'] },
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
          surgeon: { select: { fullName: true } },
          preOperativeVisits: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ scheduledTime: 'asc' }],
      });

      return NextResponse.json({
        surgeries: surgeries.map(s => ({
          surgeryId: s.id,
          patientName: s.patient.name,
          folderNumber: s.patient.folderNumber,
          age: s.patient.age,
          gender: s.patient.gender,
          ward: s.patient.ward,
          diagnosis: s.indication,
          procedureName: s.procedureName,
          surgicalUnit: s.unit,
          scheduledDate: s.scheduledDate,
          scheduledTime: s.scheduledTime,
          surgeonName: s.surgeonName || s.surgeon?.fullName || 'TBD',
          hasPreOpVisit: s.preOperativeVisits.length > 0,
          latestVisitStatus: s.preOperativeVisits[0]?.overallStatus || null,
        })),
        date: targetDate.toISOString(),
      });
    }

    // Mode 2: Fetch existing pre-op visits
    const where: any = {};

    if (surgeryId) {
      where.surgeryId = surgeryId;
    } else {
      where.visitDate = { gte: startOfDay, lte: endOfDay };
    }

    if (statusParam) {
      where.overallStatus = statusParam;
    }

    const visits = await prisma.preOperativeVisit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(visits);
  } catch (error) {
    console.error('Pre-operative visit GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Create a pre-operative visit assessment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { surgeryId } = body;

    if (!surgeryId) {
      return NextResponse.json({ error: 'surgeryId is required' }, { status: 400 });
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

    // Determine overall status based on critical flags
    let overallStatus: PreOpVisitStatus = 'CLEARED';
    const criticalFlags = [
      body.patientAvailableInWard === false,
      body.consentStatus === 'NOT_OBTAINED' || body.consentStatus === 'REFUSED',
      body.surgicalFeePaymentStatus === 'NOT_PAID',
      body.preAnaestheticReviewDone === false,
      body.npoStatus === 'NOT_FASTING',
      body.investigationsComplete === false,
      body.patientEmotionalReadiness === 'REFUSED',
    ];

    if (criticalFlags.some(f => f)) {
      overallStatus = 'NOT_CLEARED';
    } else if (
      body.patientEmotionalReadiness === 'ANXIOUS' ||
      body.patientEmotionalReadiness === 'VERY_ANXIOUS' ||
      body.patientEmotionalReadiness === 'NEEDS_COUNSELLING' ||
      body.npoStatus === 'PARTIALLY_COMPLIANT'
    ) {
      overallStatus = 'VISITED'; // Visited but with concerns
    }

    // Allow manual override
    if (body.overallStatus) {
      overallStatus = body.overallStatus as PreOpVisitStatus;
    }

    const visit = await prisma.preOperativeVisit.create({
      data: {
        surgeryId,
        patientName: surgery.patient.name,
        folderNumber: surgery.patient.folderNumber,
        ward: surgery.patient.ward,
        age: surgery.patient.age,
        gender: surgery.patient.gender,
        procedureName: surgery.procedureName,
        surgicalUnit: surgery.unit,
        scheduledDate: surgery.scheduledDate,
        scheduledTime: surgery.scheduledTime,
        surgeonName: surgery.surgeonName || surgery.surgeon?.fullName || 'N/A',
        visitDate: new Date(),
        visitedById: session.user.id,
        visitedByName: session.user.name || 'Unknown',
        patientAvailableInWard: body.patientAvailableInWard ?? true,
        surgicalFeePaymentStatus: body.surgicalFeePaymentStatus || 'UNKNOWN',
        consentStatus: body.consentStatus || 'PENDING',
        surgicalItemsAvailable: body.surgicalItemsAvailable ?? true,
        preAnaestheticReviewDone: body.preAnaestheticReviewDone ?? false,
        npoStatus: body.npoStatus || 'UNKNOWN',
        investigationsComplete: body.investigationsComplete ?? false,
        pendingInvestigations: body.pendingInvestigations || null,
        patientEmotionalReadiness: body.patientEmotionalReadiness || 'UNKNOWN',
        bloodReady: body.bloodReady ?? false,
        ivLineSecured: body.ivLineSecured ?? false,
        skinPrepDone: body.skinPrepDone ?? false,
        overallStatus,
        overallNotes: body.overallNotes || null,
        nurseSignature: body.nurseSignature || session.user.name || null,
      },
    });

    return NextResponse.json(visit, { status: 201 });
  } catch (error) {
    console.error('Pre-operative visit POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: Update an existing pre-operative visit
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { visitId, ...updateData } = body;

    if (!visitId) {
      return NextResponse.json({ error: 'visitId is required' }, { status: 400 });
    }

    const existing = await prisma.preOperativeVisit.findUnique({ where: { id: visitId } });
    if (!existing) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    const visit = await prisma.preOperativeVisit.update({
      where: { id: visitId },
      data: updateData,
    });

    return NextResponse.json(visit);
  } catch (error) {
    console.error('Pre-operative visit PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
