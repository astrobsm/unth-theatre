import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { triggerRadio } from '@/lib/radioEvents';
import { sendPushToRoles } from '@/lib/fcm';
import { z } from 'zod';
import { ensureAnaesthesiaCodeForSurgery } from '@/lib/surgeryCodes';

export const dynamic = 'force-dynamic';

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
            // On-duty anaesthetist set at booking time -> shown as "To be collected by"
            anesthetist: {
              select: { id: true, fullName: true, phoneNumber: true, role: true },
            },
          },
        },
        prescribedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
            phoneNumber: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
            phoneNumber: true,
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

    const surgeryMap = new Map<string, any>();
    for (const prescription of prescriptions as any[]) {
      if (prescription.surgery?.id) surgeryMap.set(prescription.surgery.id, prescription.surgery);
    }
    const surgeries = Array.from(surgeryMap.values());
    if (surgeries.length) {
      const theatreIds = Array.from(new Set(surgeries.map((s) => s.theatreId).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)));
      const theatres = theatreIds.length
        ? await prisma.theatreSuite.findMany({
            where: { id: { in: theatreIds } },
            select: { id: true, name: true, location: true },
          })
        : [];
      const theatreById = new Map(theatres.map((t) => [t.id, t]));

      const scrubNurseIds = Array.from(new Set(surgeries.map((s) => s.scrubNurseId).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)));
      const scrubNurses = scrubNurseIds.length
        ? await prisma.user.findMany({
            where: { id: { in: scrubNurseIds } },
            select: { id: true, fullName: true, phoneNumber: true },
          })
        : [];
      const scrubNurseById = new Map(scrubNurses.map((u) => [u.id, u]));

      const surgeryIds = surgeries.map((s) => s.id);
      const dayKeys = Array.from(new Set(surgeries.map((s) => new Date(s.scheduledDate).toISOString().slice(0, 10))));
      const dayStarts = dayKeys.map((d) => new Date(`${d}T00:00:00`).getTime());
      const minDay = new Date(Math.min(...dayStarts));
      const maxDay = new Date(Math.max(...dayStarts));
      maxDay.setDate(maxDay.getDate() + 1);

      const allocations = await prisma.theatreAllocation.findMany({
        where: {
          OR: [{ surgeryId: { in: surgeryIds } }, { date: { gte: minDay, lt: maxDay } }],
        },
        include: {
          theatre: { select: { name: true } },
          scrubNurse: { select: { fullName: true, phoneNumber: true } },
        },
      });
      const bySurgeryId = new Map<string, (typeof allocations)[number]>();
      const byTheatreDay = new Map<string, (typeof allocations)[number]>();
      for (const allocation of allocations) {
        if (allocation.surgeryId) bySurgeryId.set(allocation.surgeryId, allocation);
        if (allocation.theatre?.name) {
          byTheatreDay.set(`${allocation.theatre.name.toLowerCase()}|${new Date(allocation.date).toISOString().slice(0, 10)}`, allocation);
        }
      }

      for (const prescription of prescriptions as any[]) {
        const surgery = prescription.surgery;
        if (!surgery) continue;
        let allocation = bySurgeryId.get(surgery.id);
        const theatre = surgery.theatreId ? theatreById.get(surgery.theatreId) : null;
        const surgeryScrubNurse = surgery.scrubNurseId ? scrubNurseById.get(surgery.scrubNurseId) : null;
        if (!allocation && surgery.location) {
          allocation = byTheatreDay.get(`${surgery.location.toLowerCase()}|${new Date(surgery.scheduledDate).toISOString().slice(0, 10)}`);
        }
        surgery.scrubNurse = allocation?.scrubNurse
          ? { fullName: allocation.scrubNurse.fullName, phoneNumber: allocation.scrubNurse.phoneNumber }
          : surgeryScrubNurse
            ? { fullName: surgeryScrubNurse.fullName, phoneNumber: surgeryScrubNurse.phoneNumber }
            : null;
        surgery.theatreName = allocation?.theatre?.name || theatre?.name || surgery.location || null;
        surgery.theatreLocation = theatre?.location || surgery.location || null;
      }
    }

    return NextResponse.json(prescriptions);
  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    // Return empty array instead of error if table doesn't exist yet
    return NextResponse.json([]);
  }
}

// POST - Create new prescription
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is an anesthetist or admin
    if (!['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only anesthetists and administrators can create prescriptions' },
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

    // Generate the patient-facing anaesthesia drug code now that the anaesthetist
    // has prescribed. The surgeon/anaesthetist gives this to the patient for pharmacy.
    let anaesthesiaDrugCode: string | null = null;
    if (prescription.surgeryId) {
      anaesthesiaDrugCode = await ensureAnaesthesiaCodeForSurgery(prisma, prescription.surgeryId);
    }

    // Real-time radio broadcast: prescription submitted
    await triggerRadio({
      category: 'WORKFLOW',
      title: `Prescription submitted — ${prescription.patientName ?? validatedData.patientName}`,
      message:
        `New anaesthetic prescription submitted for patient ` +
        `${prescription.patientName ?? validatedData.patientName}. ` +
        `Prescriber: ${session.user.name ?? 'anaesthetist'}. Pharmacy please review.`,
      priority: 70,
      urgency: 'MEDIUM',
      triggeredById: session.user.id,
      metadata: {
        source: 'AnestheticPrescription',
        prescriptionId: prescription.id,
        patientId: validatedData.patientId,
      },
    });

    // Native push to pharmacy so they are alerted even when the app is closed.
    // No-ops when FCM is not configured.
    void sendPushToRoles(['PHARMACIST'], {
      title: '💊 New prescription to review',
      body: `Anaesthetic prescription for ${prescription.patientName ?? validatedData.patientName}. Pharmacy, please review and pack.`,
      link: '/dashboard/prescriptions',
      data: { prescriptionId: prescription.id, kind: 'prescription_ready' },
    });

    return NextResponse.json({ ...prescription, anaesthesiaDrugCode }, { status: 201 });
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
