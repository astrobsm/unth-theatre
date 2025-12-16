import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Schema for creating blood request
const createBloodRequestSchema = z.object({
  surgeryId: z.string(),
  patientId: z.string(),
  patientName: z.string(),
  folderNumber: z.string(),
  bloodType: z.string(),
  rhFactor: z.string(),
  unitsRequested: z.number().min(1),
  bloodProducts: z.string(), // JSON array
  scheduledSurgeryDate: z.string(),
  surgeryType: z.enum(['ELECTIVE', 'URGENT', 'EMERGENCY']),
  isEmergency: z.boolean().default(false),
  procedureName: z.string(),
  crossMatchRequired: z.boolean().default(true),
  urgency: z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']).default('ROUTINE'),
  priorityLevel: z.number().min(1).max(5).default(3),
  clinicalIndication: z.string().optional(),
  specialRequirements: z.string().optional(),
});

// GET - Fetch all blood requests or filtered
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const surgeryId = searchParams.get('surgeryId');
    const status = searchParams.get('status');
    const date = searchParams.get('date');
    const isEmergency = searchParams.get('isEmergency');
    const urgency = searchParams.get('urgency');

    const where: any = {};

    if (surgeryId) {
      where.surgeryId = surgeryId;
    }

    if (status) {
      where.status = status;
    }

    if (isEmergency === 'true') {
      where.isEmergency = true;
    }

    if (urgency) {
      where.urgency = urgency;
    }

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      where.scheduledSurgeryDate = {
        gte: startDate,
        lte: endDate,
      };
    }

    const bloodRequests = await prisma.bloodRequest.findMany({
      where,
      include: {
        surgery: {
          include: {
            patient: true,
            surgeon: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        patient: true,
        requestedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        acknowledgedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        preparedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: [
        { isEmergency: 'desc' },
        { priorityLevel: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json(bloodRequests);
  } catch (error) {
    console.error('Error fetching blood requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch blood requests' },
      { status: 500 }
    );
  }
}

// POST - Create new blood request
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user can request blood (surgeon or anesthetist)
    if (!['SURGEON', 'ANAESTHETIST', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only surgeons or anesthetists can request blood' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createBloodRequestSchema.parse(body);

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

    // Create blood request
    const bloodRequest = await prisma.bloodRequest.create({
      data: {
        ...validatedData,
        scheduledSurgeryDate: new Date(validatedData.scheduledSurgeryDate),
        requestedById: session.user.id,
        requestedByName: session.user.name || 'Unknown',
        status: 'REQUESTED',
      },
      include: {
        surgery: true,
        patient: true,
        requestedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'BloodRequest',
        recordId: bloodRequest.id,
        changes: JSON.stringify(bloodRequest),
      },
    });

    // Notify all blood bank staff
    const bloodBankStaff = await prisma.user.findMany({
      where: {
        role: 'BLOODBANK_STAFF',
        status: 'APPROVED',
      },
    });

    return NextResponse.json(bloodRequest, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating blood request:', error);
    return NextResponse.json(
      { error: 'Failed to create blood request' },
      { status: 500 }
    );
  }
}
