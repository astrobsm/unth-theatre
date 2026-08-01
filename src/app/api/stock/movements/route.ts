// ============================================================
// Stock movements — issuing, returning, consuming and wasting
// ------------------------------------------------------------
// Everything that happens to stock after it has been reserved. Each call writes
// exactly one movement row and the counter changes that movement implies, in
// one transaction — a movement whose effect landed without it, or the reverse,
// is an unaccountable quantity.
//
// CONSIGNMENT. Consuming vendor-owned stock is the moment the hospital buys it.
// That is recorded as its own OWNERSHIP_TRANSFER movement rather than by
// flipping the batch's owner, because only the CONSUMED portion changes hands —
// the rest of the lot is still the vendor's property sitting on the shelf.
// Settlement therefore sums ownership transfers per vendor, which is both
// correct for part-used lots and auditable line by line.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireStock } from '@/lib/stock/access';
import { applyMovement } from '@/lib/stock/quantities';
import { canAccountFor, canIssue, transfersOwnershipOnConsumption } from '@/lib/stock/rules';
import { idempotencyKeyFrom, replayIfSeen, rememberResult } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

/** What a caller may ask for. WASTE is a CONSUME that produced nothing. */
type Action = 'ISSUE' | 'RETURN' | 'CONSUME' | 'WASTE';

const MOVEMENT_INCLUDE = {
  batch: {
    select: {
      id: true,
      batchNumber: true,
      owner: true,
      item: { select: { id: true, name: true } },
      location: { select: { id: true, name: true, isControlled: true } },
    },
  },
} satisfies Prisma.StockMovementInclude;

