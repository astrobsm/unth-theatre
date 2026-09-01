import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { detectConflict } from '@/lib/concurrency';
import { canCompleteReview, canDeclareFit } from '@/lib/anaesthesia/fitness';
import { ANAESTHESIA_TYPE_VALUES } from '@/lib/anaesthesiaTypes';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Schema for updating pre-op review
const updatePreOpReviewSchema = z.object({
  currentMedications: z.string().optional(),
  allergies: z.string().optional(),
  comorbidities: z.string().optional(),
  previousAnesthesia: z.string().optional(),
  lastOralIntake: z.string().optional(),
  fastingStatus: z.string().optional(),
  weight: z.number().optional(),
  height: z.number().optional(),
  bmi: z.number().optional(),
  bloodPressure: z.string().optional(),
  heartRate: z.number().optional(),
  respiratoryRate: z.number().optional(),
  temperature: z.number().optional(),
  airwayClass: z.string().optional(),
  neckMovement: z.string().optional(),
  dentition: z.string().optional(),
  hemoglobin: z.number().optional(),
  plateletCount: z.number().optional(),
  ptInr: z.number().optional(),
  creatinine: z.number().optional(),
  sodium: z.number().optional(),
  potassium: z.number().optional(),
  bloodGlucose: z.number().optional(),
  otherLabResults: z.string().optional(),
  asaClass: z.string().optional(),
  // Same five-value list as the create route had; see @/lib/anaesthesiaTypes.
  proposedAnesthesiaType: z.enum(ANAESTHESIA_TYPE_VALUES).optional(),
  anestheticPlan: z.string().optional(),
  specialConsiderations: z.string().optional(),
  riskLevel: z.string().optional(),
  riskFactors: z.string().optional(),
  reviewNotes: z.string().optional(),
  recommendations: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'APPROVED']).optional(),
  consultantAnesthetistId: z.string().optional(),

  // The decision the whole review now turns on, and the requirements that say
  // what would change it. Both optional here because a review is saved
  // repeatedly while it is being written; they are enforced at COMPLETED.
  fitnessDecision: z.enum(['FIT', 'NOT_FIT']).optional(),
  optimisationRequirements: z.array(z.object({
    category: z.string().min(1),
    action: z.string(),
    responsible: z.string().nullish(),
    targetCompletion: z.string().nullish(),
    priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  })).optional(),
  reassessmentNote: z.string().optional(),
});

