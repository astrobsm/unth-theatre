import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Schema for creating emergency alert
const createEmergencyAlertSchema = z.object({
  surgeryId: z.string(),
  patientName: z.string(),
  folderNumber: z.string(),
  age: z.number().optional(),
  gender: z.string().optional(),
  procedureName: z.string(),
  surgicalUnit: z.string(),
  indication: z.string(),
  estimatedStartTime: z.string().optional(),
  theatreId: z.string().optional(),
  theatreName: z.string().optional(),
  bloodRequired: z.boolean().default(false),
  bloodUnits: z.number().optional(),
  specialEquipment: z.string().optional(), // JSON array
  alertMessage: z.string().optional(),
  additionalNotes: z.string().optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM']).default('CRITICAL'),
});

// GET - Fetch all emergency alerts or active ones
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const displayOnTv = searchParams.get('displayOnTv') === 'true';

    const where: any = {};

    if (activeOnly) {
      where.status = 'ACTIVE';
    }

    if (displayOnTv) {
      where.displayOnTv = true;
      where.status = 'ACTIVE';
    }

    const alerts = await prisma.emergencySurgeryAlert.findMany({
      where,
      include: {
        surgery: {
          include: {
            patient: true,
          },
        },
        surgeon: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
          },
        },
        anesthetist: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: [
        { priority: 'asc' }, // CRITICAL first
        { alertTriggeredAt: 'desc' },
      ],
    });

    return NextResponse.json(alerts);
  } catch (error) {
    console.error('Error fetching emergency alerts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch emergency alerts' },
      { status: 500 }
    );
  }
}

// POST - Create new emergency alert
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user can trigger emergency alerts
    if (!['SURGEON', 'ANAESTHETIST', 'THEATRE_MANAGER', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to trigger emergency alerts' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createEmergencyAlertSchema.parse(body);

    // Verify surgery exists
    const surgery = await prisma.surgery.findUnique({
      where: { id: validatedData.surgeryId },
      include: {
        patient: true,
      },
    });

    if (!surgery) {
      return NextResponse.json(
        { error: 'Surgery not found' },
        { status: 404 }
      );
    }

    // Update surgery type to EMERGENCY
    await prisma.surgery.update({
      where: { id: validatedData.surgeryId },
      data: {
        surgeryType: 'EMERGENCY',
      },
    });

    // Create emergency alert
    const alert = await prisma.emergencySurgeryAlert.create({
      data: {
        ...validatedData,
        estimatedStartTime: validatedData.estimatedStartTime
          ? new Date(validatedData.estimatedStartTime)
          : null,
        surgeonId: session.user.role === 'SURGEON' ? session.user.id : surgery.surgeonId || '',
        surgeonName: session.user.role === 'SURGEON' ? (session.user.name || '') : surgery.surgeonName || '',
        status: 'ACTIVE',
        displayOnTv: true,
      },
      include: {
        surgery: true,
        surgeon: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'EmergencySurgeryAlert',
        recordId: alert.id,
        changes: JSON.stringify(alert),
      },
    });

    // Get all theatre staff who should be notified
    const staffToNotify = await prisma.user.findMany({
      where: {
        role: {
          in: [
            'THEATRE_MANAGER',
            'THEATRE_CHAIRMAN',
            'ANAESTHETIST',
            'SCRUB_NURSE',
            'RECOVERY_ROOM_NURSE',
            'THEATRE_STORE_KEEPER',
            'ANAESTHETIC_TECHNICIAN',
            'PORTER',
            'BLOODBANK_STAFF',
            'PHARMACIST',
          ],
        },
        status: 'APPROVED',
      },
    });

    // If blood is required, create automatic blood request
    if (validatedData.bloodRequired && validatedData.bloodUnits) {
      await prisma.bloodRequest.create({
        data: {
          surgeryId: validatedData.surgeryId,
          patientId: surgery.patientId,
          patientName: validatedData.patientName,
          folderNumber: validatedData.folderNumber,
          bloodType: surgery.patient.whoRiskClass || 'Unknown', // Should be actual blood type
          rhFactor: 'Positive', // Should be actual Rh factor
          unitsRequested: validatedData.bloodUnits,
          bloodProducts: JSON.stringify(['Packed Red Blood Cells']),
          scheduledSurgeryDate: surgery.scheduledDate,
          surgeryType: 'EMERGENCY',
          isEmergency: true,
          procedureName: validatedData.procedureName,
          requestedById: session.user.id,
          requestedByName: session.user.name || '',
          urgency: 'EMERGENCY',
          priorityLevel: 1,
          status: 'REQUESTED',
        },
      });
    }

    // Log TV display
    await prisma.tvAlertDisplayLog.create({
      data: {
        alertId: alert.id,
        alertType: 'EMERGENCY_SURGERY',
        tvLocation: 'All Theatre Locations',
      },
    });

    return NextResponse.json(alert, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating emergency alert:', error);
    return NextResponse.json(
      { error: 'Failed to create emergency alert' },
      { status: 500 }
    );
  }
}
