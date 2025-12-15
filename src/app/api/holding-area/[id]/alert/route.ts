import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// POST - Trigger red alert for holding area assessment
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only holding area nurses can trigger alerts
    if (session.user.role !== 'SCRUB_NURSE' && 
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { alertType, description, severity = 'HIGH' } = body;

    if (!alertType || !description) {
      return NextResponse.json(
        { error: 'Alert type and description are required' },
        { status: 400 }
      );
    }

    // Get assessment with surgery details
    const assessment = await prisma.holdingAreaAssessment.findUnique({
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

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Create red alert
    const redAlert = await prisma.holdingAreaRedAlert.create({
      data: {
        assessmentId: params.id,
        alertType,
        description,
        severity,
        triggeredBy: session.user.id,
        surgeonNotified: true,
        anesthetistNotified: assessment.surgery.anesthetistId ? true : false,
        coordinatorNotified: true,
        notificationsSentAt: new Date()
      }
    });

    // Update assessment status
    await prisma.holdingAreaAssessment.update({
      where: { id: params.id },
      data: {
        redAlertTriggered: true,
        redAlertType: alertType,
        redAlertDescription: description,
        redAlertTime: new Date(),
        status: 'RED_ALERT_ACTIVE'
      }
    });

    // Create system notifications for relevant users
    const notifications = [];

    // Notify surgeon
    notifications.push(
      prisma.systemNotification.create({
        data: {
          userId: assessment.surgery.surgeonId,
          type: 'RED_ALERT',
          title: `Red Alert: ${alertType}`,
          message: `Holding area red alert for patient ${assessment.patient.name}. ${description}`,
          priority: severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
          actionUrl: `/dashboard/holding-area/${params.id}`
        }
      })
    );

    // Notify anesthetist if assigned
    if (assessment.surgery.anesthetistId) {
      notifications.push(
        prisma.systemNotification.create({
          data: {
            userId: assessment.surgery.anesthetistId,
            type: 'RED_ALERT',
            title: `Red Alert: ${alertType}`,
            message: `Holding area red alert for patient ${assessment.patient.name}. ${description}`,
            priority: severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
            actionUrl: `/dashboard/holding-area/${params.id}`
          }
        })
      );
    }

    // Notify all theatre managers (coordinators role removed)
    const managers = await prisma.user.findMany({
      where: { role: 'THEATRE_MANAGER' }
    });

    for (const manager of managers) {
      notifications.push(
        prisma.systemNotification.create({
          data: {
            userId: manager.id,
            type: 'HOLDING_AREA_ALERT',
            title: `Holding Area Alert: ${alertType}`,
            message: `Red alert triggered for patient ${assessment.patient.name}. ${description}`,
            priority: severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
            actionUrl: `/dashboard/holding-area/${params.id}`
          }
        })
      );
    }

    await Promise.all(notifications);

    return NextResponse.json({
      alert: redAlert,
      message: 'Red alert triggered and notifications sent'
    }, { status: 201 });

  } catch (error) {
    console.error('Error triggering red alert:', error);
    return NextResponse.json(
      { error: 'Failed to trigger red alert' },
      { status: 500 }
    );
  }
}
