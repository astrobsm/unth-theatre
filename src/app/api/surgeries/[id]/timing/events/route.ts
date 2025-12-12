import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// POST - Record a surgical event
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Get surgical timing record
    const timing = await prisma.surgicalTiming.findUnique({
      where: { surgeryId: params.id }
    });

    if (!timing) {
      return NextResponse.json({ error: 'No timing record found. Please initialize timing first.' }, { status: 404 });
    }

    // Calculate minutes from start
    let minutesFromStart = null;
    if (timing.patientEnteredRoomTime && body.eventTime) {
      const start = new Date(timing.patientEnteredRoomTime);
      const event = new Date(body.eventTime);
      minutesFromStart = Math.floor((event.getTime() - start.getTime()) / 60000);
    }

    const event = await prisma.surgicalEvent.create({
      data: {
        surgicalTiming: {
          connect: { id: timing.id }
        },
        eventType: body.eventType,
        eventTime: new Date(body.eventTime),
        recordedBy: session.user.id,
        notes: body.notes,
        minutesFromStart
      }
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error: any) {
    console.error('Error recording surgical event:', error);
    return NextResponse.json(
      { error: 'Failed to record event', details: error.message },
      { status: 500 }
    );
  }
}
