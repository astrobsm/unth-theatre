// ============================================================
// Reservations — committing stock to a case
// ------------------------------------------------------------
// The step between "this case needs six packs of Vicryl" and stock physically
// leaving the store. Reserved stock is still on the shelf; it is simply no
// longer available to anybody else, which is what stops two lists being booked
// against the same box.
//
// WHICH batches are chosen is not decided here — allocateFefo is, and it works
// first-expired-first-out so stock is used before it lapses. This route asks
// for an item and a quantity; the allocator answers with lots.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireStock } from '@/lib/stock/access';
import { allocateFefo } from '@/lib/stock/allocate';
import { canReserve } from '@/lib/stock/rules';
import { idempotencyKeyFrom, replayIfSeen, rememberResult } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

const RESERVATION_INCLUDE = {
  batch: {
    select: {
      id: true,
      batchNumber: true,
      expiryDate: true,
      owner: true,
      sellingPrice: true,
      item: { select: { id: true, name: true, category: true } },
      location: { select: { id: true, name: true, isControlled: true, isEmergency: true } },
    },
  },
} satisfies Prisma.StockReservationInclude;

/** issued − returned − used − wasted: what theatre still physically holds. */
function outstandingOn(r: {
  quantityIssued: number;
  quantityReturned: number;
  quantityUsed: number;
  quantityWasted: number;
}): number {
  return r.quantityIssued - r.quantityReturned - r.quantityUsed - r.quantityWasted;
}

