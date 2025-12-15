import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// POST - Log medication administered
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only anesthetists and nurse anesthetists can log medications
    const allowedRoles = [
      'ANAESTHETIST', 
      'ADMIN', 'THEATRE_MANAGER'
    ];

    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { medicationName, dose, route, time } = body;

    if (!medicationName || !dose) {
      return NextResponse.json(
        { error: 'Medication name and dose are required' },
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

    // Parse existing medications or create new array
    let medications = [];
    if (record.medicationsAdministered) {
      try {
        medications = JSON.parse(record.medicationsAdministered);
      } catch (e) {
        medications = [];
      }
    }

    // Add new medication
    const newMedication = {
      timestamp: time || new Date().toISOString(),
      medicationName: medicationName,
      dose: dose,
      route: route || 'IV',
      administeredBy: session.user.name || 'Unknown',
      userId: session.user.id
    };

    medications.push(newMedication);

    // Update record
    await prisma.intraOperativeRecord.update({
      where: { id: params.id },
      data: {
        medicationsAdministered: JSON.stringify(medications)
      }
    });

    return NextResponse.json({
      medication: newMedication,
      message: 'Medication logged successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Error logging medication:', error);
    return NextResponse.json(
      { error: 'Failed to log medication' },
      { status: 500 }
    );
  }
}
