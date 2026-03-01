import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const requestSchema = z.object({
  prescriptionId: z.string(),
  surgeryId: z.string(),
  medicationsRequested: z.array(z.object({
    drugName: z.string(),
    dosage: z.string(),
    route: z.string(),
    quantity: z.number().int().min(1),
    reason: z.string(),
  })),
  urgency: z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']).default('EMERGENCY'),
  reason: z.string(),
  notes: z.string().optional(),
});

// POST - Request additional medications during surgery (EMERGENCY)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = requestSchema.parse(body);
    const user = session.user as any;

    // Verify prescription exists
    const prescription = await prisma.anestheticPrescription.findUnique({
      where: { id: data.prescriptionId },
    });

    if (!prescription) {
      return NextResponse.json({ error: 'Prescription not found' }, { status: 404 });
    }

    // Create additional request
    const additionalRequest = await prisma.additionalMedicationRequest.create({
      data: {
        prescriptionId: data.prescriptionId,
        surgeryId: data.surgeryId,
        requestedById: user.id,
        requestedByName: user.fullName || user.name || 'Unknown',
        medicationsRequested: JSON.stringify(data.medicationsRequested),
        urgency: data.urgency,
        reason: data.reason,
        status: 'PENDING',
        alertSentAt: new Date(),
        notes: data.notes,
      },
    });

    // Create emergency notification for all pharmacists
    const pharmacists = await prisma.user.findMany({
      where: {
        role: { in: ['PHARMACIST', 'ADMIN', 'SYSTEM_ADMINISTRATOR'] },
        status: 'APPROVED',
      },
      select: { id: true },
    });

    // Create notifications for all pharmacists
    const surgery = await prisma.surgery.findUnique({
      where: { id: data.surgeryId },
      select: { procedureName: true },
    });

    const drugNames = data.medicationsRequested.map((m) => m.drugName).join(', ');
    const notificationMessage = `🚨 EMERGENCY MEDICATION REQUEST: ${drugNames} needed for surgery "${surgery?.procedureName || 'Unknown'}". Urgency: ${data.urgency}. Reason: ${data.reason}. WALKIE-TALKIE ALERT: Please prepare medications immediately and notify theatre.`;

    for (const pharmacist of pharmacists) {
      await prisma.notification.create({
        data: {
          userId: pharmacist.id,
          type: 'EMERGENCY',
          title: '🚨 EMERGENCY: Additional Medication Request',
          message: notificationMessage,
          link: '/dashboard/medication-tracking',
        },
      });
    }

    return NextResponse.json({
      success: true,
      additionalRequest,
      alertsSent: pharmacists.length,
      message: `Emergency alert sent to ${pharmacists.length} pharmacist(s). Walkie-talkie notification triggered.`,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error creating additional request:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update additional request status (pharmacist acknowledges/packs)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { requestId, action, pharmacistNotes } = body;
    const user = session.user as any;

    if (!requestId || !action) {
      return NextResponse.json({ error: 'Missing requestId or action' }, { status: 400 });
    }

    const additionalRequest = await prisma.additionalMedicationRequest.findUnique({
      where: { id: requestId },
    });

    if (!additionalRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const updateData: any = {};

    switch (action) {
      case 'ACKNOWLEDGE':
        updateData.status = 'ACKNOWLEDGED';
        updateData.acknowledgedById = user.id;
        updateData.acknowledgedByName = user.fullName || user.name || 'Unknown';
        updateData.acknowledgedAt = new Date();
        updateData.walkieTalkieNotified = true;
        break;

      case 'PACKING':
        updateData.status = 'PACKING';
        break;

      case 'PACKED':
        updateData.status = 'PACKED';
        updateData.packedById = user.id;
        updateData.packedByName = user.fullName || user.name || 'Unknown';
        updateData.packedAt = new Date();
        updateData.pharmacistNotes = pharmacistNotes;
        break;

      case 'COLLECTED':
        updateData.status = 'COLLECTED';
        updateData.collectedAt = new Date();
        updateData.collectedByName = user.fullName || user.name || 'Unknown';

        // Auto-create usage records for additional medications
        const meds = JSON.parse(additionalRequest.medicationsRequested);
        for (const med of meds) {
          await prisma.medicationUsageRecord.create({
            data: {
              prescriptionId: additionalRequest.prescriptionId,
              surgeryId: additionalRequest.surgeryId,
              drugName: med.drugName,
              dosage: med.dosage,
              route: med.route,
              quantityDispensed: med.quantity,
              quantityRemaining: med.quantity,
              isReturnRequired: true,
            },
          });
        }
        break;

      case 'CANCEL':
        updateData.status = 'CANCELLED';
        updateData.pharmacistNotes = pharmacistNotes;
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const updated = await prisma.additionalMedicationRequest.update({
      where: { id: requestId },
      data: updateData,
    });

    return NextResponse.json({ success: true, additionalRequest: updated });
  } catch (error: any) {
    console.error('Error updating additional request:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// GET - Get additional medication requests
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const prescriptionId = searchParams.get('prescriptionId');
    const surgeryId = searchParams.get('surgeryId');
    const status = searchParams.get('status');
    const pending = searchParams.get('pending');

    const where: any = {};
    if (prescriptionId) where.prescriptionId = prescriptionId;
    if (surgeryId) where.surgeryId = surgeryId;
    if (status) where.status = status;
    if (pending === 'true') {
      where.status = { in: ['PENDING', 'ACKNOWLEDGED', 'PACKING'] };
    }

    const requests = await prisma.additionalMedicationRequest.findMany({
      where,
      include: {
        surgery: {
          select: { procedureName: true, scheduledDate: true },
        },
        prescription: {
          select: { patientName: true },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });

    return NextResponse.json(requests);
  } catch (error: any) {
    console.error('Error fetching additional requests:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
