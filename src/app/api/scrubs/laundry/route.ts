import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Laundry manager interface.
 *
 * GET  -> today's (or requested) laundry batch with its items, plus all sets
 *         currently IN_CLEANING that still need to be received.
 * POST -> create a batch for a day/shift, pulling in every set in cleaning.
 * PUT  -> update items (received / ready / missing) and the batch readiness.
 */

function dayBounds(dateParam?: string | null) {
  const d = dateParam ? new Date(dateParam) : new Date();
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const shift = searchParams.get('shift') || 'MORNING';
    const { start, end } = dayBounds(searchParams.get('date'));

    const [batch, inCleaning] = await Promise.all([
      prisma.scrubLaundryBatch.findFirst({
        where: { batchDate: { gte: start, lte: end }, shift: shift as any },
        include: { items: { orderBy: { serialNumber: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.scrubSet.findMany({
        where: { status: 'IN_CLEANING' },
        select: { id: true, serialNumber: true, color: true, ownerName: true },
        orderBy: { serialNumber: 'asc' },
      }),
    ]);

    return NextResponse.json({ batch, inCleaning });
  } catch (error) {
    console.error('GET /api/scrubs/laundry error:', error);
    return NextResponse.json(
      { error: 'Failed to load laundry batch' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const shift = (body.shift || 'MORNING') as 'MORNING' | 'NIGHT';
    const actorId = (session.user as any).id as string;
    const actorName =
      (session.user as any).fullName || session.user?.name || 'Laundry';

    const { start, end } = dayBounds(body.date);

    // Reuse an existing batch for the same day/shift if present.
    const existing = await prisma.scrubLaundryBatch.findFirst({
      where: { batchDate: { gte: start, lte: end }, shift: shift as any },
      include: { items: true },
    });
    if (existing) {
      return NextResponse.json({ batch: existing });
    }

    // Pull in every set currently sitting in laundry.
    const inCleaning = await prisma.scrubSet.findMany({
      where: { status: 'IN_CLEANING' },
      select: { id: true, serialNumber: true, color: true },
    });

    const batch = await prisma.scrubLaundryBatch.create({
      data: {
        batchDate: new Date(),
        shift: shift as any,
        status: 'RECEIVED',
        receivedById: actorId,
        receivedByName: actorName,
        managerId: body.managerId || null,
        managerName: body.managerName || null,
        expectedCount: inCleaning.length,
        items: {
          create: inCleaning.map((s) => ({
            scrubSetId: s.id,
            serialNumber: s.serialNumber,
            color: s.color,
          })),
        },
      },
      include: { items: { orderBy: { serialNumber: 'asc' } } },
    });

    return NextResponse.json({ batch }, { status: 201 });
  } catch (error) {
    console.error('POST /api/scrubs/laundry error:', error);
    return NextResponse.json(
      { error: 'Failed to create laundry batch' },
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
    const batchId = body.batchId as string;
    if (!batchId) {
      return NextResponse.json({ error: 'batchId required' }, { status: 400 });
    }

    // ---- Update a single item (received / ready / missing) ----------------
    if (body.itemId) {
      const item = await prisma.scrubLaundryItem.findUnique({
        where: { id: body.itemId },
      });
      if (!item) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      }

      const data: any = {};
      if (body.received !== undefined) {
        data.received = !!body.received;
        data.receivedAt = body.received ? new Date() : null;
        if (body.received) data.missing = false;
      }
      if (body.ready !== undefined) {
        data.ready = !!body.ready;
        data.readyAt = body.ready ? new Date() : null;
      }
      if (body.missing !== undefined) {
        data.missing = !!body.missing;
        if (body.missing) {
          data.received = false;
          data.receivedAt = null;
        }
      }
      if (typeof body.condition === 'string') data.condition = body.condition;

      await prisma.scrubLaundryItem.update({
        where: { id: body.itemId },
        data,
      });

      // A missing item raises an alert and flags the set as MISSING.
      if (body.missing && item.scrubSetId) {
        await prisma.scrubSet.update({
          where: { id: item.scrubSetId },
          data: { status: 'MISSING' },
        });
        const dupe = await prisma.scrubAlert.findFirst({
          where: {
            type: 'MISSING_ITEM',
            serialNumber: item.serialNumber,
            resolved: false,
          },
        });
        if (!dupe) {
          await prisma.scrubAlert.create({
            data: {
              type: 'MISSING_ITEM',
              severity: 'HIGH',
              message: `Scrub set ${item.serialNumber} (${item.color}) not received in laundry`,
              serialNumber: item.serialNumber,
              scrubSetId: item.scrubSetId,
            },
          });
        }
      }

      // Marking an item ready returns the set to its owner's reserve pool.
      if (body.ready && item.scrubSetId) {
        await prisma.scrubSet.update({
          where: { id: item.scrubSetId },
          data: { status: 'RESERVE' },
        });
      }
    }

    // ---- Recompute batch roll-up counts -----------------------------------
    const items = await prisma.scrubLaundryItem.findMany({
      where: { batchId },
    });
    const receivedCount = items.filter((i) => i.received).length;
    const readyCount = items.filter((i) => i.ready).length;
    const missingCount = items.filter((i) => i.missing).length;

    const data: any = { receivedCount, readyCount, missingCount };

    // Batch-level readiness report for the next operating day.
    if (body.markReady) {
      const allReady = items.length > 0 && readyCount === items.length;
      data.readyForNextDay = allReady;
      data.readyReportedAt = new Date();
      data.status = missingCount > 0 ? 'INCOMPLETE' : allReady ? 'READY' : 'IN_PROGRESS';
      if (typeof body.notes === 'string') data.notes = body.notes;

      if (missingCount > 0) {
        const dupe = await prisma.scrubAlert.findFirst({
          where: { type: 'INCOMPLETE_BATCH', resolved: false, scrubSetId: batchId },
        });
        if (!dupe) {
          await prisma.scrubAlert.create({
            data: {
              type: 'INCOMPLETE_BATCH',
              severity: 'HIGH',
              message: `Laundry batch incomplete — ${missingCount} item(s) missing, not ready for next day`,
              scrubSetId: batchId,
            },
          });
        }
      }
    } else if (receivedCount > 0) {
      data.status = 'IN_PROGRESS';
    }

    const batch = await prisma.scrubLaundryBatch.update({
      where: { id: batchId },
      data,
      include: { items: { orderBy: { serialNumber: 'asc' } } },
    });

    return NextResponse.json({ batch });
  } catch (error) {
    console.error('PUT /api/scrubs/laundry error:', error);
    return NextResponse.json(
      { error: 'Failed to update laundry batch' },
      { status: 500 },
    );
  }
}
