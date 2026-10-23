import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiError } from '@/lib/apiError';
import { withRelevance } from '@/lib/notifications/relevance';

export const dynamic = 'force-dynamic';

// GET /api/notifications/timeline - Get approaching events and deadlines
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const userRole = session.user.role;
    const now = new Date();
    const next24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const next1Hour = new Date(Date.now() + 60 * 60 * 1000);

    // 1. Upcoming surgeries (next 24 hours) — MINE, not the hospital's.
    //
    // This query had no user filter at all: it fetched every scheduled case
    // and showed it to whoever was looking. A porter got the paediatric
    // surgery list, a laundry supervisor got a laminectomy running late, and
    // twenty-three items of other people's work taught everybody to ignore
    // the bell. See lib/notifications/relevance.ts; theatre managers and
    // booking officers are still shown all of it, because the whole board is
    // their job.
    // Read the department here rather than widening the session token: the
    // JWT is already issued to everyone and adding a field to it would not
    // reach anyone who is signed in until their session rolled over, which
    // for a 30-day session means this fix would land at different times for
    // different people.
    const viewerRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { department: true },
    });

    const viewer = {
      id: userId,
      role: userRole,
      department: viewerRecord?.department ?? null,
    };

    const upcomingSurgeries = await prisma.surgery.findMany({
      where: withRelevance(
        {
          scheduledDate: {
            gte: now,
            lte: next24Hours,
          },
          status: {
            in: ['SCHEDULED', 'IN_HOLDING_AREA', 'READY_FOR_THEATRE'],
          },
        },
        viewer,
      ) as never,
      include: {
        patient: { select: { name: true, folderNumber: true } },
      },
      orderBy: { scheduledDate: 'asc' },
      take: 20,
    });

    // 2. Pending transfer approvals (for theatre managers)
    let pendingTransfers: any[] = [];
    if (['THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR'].includes(userRole)) {
      pendingTransfers = await prisma.stockTransfer.findMany({
        where: {
          status: 'REQUESTED',
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    }

    // 3. Equipment maintenance due
    const maintenanceDue = await prisma.equipment.findMany({
      where: {
        nextServiceDue: {
          lte: next24Hours,
        },
        status: { not: 'OUT_OF_SERVICE' },
      },
      orderBy: { nextServiceDue: 'asc' },
      take: 10,
    });

    // 4. Low stock alerts
    const lowStockItems = await prisma.inventoryItem.findMany({
      where: {
        quantity: { lte: 5 },
      },
      orderBy: { quantity: 'asc' },
      take: 10,
    });

    // 5. Active fault alerts
    const activeFaults = await prisma.equipmentFaultAlert.findMany({
      where: {
        status: { in: ['REPORTED', 'ACKNOWLEDGED', 'IN_PROGRESS'] },
      },
      orderBy: [
        { priority: 'asc' },
        { alertTime: 'desc' },
      ],
      take: 10,
    });

    // 6. Holding area patients waiting
    const holdingAreaPatients = await prisma.holdingAreaAssessment.findMany({
      where: {
        status: { in: ['ARRIVED', 'VERIFICATION_IN_PROGRESS', 'CLEARED_FOR_THEATRE'] },
      },
      include: {
        patient: { select: { name: true } },
        surgery: { select: { procedureName: true, scheduledDate: true } },
      },
      orderBy: { arrivalTime: 'asc' },
      take: 10,
    });

    // 7. PACU patients ready for discharge
    const pacuReady = await prisma.pACUAssessment.findMany({
      where: {
        dischargeReadiness: 'READY_FOR_WARD',
        dischargeTime: null,
      },
      include: {
        patient: { select: { name: true } },
      },
      orderBy: { admissionTime: 'asc' },
      take: 10,
    });

    // Auto-create notifications for critical approaching events
    const criticalNotifications: any[] = [];

    // Surgery starting within 1 hour without notification
    for (const surgery of upcomingSurgeries) {
      if (surgery.scheduledDate && surgery.scheduledDate <= next1Hour) {
        criticalNotifications.push({
          type: 'SURGERY_SCHEDULED' as const,
          title: `Surgery in ${Math.round((surgery.scheduledDate.getTime() - now.getTime()) / 60000)} min`,
          message: `${surgery.procedureName} for ${surgery.patient.name} in ${surgery.subspecialty}`,
          priority: 'HIGH',
          actionUrl: `/dashboard/surgeries`,
          relatedEntityType: 'Surgery',
          relatedEntityId: surgery.id,
          scheduledAt: surgery.scheduledDate,
          isTimelineCritical: true,
        });
      }
    }

    // Create missing notifications
    for (const notif of criticalNotifications) {
      const exists = await prisma.systemNotification.findFirst({
        where: {
          relatedEntityId: notif.relatedEntityId,
          relatedEntityType: notif.relatedEntityType,
          type: notif.type,
          createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
        },
      });

      if (!exists) {
        await prisma.systemNotification.create({ data: notif });
      }
    }

    // Build timeline data
    const timeline: Array<{
      category: string;
      title: string;
      subtitle?: string;
      location?: string;
      time?: Date | null;
      status: string;
      urgency: string;
      actionUrl: string;
      id: string;
    }> = [
      ...upcomingSurgeries.map(s => ({
        category: 'surgery',
        title: s.procedureName,
        subtitle: `${s.patient.name} (${s.patient.folderNumber})`,
        location: s.subspecialty,
        time: s.scheduledDate,
        status: s.status,
        urgency: s.scheduledDate && s.scheduledDate <= next1Hour ? 'critical' : 'upcoming',
        actionUrl: '/dashboard/surgeries',
        id: s.id,
      })),
      ...maintenanceDue.map(e => ({
        category: 'maintenance',
        title: `Maintenance Due: ${e.name}`,
        subtitle: '',
        time: e.nextServiceDue,
        status: 'DUE',
        urgency: e.nextServiceDue && e.nextServiceDue <= next1Hour ? 'critical' : 'upcoming',
        actionUrl: '/dashboard/fault-alerts',
        id: e.id,
      })),
      ...lowStockItems.map(i => ({
        category: 'stock',
        title: `Low Stock: ${i.name}`,
        subtitle: `${i.quantity} remaining`,
        status: i.quantity <= 0 ? 'OUT_OF_STOCK' : 'LOW',
        urgency: i.quantity <= 0 ? 'critical' : 'warning',
        actionUrl: '/dashboard/inventory',
        id: i.id,
      })),
      ...activeFaults.map(f => ({
        category: 'fault',
        title: `Fault: ${f.itemName}`,
        subtitle: f.faultDescription,
        location: '',
        status: f.status,
        urgency: f.priority === 'CRITICAL' ? 'critical' : f.priority === 'HIGH' ? 'warning' : 'normal',
        actionUrl: '/dashboard/fault-alerts',
        id: f.id,
      })),
      ...holdingAreaPatients.map(h => ({
        category: 'holding-area',
        title: `Holding: ${h.patient.name}`,
        subtitle: h.surgery?.procedureName || '',
        time: h.surgery?.scheduledDate,
        status: h.status,
        urgency: 'upcoming',
        actionUrl: '/dashboard/holding-area',
        id: h.id,
      })),
      ...pacuReady.map(p => ({
        category: 'pacu',
        title: `PACU Discharge Ready: ${p.patient.name}`,
        status: 'READY_FOR_WARD',
        urgency: 'warning',
        actionUrl: '/dashboard/pacu',
        id: p.id,
      })),
      ...pendingTransfers.map(t => ({
        category: 'transfer',
        title: `Transfer Approval: ${t.itemName}`,
        subtitle: `Qty: ${t.quantityTransferred}`,
        status: 'PENDING',
        urgency: 'warning',
        actionUrl: '/dashboard/sub-stores/transfers',
        id: t.id,
      })),
    ].sort((a, b) => {
      // Sort critical first, then by time
      const urgencyOrder: Record<string, number> = { critical: 0, warning: 1, upcoming: 2, normal: 3 };
      const urgDiff = (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3);
      if (urgDiff !== 0) return urgDiff;
      const aTime = 'time' in a && a.time ? new Date(a.time as string).getTime() : Infinity;
      const bTime = 'time' in b && b.time ? new Date(b.time as string).getTime() : Infinity;
      return aTime - bTime;
    });

    return NextResponse.json({
      timeline,
      counts: {
        upcomingSurgeries: upcomingSurgeries.length,
        pendingTransfers: pendingTransfers.length,
        maintenanceDue: maintenanceDue.length,
        lowStock: lowStockItems.length,
        activeFaults: activeFaults.length,
        holdingArea: holdingAreaPatients.length,
        pacuReady: pacuReady.length,
      },
    });
  } catch (error) {
    return apiError('notifications.timeline', error);
  }
}
