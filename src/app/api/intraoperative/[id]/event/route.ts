import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// POST - Log an intra-operative event
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = [
      'SURGEON', 'ANAESTHETIST', 
      'SCRUB_NURSE', 
      'ADMIN', 'THEATRE_MANAGER'
    ];

    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { eventType, description, timestamp } = body;

    if (!eventType || !description) {
      return NextResponse.json(
        { error: 'Event type and description are required' },
        { status: 400 }
      );
    }

    // Get current record
    const record = await prisma.intraOperativeRecord.findUnique({
      where: { id: params.id }
    });

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    // Parse existing events log or create new array
    let eventsLog = [];
    if (record.eventsLog) {
      try {
        eventsLog = JSON.parse(record.eventsLog);
      } catch (e) {
        eventsLog = [];
      }
    }

    // Add new event
    const newEvent = {
      timestamp: timestamp || new Date().toISOString(),
      eventType,
      description,
      recordedBy: session.user.name,
      userId: session.user.id
    };

    eventsLog.push(newEvent);

    // Update record
    const updated = await prisma.intraOperativeRecord.update({
      where: { id: params.id },
      data: {
        eventsLog: JSON.stringify(eventsLog)
      },
      include: {
        surgery: {
          include: {
            patient: true
          }
        }
      }
    });

    return NextResponse.json({
      event: newEvent,
      message: 'Event logged successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Error logging event:', error);
    return NextResponse.json(
      { error: 'Failed to log event' },
      { status: 500 }
    );
  }
}
