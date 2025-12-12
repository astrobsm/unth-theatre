import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET - Get surgical count checklist for a surgery
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    const countChecklist = await prisma.surgicalCountChecklist.findUnique({
      where: { surgeryId: id },
      include: {
        surgery: {
          select: {
            id: true,
            procedureName: true,
            scheduledDate: true,
            patient: {
              select: {
                name: true,
                folderNumber: true
              }
            },
            surgeon: {
              select: {
                fullName: true
              }
            }
          }
        },
        countEvents: {
          orderBy: {
            recordedAt: 'asc'
          }
        }
      }
    });

    if (!countChecklist) {
      return NextResponse.json({ error: 'Count checklist not found' }, { status: 404 });
    }

    return NextResponse.json(countChecklist);
  } catch (error) {
    console.error('Error fetching surgical count checklist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch count checklist' },
      { status: 500 }
    );
  }
}

// POST - Initialize surgical count checklist for a surgery
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only scrub nurses and authorized staff can create count checklists
    if (session.user.role !== 'SCRUB_NURSE' &&
        session.user.role !== 'CIRCULATING_NURSE' &&
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json();

    // Check if count checklist already exists
    const existing = await prisma.surgicalCountChecklist.findUnique({
      where: { surgeryId: id }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Count checklist already exists for this surgery' },
        { status: 400 }
      );
    }

    // Verify surgery exists
    const surgery = await prisma.surgery.findUnique({
      where: { id },
      include: {
        surgeon: { select: { fullName: true } }
      }
    });

    if (!surgery) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    // Create count checklist with initial pre-count data
    const countChecklist = await prisma.surgicalCountChecklist.create({
      data: {
        surgery: {
          connect: { id }
        },
        surgicalOperationType: surgery.procedureName,
        operationDate: surgery.scheduledDate,
        surgeonName: surgery.surgeon.fullName,
        scrubNurseName: body.scrubNurseName || session.user.name || 'Unknown',
        circulatingNurseName: body.circulatingNurseName,
        
        // Pre-count data from request
        preCountInstruments: body.preCountInstruments || 0,
        preCountSmallSwabs: body.preCountSmallSwabs || 0,
        preCountMediumSwabs: body.preCountMediumSwabs || 0,
        preCountLargeSwabs: body.preCountLargeSwabs || 0,
        preCountRollSwabs: body.preCountRollSwabs || 0,
        preCountTapeLaparotomy: body.preCountTapeLaparotomy || 0,
        preCountAbdominalPack: body.preCountAbdominalPack || 0,
        preCountBlades: body.preCountBlades || 0,
        preCountNeedles: body.preCountNeedles || 0,
        preCountSutures: body.preCountSutures || 0,
        preCountTrocars: body.preCountTrocars || 0,
        preCountOthers: body.preCountOthers,
        
        preCountInstrumentsRecorded: true,
        preCountSwabsRecorded: true,
        preCountSharpsRecorded: true,
      },
      include: {
        surgery: {
          select: {
            procedureName: true,
            patient: { select: { name: true, folderNumber: true } }
          }
        }
      }
    });

    // Log the initial count event
    await prisma.surgicalCountEvent.create({
      data: {
        countChecklist: {
          connect: { id: countChecklist.id }
        },
        eventType: 'PRE_COUNT',
        itemType: 'INSTRUMENTS',
        itemDescription: 'Initial instrument count recorded',
        recordedBy: session.user.name || session.user.id,
        notes: `Pre-surgery count: ${body.preCountInstruments || 0} instruments`
      }
    });

    return NextResponse.json(countChecklist, { status: 201 });
  } catch (error: any) {
    console.error('Error creating surgical count checklist:', error);
    return NextResponse.json(
      { error: 'Failed to create count checklist', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - Update surgical count checklist
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'SCRUB_NURSE' &&
        session.user.role !== 'CIRCULATING_NURSE' &&
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json();

    const existing = await prisma.surgicalCountChecklist.findUnique({
      where: { surgeryId: id }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Count checklist not found' }, { status: 404 });
    }

    // Prepare update data
    const updateData: any = {};

    // Copy all updateable fields from body
    const updateableFields = [
      'addedInstruments', 'addedSmallSwabs', 'addedMediumSwabs', 'addedLargeSwabs',
      'addedRollSwabs', 'addedTapeLaparotomy', 'addedAbdominalPack', 'addedBlades',
      'addedNeedles', 'addedSutures', 'addedTrocars', 'addedOthers',
      'firstCountInstruments', 'firstCountSmallSwabs', 'firstCountMediumSwabs',
      'firstCountLargeSwabs', 'firstCountRollSwabs', 'firstCountTapeLaparotomy',
      'firstCountAbdominalPack', 'firstCountBlades', 'firstCountNeedles',
      'firstCountSutures', 'firstCountTrocars', 'firstCountOthers',
      'firstCountCorrect', 'firstCountDiscrepancy',
      'secondCountInstruments', 'secondCountSmallSwabs', 'secondCountMediumSwabs',
      'secondCountLargeSwabs', 'secondCountRollSwabs', 'secondCountTapeLaparotomy',
      'secondCountAbdominalPack', 'secondCountBlades', 'secondCountNeedles',
      'secondCountSutures', 'secondCountTrocars', 'secondCountOthers',
      'secondCountCorrect', 'secondCountDiscrepancy',
      'allCountsCorrect', 'finalCountVerifiedBy', 'finalCountWitnessedBy',
      'surgeonNotifiedOfCount', 'discrepancyOccurred', 'discrepancyType',
      'discrepancyDetails', 'discrepancyResolved', 'discrepancyResolution',
      'xRayOrdered', 'xRayResult', 'incidentReportFiled',
      'countSheetCompleted', 'signatureScrubNurse', 'signatureCirculatingNurse',
      'signatureSurgeon', 'remarks', 'specialNotes'
    ];

    updateableFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    // Set timestamps for count phases
    if (body.firstCountInstruments !== undefined && !existing.firstCountTime) {
      updateData.firstCountTime = new Date();
    }

    if (body.secondCountInstruments !== undefined && !existing.secondCountTime) {
      updateData.secondCountTime = new Date();
    }

    if (body.allCountsCorrect && !existing.completedAt) {
      updateData.completedAt = new Date();
    }

    const updated = await prisma.surgicalCountChecklist.update({
      where: { surgeryId: id },
      data: updateData,
      include: {
        surgery: {
          select: {
            procedureName: true,
            patient: { select: { name: true } }
          }
        },
        countEvents: {
          orderBy: { recordedAt: 'desc' },
          take: 10
        }
      }
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Error updating surgical count checklist:', error);
    return NextResponse.json(
      { error: 'Failed to update count checklist', details: error.message },
      { status: 500 }
    );
  }
}