// GET - Fetch single pre-op review
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const review = await prisma.preOperativeAnestheticReview.findUnique({
      where: { id: params.id },
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
            packedBy: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!review) {
      return NextResponse.json(
        { error: 'Pre-op review not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(review);
  } catch (error) {
    console.error('Error fetching pre-op review:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pre-op review' },
      { status: 500 }
    );
  }
}

// PATCH - Update pre-op review
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updatePreOpReviewSchema.parse(body);

    // Check if review exists
    const existingReview = await prisma.preOperativeAnestheticReview.findUnique({
      where: { id: params.id },
    });

    if (!existingReview) {
      return NextResponse.json(
        { error: 'Pre-op review not found' },
        { status: 404 }
      );
    }

    const conflict = detectConflict(request, existingReview, 'pre-op review');
    if (conflict) return conflict;

    // ── The review cannot end without a decision ────────────────────────────
    // Enforced on the way to COMPLETED rather than on every save, because a
    // review is written over several saves and blocking the intermediate ones
    // would just teach people to fill the field with anything early.
    const { optimisationRequirements, ...reviewFields } = validatedData;
    const finishing = validatedData.status === 'COMPLETED' || validatedData.status === 'APPROVED';
    const decision = validatedData.fitnessDecision ?? existingReview.fitnessDecision ?? null;

    if (finishing) {
      const verdict = canCompleteReview({
        decision: decision as 'FIT' | 'NOT_FIT' | null,
        // Requirements sent with this request, or the ones already stored —
        // a review completed in a second call must not be judged as though it
        // had none.
        requirements: optimisationRequirements ?? await prisma.anaestheticOptimisationRequirement.findMany({
          where: { reviewId: params.id },
          select: { category: true, action: true, status: true },
        }),
        reviewerId: existingReview.anesthetistId,
      });
      if (!verdict.ok) {
        return NextResponse.json(
          { error: verdict.problems[0], problems: verdict.problems },
          { status: 422 },
        );
      }
    }

    // Only an anaesthetist may move the fitness decision. The people most
    // motivated to get a case moving are exactly the ones who must not be able
    // to overrule it.
    const changingDecision = validatedData.fitnessDecision
      && validatedData.fitnessDecision !== existingReview.fitnessDecision;
    if (changingDecision && !canDeclareFit({ role: (session.user as { role?: string }).role })) {
      return NextResponse.json(
        { error: 'Only an anaesthetist may record or change fitness for the proposed anaesthesia.' },
        { status: 403 },
      );
    }

    // Update review
    const updatedReview = await prisma.preOperativeAnestheticReview.update({
      where: { id: params.id },
      data: {
        ...reviewFields,
        ...(changingDecision
          ? {
              fitnessDecidedAt: new Date(),
              fitnessDecidedById: (session.user as { id?: string }).id ?? null,
              // Moving from NOT_FIT to FIT is a reassessment, and is stamped as
              // one. Without this the flag could be lifted with nothing
              // recording that a person looked at the patient again.
              ...(existingReview.fitnessDecision === 'NOT_FIT' && validatedData.fitnessDecision === 'FIT'
                ? {
                    reassessedAt: new Date(),
                    reassessedById: (session.user as { id?: string }).id ?? null,
                  }
                : {}),
            }
          : {}),
        lastOralIntake: validatedData.lastOralIntake
          ? new Date(validatedData.lastOralIntake)
          : undefined,
        consultantName: validatedData.consultantAnesthetistId
          ? (await prisma.user.findUnique({
              where: { id: validatedData.consultantAnesthetistId },
            }))?.fullName
          : undefined,
      },
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
        consultantAnesthetist: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    // Requirements arriving with this request are CREATED, never used to
    // replace the stored set. Deleting the ones already there to make the list
    // match would destroy the record of a requirement that was raised and then
    // reconsidered — and the status field exists precisely so a requirement
    // that stops being relevant can be closed rather than erased. The form
    // therefore sends only what has been newly added.
    if (optimisationRequirements?.length) {
      await prisma.anaestheticOptimisationRequirement.createMany({
        data: optimisationRequirements.map((r) => ({
          reviewId: params.id,
          surgeryId: existingReview.surgeryId,
          patientId: existingReview.patientId,
          category: r.category,
          action: r.action,
          responsible: r.responsible ?? null,
          targetCompletion: r.targetCompletion ? new Date(r.targetCompletion) : null,
          priority: r.priority,
          raisedById: (session.user as { id?: string }).id ?? existingReview.anesthetistId,
        })),
      });
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'PreOperativeAnestheticReview',
        recordId: updatedReview.id,
        changes: JSON.stringify({
          before: existingReview,
          after: updatedReview,
        }),
      },
    });

    return NextResponse.json(updatedReview);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error updating pre-op review:', error);
    return NextResponse.json(
      { error: 'Failed to update pre-op review' },
      { status: 500 }
    );
  }
}

// DELETE - Delete pre-op review
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has permission
    if (!['ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const review = await prisma.preOperativeAnestheticReview.delete({
      where: { id: params.id },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        tableName: 'PreOperativeAnestheticReview',
        recordId: params.id,
        changes: JSON.stringify(review),
      },
    });

    return NextResponse.json({ message: 'Pre-op review deleted successfully' });
  } catch (error) {
    console.error('Error deleting pre-op review:', error);
    return NextResponse.json(
      { error: 'Failed to delete pre-op review' },
      { status: 500 }
    );
  }
}
