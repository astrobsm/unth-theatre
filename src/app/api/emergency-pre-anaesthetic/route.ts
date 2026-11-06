import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { generateUniqueEmergencyAnaesthesiaCode } from '@/lib/surgeryCodes';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';
import {
  OPTIMISATION_CATEGORIES, canCompleteReview, type OptimisationRequirement,
} from '@/lib/anaesthesia/fitness';
import {
  adviceNotificationLine, buildSurgeonFitnessAdvice,
} from '@/lib/emergency/fitnessAdvice';

export const dynamic = 'force-dynamic';

const createReviewSchema = z.object({
  emergencyBookingId: z.string(),
  patientName: z.string(),
  folderNumber: z.string(),
  surgeryId: z.string().optional(),
  // Assessment
  airwayAssessment: z.string().optional(),
  asaClassification: z.string().optional(),
  allergies: z.string().optional(),
  currentMedications: z.string().optional(),
  pastMedicalHistory: z.string().optional(),
  lastMealTime: z.string().optional(),
  // Vitals
  bloodPressure: z.string().optional(),
  heartRate: z.number().optional(),
  oxygenSaturation: z.number().optional(),
  temperature: z.number().optional(),
  // Weight, height, estimated blood loss and coagulation status were dropped
  // from this form: nobody weighs or measures a patient being resuscitated, and
  // the two haematology fields duplicated the lab workup. The DB columns remain
  // so historical reviews keep their values.
  // Emergency-specific
  hemoglobinLevel: z.number().optional(),
  crossMatchStatus: z.string().optional(),
  ivAccess: z.string().optional(),
  patientNPOStatus: z.string().optional(),
  // Plan
  anaestheticPlan: z.string().optional(),
  specialConsiderations: z.string().optional(),
  riskAssessment: z.string().optional(),
  /**
   * WAS BEING SILENTLY DISCARDED. The form has had a box headed "What needs
   * to be optimised before surgery" for as long as it has had two steps, and
   * the anaesthetist's answer never reached the database: zod strips keys it
   * does not declare, and this one was not declared. Anybody who typed in it
   * was typing into a void.
   */
  optimisationNeeded: z.string().max(4000).optional(),
  /** Fit for the proposed anaesthesia, now. The same two values as elective. */
  fitnessDecision: z.enum(['FIT', 'NOT_FIT']).optional(),
  /** What must be done to make an unfit patient fit. Required when NOT_FIT. */
  optimisationRequirements: z.array(z.object({
    category: z.enum(OPTIMISATION_CATEGORIES),
    action: z.string().min(1).max(2000),
    responsible: z.string().max(200).nullish(),
    targetCompletion: z.string().nullish(),
    priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  })).optional(),
  consentObtained: z.boolean().default(false),
  consentNotes: z.string().optional(),
  // Prescription
  medications: z.string().optional(), // JSON array
  fluids: z.string().optional(),
  emergencyDrugs: z.string().optional(),
  specialInstructions: z.string().optional(),
  // Anaesthesia pack consumables, chosen from the technique's packs exactly as
  // on the elective review. Routed to the Consumable Pack Provider; the pack's
  // PHARMACY items arrive folded into `medications` above, so they reach the
  // pharmacy through the emergency prescription like every other drug here.
  consumableRequests: z
    .array(
      z.object({
        name: z.string(),
        category: z.string(),
        size: z.string().nullish(),
        unit: z.string().optional(),
        quantity: z.number().optional(),
        notes: z.string().optional(),
      }),
    )
    .optional(),
});

