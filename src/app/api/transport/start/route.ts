import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { acknowledgeRadioByMetadata, triggerRadio } from '@/lib/radioEvents';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const startTransportSchema = z.object({
  staffCode: z.string().min(1, 'Staff code is required'),
  patientFolderNumber: z.string().min(1, 'Patient folder number is required'),
  fromLocation: z.string().min(1, 'From location is required'),
  toLocation: z.string().min(1, 'To location is required'),
  transportType: z.string().optional(),
  equipmentUsed: z.string().optional(),
  surgeryId: z.string().optional(),
  notes: z.string().optional(),
  // Second porter (trolley partner) staff code — optional.
  transporter2Code: z.string().optional().nullable(),
  // When true, auto-end any existing IN_PROGRESS transport for this porter
  // instead of blocking the new one.
  force: z.boolean().optional(),
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
      if (!validatedData.force) {
        return NextResponse.json(
          {
            error: 'You have an active transport session. Please end it first.',
            canForce: true,
            activeTransportId: activeTransport.id,
          },
          { status: 409 }
        );
      }
      // Force requested: auto-complete the previous transport so a new one can start.
      const endTime = new Date();
      const durationMinutes = Math.floor(
        (endTime.getTime() - activeTransport.startTime.getTime()) / 60000
      );
      await prisma.patientTransportLog.update({
        where: { id: activeTransport.id },
        data: {
          endTime,
          durationMinutes,
          status: 'COMPLETED',
          receivedAt: endTime,
          notes: [activeTransport.notes, 'Auto-ended: a new transport was force-started by the porter.']
            .filter(Boolean)
            .join(' • '),
        },
      });
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

    // Resolve the optional second porter (trolley partner). Patient transport
    // needs two porters to push the trolley.
    let porter2: { id: string; fullName: string; staffCode: string | null } | null = null;
    const transporter2Code = validatedData.transporter2Code?.trim();
    if (transporter2Code) {
      if (transporter2Code === porter.staffCode) {
        return NextResponse.json(
          { error: 'The second transporter must be a different porter' },
          { status: 400 }
        );
      }
      const found = await prisma.user.findUnique({
        where: { staffCode: transporter2Code },
        select: { id: true, fullName: true, staffCode: true, role: true, status: true },
      });
      if (!found) {
        return NextResponse.json(
          { error: 'Second transporter staff code is invalid' },
          { status: 404 }
        );
      }
      if (found.status !== 'APPROVED') {
        return NextResponse.json(
          { error: 'Second transporter account is not approved' },
          { status: 403 }
        );
      }
      if (found.role !== 'PORTER' && found.role !== 'ADMIN' && found.role !== 'THEATRE_MANAGER') {
        return NextResponse.json(
          { error: 'The second transporter must be a porter' },
          { status: 403 }
        );
      }
      porter2 = { id: found.id, fullName: found.fullName, staffCode: found.staffCode };
    }

    // Create transport log
    const transportLog = await prisma.patientTransportLog.create({
      data: {
        porterId: porter.id,
        porterCode: porter.staffCode!,
        porterName: porter.fullName,
        porter2Id: porter2?.id,
        porter2Code: porter2?.staffCode,
        porter2Name: porter2?.fullName,
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

    // Silence any pending porter-call radio loops for this surgery / patient
    await acknowledgeRadioByMetadata('kind', 'porter_call', porter.id);
    if (validatedData.surgeryId) {
      await acknowledgeRadioByMetadata('surgeryId', validatedData.surgeryId, porter.id);
    }

    // Confirmation broadcast
    await triggerRadio({
      category: 'CONFIRMATION',
      title: `Porter on the way — ${patient.name}`,
      message: `Porter ${porter.fullName} has started transport of patient ${patient.name} from ${validatedData.fromLocation} to ${validatedData.toLocation}.`,
      priority: 60,
      urgency: 'LOW',
      triggeredById: porter.id,
      metadata: { source: 'PorterStart', porterId: porter.id, patientId: patient.id },
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
