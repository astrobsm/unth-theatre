import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createLabRequestSchema = z.object({
  emergencyBookingId: z.string().optional(),
  surgeryId: z.string().optional(),
  patientName: z.string().min(1, 'Patient name is required'),
  folderNumber: z.string().min(1, 'Folder number is required'),
  age: z.number().optional(),
  gender: z.string().optional(),
  ward: z.string().optional(),
  diagnosis: z.string().optional(),
  priority: z.enum(['CRITICAL', 'URGENT', 'ROUTINE']).default('CRITICAL'),
  clinicalIndication: z.string().min(1, 'Clinical indication is required'),
  specialInstructions: z.string().optional(),
  notes: z.string().optional(),
  tests: z.array(z.object({
    testName: z.string().min(1),
    testCategory: z.enum([
      'HEMATOLOGY', 'BIOCHEMISTRY', 'COAGULATION', 'BLOOD_GAS',
      'CROSS_MATCH', 'URINALYSIS', 'MICROBIOLOGY', 'SEROLOGY',
      'RADIOLOGY', 'ECG', 'OTHER'
    ]),
    sampleType: z.string().optional(),
  })).min(1, 'At least one test is required'),
});

// GET - Fetch emergency lab requests
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const emergencyBookingId = searchParams.get('emergencyBookingId');
    const surgeryId = searchParams.get('surgeryId');

    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (emergencyBookingId) where.emergencyBookingId = emergencyBookingId;
    if (surgeryId) where.surgeryId = surgeryId;

    // Lab staff see all; surgeons/anaesthetists see their own requests
    if (session.user.role === 'LABORATORY_STAFF') {
      // Lab staff sees everything
    } else if (['SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'].includes(session.user.role)) {
      where.requestedById = session.user.id;
    }

    const requests = await prisma.emergencyLabRequest.findMany({
      where,
      include: {
        requestedBy: {
          select: { id: true, fullName: true, role: true, phoneNumber: true },
        },
        acknowledgedBy: {
          select: { id: true, fullName: true, role: true },
        },
        emergencyBooking: {
          select: { id: true, procedureName: true, priority: true, status: true },
        },
        surgery: {
          select: { id: true, procedureName: true, status: true, scheduledDate: true },
        },
        labTests: {
          include: {
            sampleCollectedBy: { select: { fullName: true } },
            receivedByLab: { select: { fullName: true } },
            resultEnteredBy: { select: { fullName: true } },
            resultVerifiedBy: { select: { fullName: true } },
          },
        },
      },
      orderBy: [
        { priority: 'asc' },
        { requestedAt: 'desc' },
      ],
    });

    return NextResponse.json(requests);
  } catch (error) {
    console.error('Error fetching emergency lab requests:', error);
    return NextResponse.json([]);
  }
}

// POST - Create a new emergency lab workup request
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only clinical staff can request lab workups
    const allowedRoles = [
      'SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
      'THEATRE_MANAGER', 'ADMIN', 'CMAC', 'DC_MAC', 'CHIEF_MEDICAL_DIRECTOR',
    ];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const data = createLabRequestSchema.parse(body);

    // Create the lab request with nested tests
    const labRequest = await prisma.emergencyLabRequest.create({
      data: {
        emergencyBookingId: data.emergencyBookingId || null,
        surgeryId: data.surgeryId || null,
        patientName: data.patientName,
        folderNumber: data.folderNumber,
        age: data.age,
        gender: data.gender,
        ward: data.ward,
        diagnosis: data.diagnosis,
        requestedById: session.user.id,
        requestedByName: session.user.name || '',
        priority: data.priority,
        clinicalIndication: data.clinicalIndication,
        specialInstructions: data.specialInstructions,
        notes: data.notes,
        status: 'REQUESTED',
        labTests: {
          create: data.tests.map(test => ({
            testName: test.testName,
            testCategory: test.testCategory,
            sampleType: test.sampleType || null,
            status: 'REQUESTED',
          })),
        },
      },
      include: {
        labTests: true,
        requestedBy: { select: { fullName: true, role: true } },
      },
    });

    // Send voice/push notifications to all LABORATORY_STAFF
    const labStaff = await prisma.user.findMany({
      where: { role: 'LABORATORY_STAFF', status: 'APPROVED' },
      select: { id: true, fullName: true },
    });

    const testNames = data.tests.map(t => t.testName).join(', ');
    const voiceMessage = `EMERGENCY LAB WORKUP! Priority: ${data.priority}. Patient: ${data.patientName}, Folder: ${data.folderNumber}. Tests required: ${testNames}. Please collect sample immediately and treat as priority.`;

    // Create notifications for lab staff
    const notificationPromises = labStaff.map(staff =>
      prisma.emergencyLabNotification.create({
        data: {
          emergencyLabRequestId: labRequest.id,
          recipientId: staff.id,
          recipientRole: 'LABORATORY_STAFF',
          notificationType: 'SAMPLE_COLLECT',
          isVoiceNotification: true,
          voiceMessage: voiceMessage,
          isPushNotification: true,
          pushTitle: `🔬 EMERGENCY LAB: ${data.priority}`,
          pushMessage: `${data.patientName} (${data.folderNumber}) - ${testNames}. Collect sample NOW!`,
        },
      })
    );

    // Also create Notification records (system-wide notifications)
    const systemNotificationPromises = labStaff.map(staff =>
      prisma.notification.create({
        data: {
          userId: staff.id,
          type: 'EMERGENCY_LAB_WORKUP',
          title: `🔬 EMERGENCY LAB: ${data.priority}`,
          message: `Emergency lab workup requested for ${data.patientName} (${data.folderNumber}). Tests: ${testNames}. Please collect sample immediately.`,
          link: '/dashboard/emergency-lab-workup',
        },
      })
    );

    await Promise.all([...notificationPromises, ...systemNotificationPromises]);

    // Update request with notification status
    await prisma.emergencyLabRequest.update({
      where: { id: labRequest.id },
      data: {
        status: 'NOTIFIED',
        voiceNotificationSent: true,
        voiceNotificationSentAt: new Date(),
        pushNotificationSent: true,
        pushNotificationSentAt: new Date(),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'EmergencyLabRequest',
        recordId: labRequest.id,
        changes: JSON.stringify({
          patientName: data.patientName,
          folderNumber: data.folderNumber,
          priority: data.priority,
          tests: testNames,
          labStaffNotified: labStaff.length,
        }),
      },
    });

    return NextResponse.json({
      ...labRequest,
      message: `Emergency lab workup created. ${labStaff.length} lab staff notified with voice alerts.`,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error creating emergency lab request:', error);
    return NextResponse.json({ error: 'Failed to create emergency lab request' }, { status: 500 });
  }
}
