import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Schema for creating prescription
const createPrescriptionSchema = z.object({
  preOpReviewId: z.string(),
  surgeryId: z.string(),
  patientId: z.string(),
  patientName: z.string(),
  medications: z.string(), // JSON array
  fluids: z.string().optional(),
  emergencyDrugs: z.string().optional(),
  scheduledSurgeryDate: z.string(),
  urgency: z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']).default('ROUTINE'),
  specialInstructions: z.string().optional(),
  allergyAlerts: z.string().optional(),
  prescriptionNotes: z.string().optional(),
});

// GET - Fetch all prescriptions or filtered
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
    const urgency = searchParams.get('urgency');
    const needsPacking = searchParams.get('needsPacking');

    const where: any = {};

    if (surgeryId) {
      where.surgeryId = surgeryId;
    }

    if (status) {
      where.status = status;
    }

    if (urgency) {
      where.urgency = urgency;
    }

    if (needsPacking === 'true') {
      where.status = 'APPROVED';
      where.packedAt = null;
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

    const prescriptions = await prisma.anestheticPrescription.findMany({
      where,
      include: {
        preOpReview: true,
        surgery: {
          include: {
            patient: true,
          },
        },
        prescribedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        packedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(prescriptions);
  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prescriptions' },
      { status: 500 }
    );
  }
}

// POST - Create new prescription
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is an anesthetist
    if (!['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only anesthetists can create prescriptions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createPrescriptionSchema.parse(body);

    // Verify pre-op review exists
    const preOpReview = await prisma.preOperativeAnestheticReview.findUnique({
      where: { id: validatedData.preOpReviewId },
    });

    if (!preOpReview) {
      return NextResponse.json(
        { error: 'Pre-operative review not found' },
        { status: 404 }
      );
    }

    // Create prescription
    const prescription = await prisma.anestheticPrescription.create({
      data: {
        ...validatedData,
        scheduledSurgeryDate: new Date(validatedData.scheduledSurgeryDate),
        prescribedById: session.user.id,
        prescribedByName: session.user.name || '',
        status: 'DRAFT',
      },
      include: {
        surgery: true,
        patient: true,
        prescribedBy: {
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
        tableName: 'AnestheticPrescription',
        recordId: prescription.id,
        changes: JSON.stringify(prescription),
      },
    });

    return NextResponse.json(prescription, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating prescription:', error);
    return NextResponse.json(
      { error: 'Failed to create prescription' },
      { status: 500 }
    );
  }
}
