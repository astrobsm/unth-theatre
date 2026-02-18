import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Schema for creating emergency surgery booking
const createEmergencyBookingSchema = z.object({
  patientName: z.string().min(1, 'Patient name is required'),
  folderNumber: z.string().min(1, 'Folder number is required'),
  age: z.number().optional(),
  gender: z.string().optional(),
  ward: z.string().optional(),
  diagnosis: z.string().min(1, 'Diagnosis is required'),
  procedureName: z.string().min(1, 'Procedure name is required'),
  surgicalUnit: z.string().min(1, 'Surgical unit is required'),
  indication: z.string().min(1, 'Indication for emergency is required'),
  surgeonId: z.string().optional(),
  surgeonName: z.string().optional(),
  anesthetistId: z.string().optional(),
  anesthetistName: z.string().optional(),
  requiredByTime: z.string().optional(),
  estimatedDuration: z.number().optional(),
  theatreId: z.string().optional(),
  theatreName: z.string().optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM']).default('CRITICAL'),
  classification: z.string().optional(),
  bloodRequired: z.boolean().default(false),
  bloodType: z.string().optional(),
  bloodUnits: z.number().optional(),
  specialEquipment: z.string().optional(),
  specialRequirements: z.string().optional(),
});

// GET - Fetch all emergency bookings
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (priority) {
      where.priority = priority;
    }

    if (dateFrom || dateTo) {
      where.requestedAt = {};
      if (dateFrom) where.requestedAt.gte = new Date(dateFrom);
      if (dateTo) where.requestedAt.lte = new Date(dateTo);
    }

    const bookings = await prisma.emergencySurgeryBooking.findMany({
      where,
      include: {
        surgeon: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            role: true,
          },
        },
        anesthetist: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            role: true,
          },
        },
        surgery: {
          include: {
            patient: true,
          },
        },
      },
      orderBy: [
        { priority: 'asc' },
        { requestedAt: 'desc' },
      ],
    });

    return NextResponse.json(bookings);
  } catch (error) {
    console.error('Error fetching emergency bookings:', error);
    return NextResponse.json([]);
  }
}

