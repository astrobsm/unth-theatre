import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

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

    const vitalSigns = await prisma.pACUVitalSigns.create({
      data: {
        pacuAssessmentId: params.id,
        recordedBy: session.user.id,
        ...body
      }
    });

    // Check if vital signs are abnormal and trigger alert if needed
    const abnormalVitals = 
      (body.heartRate && (body.heartRate < 50 || body.heartRate > 120)) ||
      (body.oxygenSaturation && body.oxygenSaturation < 92) ||
      (body.consciousnessLevel && body.consciousnessLevel === 'UNRESPONSIVE') ||
      (body.painScore && body.painScore > 8);

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
        if (body.heartRate && (body.heartRate < 50 || body.heartRate > 120)) {
          alertDescription += `HR ${body.heartRate}bpm, `;
        }
        if (body.oxygenSaturation && body.oxygenSaturation < 92) {
          alertDescription += `SpO2 ${body.oxygenSaturation}%, `;
        }
        if (body.painScore && body.painScore > 8) {
          alertDescription += `Severe pain (${body.painScore}/10), `;
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