// ---------------------------------------------------------------------------
// GET — what is committed to a case
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const guard = await requireStock('view');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const surgeryId = sp.get('surgeryId');
  if (!surgeryId) {
    return NextResponse.json({ error: 'Which surgery?' }, { status: 400 });
  }

  try {
    const rows = await prisma.stockReservation.findMany({
      where: {
        surgeryId,
        ...(sp.get('status') ? { status: sp.get('status') as never } : {}),
      },
      include: RESERVATION_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    const lines = rows.map((r) => ({
      ...r,
      outstanding: outstandingOn(r),
      lineTotal: r.unitPriceAtReservation * r.quantityReserved,
    }));

    return NextResponse.json({
      reservations: lines,
      totals: {
        lines: lines.length,
        reserved: lines.reduce((s, l) => s + l.quantityReserved, 0),
        issued: lines.reduce((s, l) => s + l.quantityIssued, 0),
        used: lines.reduce((s, l) => s + l.quantityUsed, 0),
        wasted: lines.reduce((s, l) => s + l.quantityWasted, 0),
        outstanding: lines.reduce((s, l) => s + l.outstanding, 0),
        // Kobo. What this case has committed at the prices agreed when booked.
        value: lines.reduce((s, l) => s + l.lineTotal, 0),
      },
    });
  } catch (error) {
    console.error('[stock] reservation list failed:', error);
    return NextResponse.json({ error: 'Failed to load reservations' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — reserve an item against a case
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requireStock('reserve');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: {
    surgeryId?: string;
    itemId?: string;
    quantity?: number;
    /** Optional: reserve from one named lot instead of letting FEFO choose. */
    batchId?: string;
    sourceKind?: string;
    sourceId?: string;
    emergencyAuthorisedBy?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { surgeryId, itemId, quantity } = body;
  if (!surgeryId || !itemId) {
    return NextResponse.json({ error: 'A surgery and an item are required.' }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || (quantity ?? 0) <= 0) {
    return NextResponse.json(
      { error: 'The quantity must be a whole number greater than zero.' },
      { status: 400 }
    );
  }

  const idemKey = idempotencyKeyFrom(request);
  const replayed = await replayIfSeen(idemKey);
  if (replayed) return replayed;

  try {
    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      select: { id: true, surgeryType: true, status: true },
    });
    if (!surgery) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });

    // An emergency case is never made to wait on the emergency store.
    const isElective = surgery.surgeryType === 'ELECTIVE';

    const batches = await prisma.stockBatch.findMany({
      where: {
        itemId,
        deletedAt: null,
        ...(body.batchId ? { id: body.batchId } : {}),
      },
      include: { location: { select: { name: true, isEmergency: true, isControlled: true, isConsignment: true } } },
    });

    if (batches.length === 0) {
      return NextResponse.json(
        { error: 'No stock has been received against this item yet.', code: 'NO_STOCK' },
        { status: 409 }
      );
    }

    const plan = allocateFefo({
      batches: batches.map((b) => ({ ...b, status: b.status as string, location: b.location })),
      quantity: quantity as number,
      isElective,
      emergencyAuthorisedBy: body.emergencyAuthorisedBy ?? null,
    });

    if (plan.allocations.length === 0) {
      return NextResponse.json(
        {
          error: `Nothing available to reserve. ${plan.shortfall} still needed.`,
          code: 'INSUFFICIENT_STOCK',
          shortfall: plan.shortfall,
        },
        { status: 409 }
      );
    }

    // Each chosen lot is re-checked against the full rule set. The allocator
    // sorts and sizes; canReserve is the authority on whether it may be taken.
    for (const line of plan.allocations) {
      const batch = batches.find((b) => b.id === line.batchId)!;
      const verdict = canReserve({
        batch: { ...batch, status: batch.status as string },
        quantity: line.quantity,
        location: batch.location,
        isElective,
        emergencyAuthorisedBy: body.emergencyAuthorisedBy ?? null,
      });
      if (!verdict.allowed) {
        return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 409 });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const line of plan.allocations) {
        const reservation = await tx.stockReservation.create({
          data: {
            surgeryId,
            batchId: line.batchId,
            quantityReserved: line.quantity,
            unitPriceAtReservation: line.unitPrice,
            sourceKind: body.sourceKind ?? null,
            sourceId: body.sourceId ?? null,
            requestedById: actor.userId,
          },
          include: RESERVATION_INCLUDE,
        });

        await tx.stockBatch.update({
          where: { id: line.batchId },
          data: { quantityReserved: { increment: line.quantity }, updatedById: actor.userId },
        });

        await tx.stockMovement.create({
          data: {
            batchId: line.batchId,
            reservationId: reservation.id,
            type: 'RESERVE',
            quantity: line.quantity,
            surgeryId,
            actorId: actor.userId,
            actorName: actor.fullName,
            reason: body.emergencyAuthorisedBy
              ? `Emergency stock authorised by ${body.emergencyAuthorisedBy}`
              : null,
          },
        });

        rows.push(reservation);
      }
      return rows;
    });

    const payload = {
      reservations: created,
      // Stated plainly rather than buried: a partly-filled reservation still
      // leaves the case short, and somebody has to know before the day.
      shortfall: plan.shortfall,
      satisfied: plan.satisfied,
      success: true,
    };
    await rememberResult(idemKey, 201, payload);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    console.error('[stock] reserve failed:', error);
    return NextResponse.json({ error: 'Failed to reserve the stock' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH — release a reservation back to the shelf
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const guard = await requireStock('reserve');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: { id?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: 'Which reservation?' }, { status: 400 });

  try {
    const reservation = await prisma.stockReservation.findUnique({ where: { id: body.id } });
    if (!reservation) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });

    if (reservation.status === 'RELEASED' || reservation.status === 'CANCELLED') {
      return NextResponse.json({ success: true, alreadyReleased: true });
    }

    // Only what is still held can be given back. Anything already issued is in
    // theatre and must be returned physically, not released on paper.
    const stillHeld = reservation.quantityReserved - reservation.quantityIssued;
    if (stillHeld <= 0) {
      return NextResponse.json(
        {
          error: 'This reservation has already been issued in full. Record a return instead.',
          code: 'ALREADY_ISSUED',
        },
        { status: 409 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.stockReservation.update({
        where: { id: reservation.id },
        data: { status: 'RELEASED', releasedAt: new Date() },
        include: RESERVATION_INCLUDE,
      });

      await tx.stockBatch.update({
        where: { id: reservation.batchId },
        data: { quantityReserved: { decrement: stillHeld }, updatedById: actor.userId },
      });

      await tx.stockMovement.create({
        data: {
          batchId: reservation.batchId,
          reservationId: reservation.id,
          type: 'RELEASE_RESERVATION',
          quantity: stillHeld,
          surgeryId: reservation.surgeryId,
          actorId: actor.userId,
          actorName: actor.fullName,
          reason: body.reason ?? 'Reservation released',
        },
      });

      return row;
    });

    return NextResponse.json({ reservation: updated, released: stillHeld, success: true });
  } catch (error) {
    console.error('[stock] release failed:', error);
    return NextResponse.json({ error: 'Failed to release the reservation' }, { status: 500 });
  }
}
