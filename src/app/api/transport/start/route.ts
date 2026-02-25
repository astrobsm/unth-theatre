import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const startTransportSchema = z.object({
  staffCode: z.string().min(1, 'Staff code is required'),
  patientFolderNumber: z.string().min(1, 'Patient folder number is required'),
  fromLocation: z.string().min(1, 'From location is required'),
  toLocation: z.string().min(1, 'To location is required'),
  transportType: z.string().optional(),
  equipmentUsed: z.string().optional(),
  surgeryId: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    const body = await request.json();
    const validatedData = startTransportSchema.parse(body);

    // Find porter by staff code
    const porter = await prisma.user.findUnique({
      where: { staffCode: validatedData.staffCode },
      select: {
        id: true,
        fullName: true,
        staffCode: true,
        role: true,
        status: true,
      },
    });

    if (!porter) {
      return NextResponse.json(
        { error: 'Invalid staff code' },
        { status: 404 }
      );
    }

    if (porter.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'Staff account is not approved' },
        { status: 403 }
      );
    }

    if (porter.role !== 'PORTER' && porter.role !== 'ADMIN' && porter.role !== 'THEATRE_MANAGER') {
      return NextResponse.json(
        { error: 'Only porters and administrators can log transport duties' },
        { status: 403 }
      );
    }

    // Check for active transport
    const activeTransport = await prisma.patientTransportLog.findFirst({
      where: {
        porterId: porter.id,
        status: 'IN_PROGRESS',
      },
    });

    if (activeTransport) {
      return NextResponse.json(
        { error: 'You have an active transport session. Please end it first.' },
        { status: 400 }
      );
    }

    // Find patient
    const patient = await prisma.patient.findUnique({
      where: { folderNumber: validatedData.patientFolderNumber },
      select: {
        id: true,
        name: true,
        folderNumber: true,
      },
    });

    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Create transport log
    const transportLog = await prisma.patientTransportLog.create({
      data: {
        porterId: porter.id,
        porterCode: porter.staffCode!,
        porterName: porter.fullName,
        patientId: patient.id,
        patientName: patient.name,
        patientFolderNumber: patient.folderNumber,
        fromLocation: validatedData.fromLocation,
        toLocation: validatedData.toLocation,
        transportType: validatedData.transportType,
        equipmentUsed: validatedData.equipmentUsed,
        surgeryId: validatedData.surgeryId,
        notes: validatedData.notes,
        status: 'IN_PROGRESS',
      },
    });

    return NextResponse.json(
      {
        message: 'Patient transport started successfully',
        log: transportLog,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error starting transport:', error);
    return NextResponse.json(
      { error: 'Failed to start transport session' },
      { status: 500 }
    );
  }
}
