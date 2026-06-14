import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST - Record vital signs
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only recovery room nurses can record vitals
    if (session.user.role !== 'RECOVERY_ROOM_NURSE' && 
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // The client form can post fields that don't map 1:1 to the schema
    // (systolicBP/diastolicBP/nauseaScore) and sends numbers that may arrive as
    // strings/NaN. Build a clean, type-correct payload to avoid Prisma "Unknown
    // argument" / type errors that surface as a 500.
    const toInt = (v: any): number | undefined => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = typeof v === 'number' ? v : parseInt(String(v), 10);
      return Number.isFinite(n) ? n : undefined;
    };
    const toFloat = (v: any): number | undefined => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      return Number.isFinite(n) ? n : undefined;
    };

    // Combine separate systolic/diastolic into the single bloodPressure column.
    const systolic = toInt(body.systolicBP);
    const diastolic = toInt(body.diastolicBP);
    const bloodPressure =
      body.bloodPressure ??
      (systolic !== undefined && diastolic !== undefined ? `${systolic}/${diastolic}` : undefined);

    const nauseaScore = toInt(body.nauseaScore);
    const notesParts: string[] = [];
    if (body.notes) notesParts.push(String(body.notes));
    if (nauseaScore !== undefined) notesParts.push(`Nausea score: ${nauseaScore}/10`);

    const VALID_CONSCIOUSNESS = ['ALERT', 'DROWSY', 'RESPONSIVE_TO_VOICE', 'RESPONSIVE_TO_PAIN', 'UNRESPONSIVE'];

    const vitalsData: any = {
      pacuAssessmentId: params.id,
      recordedBy: session.user.id,
    };
    if (bloodPressure !== undefined) vitalsData.bloodPressure = bloodPressure;
    const heartRate = toInt(body.heartRate);
    if (heartRate !== undefined) vitalsData.heartRate = heartRate;
    const respiratoryRate = toInt(body.respiratoryRate);
    if (respiratoryRate !== undefined) vitalsData.respiratoryRate = respiratoryRate;
    const oxygenSaturation = toInt(body.oxygenSaturation);
    if (oxygenSaturation !== undefined) vitalsData.oxygenSaturation = oxygenSaturation;
    const temperature = toFloat(body.temperature);
    if (temperature !== undefined) vitalsData.temperature = temperature;
    const painScore = toInt(body.painScore);
    if (painScore !== undefined) vitalsData.painScore = painScore;
    if (body.consciousnessLevel && VALID_CONSCIOUSNESS.includes(body.consciousnessLevel)) {
      vitalsData.consciousnessLevel = body.consciousnessLevel;
    }
    if (notesParts.length) vitalsData.notes = notesParts.join(' | ');
    if (typeof body.interventionRequired === 'boolean') vitalsData.interventionRequired = body.interventionRequired;
    if (body.interventionDetails) vitalsData.interventionDetails = String(body.interventionDetails);

    const vitalSigns = await prisma.pACUVitalSigns.create({
      data: vitalsData,
    });

    // Check if vital signs are abnormal and trigger alert if needed
    const abnormalVitals = 
      (heartRate !== undefined && (heartRate < 50 || heartRate > 120)) ||
      (oxygenSaturation !== undefined && oxygenSaturation < 92) ||
      (vitalsData.consciousnessLevel === 'UNRESPONSIVE') ||
      (painScore !== undefined && painScore > 8);

    if (abnormalVitals) {
      // Get assessment details
      const assessment = await prisma.pACUAssessment.findUnique({
        where: { id: params.id },
        include: {
          patient: true,
          surgery: {
            include: {
              surgeon: true,
              anesthetist: true
            }
          }
        }
      });

      if (assessment) {
        let alertDescription = 'Abnormal vital signs detected: ';
        if (heartRate !== undefined && (heartRate < 50 || heartRate > 120)) {
          alertDescription += `HR ${heartRate}bpm, `;
        }
        if (oxygenSaturation !== undefined && oxygenSaturation < 92) {
          alertDescription += `SpO2 ${oxygenSaturation}%, `;
        }
        if (painScore !== undefined && painScore > 8) {
          alertDescription += `Severe pain (${painScore}/10), `;
        }

        // Create red alert
        await prisma.pACURedAlert.create({
          data: {
            pacuAssessmentId: params.id,
            alertType: 'ABNORMAL_VITALS',
            description: alertDescription,
            severity: 'HIGH',
            triggeredBy: session.user.id,
            surgeonNotified: true,
            anesthetistNotified: true,
            notificationsSentAt: new Date()
          }
        });

        // Update assessment
        await prisma.pACUAssessment.update({
          where: { id: params.id },
          data: {
            redAlertTriggered: true,
            redAlertType: 'ABNORMAL_VITALS',
            redAlertDescription: alertDescription,
            redAlertTime: new Date()
          }
        });

        // Send notifications
        const notifications = [];
        if (assessment.surgery.surgeonId) {
          notifications.push(
            prisma.systemNotification.create({
              data: {
                userId: assessment.surgery.surgeonId,
                type: 'RED_ALERT',
                title: 'PACU Red Alert: Abnormal Vitals',
                message: `Patient ${assessment.patient.name} - ${alertDescription}`,
                priority: 'HIGH',
                actionUrl: `/dashboard/pacu/${params.id}`
              }
            })
          );
        }

        if (assessment.surgery.anesthetistId) {
          notifications.push(
            prisma.systemNotification.create({
              data: {
                userId: assessment.surgery.anesthetistId,
                type: 'RED_ALERT',
                title: 'PACU Red Alert: Abnormal Vitals',
                message: `Patient ${assessment.patient.name} - ${alertDescription}`,
                priority: 'HIGH',
                actionUrl: `/dashboard/pacu/${params.id}`
              }
            })
          );
        }

        await Promise.all(notifications);
      }
    }

    return NextResponse.json({
      vitalSigns,
      alert: abnormalVitals ? 'Red alert triggered for abnormal vitals' : null
    }, { status: 201 });

  } catch (error) {
    console.error('Error recording vital signs:', error);
    return NextResponse.json(
      { error: 'Failed to record vital signs' },
      { status: 500 }
    );
  }
}

// GET - Get all vital signs for assessment
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const vitalSigns = await prisma.pACUVitalSigns.findMany({
      where: { pacuAssessmentId: params.id },
      orderBy: {
        recordedAt: 'desc'
      }
    });

    return NextResponse.json(vitalSigns);
  } catch (error) {
    console.error('Error fetching vital signs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vital signs' },
      { status: 500 }
    );
  }
}
