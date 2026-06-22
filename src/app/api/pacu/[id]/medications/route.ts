import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - List medications administered during this PACU stay
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const medications = await prisma.pACUMedication.findMany({
      where: { pacuAssessmentId: params.id },
      orderBy: { administeredAt: 'desc' },
    });

    return NextResponse.json(medications);
  } catch (error) {
    console.error('Error fetching PACU medications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch medications' },
      { status: 500 }
    );
  }
}

// POST - Record a medication administered in PACU
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only recovery room nurses (and managers/admins) may record medications.
    if (session.user.role !== 'RECOVERY_ROOM_NURSE' &&
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Ensure the assessment exists before logging against it.
    const assessment = await prisma.pACUAssessment.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const body = await request.json();

    const medicationName = (body.medicationName ?? '').toString().trim();
    const dose = (body.dose ?? '').toString().trim();
    const route = (body.route ?? '').toString().trim();

    if (!medicationName || !dose || !route) {
      return NextResponse.json(
        { error: 'Medication name, dose and route are required' },
        { status: 400 }
      );
    }

    const medication = await prisma.pACUMedication.create({
      data: {
        pacuAssessmentId: params.id,
        administeredBy: session.user.id,
        administeredAt: body.administeredAt ? new Date(body.administeredAt) : new Date(),
        medicationName,
        dose,
        route,
        indication: body.indication ? String(body.indication).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
      },
    });

    return NextResponse.json(medication, { status: 201 });
  } catch (error) {
    console.error('Error recording PACU medication:', error);
    return NextResponse.json(
      { error: 'Failed to record medication' },
      { status: 500 }
    );
  }
}