// ---------------------------------------------------------------------------
// GET — the movement log
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const guard = await requireStock('view');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const where: Prisma.StockMovementWhereInput = {};
  if (sp.get('batchId')) where.batchId = sp.get('batchId') as string;
  if (sp.get('surgeryId')) where.surgeryId = sp.get('surgeryId') as string;
  if (sp.get('type')) where.type = sp.get('type') as never;

  const from = sp.get('from');
  const to = sp.get('to');
  if (from || to) {
    where.occurredAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  try {
    const movements = await prisma.stockMovement.findMany({
      where,
      include: MOVEMENT_INCLUDE,
      orderBy: { occurredAt: 'desc' },
      take: Math.min(500, Number(sp.get('limit') ?? 200) || 200),
    });
    return NextResponse.json({ movements });
  } catch (error) {
    console.error('[stock] movement list failed:', error);
    return NextResponse.json({ error: 'Failed to load stock movements' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — record a movement
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requireStock('move');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: {
    action?: Action;
    reservationId?: string;
    batchId?: string;
    quantity?: number;
    witnessId?: string;
    witnessName?: string;
    reason?: string;
    notes?: string;
    scannedCode?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const action = body.action;
  const quantity = body.quantity;

  if (!action || !['ISSUE', 'RETURN', 'CONSUME', 'WASTE'].includes(action)) {
    return NextResponse.json(
      { error: 'An action of ISSUE, RETURN, CONSUME or WASTE is required.' },
      { status: 400 }
    );
  }
  if (!Number.isInteger(quantity) || (quantity ?? 0) <= 0) {
    return NextResponse.json(
      { error: 'The quantity must be a whole number greater than zero.' },
      { status: 400 }
    );
  }
  if (!body.reservationId) {
    return NextResponse.json(
      { error: 'Stock moves against a reservation, so the case it is for is always recorded.' },
      { status: 400 }
    );
  }

  // A movement queued offline must not be applied twice — that would move stock
  // that never moved.
  const idemKey = idempotencyKeyFrom(request);
  const replayed = await replayIfSeen(idemKey);
  if (replayed) return replayed;

  try {
    const reservation = await prisma.stockReservation.findUnique({
      where: { id: body.reservationId },
      include: {
        batch: {
          include: { location: { select: { name: true, isControlled: true, isEmergency: true } } },
        },
      },
    });
    if (!reservation) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });

    const batch = reservation.batch;
    const location = batch.location;
    const qty = quantity as number;

    // --- Ask the rules ----------------------------------------------------
    if (action === 'ISSUE') {
      const stillReserved = reservation.quantityReserved - reservation.quantityIssued;
      const verdict = canIssue({
        batch: { ...batch, status: batch.status as string },
        quantity: qty,
        reservedForCase: stillReserved,
        location,
        witnessId: body.witnessId ?? null,
      });
      if (!verdict.allowed) {
        return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 409 });
      }
    } else {
      const outstanding =
        reservation.quantityIssued -
        reservation.quantityReturned -
        reservation.quantityUsed -
        reservation.quantityWasted;
      const verdict = canAccountFor({
        kind: action === 'WASTE' ? 'WASTE' : action,
        quantity: qty,
        outstanding,
        location,
        witnessId: body.witnessId ?? null,
      });
      if (!verdict.allowed) {
        return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 409 });
      }
    }

    // --- Persist ----------------------------------------------------------
    const movementType = action === 'WASTE' ? 'CONSUME' : action;
    const patch = applyMovement(action === 'WASTE' ? 'CONSUME' : action, qty);

    const result = await prisma.$transaction(async (tx) => {
      // Waste is recorded against `damaged`, not `used`: it left the store and
      // must be accounted for, but nothing was gained by it and the patient is
      // not billed for it.
      const batchData: Prisma.StockBatchUpdateInput = {};
      if (action === 'WASTE') {
        batchData.quantityDamaged = { increment: qty };
      } else {
        for (const [field, delta] of Object.entries(patch)) {
          (batchData as Record<string, unknown>)[field] =
            delta >= 0 ? { increment: delta } : { decrement: Math.abs(delta) };
        }
      }
      batchData.updatedById = actor.userId;

      const updatedBatch = await tx.stockBatch.update({ where: { id: batch.id }, data: batchData });

      const reservationData: Prisma.StockReservationUpdateInput = {};
      if (action === 'ISSUE') reservationData.quantityIssued = { increment: qty };
      if (action === 'RETURN') reservationData.quantityReturned = { increment: qty };
      if (action === 'CONSUME') reservationData.quantityUsed = { increment: qty };
      // Waste draws down what is outstanding but is NOT "used": the patient is
      // billed for what was used, and a dropped vial is the hospital's loss.
      if (action === 'WASTE') reservationData.quantityWasted = { increment: qty };

      const nextIssued = reservation.quantityIssued + (action === 'ISSUE' ? qty : 0);
      const nextReturned = reservation.quantityReturned + (action === 'RETURN' ? qty : 0);
      const nextUsed = reservation.quantityUsed + (action === 'CONSUME' ? qty : 0);
      const nextWasted = reservation.quantityWasted + (action === 'WASTE' ? qty : 0);

      if (action === 'ISSUE') {
        reservationData.status = nextIssued >= reservation.quantityReserved ? 'ISSUED' : 'PARTIALLY_ISSUED';
      } else if (nextIssued > 0 && nextIssued - nextReturned - nextUsed - nextWasted <= 0) {
        // Everything that went out has been accounted for.
        reservationData.status = 'CONSUMED';
      }

      const updatedReservation = await tx.stockReservation.update({
        where: { id: reservation.id },
        data: reservationData,
        include: { batch: { select: { batchNumber: true } } },
      });

      const movement = await tx.stockMovement.create({
        data: {
          batchId: batch.id,
          reservationId: reservation.id,
          type: movementType as never,
          quantity: qty,
          surgeryId: reservation.surgeryId,
          actorId: actor.userId,
          actorName: actor.fullName,
          witnessId: body.witnessId ?? null,
          witnessName: body.witnessName ?? null,
          reason: action === 'WASTE' ? (body.reason ?? 'Discarded') : (body.reason ?? null),
          notes: body.notes ?? null,
          scannedCode: body.scannedCode ?? null,
          fromLocationId: action === 'ISSUE' ? batch.locationId : null,
          toLocationId: action === 'RETURN' ? batch.locationId : null,
        },
      });

      // Consuming consignment stock is the moment the hospital buys it. Only
      // the consumed quantity changes hands; the rest of the lot stays the
      // vendor's, so this is a movement rather than a change to the batch.
      let ownershipTransfer = null;
      if (action === 'CONSUME' && transfersOwnershipOnConsumption(batch.owner)) {
        ownershipTransfer = await tx.stockMovement.create({
          data: {
            batchId: batch.id,
            reservationId: reservation.id,
            type: 'OWNERSHIP_TRANSFER',
            quantity: qty,
            surgeryId: reservation.surgeryId,
            ownerBefore: 'VENDOR',
            ownerAfter: 'HOSPITAL',
            actorId: actor.userId,
            actorName: actor.fullName,
            reason: 'Consignment stock consumed — ownership passes to the hospital and becomes settleable.',
          },
        });
      }

      return { movement, ownershipTransfer, batch: updatedBatch, reservation: updatedReservation };
    });

    const payload = {
      movement: result.movement,
      ownershipTransferred: Boolean(result.ownershipTransfer),
      reservation: result.reservation,
      success: true,
    };
    await rememberResult(idemKey, 201, payload);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    console.error('[stock] movement failed:', error);
    return NextResponse.json({ error: 'Failed to record the stock movement' }, { status: 500 });
  }
}
