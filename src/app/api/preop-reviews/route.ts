import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { idempotencyKeyFrom, replayIfSeen, rememberResult } from '@/lib/idempotency';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { ensureAnaesthesiaCodeForSurgery } from '@/lib/surgeryCodes';
import { ANAESTHESIA_TYPE_VALUES } from '@/lib/anaesthesiaTypes';

export const dynamic = 'force-dynamic';

// Helpers: turn '' / null into undefined before validation
const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);
const optStr = z.preprocess(emptyToUndef, z.string().optional());
const optNum = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : typeof v === 'string' ? Number(v) : v),
  z.number().optional()
);
const optEnum = <T extends [string, ...string[]]>(values: T) =>
  z.preprocess(emptyToUndef, z.enum(values).optional());

// Schema for creating pre-op review
const createPreOpReviewSchema = z.object({
  surgeryId: z.string().min(1, 'surgeryId is required'),
  patientId: z.string().min(1, 'patientId is required'),
  patientName: z.string().min(1, 'patientName is required'),
  folderNumber: z.string().min(1, 'folderNumber is required'),
  scheduledSurgeryDate: z.string().min(1, 'scheduledSurgeryDate is required'),
  currentMedications: optStr,
  allergies: optStr,
  comorbidities: optStr,
  previousAnesthesia: optStr,
  lastOralIntake: optStr,
  fastingStatus: optStr,
  weight: optNum,
  height: optNum,
  bmi: optNum,
  bloodPressure: optStr,
  heartRate: optNum,
  respiratoryRate: optNum,
  temperature: optNum,
  airwayClass: optStr,
  neckMovement: optStr,
  dentition: optStr,
  hemoglobin: optNum,
  plateletCount: optNum,
  ptInr: optNum,
  creatinine: optNum,
  sodium: optNum,
  potassium: optNum,
  bloodGlucose: optNum,
  otherLabResults: optStr,
  asaClass: optStr,
  // Was a hand-written list of five that omitted EPIDURAL and
  // COMBINED_SPINAL_EPIDURAL — both offered by the form, both with seeded packs.
  // Choosing either rejected the whole review with a 400.
  proposedAnesthesiaType: optEnum(ANAESTHESIA_TYPE_VALUES),
  anestheticPlan: optStr,
  specialConsiderations: optStr,
  riskLevel: optStr,
  riskFactors: optStr,
  // Retained so an older client, or a review being migrated, can still send
  // them. The form no longer collects either.
  reviewNotes: optStr,
  recommendations: optStr,
  // The decision the review turns on, and what would change it. Accepted here
  // as well as on PATCH because the form creates and completes in one action —
  // without this, zod would strip them silently and the whole workflow would
  // appear to save and record nothing.
  fitnessDecision: optEnum(['FIT', 'NOT_FIT']),
  optimisationRequirements: z.array(z.object({
    category: z.string().min(1),
    action: z.string(),
    responsible: z.string().nullish(),
    targetCompletion: z.string().nullish(),
    priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  })).optional(),
  // Ward presence at the planned review time.
  patientInWardAtReview: z.boolean().optional().nullable(),
  patientAbsenceNote: optStr,
  // Prescription data
  prescription: z.object({
    medications: z.array(z.object({
      id: z.string(),
      category: z.string(),
      name: z.string(),
      dose: z.string(),
      unit: z.string(),
      route: z.string(),
      timing: z.string(),
      notes: z.string().optional(),
    })),
    urgency: z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']),
    specialInstructions: z.string().optional(),
    allergyAlerts: z.string().optional(),
  }).optional(),
  // Anaesthesia consumables from applied packs → Consumable Pack Provider.
  consumableRequests: z.array(z.object({
    name: z.string().min(1),
    category: z.string().default('ANAESTHESIA_AIRWAY'),
    size: z.string().nullish(),
    unit: z.string().default('piece'),
    quantity: z.number().int().min(1).default(1),
    notes: z.string().nullish(),
  })).optional(),
  // Anaesthesia consent (WHO-aligned) — electronic signature or uploaded scan.
  anaesthesiaConsent: z.object({
    text: z.string(),
    signature: z.string(),
    signedBy: z.string().optional(),
    relation: z.string().optional(),
    method: z.string().optional(),
  }).optional(),
});

