import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET - Get specific intra-operative record
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const record = await prisma.intraOperativeRecord.findUnique({
      where: { id: params.id },
      include: {
        surgery: {
          include: {
            patient: true,
            surgeon: true,
            anesthetist: true,
            assistantSurgeon: true
          }
        }
      }
    });

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error('Error fetching intra-operative record:', error);
    return NextResponse.json(
      { error: 'Failed to fetch record' },
      { status: 500 }
    );
  }
}

// PUT - Update intra-operative record
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // All clinical staff can update
    const allowedRoles = [
      'SURGEON', 'ANAESTHETIST', 
      'SCRUB_NURSE', 
      'ADMIN', 'THEATRE_MANAGER'
    ];

    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    const record = await prisma.intraOperativeRecord.update({
      where: { id: params.id },
      data: body,
      include: {
        surgery: {
          include: {
            patient: true,
            surgeon: true,
            anesthetist: true
          }
        }
      }
    });

    // Update surgery timing if relevant fields changed
    if (body.knifeToSkinTime || body.procedureEndTime) {
      await prisma.surgery.update({
        where: { id: record.surgeryId },
        data: {
          knifeOnSkinTime: body.knifeToSkinTime,
          surgeryEndTime: body.procedureEndTime,
          actualStartTime: body.procedureStartTime,
          actualEndTime: body.closureEndTime
        }
      });
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error('Error updating intra-operative record:', error);
    return NextResponse.json(
      { error: 'Failed to update record' },
      { status: 500 }
    );
  }
}
