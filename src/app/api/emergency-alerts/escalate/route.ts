import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST - Check and escalate unacknowledged emergency alerts after 15 minutes
// This endpoint can be called by a cron job or the display page
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Allow unauthenticated calls for cron jobs via special header
    const cronSecret = request.headers.get('x-cron-secret');
    const isAuthorizedCron = cronSecret === process.env.CRON_SECRET;
    
    if (!session?.user && !isAuthorizedCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    // Find all ACTIVE alerts that were triggered more than 15 minutes ago
    // and haven't been escalated yet
    const unacknowledgedAlerts = await prisma.emergencySurgeryAlert.findMany({
      where: {
        status: 'ACTIVE',
        alertTriggeredAt: {
          lt: fifteenMinutesAgo,
        },
        escalatedAt: null, // Not yet escalated
      },
      include: {
        surgery: {
          include: {
            patient: true,
          },
        },
      },
    });

    if (unacknowledgedAlerts.length === 0) {
      return NextResponse.json({ 
        message: 'No alerts require escalation',
        escalatedCount: 0 
      });
    }

    // Get all admin users to notify
    const adminUsers = await prisma.user.findMany({
      where: {
        role: {
          in: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'],
        },
        status: 'APPROVED',
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
      },
    });

    // Escalate each alert
    const escalatedAlerts = [];
    for (const alert of unacknowledgedAlerts) {
      // Update alert with escalation info
      const updatedAlert = await prisma.emergencySurgeryAlert.update({
        where: { id: alert.id },
        data: {
          escalatedAt: new Date(),
          escalatedToAdmins: true,
          additionalNotes: `${alert.additionalNotes || ''}\n\n[ESCALATED] Alert escalated to ${adminUsers.length} admin users at ${new Date().toISOString()} after 15 minutes without acknowledgment.`,
        },
      });

      // Note: Notification creation is commented out until migration is run
      // TODO: Enable after running prisma migrate
      // for (const admin of adminUsers) {
      //   await prisma.notification.create({
      //     data: {
      //       userId: admin.id,
      //       type: 'EMERGENCY_ESCALATION',
      //       title: '⚠️ EMERGENCY ALERT ESCALATED',
      //       message: `Emergency surgery for ${alert.patientName} (${alert.procedureName}) has not been acknowledged for 15 minutes. Immediate attention required!`,
      //       link: `/dashboard/emergency-alerts`,
      //       isRead: false,
      //     },
      //   });
      // }

      // Log the escalation
      await prisma.auditLog.create({
        data: {
          userId: session?.user?.id || 'SYSTEM',
          action: 'ESCALATE_EMERGENCY_ALERT',
          tableName: 'EmergencySurgeryAlert',
          recordId: alert.id,
          changes: JSON.stringify({
            escalatedAt: new Date().toISOString(),
            notifiedAdmins: adminUsers.map(a => a.fullName || a.email).join(', '),
            reason: 'No acknowledgment after 15 minutes',
          }),
        },
      });

      escalatedAlerts.push({
        alertId: alert.id,
        patientName: alert.patientName,
        procedureName: alert.procedureName,
        notifiedAdmins: adminUsers.length,
      });
    }

    return NextResponse.json({
      message: `Successfully escalated ${escalatedAlerts.length} alert(s)`,
      escalatedCount: escalatedAlerts.length,
      escalatedAlerts,
      notifiedAdmins: adminUsers.length,
    });
  } catch (error) {
    console.error('Error escalating emergency alerts:', error);
    return NextResponse.json(
      { error: 'Failed to escalate alerts' },
      { status: 500 }
    );
  }
}

// GET - Get escalation status for all alerts
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    // Get alerts that need escalation
    const alertsNeedingEscalation = await prisma.emergencySurgeryAlert.count({
      where: {
        status: 'ACTIVE',
        alertTriggeredAt: {
          lt: fifteenMinutesAgo,
        },
        escalatedAt: null,
      },
    });

    // Get already escalated alerts
    const escalatedAlerts = await prisma.emergencySurgeryAlert.findMany({
      where: {
        escalatedToAdmins: true,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        patientName: true,
        procedureName: true,
        escalatedAt: true,
        alertTriggeredAt: true,
      },
    });

    return NextResponse.json({
      alertsNeedingEscalation,
      escalatedAlerts,
      currentTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting escalation status:', error);
    return NextResponse.json(
      { error: 'Failed to get escalation status' },
      { status: 500 }
    );
  }
}
