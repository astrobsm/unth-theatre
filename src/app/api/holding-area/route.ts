import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { triggerRadio, speak3 } from '@/lib/radioEvents';
import { MIN_OVERRIDE_REASON } from '@/lib/preopRequirements';
import { jsonWithETag } from '@/lib/etag';

export const dynamic = 'force-dynamic';

// GET - Get all holding area assessments (with filters)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const active = searchParams.get('active') === 'true';
    const dateParam = searchParams.get('date'); // YYYY-MM-DD; defaults to today

    const where: any = {};
    
    if (status) {
      where.status = status;
    }

    if (active) {
      where.status = {
        in: ['ARRIVED', 'VERIFICATION_IN_PROGRESS', 'DISCREPANCY_FOUND', 'RED_ALERT_ACTIVE', 'CLEARED_FOR_THEATRE', 'ENROUTE_TO_THEATRE']
      };
    }

    // Scope to a single day by arrival time. Default to today's admissions so the
    // page is not flooded with every historical record; selecting a date loads
    // previous days. Pass date=all to skip the day filter entirely.
    if (dateParam !== 'all') {
      const day = dateParam ? new Date(dateParam) : new Date();
      const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
      where.arrivalTime = { gte: dayStart, lte: dayEnd };
    }

    const assessments = await prisma.holdingAreaAssessment.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            folderNumber: true,
            name: true,
            age: true,
            gender: true,
            ward: true
          }
        },
        surgery: {
          select: {
            id: true,
            procedureName: true,
            scheduledDate: true,
            scheduledTime: true,
            status: true,
            surgeonId: true,
            surgeon: {
              select: {
                fullName: true,
                email: true
              }
            }
          }
        },
        redAlerts: {
          where: {
            resolved: false
          },
          orderBy: {
            triggeredAt: 'desc'
          }
        }
      },
      orderBy: {
        arrivalTime: 'desc'
      }
    });

    // ETag/304: unchanged holding-area list replies 304 (empty body).
    return jsonWithETag(request, assessments);
  } catch (error) {
    console.error('Error fetching holding area assessments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assessments' },
      { status: 500 }
    );
  }
}

// POST - Create new holding area assessment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only authorized staff can create assessments
    if (session.user.role !== 'SCRUB_NURSE' &&
        session.user.role !== 'ANAESTHETIST' &&
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden - Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { surgeryId, patientId, consentDeferralReason } = body;

    // Check if assessment already exists for this surgery
    const existing = await prisma.holdingAreaAssessment.findUnique({
      where: { surgeryId }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Assessment already exists for this surgery' },
        { status: 400 }
      );
    }

    // ── The consent gate ───────────────────────────────────────────────────
    //
    // Booking no longer requires consent, and this is where that requirement
    // went. It did not disappear: it moved to the morning, to the one moment
    // when the patient is actually present and a consent can genuinely be
    // taken, and to the one person who can see whether it has been.
    //
    // The reason it is here rather than at booking: a patient who is not yet
    // on the ward, with a folder still being processed, cannot be consented on
    // the day the slot is requested. Refusing the booking until they can be
    // did not produce consents — over two months it produced 390 cases with
    // none on record, 66 of which reached a completed operation.
    //
    // NOT a hard stop, deliberately. A nurse with a patient at the door must
    // never be left unable to act, so a named reason lets her proceed and puts
    // the deferral on the record instead of into somebody's memory. What she
    // cannot do is admit the patient without noticing.
    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      select: {
        consentFileData: true,
        consentSignedElectronically: true,
        consentCompletedAt: true,
        patient: { select: { name: true } },
        // A nurse confirming at the pre-operative visit that the signed form is
        // in the folder is the third way consent genuinely exists here, and the
        // commonest: most consent is signed on the ward and stays on paper.
        // Only the newest visit counts — an OBTAINED recorded before a later
        // visit found it missing must not outvote the later one.
        preOperativeVisits: {
          select: { consentStatus: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const hasConsent = Boolean(
      surgery?.consentFileData ||
      surgery?.consentSignedElectronically ||
      surgery?.consentCompletedAt ||
      surgery?.preOperativeVisits?.[0]?.consentStatus === 'OBTAINED',
    );
    const reason = String(consentDeferralReason ?? '').trim();

    if (!hasConsent && reason.length < MIN_OVERRIDE_REASON) {
      return NextResponse.json(
        {
          error:
            `There is no signed consent on record for ${surgery?.patient?.name ?? 'this patient'}. ` +
            'It must be uploaded before the patient goes through to theatre — a photograph of the ' +
            'signed paper form is enough. If the patient must be received now, give the clinical ' +
            'reason and it will be recorded against the case in your name.',
          code: 'CONSENT_REQUIRED',
          // Tells the screen to offer the reason box rather than simply refuse.
          consentDeferralAvailable: true,
        },
        { status: 400 },
      );
    }

    // Create assessment with proper relations and initialize status
    const assessment = await prisma.holdingAreaAssessment.create({
      data: {
        surgery: {
          connect: { id: surgeryId }
        },
        patient: {
          connect: { id: patientId }
        },
        receivedBy: session.user.id,
        status: 'ARRIVED',
        // Initialize all safety checks to false
        patientIdentityConfirmed: false,
        surgicalSiteMarked: false,
        surgicalSiteConfirmed: false,
        procedureConfirmed: false,
        consentFormPresent: hasConsent,
        consentFormSigned: false,
        consentUnderstandingConfirmed: false,
        // A patient received without consent on record is marked as such, in
        // the receiving nurse's name, at the moment it happens. Reconstructing
        // this afterwards is exactly what cannot be done.
        consentNotSigned: !hasConsent,
        ...(hasConsent
          ? {}
          : {
              consentRemarks:
                `Received without consent on record. Reason given by ` +
                `${(session.user as { name?: string }).name ?? 'receiving staff'}: ${reason}`,
            }),
        allergyStatusChecked: false,
        hasAllergies: false,
        fastingStatusChecked: false,
        fastingCompliant: false,
        vitalSignsNormal: false,
        preOpAssessmentPresent: false,
        labResultsPresent: false,
        anesthesiaAssessmentPresent: false,
        medicationChartPresent: false,
        allDocumentationComplete: false,
        preMedicationGiven: false,
        ivAccessEstablished: false,
        discrepancyDetected: false,
        redAlertTriggered: false,
        clearedForTheatre: false
      },
      include: {
        patient: true,
        surgery: {
          include: {
            surgeon: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            }
          }
        }
      }
    });

    // Update surgery status to indicate patient is in holding area
    await prisma.surgery.update({
      where: { id: surgeryId },
      data: { status: 'IN_HOLDING_AREA' }
    });

    // Theatre radio: announce arrival at the holding area (spoken three times).
    const patientName = assessment.patient?.name || 'patient';
    const procedure = assessment.surgery?.procedureName || 'surgery';
    const arrivalMsg = `Patient ${patientName} has arrived in the holding area for ${procedure}. Holding area team, please commence verification.`;
    await triggerRadio({
      category: 'WORKFLOW',
      title: `Holding area arrival — ${patientName}`,
      message: speak3(arrivalMsg),
      priority: 72,
      urgency: 'MEDIUM',
      triggeredById: session.user.id,
      metadata: { source: 'HoldingArea.arrival', surgeryId, kind: 'holding_arrival', tripleRepeat: true },
    });

    return NextResponse.json(assessment, { status: 201 });
  } catch (error: any) {
    console.error('Error creating holding area assessment:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: 'Failed to create assessment', details: error.message },
      { status: 500 }
    );
  }
}
