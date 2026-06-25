import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Nurse theatre-readiness confirmation.
 *
 * A perioperative nurse confirms, against a theatre-setup (material collection)
 * record, that:
 *   1. all materials needed for the day's surgery have been collected,
 *   2. the walkie-talkie radio has been signed out and set to channel 7,
 *   3. they are in the designated theatre and ready to receive patients.
 *
 * When all three are confirmed the theatre is marked ready (surfaced in the
 * Theatre Readiness module) and a single radio announcement is raised whose
 * spoken text repeats the theatre name / ready message three times to alert the
 * surgical team.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      setupId,
      materialsConfirmed,
      radioOnChannel7,
      inTheatreReady,
    } = body as {
      setupId?: string;
      materialsConfirmed?: boolean;
      radioOnChannel7?: boolean;
      inTheatreReady?: boolean;
    };

    if (!setupId) {
      return NextResponse.json({ error: 'setupId is required' }, { status: 400 });
    }

    const setup = await prisma.theatreSetup.findUnique({
      where: { id: setupId },
      include: {
        theatre: { select: { name: true, location: true } },
        nurse: { select: { fullName: true } },
      },
    });

    if (!setup) {
      return NextResponse.json({ error: 'Theatre setup not found' }, { status: 404 });
    }

    const allConfirmed =
      Boolean(materialsConfirmed) && Boolean(radioOnChannel7) && Boolean(inTheatreReady);

    // Only raise the radio announcement on the transition into "ready".
    const isNewlyReady = allConfirmed && !setup.theatreReady;

    const updated = await prisma.theatreSetup.update({
      where: { id: setupId },
      data: {
        materialsConfirmed: Boolean(materialsConfirmed),
        radioOnChannel7: Boolean(radioOnChannel7),
        inTheatreReady: Boolean(inTheatreReady),
        theatreReady: allConfirmed,
        readyConfirmedAt: allConfirmed ? new Date() : null,
        ...(isNewlyReady ? { readyAnnouncedAt: new Date() } : {}),
      },
      include: {
        theatre: { select: { name: true, location: true } },
        nurse: { select: { fullName: true } },
      },
    });

    if (isNewlyReady) {
      const theatreName = setup.theatre?.name || 'Theatre';
      const nurseName = setup.nurse?.fullName || 'The perioperative nurse';
      // Repeat the core readiness statement three times so the surgical team
      // hears the theatre announced thrice.
      const line =
        `Attention surgical team. ${theatreName} is now ready to receive patients for surgery.`;
      const message =
        `${line} ${line} ${line} ` +
        `Materials have been collected and the theatre nurse, ${nurseName}, is in ${theatreName} and ready. ` +
        `Please proceed to ${theatreName}.`;

      try {
        await prisma.radioAnnouncement.create({
          data: {
            category: 'WORKFLOW',
            title: `${theatreName} is ready for surgery`,
            message,
            priority: 75,
            location: setup.theatre?.name ?? null,
            urgency: 'HIGH',
            triggerSource: 'EVENT',
            status: 'PENDING',
            triggeredById: session.user.id,
            metadata: JSON.stringify({
              source: 'NurseTheatreReadiness',
              setupId: setup.id,
              theatreId: setup.theatreId,
            }),
          },
        });
      } catch (err) {
        // Don't fail the readiness confirmation if the announcement insert fails.
        console.error('[theatre-setup/readiness] failed to raise radio announcement:', err);
      }
    }

    return NextResponse.json({ setup: updated, announced: isNewlyReady });
  } catch (error) {
    console.error('Failed to confirm theatre readiness:', error);
    return NextResponse.json(
      { error: 'Failed to confirm theatre readiness' },
      { status: 500 }
    );
  }
}
