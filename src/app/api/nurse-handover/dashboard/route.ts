import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/nurse-handover/dashboard - Aggregated handover dashboard data
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's scheduled surgeries with handover status
    const surgeries = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: today, lt: tomorrow },
        status: { in: ['SCHEDULED', 'IN_HOLDING_AREA', 'READY_FOR_THEATRE', 'IN_PROGRESS'] },
      },
      include: {
        patient: { select: { id: true, name: true, folderNumber: true, ward: true, age: true, gender: true } },
        surgeon: { select: { id: true, fullName: true } },
        anesthetist: { select: { id: true, fullName: true } },
        nurseHandovers: {
          where: { createdAt: { gte: today } },
          select: {
            id: true,
            status: true,
            handoverPhase: true,
            consentObtained: true,
            preOpChecklistCompleted: true,
            bloodAvailability: true,
            fastingStatus: true,
            instrumentSetPrepared: true,
            sterilityConfirmed: true,
            equipmentChecked: true,
            theatreAssigned: true,
            implantsAvailable: true,
            ivLineSecured: true,
            medicationsAdministered: true,
            skinPreparation: true,
            infectionRisk: true,
            highRiskPatient: true,
            handingOverNurseName: true,
            receivingNurseName: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { scheduledDate: 'asc' },
    });

    // Calculate readiness for each surgery
    const surgeryReadiness = surgeries.map(surgery => {
      const handover = surgery.nurseHandovers[0];
      let readinessStatus: 'READY' | 'PENDING' | 'NOT_READY' = 'NOT_READY';
      let missingItems: string[] = [];

      if (handover) {
        if (!handover.consentObtained) missingItems.push('Consent');
        if (!handover.preOpChecklistCompleted) missingItems.push('Pre-Op Checklist');
        if (!handover.bloodAvailability) missingItems.push('Blood Availability');
        if (!handover.fastingStatus) missingItems.push('Fasting Status');
        if (!handover.instrumentSetPrepared) missingItems.push('Instruments');
        if (!handover.sterilityConfirmed) missingItems.push('Sterility');
        if (!handover.equipmentChecked) missingItems.push('Equipment');

        if (missingItems.length === 0 && handover.status === 'COMPLETED') {
          readinessStatus = 'READY';
        } else if (handover.status !== 'DRAFT') {
          readinessStatus = 'PENDING';
        }
      } else {
        missingItems.push('No handover submitted');
      }

      return {
        surgeryId: surgery.id,
        patientName: surgery.patient?.name || 'Unknown',
        patientFolderNumber: surgery.patient?.folderNumber || '',
        patientWard: surgery.patient?.ward || '',
        procedure: surgery.procedureName,
        surgeon: surgery.surgeonName || surgery.surgeon?.fullName || 'TBA',
        anesthetist: surgery.anesthetist?.fullName || 'TBA',
        scheduledTime: surgery.scheduledDate,
        surgeryStatus: surgery.status,
        readinessStatus,
        missingItems,
        hasHandover: !!handover,
        handoverStatus: handover?.status || null,
        infectionRisk: handover?.infectionRisk || false,
        highRiskPatient: handover?.highRiskPatient || false,
        handoverNurse: handover?.handingOverNurseName || null,
      };
    });

    // Get today's handover stats
    const handoverStats = await prisma.nurseHandover.groupBy({
      by: ['status'],
      where: { createdAt: { gte: today, lt: tomorrow } },
      _count: true,
    });

    // Get alerts - incomplete handovers approaching surgery time
    const alerts: Array<{ type: string; message: string; severity: 'critical' | 'warning' | 'info'; surgeryId?: string }> = [];

    for (const sr of surgeryReadiness) {
      if (sr.readinessStatus === 'NOT_READY' && sr.surgeryStatus === 'SCHEDULED') {
        alerts.push({
          type: 'NO_HANDOVER',
          message: `No handover for ${sr.patientName} (${sr.procedure})`,
          severity: 'critical',
          surgeryId: sr.surgeryId,
        });
      }
      if (sr.missingItems.includes('Consent')) {
        alerts.push({
          type: 'MISSING_CONSENT',
          message: `Missing consent for ${sr.patientName}`,
          severity: 'critical',
          surgeryId: sr.surgeryId,
        });
      }
      if (sr.missingItems.includes('Equipment') || sr.missingItems.includes('Instruments')) {
        alerts.push({
          type: 'EQUIPMENT_NOT_READY',
          message: `Equipment/Instruments not ready for ${sr.patientName}`,
          severity: 'warning',
          surgeryId: sr.surgeryId,
        });
      }
      if (sr.infectionRisk) {
        alerts.push({
          type: 'INFECTION_RISK',
          message: `Infection risk flagged for ${sr.patientName}`,
          severity: 'warning',
          surgeryId: sr.surgeryId,
        });
      }
      if (sr.highRiskPatient) {
        alerts.push({
          type: 'HIGH_RISK',
          message: `High-risk patient: ${sr.patientName}`,
          severity: 'warning',
          surgeryId: sr.surgeryId,
        });
      }
    }

    // Performance metrics
    const recentHandovers = await prisma.nurseHandover.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        status: 'COMPLETED',
      },
      select: {
        handoverDurationMinutes: true,
        delayMinutes: true,
        delayCause: true,
        handingOverNurseName: true,
        handoverStartedAt: true,
        handoverCompletedAt: true,
      },
    });

    const avgDuration = recentHandovers.length > 0
      ? Math.round(recentHandovers.reduce((sum, h) => sum + (h.handoverDurationMinutes || 0), 0) / recentHandovers.length)
      : 0;

    const totalDelays = recentHandovers.filter(h => (h.delayMinutes || 0) > 0).length;

    return NextResponse.json({
      surgeryReadiness,
      stats: {
        totalSurgeries: surgeries.length,
        ready: surgeryReadiness.filter(s => s.readinessStatus === 'READY').length,
        pending: surgeryReadiness.filter(s => s.readinessStatus === 'PENDING').length,
        notReady: surgeryReadiness.filter(s => s.readinessStatus === 'NOT_READY').length,
        handoversByStatus: handoverStats.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
      },
      alerts,
      performance: {
        avgHandoverDuration: avgDuration,
        completedLast7Days: recentHandovers.length,
        delaysLast7Days: totalDelays,
      },
    });
  } catch (error) {
    console.error('Error fetching handover dashboard:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
