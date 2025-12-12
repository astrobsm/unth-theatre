import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET - Get surgical timing for a surgery
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const timing = await prisma.surgicalTiming.findUnique({
      where: { surgeryId: params.id },
      include: {
        surgery: {
          select: {
            id: true,
            procedureName: true,
            patient: {
              select: {
                name: true,
                folderNumber: true
              }
            }
          }
        },
        events: {
          orderBy: {
            eventTime: 'asc'
          }
        }
      }
    });

    if (!timing) {
      return NextResponse.json({ error: 'Timing record not found' }, { status: 404 });
    }

    return NextResponse.json(timing);
  } catch (error) {
    console.error('Error fetching surgical timing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch timing' },
      { status: 500 }
    );
  }
}

// POST - Create surgical timing record
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check authorization
    const allowedRoles = ['SURGEON', 'CIRCULATING_NURSE', 'SCRUB_NURSE', 'ANAESTHETIST', 'ADMIN', 'THEATRE_MANAGER'];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Check if timing already exists
    const existing = await prisma.surgicalTiming.findUnique({
      where: { surgeryId: params.id }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Timing record already exists for this surgery' },
        { status: 400 }
      );
    }

    const timing = await prisma.surgicalTiming.create({
      data: {
        surgery: {
          connect: { id: params.id }
        },
        recordedBy: session.user.id,
        patientEnteredRoomTime: body.patientEnteredRoomTime ? new Date(body.patientEnteredRoomTime) : undefined,
        anesthesiaStartTime: body.anesthesiaStartTime ? new Date(body.anesthesiaStartTime) : undefined,
        anesthesiaReadyTime: body.anesthesiaReadyTime ? new Date(body.anesthesiaReadyTime) : undefined,
        timeoutStartTime: body.timeoutStartTime ? new Date(body.timeoutStartTime) : undefined,
        timeoutCompletedTime: body.timeoutCompletedTime ? new Date(body.timeoutCompletedTime) : undefined,
        timeoutPerformedBy: body.timeoutPerformedBy,
        timeoutTeamPresent: body.timeoutTeamPresent,
        incisionTime: body.incisionTime ? new Date(body.incisionTime) : undefined,
        procedureStartTime: body.procedureStartTime ? new Date(body.procedureStartTime) : undefined,
        procedureEndTime: body.procedureEndTime ? new Date(body.procedureEndTime) : undefined,
        closureStartTime: body.closureStartTime ? new Date(body.closureStartTime) : undefined,
        closureEndTime: body.closureEndTime ? new Date(body.closureEndTime) : undefined,
        dressingAppliedTime: body.dressingAppliedTime ? new Date(body.dressingAppliedTime) : undefined,
        patientExtubatedTime: body.patientExtubatedTime ? new Date(body.patientExtubatedTime) : undefined,
        patientLeftRoomTime: body.patientLeftRoomTime ? new Date(body.patientLeftRoomTime) : undefined,
        signOutTime: body.signOutTime ? new Date(body.signOutTime) : undefined,
        signOutPerformedBy: body.signOutPerformedBy,
        delayOccurred: body.delayOccurred || false,
        delayReason: body.delayReason,
        delayDuration: body.delayDuration,
        interruptionOccurred: body.interruptionOccurred || false,
        interruptionReason: body.interruptionReason,
        interruptionDuration: body.interruptionDuration,
        surgeonPresent: body.surgeonPresent,
        anesthetistPresent: body.anesthetistPresent,
        scrubNursePresent: body.scrubNursePresent,
        circulatingNursePresent: body.circulatingNursePresent,
        otherTeamMembers: body.otherTeamMembers,
        timingNotes: body.timingNotes
      },
      include: {
        surgery: {
          select: {
            id: true,
            procedureName: true,
            patient: {
              select: {
                name: true,
                folderNumber: true
              }
            }
          }
        }
      }
    });

    return NextResponse.json(timing, { status: 201 });
  } catch (error: any) {
    console.error('Error creating surgical timing:', error);
    return NextResponse.json(
      { error: 'Failed to create timing', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - Update surgical timing
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['SURGEON', 'CIRCULATING_NURSE', 'SCRUB_NURSE', 'ANAESTHETIST', 'ADMIN', 'THEATRE_MANAGER'];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Get existing timing record
    const existing = await prisma.surgicalTiming.findUnique({
      where: { surgeryId: params.id }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Timing record not found' }, { status: 404 });
    }

    // Calculate durations
    let anesthesiaDuration, surgicalDuration, totalORTime, closureDuration;
    
    if (body.anesthesiaStartTime && body.anesthesiaReadyTime) {
      const start = new Date(body.anesthesiaStartTime);
      const ready = new Date(body.anesthesiaReadyTime);
      anesthesiaDuration = Math.floor((ready.getTime() - start.getTime()) / 60000);
    }

    if (body.incisionTime && body.procedureEndTime) {
      const incision = new Date(body.incisionTime);
      const end = new Date(body.procedureEndTime);
      surgicalDuration = Math.floor((end.getTime() - incision.getTime()) / 60000);
    }

    if (body.patientEnteredRoomTime && body.patientLeftRoomTime) {
      const entered = new Date(body.patientEnteredRoomTime);
      const left = new Date(body.patientLeftRoomTime);
      totalORTime = Math.floor((left.getTime() - entered.getTime()) / 60000);
    }

    if (body.closureStartTime && body.closureEndTime) {
      const start = new Date(body.closureStartTime);
      const end = new Date(body.closureEndTime);
      closureDuration = Math.floor((end.getTime() - start.getTime()) / 60000);
    }

    const timing = await prisma.surgicalTiming.update({
      where: { surgeryId: params.id },
      data: {
        patientEnteredRoomTime: body.patientEnteredRoomTime ? new Date(body.patientEnteredRoomTime) : undefined,
        anesthesiaStartTime: body.anesthesiaStartTime ? new Date(body.anesthesiaStartTime) : undefined,
        anesthesiaReadyTime: body.anesthesiaReadyTime ? new Date(body.anesthesiaReadyTime) : undefined,
        timeoutStartTime: body.timeoutStartTime ? new Date(body.timeoutStartTime) : undefined,
        timeoutCompletedTime: body.timeoutCompletedTime ? new Date(body.timeoutCompletedTime) : undefined,
        timeoutPerformedBy: body.timeoutPerformedBy,
        timeoutTeamPresent: body.timeoutTeamPresent,
        incisionTime: body.incisionTime ? new Date(body.incisionTime) : undefined,
        procedureStartTime: body.procedureStartTime ? new Date(body.procedureStartTime) : undefined,
        procedureEndTime: body.procedureEndTime ? new Date(body.procedureEndTime) : undefined,
        closureStartTime: body.closureStartTime ? new Date(body.closureStartTime) : undefined,
        closureEndTime: body.closureEndTime ? new Date(body.closureEndTime) : undefined,
        dressingAppliedTime: body.dressingAppliedTime ? new Date(body.dressingAppliedTime) : undefined,
        patientExtubatedTime: body.patientExtubatedTime ? new Date(body.patientExtubatedTime) : undefined,
        patientLeftRoomTime: body.patientLeftRoomTime ? new Date(body.patientLeftRoomTime) : undefined,
        signOutTime: body.signOutTime ? new Date(body.signOutTime) : undefined,
        signOutPerformedBy: body.signOutPerformedBy,
        anesthesiaDuration,
        surgicalDuration,
        totalORTime,
        closureDuration,
        delayOccurred: body.delayOccurred,
        delayReason: body.delayReason,
        delayDuration: body.delayDuration,
        interruptionOccurred: body.interruptionOccurred,
        interruptionReason: body.interruptionReason,
        interruptionDuration: body.interruptionDuration,
        surgeonPresent: body.surgeonPresent,
        anesthetistPresent: body.anesthetistPresent,
        scrubNursePresent: body.scrubNursePresent,
        circulatingNursePresent: body.circulatingNursePresent,
        otherTeamMembers: body.otherTeamMembers,
        timingNotes: body.timingNotes
      },
      include: {
        surgery: {
          select: {
            id: true,
            procedureName: true,
            patient: {
              select: {
                name: true,
                folderNumber: true
              }
            }
          }
        },
        events: {
          orderBy: {
            eventTime: 'asc'
          }
        }
      }
    });

    // Update surgery status if procedure ended
    if (body.procedureEndTime && !existing.procedureEndTime) {
      await prisma.surgery.update({
        where: { id: params.id },
        data: { status: 'COMPLETED' }
      });
    }

    return NextResponse.json(timing);
  } catch (error: any) {
    console.error('Error updating surgical timing:', error);
    return NextResponse.json(
      { error: 'Failed to update timing', details: error.message },
      { status: 500 }
    );
  }
}
