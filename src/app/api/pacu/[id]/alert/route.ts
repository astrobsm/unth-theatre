import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// POST - Trigger PACU red alert
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only recovery room nurses can trigger alerts
    if (session.user.role !== 'RECOVERY_ROOM_NURSE' && 
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

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Create red alert
    const redAlert = await prisma.pACURedAlert.create({
      data: {
        pacuAssessmentId: params.id,
        alertType,
        description,
        severity,
        triggeredBy: session.user.id,
        surgeonNotified: true,
        anesthetistNotified: assessment.surgery.anesthetistId ? true : false,
        wardNotified: true,
        notificationsSentAt: new Date()
      }
    });

    // Update assessment
    await prisma.pACUAssessment.update({
      where: { id: params.id },
      data: {
        redAlertTriggered: true,
        redAlertType: alertType,
        redAlertDescription: description,
        redAlertTime: new Date(),
        complicationsDetected: true,
        complicationDetails: description
      }
    });

    // Create system notifications
    const notifications = [];

    // Notify surgeon
    notifications.push(
      prisma.systemNotification.create({
        data: {
          userId: assessment.surgery.surgeonId,
          type: 'RED_ALERT',
          title: `PACU Red Alert: ${alertType}`,
          message: `Patient ${assessment.patient.name} in recovery - ${description}`,
          priority: severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
          actionUrl: `/dashboard/pacu/${params.id}`
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
            title: `PACU Red Alert: ${alertType}`,
            message: `Patient ${assessment.patient.name} in recovery - ${description}`,
            priority: severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
            actionUrl: `/dashboard/pacu/${params.id}`
          }
        })
      );
    }

    // Notify theatre managers
    const managers = await prisma.user.findMany({
      where: { role: 'THEATRE_MANAGER' }
    });

    for (const manager of managers) {
      notifications.push(
        prisma.systemNotification.create({
          data: {
            userId: manager.id,
            type: 'PACU_ALERT',
            title: `PACU Alert: ${alertType}`,
            message: `Red alert in recovery for ${assessment.patient.name}. ${description}`,
            priority: severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
            actionUrl: `/dashboard/pacu/${params.id}`
          }
        })
      );
    }

    await Promise.all(notifications);

    return NextResponse.json({
      alert: redAlert,
      message: 'PACU red alert triggered and notifications sent'
    }, { status: 201 });

  } catch (error) {
    console.error('Error triggering PACU red alert:', error);
    return NextResponse.json(
      { error: 'Failed to trigger red alert' },
      { status: 500 }
    );
  }
}