// GET - Fetch all pre-op reviews or filtered by surgery
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

    const where: any = {};

    if (surgeryId) {
      where.surgeryId = surgeryId;
    }

    if (status) {
      where.status = status;
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

    const reviews = await prisma.preOperativeAnestheticReview.findMany({
      where,
      include: {
        surgery: {
          include: {
            patient: true,
          },
        },
        anesthetist: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        consultantAnesthetist: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        prescriptions: {
          include: {
            prescribedBy: {
              select: {
                id: true,
                fullName: true,
              },
            },
            approvedBy: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(reviews);
  } catch (error) {
    console.error('Error fetching pre-op reviews:', error);
    // Return empty array instead of error if table doesn't exist yet
    return NextResponse.json([]);
  }
}

// POST - Create new pre-op review
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is an anesthetist or admin
    if (!['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only anesthetists and administrators can create pre-op reviews' },
        { status: 403 }
      );
    }

    const idemKey = idempotencyKeyFrom(request);
    const replay = await replayIfSeen(idemKey);
    if (replay) return replay;

    const body = await request.json();
    const validatedData = createPreOpReviewSchema.parse(body);

    // Extract prescription + pack-consumable data before creating review
    const {
      prescription, anaesthesiaConsent, consumableRequests,
      optimisationRequirements, ...reviewData
    } = validatedData;

    // Check if review already exists for this surgery
    const existingReview = await prisma.preOperativeAnestheticReview.findUnique({
      where: { surgeryId: reviewData.surgeryId },
    });

    if (existingReview) {
      return NextResponse.json(
        { error: 'A pre-operative review already exists for this surgery. Open it from the list to edit.' },
        { status: 409 }
      );
    }

    // Create pre-op review
    const review = await prisma.preOperativeAnestheticReview.create({
      data: {
        ...reviewData,
        scheduledSurgeryDate: new Date(reviewData.scheduledSurgeryDate),
        lastOralIntake: reviewData.lastOralIntake ? new Date(reviewData.lastOralIntake) : null,
        anesthetistId: session.user.id,
        anesthetistName: session.user.name || '',
        status: 'IN_PROGRESS',
        // Stamped with the decision so "who decided this, and when" is answered
        // by the row itself rather than inferred from the audit log.
        ...(reviewData.fitnessDecision
          ? { fitnessDecidedAt: new Date(), fitnessDecidedById: session.user.id }
          : {}),
        ...(anaesthesiaConsent
          ? {
              anaesthesiaConsentText: anaesthesiaConsent.text,
              anaesthesiaConsentSignature: anaesthesiaConsent.signature,
              anaesthesiaConsentSignedBy: anaesthesiaConsent.signedBy || null,
              anaesthesiaConsentRelation: anaesthesiaConsent.relation || null,
              anaesthesiaConsentMethod: anaesthesiaConsent.method || null,
              anaesthesiaConsentSignedAt: new Date(),
            }
          : {}),
      } as any,
      include: {
        surgery: true,
        patient: true,
        anesthetist: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    // What must be addressed before an unfit patient can proceed. Written after
    // the review exists because each row is keyed to it.
    if (optimisationRequirements?.length) {
      await prisma.anaestheticOptimisationRequirement.createMany({
        data: optimisationRequirements.map((r) => ({
          reviewId: review.id,
          surgeryId: review.surgeryId,
          patientId: review.patientId,
          category: r.category,
          action: r.action,
          responsible: r.responsible ?? null,
          targetCompletion: r.targetCompletion ? new Date(r.targetCompletion) : null,
          priority: r.priority,
          raisedById: session.user.id,
        })),
      });
    }

    // Create anesthetic prescription if medications were added
    if (prescription && prescription.medications.length > 0) {
      await prisma.anestheticPrescription.create({
        data: {
          preOpReviewId: review.id,
          surgeryId: reviewData.surgeryId,
          patientId: reviewData.patientId,
          patientName: reviewData.patientName,
          prescribedById: session.user.id,
          prescribedByName: session.user.name || '',
          scheduledSurgeryDate: new Date(reviewData.scheduledSurgeryDate),
          medications: JSON.stringify(prescription.medications),
          urgency: prescription.urgency,
          specialInstructions: prescription.specialInstructions || null,
          allergyAlerts: reviewData.allergies || null,
          status: 'PENDING_APPROVAL', // Awaiting consultant approval
        },
      });

      // Generate the patient-facing anaesthesia drug code for pharmacy collection.
      if (reviewData.surgeryId) {
        await ensureAnaesthesiaCodeForSurgery(prisma, reviewData.surgeryId);
      }
    }

    // Anaesthesia consumables from applied packs → Consumable Pack Provider.
    if (consumableRequests && consumableRequests.length > 0 && reviewData.surgeryId) {
      const CONS_CATEGORIES = new Set([
        'GLOVES', 'GOWNS_DRAPES', 'SUTURES', 'SYRINGES_NEEDLES', 'CATHETERS_TUBING',
        'DRESSING_PACKS', 'SKIN_PREP', 'CLEANING_SOLUTION', 'STERILE_DRESSINGS',
        'IRRIGATION', 'DIATHERMY', 'SUCTION', 'ANAESTHESIA_AIRWAY', 'PPE', 'OTHER',
      ]);
      await prisma.surgeryConsumableRequest.createMany({
        data: consumableRequests.map((c) => ({
          surgeryId: reviewData.surgeryId,
          name: c.name,
          category: (CONS_CATEGORIES.has(c.category) ? c.category : 'ANAESTHESIA_AIRWAY') as any,
          size: c.size ?? null,
          unit: c.unit ?? 'piece',
          quantity: c.quantity ?? 1,
          notes: c.notes ?? 'Anaesthesia pack',
          requestedById: session.user.id,
          requestedByName: session.user.name || '',
        })),
      });
      // Notify the consumable pack providers / theatre store.
      try {
        const providers = await prisma.user.findMany({
          where: { role: { in: ['CONSUMABLE_PACK_PROVIDER', 'THEATRE_STORE_KEEPER', 'ADMIN'] as any }, status: 'APPROVED' as any },
          select: { id: true },
        });
        if (providers.length) {
          await prisma.notification.createMany({
            data: providers.map((u) => ({
              userId: u.id,
              type: 'STOCK_ALERT' as any,
              title: 'Anaesthesia consumables to pack',
              message: `${consumableRequests.length} anaesthesia consumable(s) requested for ${reviewData.patientName}.`,
              link: '/dashboard/consumable-pack-provider',
            })),
          });
        }
      } catch (e) {
        console.error('pack-provider notification failed (non-fatal):', e);
      }
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'PreOperativeAnestheticReview',
        recordId: review.id,
        changes: JSON.stringify(review),
      },
    });

    await rememberResult(idemKey, 201, review, 'POST /api/preop-reviews');
    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(e => `${e.path.join('.') || 'body'}: ${e.message}`);
      console.error('Pre-op review validation failed:', issues);
      return NextResponse.json(
        { error: `Validation error: ${issues.join('; ')}`, details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating pre-op review:', error);
    return NextResponse.json(
      { error: 'Failed to create pre-op review', message: (error as Error)?.message },
      { status: 500 }
    );
  }
}