// POST - Create new emergency surgery booking + auto-trigger emergency alert
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only surgeons, anesthetists, theatre managers, and admins can create emergency bookings
    if (!['SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'THEATRE_MANAGER', 'ADMIN', 'CMAC', 'DC_MAC', 'CHIEF_MEDICAL_DIRECTOR'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create emergency booking' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createEmergencyBookingSchema.parse(body);

    // Determine surgeon
    const surgeonId = validatedData.surgeonId || (session.user.role === 'SURGEON' ? session.user.id : undefined);
    const surgeonName = validatedData.surgeonName || (session.user.role === 'SURGEON' ? (session.user.name || '') : '');

    if (!surgeonId) {
      return NextResponse.json(
        { error: 'Surgeon is required for emergency booking' },
        { status: 400 }
      );
    }

    // Create the emergency booking
    const booking = await prisma.emergencySurgeryBooking.create({
      data: {
        patientName: validatedData.patientName,
        folderNumber: validatedData.folderNumber,
        age: validatedData.age,
        gender: validatedData.gender,
        ward: validatedData.ward,
        diagnosis: validatedData.diagnosis,
        procedureName: validatedData.procedureName,
        surgicalUnit: validatedData.surgicalUnit,
        indication: validatedData.indication,
        surgeonId: surgeonId,
        surgeonName: surgeonName,
        anesthetistId: validatedData.anesthetistId || null,
        anesthetistName: validatedData.anesthetistName || null,
        requiredByTime: validatedData.requiredByTime ? new Date(validatedData.requiredByTime) : null,
        estimatedDuration: validatedData.estimatedDuration,
        theatreId: validatedData.theatreId || null,
        theatreName: validatedData.theatreName || null,
        priority: validatedData.priority,
        classification: validatedData.classification,
        bloodRequired: validatedData.bloodRequired,
        bloodType: validatedData.bloodType,
        bloodUnits: validatedData.bloodUnits,
        specialEquipment: validatedData.specialEquipment,
        specialRequirements: validatedData.specialRequirements,
        status: 'SUBMITTED',
      },
      include: {
        surgeon: {
          select: { id: true, fullName: true, phoneNumber: true },
        },
        anesthetist: {
          select: { id: true, fullName: true, phoneNumber: true },
        },
      },
    });

    // AUTO-TRIGGER EMERGENCY ALERT
    // Find or create a patient record
    let patient = await prisma.patient.findFirst({
      where: { folderNumber: validatedData.folderNumber },
    });

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          name: validatedData.patientName,
          folderNumber: validatedData.folderNumber,
          age: validatedData.age ?? 0,
          gender: validatedData.gender || 'Unknown',
          ward: validatedData.ward || 'Emergency',
        },
      });
    }

    // Create a surgery record
    const scheduledDate = validatedData.requiredByTime ? new Date(validatedData.requiredByTime) : new Date();
    const scheduledTime = scheduledDate.toTimeString().slice(0, 5); // "HH:MM"
    const surgery = await prisma.surgery.create({
      data: {
        patientId: patient.id,
        procedureName: validatedData.procedureName,
        subspecialty: validatedData.surgicalUnit,
        unit: validatedData.surgicalUnit,
        indication: validatedData.indication,
        surgeonId: surgeonId,
        surgeonName: surgeonName,
        anesthetistId: validatedData.anesthetistId || null,
        scheduledDate: scheduledDate,
        scheduledTime: scheduledTime,
        surgeryType: 'EMERGENCY',
        status: 'SCHEDULED',
        needBloodTransfusion: validatedData.bloodRequired || false,
        otherSpecialNeeds: validatedData.specialEquipment || null,
        remarks: validatedData.specialRequirements || null,
      },
    });

    // Link surgery to booking
    await prisma.emergencySurgeryBooking.update({
      where: { id: booking.id },
      data: { surgeryId: surgery.id },
    });

    // Create Emergency Surgery Alert (wired to emergency alert system)
    const emergencyAlert = await prisma.emergencySurgeryAlert.create({
      data: {
        surgeryId: surgery.id,
        patientName: validatedData.patientName,
        folderNumber: validatedData.folderNumber,
        age: validatedData.age,
        gender: validatedData.gender,
        procedureName: validatedData.procedureName,
        surgicalUnit: validatedData.surgicalUnit,
        indication: validatedData.indication,
        surgeonId: surgeonId,
        surgeonName: surgeonName,
        anesthetistId: validatedData.anesthetistId || null,
        estimatedStartTime: validatedData.requiredByTime ? new Date(validatedData.requiredByTime) : null,
        theatreId: validatedData.theatreId || null,
        theatreName: validatedData.theatreName || null,
        bloodRequired: validatedData.bloodRequired,
        bloodUnits: validatedData.bloodUnits,
        specialEquipment: validatedData.specialEquipment,
        priority: validatedData.priority,
        alertMessage: `EMERGENCY BOOKING: ${validatedData.procedureName} for ${validatedData.patientName} - ${validatedData.indication}`,
        additionalNotes: validatedData.specialRequirements,
        status: 'ACTIVE',
        displayOnTv: true,
      },
    });

    // Update booking with alert ID
    await prisma.emergencySurgeryBooking.update({
      where: { id: booking.id },
      data: {
        emergencyAlertId: emergencyAlert.id,
        alertsSentAt: new Date(),
        notifiedRoles: JSON.stringify([
          'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ANAESTHETIST', 'SCRUB_NURSE',
          'RECOVERY_ROOM_NURSE', 'THEATRE_STORE_KEEPER', 'ANAESTHETIC_TECHNICIAN',
          'PORTER', 'BLOODBANK_STAFF', 'PHARMACIST', 'CMAC', 'DC_MAC',
        ]),
      },
    });

    // If blood is required, auto-create blood request
    if (validatedData.bloodRequired && validatedData.bloodUnits) {
      await prisma.bloodRequest.create({
        data: {
          surgeryId: surgery.id,
          patientId: patient.id,
          patientName: validatedData.patientName,
          folderNumber: validatedData.folderNumber,
          bloodType: validatedData.bloodType || 'Unknown',
          rhFactor: 'Positive',
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

    // TV Alert display log
    try {
      await prisma.tvAlertDisplayLog.create({
        data: {
          alertId: emergencyAlert.id,
          alertType: 'EMERGENCY_SURGERY_BOOKING',
          tvLocation: 'All Theatre Locations',
        },
      });
    } catch (e) {
      // TV log table may not exist
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'EmergencySurgeryBooking',
        recordId: booking.id,
        changes: JSON.stringify({
          booking: booking.id,
          surgery: surgery.id,
          alert: emergencyAlert.id,
          patientName: validatedData.patientName,
          procedure: validatedData.procedureName,
          priority: validatedData.priority,
        }),
      },
    });

    return NextResponse.json({
      booking,
      surgery,
      emergencyAlert,
      message: 'Emergency booking submitted and emergency alerts raised',
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating emergency booking:', error);
    return NextResponse.json(
      { error: 'Failed to create emergency booking' },
      { status: 500 }
    );
  }
}