// GET - Fetch reviews for a booking
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('bookingId');

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
    }

    const reviews = await prisma.emergencyPreAnaestheticReview.findMany({
      where: { emergencyBookingId: bookingId },
      include: {
        reviewer: { select: { id: true, fullName: true, role: true } },
        approvedBy: { select: { id: true, fullName: true, role: true } },
        prescriptions: {
          include: {
            packedBy: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(reviews);
  } catch (error) {
    console.error('Error fetching emergency reviews:', error);
    return NextResponse.json([], { status: 200 });
  }
}

// POST - Create pre-anaesthetic review + auto-create emergency prescription
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only anaesthetists and admins can create reviews
    if (!['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only anaesthetists can perform pre-anaesthetic reviews' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data = createReviewSchema.parse(body);

    // THE DECISION IS MANDATORY, and checked here as well as in the form.
    //
    // The same gate the elective review uses, so the two cannot drift: a
    // decision, and — when the answer is NOT_FIT — at least one requirement
    // with an instruction in it. "Not fit" with nothing to do is a dead end;
    // somebody has to know what would change the answer, or the case simply
    // stalls with no owner.
    const requirements: OptimisationRequirement[] = (data.optimisationRequirements ?? [])
      .map((r) => ({
        category: r.category,
        action: r.action,
        responsible: r.responsible ?? null,
        targetCompletion: r.targetCompletion ?? null,
        priority: r.priority ?? 'MEDIUM',
      }));

    const gate = canCompleteReview({
      decision: data.fitnessDecision ?? null,
      requirements,
      reviewerId: session.user.id,
    });
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.problems.join(' '), details: gate.problems },
        { status: 400 },
      );
    }

    const decidedAt = new Date();

    // Create the review
    const review = await prisma.emergencyPreAnaestheticReview.create({
      data: {
        emergencyBookingId: data.emergencyBookingId,
        surgeryId: data.surgeryId,
        patientName: data.patientName,
        folderNumber: data.folderNumber,
        reviewerId: session.user.id,
        reviewerName: session.user.name || '',
        airwayAssessment: data.airwayAssessment,
        asaClassification: data.asaClassification,
        allergies: data.allergies,
        currentMedications: data.currentMedications,
        pastMedicalHistory: data.pastMedicalHistory,
        lastMealTime: data.lastMealTime ? new Date(data.lastMealTime) : null,
        bloodPressure: data.bloodPressure,
        heartRate: data.heartRate,
        oxygenSaturation: data.oxygenSaturation,
        temperature: data.temperature,
        hemoglobinLevel: data.hemoglobinLevel,
        crossMatchStatus: data.crossMatchStatus,
        ivAccess: data.ivAccess,
        patientNPOStatus: data.patientNPOStatus,
        anaestheticPlan: data.anaestheticPlan,
        specialConsiderations: data.specialConsiderations,
        riskAssessment: data.riskAssessment,
        optimisationNeeded: data.optimisationNeeded,
        fitnessDecision: data.fitnessDecision,
        fitnessDecidedAt: decidedAt,
        fitnessDecidedById: session.user.id,
        optimisationPlan: requirements.length > 0 ? JSON.stringify(requirements) : null,
        consentObtained: data.consentObtained,
        consentNotes: data.consentNotes,
        status: 'COMPLETED',
      },
    });

    // Auto-create emergency prescription if medications provided
    let prescription = null;
    if (data.medications) {
      prescription = await prisma.emergencyPrescription.create({
        data: {
          reviewId: review.id,
          emergencyBookingId: data.emergencyBookingId,
          patientName: data.patientName,
          folderNumber: data.folderNumber,
          prescribedByName: session.user.name || '',
          medications: data.medications,
          fluids: data.fluids,
          emergencyDrugs: data.emergencyDrugs,
          allergyAlerts: data.allergies,
          specialInstructions: data.specialInstructions,
          isEmergency: true,
          status: 'SUBMITTED',
          anaesthesiaDrugCode: await generateUniqueEmergencyAnaesthesiaCode(prisma),
        },
      });

      // Notify pharmacists — create notification for all pharmacists
      try {
        const pharmacists = await prisma.user.findMany({
          where: { role: 'PHARMACIST', status: 'APPROVED' },
          select: { id: true },
        });

        if (pharmacists.length > 0) {
          await prisma.notification.createMany({
            data: pharmacists.map((p) => ({
              userId: p.id,
              title: '🚨 EMERGENCY Prescription',
              message: `Emergency prescription for ${data.patientName} (${data.folderNumber}) requires IMMEDIATE dispensing. Review and pack medications now.`,
              type: 'EMERGENCY',
              link: `/dashboard/prescriptions?bookingId=${data.emergencyBookingId}`,
            })),
          });
        }
      } catch (e) {
        // Notification failure shouldn't block the review
        console.error('Failed to notify pharmacists:', e);
      }
    }

    /**
     * Anaesthesia pack consumables → Consumable Pack Provider.
     *
     * Same routing as the elective pre-anaesthetic review, so a technique's
     * pack produces the same requests whether the case is booked electively or
     * as an emergency — flagged EMERGENCY so it is packed first.
     *
     * Needs a surgeryId to hang the request on; an emergency review taken
     * before the surgery record exists simply has nowhere to put it.
     */
    if (data.consumableRequests?.length && data.surgeryId) {
      const CONS_CATEGORIES = new Set([
        'GLOVES', 'GOWNS_DRAPES', 'SUTURES', 'SYRINGES_NEEDLES', 'CATHETERS_TUBING',
        'DRESSING_PACKS', 'SKIN_PREP', 'CLEANING_SOLUTION', 'STERILE_DRESSINGS',
        'IRRIGATION', 'DIATHERMY', 'SUCTION', 'ANAESTHESIA_AIRWAY', 'PPE', 'OTHER',
      ]);
      await prisma.surgeryConsumableRequest.createMany({
        data: data.consumableRequests.map((c) => ({
          surgeryId: data.surgeryId!,
          name: c.name,
          category: (CONS_CATEGORIES.has(c.category) ? c.category : 'ANAESTHESIA_AIRWAY') as any,
          size: c.size ?? null,
          unit: c.unit ?? 'piece',
          quantity: c.quantity ?? 1,
          notes: c.notes ?? 'Anaesthesia pack (EMERGENCY)',
          requestedById: session.user.id,
          requestedByName: session.user.name || '',
        })),
      });
      try {
        const providers = await prisma.user.findMany({
          where: {
            role: { in: ['CONSUMABLE_PACK_PROVIDER', 'THEATRE_STORE_KEEPER', 'ADMIN'] as any },
            status: 'APPROVED' as any,
          },
          select: { id: true },
        });
        if (providers.length) {
          await prisma.notification.createMany({
            data: providers.map((u) => ({
              userId: u.id,
              type: 'EMERGENCY' as any,
              title: '🚨 EMERGENCY anaesthesia consumables',
              message: `${data.consumableRequests!.length} anaesthesia consumable(s) needed NOW for ${data.patientName} (${data.folderNumber}).`,
              link: '/dashboard/consumable-pack-provider',
            })),
          });
        }
      } catch (e) {
        // A failed notification must not lose the request that was written.
        console.error('Failed to notify consumable pack providers:', e);
      }
    }

    /**
     * TELL THE SURGEON.
     *
     * The decision is useless sitting in a row. The surgeon is standing
     * somewhere waiting to know whether to send for the patient, and until
     * now the answer reached them only if the anaesthetist happened to find
     * them in person.
     *
     * Both answers are sent, because silence is the thing this change
     * exists to end: FIT is four lines saying nothing is waiting on
     * anaesthesia, NOT_FIT carries the list and asks for optimisation and
     * re-listing.
     *
     * Never throws. The review is already written, and a saved review that
     * answers 500 is entered twice by an anaesthetist who thinks it failed.
     */
    let advice: { text: string; whatsapp: { name: string; number: string } | null } | null = null;
    let adviceSkipped: string | null = null;
    try {
      const booking = await prisma.emergencySurgeryBooking.findUnique({
        where: { id: data.emergencyBookingId },
        select: {
          procedureName: true, theatreName: true, surgeonId: true, surgeonName: true,
          surgeon: { select: { id: true, fullName: true, phoneNumber: true } },
        },
      });

      const decision = data.fitnessDecision as 'FIT' | 'NOT_FIT';
      const text = buildSurgeonFitnessAdvice({
        decision,
        requirements,
        facts: {
          patientName: data.patientName,
          folderNumber: data.folderNumber,
          procedureName: booking?.procedureName ?? 'this emergency',
          theatreName: booking?.theatreName ?? null,
          surgeonName: booking?.surgeonName ?? null,
          reviewerName: session.user.name || 'The anaesthetist',
          anaestheticPlan: data.anaestheticPlan ?? null,
          optimisationNeeded: data.optimisationNeeded ?? null,
          riskAssessment: data.riskAssessment ?? null,
          at: decidedAt,
        },
      });

      // The bell first: it is the channel that is certain to arrive.
      const line = adviceNotificationLine(
        decision, requirements, session.user.name || 'The anaesthetist',
      );
      const recipients = new Set<string>();
      if (booking?.surgeon?.id) recipients.add(booking.surgeon.id);
      // The theatre manager too when the patient is not fit: somebody has to
      // know the room is not about to be used, and it is not the surgeon's
      // job to tell them while they are arranging blood.
      if (decision === 'NOT_FIT') {
        const managers = await prisma.user.findMany({
          where: {
            status: 'APPROVED' as any,
            role: { in: ['THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR'] as any },
          },
          select: { id: true },
        });
        managers.forEach((m) => recipients.add(m.id));
      }

      if (recipients.size > 0) {
        await prisma.notification.createMany({
          data: Array.from(recipients).map((userId) => ({
            userId,
            type: 'EMERGENCY_FITNESS_DECISION',
            title: decision === 'FIT'
              ? `✅ Fit for anaesthesia — ${data.patientName}`
              : `⛔ NOT fit for anaesthesia — ${data.patientName}`,
            message: line,
            link: '/dashboard/emergency-booking',
          })),
        });
      }

      const wa = booking?.surgeon?.phoneNumber
        ? toWhatsAppNumber(booking.surgeon.phoneNumber)
        : null;
      if (booking?.surgeon?.id) {
        try {
          await queueMessage({
            channel: 'WHATSAPP' as never,
            priority: (decision === 'NOT_FIT' ? 'URGENT' : 'HIGH') as never,
            recipientUserId: booking.surgeon.id,
            recipientName: booking.surgeon.fullName,
            recipientAddress: wa,
            recipientIsStaff: true,
            body: text,
            relatedType: 'EMERGENCY_BOOKING',
            relatedId: data.emergencyBookingId,
            trigger: 'EMERGENCY_FITNESS_ADVICE',
            scope: `${review.id}:${booking.surgeon.id}`,
            createdById: session.user.id,
            createdByName: session.user.name || '',
          });
        } catch (e) {
          console.error('[emergency-pre-anaesthetic] advice queue failed:', e);
        }
      } else {
        adviceSkipped = 'No surgeon is recorded on this booking, so nobody was advised.';
      }
      if (booking?.surgeon?.id && !wa) {
        adviceSkipped = `${booking.surgeon.fullName} has no phone number on file — advised in the app only.`;
      }

      // THE QUEUE IS NOT A DELIVERY: the hand-off is what reaches a phone.
      advice = {
        text,
        whatsapp: wa && booking?.surgeon
          ? { name: booking.surgeon.fullName, number: wa }
          : null,
      };

      await prisma.emergencyPreAnaestheticReview.update({
        where: { id: review.id },
        data: { surgeonAdvisedAt: new Date(), surgeonAdviceText: text },
      });
    } catch (e) {
      console.error('[emergency-pre-anaesthetic] could not advise the surgeon:', e);
      adviceSkipped = 'The review was saved, but the surgeon could not be advised automatically. Tell them directly.';
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'EmergencyPreAnaestheticReview',
        recordId: review.id,
        changes: JSON.stringify({
          bookingId: data.emergencyBookingId,
          patient: data.patientName,
          hasPrescription: !!prescription,
          fitnessDecision: data.fitnessDecision,
          requirements: requirements.map((r) => `${r.category}: ${r.action}`),
          surgeonAdvised: Boolean(advice),
        }),
      },
    });

    return NextResponse.json({
      review, prescription, advice, adviceSkipped,
      fitnessDecision: data.fitnessDecision,
      requirements,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error creating emergency review:', error);
    return NextResponse.json({ error: 'Failed to create review' }, { status: 500 });
  }
}
