import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Daily scrub report + alert centre.
 *
 * GET  -> a snapshot for the requested day: issued/returned counts, sets by
 *         status, overdue sign-outs, owners holding fewer than the required 3
 *         sets (low-inventory), per-colour breakdown, and open alerts.
 *         Overdue and low-inventory alerts are (idempotently) raised here.
 * PUT  -> resolve an alert.
 */

const MIN_SETS_PER_OWNER = 3; // one in-use, one in cleaning, one in reserve

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const d = searchParams.get('date') ? new Date(searchParams.get('date')!) : new Date();
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    const now = new Date();

    const [allSets, issuedToday, returnedToday, openTxns, alerts] =
      await Promise.all([
        prisma.scrubSet.findMany(),
        prisma.scrubTransaction.count({
          where: { issuedAt: { gte: start, lte: end } },
        }),
        prisma.scrubTransaction.count({
          where: { returnedAt: { gte: start, lte: end } },
        }),
        prisma.scrubTransaction.findMany({
          where: { returnedAt: null },
          orderBy: { issuedAt: 'asc' },
        }),
        prisma.scrubAlert.findMany({
          where: { resolved: false },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    // ---- Status + colour breakdown ----------------------------------------
    const byStatus: Record<string, number> = {};
    const byColor: Record<string, number> = {};
    for (const s of allSets) {
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
      byColor[s.color] = (byColor[s.color] || 0) + 1;
    }

    // ---- Overdue sign-outs ------------------------------------------------
    const overdue = openTxns
      .filter((t) => t.dueBack && t.dueBack < now)
      .map((t) => ({
        id: t.id,
        serialNumber: t.serialNumber,
        color: t.color,
        userName: t.userName,
        issuedAt: t.issuedAt,
        dueBack: t.dueBack,
      }));

    // Idempotently raise OVERDUE_RETURN alerts.
    for (const o of overdue) {
      const dupe = await prisma.scrubAlert.findFirst({
        where: { type: 'OVERDUE_RETURN', serialNumber: o.serialNumber, resolved: false },
      });
      if (!dupe) {
        await prisma.scrubAlert.create({
          data: {
            type: 'OVERDUE_RETURN',
            severity: 'MEDIUM',
            message: `${o.userName} has not returned scrub set ${o.serialNumber} (overdue)`,
            serialNumber: o.serialNumber,
            scrubSetId: o.id,
            userName: o.userName,
          },
        });
      }
    }

    // ---- Low-inventory owners (< 3 active sets) ---------------------------
    const ownerCounts: Record<string, { name: string; role: string; count: number }> = {};
    for (const s of allSets) {
      if (!s.ownerId || s.status === 'RETIRED') continue;
      const e = ownerCounts[s.ownerId] || {
        name: s.ownerName || 'Unknown',
        role: s.ownerRole || '',
        count: 0,
      };
      e.count += 1;
      ownerCounts[s.ownerId] = e;
    }
    const lowInventory = Object.entries(ownerCounts)
      .filter(([, v]) => v.count < MIN_SETS_PER_OWNER)
      .map(([ownerId, v]) => ({ ownerId, ...v, required: MIN_SETS_PER_OWNER }));

    for (const li of lowInventory) {
      const dupe = await prisma.scrubAlert.findFirst({
        where: { type: 'LOW_INVENTORY', userId: li.ownerId, resolved: false },
      });
      if (!dupe) {
        await prisma.scrubAlert.create({
          data: {
            type: 'LOW_INVENTORY',
            severity: 'LOW',
            message: `${li.name} has only ${li.count} of ${MIN_SETS_PER_OWNER} required scrub sets`,
            userId: li.ownerId,
            userName: li.name,
          },
        });
      }
    }

    // Re-read alerts so freshly raised ones are included.
    const freshAlerts = await prisma.scrubAlert.findMany({
      where: { resolved: false },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({
      date: start,
      summary: {
        totalSets: allSets.length,
        issuedToday,
        returnedToday,
        outstanding: openTxns.length,
        overdueCount: overdue.length,
        lowInventoryOwners: lowInventory.length,
      },
      byStatus,
      byColor,
      overdue,
      lowInventory,
      alerts: freshAlerts,
    });
  } catch (error) {
    console.error('GET /api/scrubs/report error:', error);
    return NextResponse.json(
      { error: 'Failed to build report' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (!body.alertId) {
      return NextResponse.json({ error: 'alertId required' }, { status: 400 });
    }

    const alert = await prisma.scrubAlert.update({
      where: { id: body.alertId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedById: (session.user as any).id || null,
      },
    });

    return NextResponse.json({ alert });
  } catch (error) {
    console.error('PUT /api/scrubs/report error:', error);
    return NextResponse.json(
      { error: 'Failed to resolve alert' },
      { status: 500 },
    );
  }
}
