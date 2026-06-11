import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/cssd-readiness - Get CSSD readiness reports
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    const where: any = {};
    if (date) {
      const targetDate = new Date(date);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      
      where.reportDate = {
        gte: targetDate,
        lt: nextDate,
      };
    }

    const reports = await prisma.cssdReadinessReport.findMany({
      where,
      include: {
        reportedBy: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
      },
      orderBy: { reportDate: 'desc' },
    });

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('Error fetching CSSD readiness reports:', error);
    // Return empty array instead of error if table doesn't exist yet
    return NextResponse.json({ reports: [] });
  }
}

// POST /api/cssd-readiness - Create CSSD readiness report
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['CSSD_STAFF', 'CSSD_SUPERVISOR', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      reportDate,
      shiftType,
      readinessStatus, // READY | LIMITED | NOT_READY
      instrumentPacks, // array of { subspecialty, packName, sterilizationStatus, notes }
      surgicalMaterials, // array of { material, quantity, sterilizationStatus, notes }
      machineFaults,
      blockingReason,
      criticalShortages,
      equipmentIssues,
      actionTaken,
      notes,
    } = body;

    if (!shiftType || !readinessStatus) {
      return NextResponse.json(
        { error: 'Shift and readiness status are required' },
        { status: 400 }
      );
    }

    const packs = Array.isArray(instrumentPacks) ? instrumentPacks : [];
    const materials = Array.isArray(surgicalMaterials) ? surgicalMaterials : [];

    // Map the simple status used by the form to the stored overall status.
    const statusMap: Record<string, string> = {
      READY: 'READY',
      LIMITED: 'PARTIALLY_READY',
      NOT_READY: 'NOT_READY',
    };
    const overallStatus = statusMap[readinessStatus] || readinessStatus;

    // Derive a readiness percentage from the proportion of sterile/ready items.
    const STERILE_STATES = ['STERILE', 'READY', 'AVAILABLE'];
    const detailRows = [...packs, ...materials];
    const sterileCount = detailRows.filter((r: any) =>
      STERILE_STATES.includes(String(r?.sterilizationStatus || '').toUpperCase())
    ).length;
    let readinessPercentage =
      detailRows.length > 0
        ? Math.round((sterileCount / detailRows.length) * 100)
        : readinessStatus === 'READY'
        ? 100
        : readinessStatus === 'LIMITED'
        ? 60
        : 20;

    // Derive available bundle/gown counts from the surgical-material rows.
    const sumQty = (match: (m: string) => boolean) =>
      materials
        .filter((m: any) => match(String(m?.material || '').toUpperCase()))
        .reduce((acc: number, m: any) => acc + (Number(m?.quantity) || 0), 0);
    const majorBundlesAvailable = sumQty((m) => m.includes('MAJOR'));
    const minorBundlesAvailable = sumQty((m) => m.includes('MINOR'));
    const gownsAvailable = sumQty((m) => m.includes('GOWN'));

    // Any fault, machine malfunction or blocking reason raises a RED ALERT.
    const machineFaultsText = (machineFaults || '').trim();
    const blockingReasonText = (blockingReason || '').trim();
    const redAlertTriggered = Boolean(machineFaultsText || blockingReasonText);

    const readinessReport = await prisma.cssdReadinessReport.create({
      data: {
        reportDate: reportDate ? new Date(reportDate) : new Date(),
        shiftType,
        overallStatus,
        readinessPercentage,
        majorBundlesAvailable,
        minorBundlesAvailable,
        gownsAvailable,
        instrumentPacks: packs.length ? JSON.stringify(packs) : null,
        surgicalMaterials: materials.length ? JSON.stringify(materials) : null,
        machineFaults: machineFaultsText || null,
        blockingReason: blockingReasonText || null,
        redAlertTriggered,
        criticalShortages: criticalShortages || null,
        equipmentIssues: equipmentIssues || null,
        actionTaken: actionTaken || null,
        reportedById: session.user.id,
        notes: notes || null,
      },
      include: {
        reportedBy: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'CssdReadinessReport',
        recordId: readinessReport.id,
        changes: JSON.stringify({ overallStatus, shiftType, readinessPercentage, redAlertTriggered }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    // RED ALERT fan-out: notify all admins and maintenance staff when there is
    // any fault, malfunctioning machine, or reason that could stop first knife.
    if (redAlertTriggered) {
      try {
        const reasons: string[] = [];
        if (machineFaultsText) reasons.push(`Machine faults: ${machineFaultsText}`);
        if (blockingReasonText) reasons.push(`Blocking reason: ${blockingReasonText}`);
        const reporterName = readinessReport.reportedBy?.fullName || 'CSSD staff';

        const recipients = await prisma.user.findMany({
          where: {
            status: 'APPROVED',
            role: {
              in: [
                'ADMIN',
                'SYSTEM_ADMINISTRATOR',
                'THEATRE_MANAGER',
                'THEATRE_CHAIRMAN',
                'CHIEF_MEDICAL_DIRECTOR',
                'WORKS_SUPERVISOR',
                'BIOMEDICAL_ENGINEER',
                'POWER_PLANT_OPERATOR',
              ],
            },
          },
          select: { id: true },
        });

        if (recipients.length > 0) {
          await prisma.notification.createMany({
            data: recipients.map((u) => ({
              userId: u.id,
              type: 'CSSD_RED_ALERT',
              title: '🔴 CSSD RED ALERT — First Knife at Risk',
              message: `${reporterName} reported an issue that may stop first knife on skin by 9AM. ${reasons.join(' | ')}`,
              link: '/dashboard/cssd/readiness',
            })),
          });
        }
      } catch (notifyError) {
        console.error('Failed to dispatch CSSD red alert notifications:', notifyError);
      }
    }

    return NextResponse.json({ readinessReport, redAlertTriggered }, { status: 201 });
  } catch (error) {
    console.error('Error creating CSSD readiness report:', error);
    return NextResponse.json(
      { error: 'Failed to create CSSD readiness report' },
      { status: 500 }
    );
  }
}
