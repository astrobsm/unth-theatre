import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { triggerRadio, speak3, getOnDutyPortersAndCleaners, namesPhrase } from '@/lib/radioEvents';

export const dynamic = 'force-dynamic';

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

    // Return null with 200 when no record exists yet (avoids browser console 404 noise)
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

    // Real-time radio broadcast: surgery start (incision/procedure start)
    if (body.incisionTime || body.procedureStartTime) {
      const patientName = timing.surgery?.patient?.name || 'patient';
      const procedure = timing.surgery?.procedureName || 'surgery';
      await triggerRadio({
        category: 'WORKFLOW',
        title: `Surgery started — ${procedure}`,
        message: `Surgery has commenced. Patient ${patientName}. Procedure: ${procedure}. Knife on skin.`,
        priority: 75,
        urgency: 'MEDIUM',
        triggeredById: session.user.id,
        metadata: {
          source: 'SurgicalTiming.start',
          surgeryId: params.id,
        },
      });
    }

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

    const allowedRoles = ['SURGEON', 'SCRUB_NURSE', 'ANAESTHETIST', 'ADMIN', 'THEATRE_MANAGER'];
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
            theatreId: true,
            location: true,
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

    const patientName = timing.surgery?.patient?.name || 'patient';
    const procedure = timing.surgery?.procedureName || 'surgery';

    // Real-time radio broadcast: surgery start (first time incision recorded)
    if ((body.incisionTime && !existing.incisionTime) ||
        (body.procedureStartTime && !existing.procedureStartTime)) {
      await triggerRadio({
        category: 'WORKFLOW',
        title: `Surgery started — ${procedure}`,
        message: `Surgery has commenced. Patient ${patientName}. Procedure: ${procedure}. Knife on skin.`,
        priority: 75,
        urgency: 'MEDIUM',
        triggeredById: session.user.id,
        metadata: { source: 'SurgicalTiming.start', surgeryId: params.id },
      });
    }

    // Real-time radio broadcast: end of surgery -> announce + call porter & cleaner
    if (body.procedureEndTime && !existing.procedureEndTime) {
      const dur = surgicalDuration ? ` Duration: ${surgicalDuration} minutes.` : '';
      // Fetch the on-duty porters & cleaners from the roster so we can name them
      // in the invitation announcements.
      const { porters, cleaners } = await getOnDutyPortersAndCleaners(
        new Date(),
        timing.surgery?.theatreId ?? null,
      );
      const porterNames = namesPhrase(porters);
      const cleanerNames = namesPhrase(cleaners);
      const theatre = timing.surgery?.location || 'theatre';

      // 1. End-of-surgery announcement (informational)
      await triggerRadio({
        category: 'WORKFLOW',
        title: `End of surgery — ${procedure}`,
        message: `Surgery completed for patient ${patientName}. Procedure: ${procedure}.${dur} Preparing for transfer to recovery.`,
        priority: 80,
        urgency: 'MEDIUM',
        triggeredById: session.user.id,
        metadata: { source: 'SurgicalTiming.end', surgeryId: params.id },
      });

      // 2. Porter call (3x baked, repeats every 2 min until acknowledged
      //    e.g. by porter starting transport or scrub nurse acknowledging)
      const porterAddress = porterNames
        ? `Porter ${porterNames}, you are required in ${theatre}.`
        : `Porter required in ${theatre}.`;
      const porterMsg = `${porterAddress} Patient ${patientName} ready for transfer to recovery. Please respond and acknowledge.`;
      await triggerRadio({
        category: 'STAFF_REQUEST',
        title: porterNames ? `Porter ${porterNames} required — ${patientName}` : `Porter required — ${patientName}`,
        message: speak3(porterMsg),
        priority: 88,
        urgency: 'HIGH',
        requireAck: true,
        repeatUntilAck: true,
        repeatEverySec: 120,
        triggeredById: session.user.id,
        metadata: {
          source: 'PorterCall',
          surgeryId: params.id,
          kind: 'porter_call',
          tripleRepeat: true,
          porters: porters.map((p) => ({ name: p.name, staffCode: p.staffCode })),
        },
      });

      // 3. Cleaner call (3x baked, repeats every 2 min until acknowledged
      //    by cleaner starting cleaning or scrub nurse acknowledging)
      const cleanerAddress = cleanerNames
        ? `Cleaner ${cleanerNames}, you are required in ${theatre}`
        : `Cleaner required in ${theatre}`;
      const cleanerMsg = `${cleanerAddress} for case turnover at end of surgery for ${patientName}. Please prepare the theatre for the next case. Please respond and acknowledge.`;
      await triggerRadio({
        category: 'STAFF_REQUEST',
        title: cleanerNames ? `Cleaner ${cleanerNames} required — theatre turnover` : `Cleaner required — theatre turnover`,
        message: speak3(cleanerMsg),
        priority: 86,
        urgency: 'HIGH',
        requireAck: true,
        repeatUntilAck: true,
        repeatEverySec: 120,
        triggeredById: session.user.id,
        metadata: {
          source: 'CleanerCall',
          surgeryId: params.id,
          kind: 'cleaner_call',
          tripleRepeat: true,
          cleaners: cleaners.map((c) => ({ name: c.name, staffCode: c.staffCode })),
        },
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
