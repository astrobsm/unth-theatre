import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - Get specific PACU assessment
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const assessment = await prisma.pACUAssessment.findUnique({
      where: { id: params.id },
      include: {
        patient: true,
        surgery: {
          include: {
            surgeon: true,
            anesthetist: true
          }
        },
        vitalSigns: {
          orderBy: {
            recordedAt: 'desc'
          }
        },
        redAlerts: {
          orderBy: {
            triggeredAt: 'desc'
          }
        }
      }
    });

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    return NextResponse.json(assessment);
  } catch (error) {
    console.error('Error fetching PACU assessment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assessment' },
      { status: 500 }
    );
  }
}

// PUT - Update PACU assessment
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only recovery room nurses can update
    if (session.user.role !== 'RECOVERY_ROOM_NURSE' && 
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Map alternate field names the client form uses to the actual schema columns.
    if (body.oxygenSupport !== undefined && body.oxygenTherapy === undefined) {
      body.oxygenTherapy = body.oxygenSupport;
    }
    if (body.oxygenLitersPerMinute !== undefined && body.oxygenFlowRate === undefined) {
      body.oxygenFlowRate = body.oxygenLitersPerMinute;
    }
    if (body.breathingSpontaneous !== undefined && body.breathingPattern === undefined) {
      body.breathingPattern = body.breathingSpontaneous ? 'Spontaneous' : 'Assisted';
    }

    // Check for conditions requiring red alert
    const shouldTriggerAlert = 
      body.consciousnessLevel === 'UNRESPONSIVE' ||
      body.airwayStatus === 'COMPROMISED' ||
      (body.painScore && body.painScore > 8) ||
      body.complicationsDetected === true;

    // Whitelist only the scalar columns that belong to PACUAssessment. The
    // client often posts back the full object (including relations like
    // patient/surgery/vitalSigns, the id and timestamps); spreading those into
    // prisma.update throws "Unknown arg" and produces a 500.
    const ALLOWED_FIELDS = [
      'admissionTime', 'receivedBy', 'handoverFrom',
      'consciousnessLevel', 'airwayStatus', 'breathingPattern', 'oxygenTherapy', 'oxygenFlowRate',
      'heartRateOnAdmission', 'bloodPressureOnAdmission', 'peripheralPerfusion', 'capillaryRefillTime',
      'painScoreOnAdmission', 'painLocation', 'painManagedAdequately',
      'surgicalSiteCondition', 'dressingIntact', 'drainsPresent', 'drainType', 'drainOutput',
      'ivFluidsRunning', 'fluidType', 'fluidRate', 'urineOutput', 'catheterInSitu',
      'temperatureOnAdmission', 'normothermic', 'warmingMeasures',
      'nauseaPresent', 'vomitingOccurred', 'antiemeticsGiven',
      'complicationsDetected', 'complicationDetails',
      'redAlertTriggered', 'redAlertType', 'redAlertDescription', 'redAlertTime',
      'redAlertResolvedBy', 'redAlertResolvedAt',
      'dischargeReadiness', 'dischargeTime', 'dischargedTo',
      'dischargeVitalsStable', 'dischargePainControlled', 'dischargeFullyConscious', 'dischargeNauseaFree',
      'medicationsGivenInPACU', 'totalTimeInPACU', 'dischargeNotes', 'warningSignsExplained', 'wardNurseHandover',
    ] as const;

    // Enum columns must not receive empty strings (Prisma throws and returns 500).
    const ENUM_FIELDS = new Set(['consciousnessLevel', 'airwayStatus', 'redAlertType', 'dischargeReadiness']);
    // Integer columns – coerce and drop NaN.
    const INT_FIELDS = new Set(['heartRateOnAdmission', 'painScoreOnAdmission', 'urineOutput', 'totalTimeInPACU']);
    // Decimal columns – coerce to number.
    const FLOAT_FIELDS = new Set(['oxygenFlowRate', 'temperatureOnAdmission']);

    const updateData: any = {};
    for (const key of ALLOWED_FIELDS) {
      const value = body[key];
      if (value === undefined) continue;
      if (ENUM_FIELDS.has(key)) {
        if (value === '' || value === null) continue;
        updateData[key] = value;
      } else if (INT_FIELDS.has(key)) {
        if (value === '' || value === null) continue;
        const n = typeof value === 'number' ? value : parseInt(String(value), 10);
        if (Number.isFinite(n)) updateData[key] = n;
      } else if (FLOAT_FIELDS.has(key)) {
        if (value === '' || value === null) continue;
        const n = typeof value === 'number' ? value : parseFloat(String(value));
        if (Number.isFinite(n)) updateData[key] = n;
      } else {
        updateData[key] = value;
      }
    }

    if (shouldTriggerAlert && !body.redAlertTriggered) {
      updateData.complicationsDetected = true;
    }

    const assessment = await prisma.pACUAssessment.update({
      where: { id: params.id },
      data: updateData,
      include: {
        patient: true,
        surgery: {
          include: {
            surgeon: true,
            anesthetist: true
          }
        },
        vitalSigns: {
          orderBy: {
            recordedAt: 'desc'
          },
          take: 10
        },
        redAlerts: true
      }
    });

    return NextResponse.json(assessment);
  } catch (error) {
    console.error('Error updating PACU assessment:', error);
    return NextResponse.json(
      { error: 'Failed to update assessment' },
      { status: 500 }
    );
  }
}
