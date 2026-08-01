// ============================================================
// Stock batches — the register, and receiving new stock
// ------------------------------------------------------------
// Receiving is the only way stock comes into existence. It writes two rows in
// one transaction: the batch itself and the RECEIVE movement that explains it.
// Those must never be able to land separately — a batch with no movement behind
// it is a quantity nobody can account for, which is exactly what this module
// exists to prevent.
//
// Writes go through the app's ordinary fetch path, so a store receiving a
// delivery with no signal queues it with everything else rather than needing a
// second sync engine.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireStock } from '@/lib/stock/access';
import { applyMovement } from '@/lib/stock/quantities';
import { isExpired } from '@/lib/stock/rules';
import { generateBatchCode, normaliseScan, qrPayloadFor } from '@/lib/stock/barcode';
import { idempotencyKeyFrom, replayIfSeen, rememberResult } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

const LIST_INCLUDE = {
  item: { select: { id: true, name: true, category: true } },
  location: { select: { id: true, code: true, name: true, isControlled: true, isEmergency: true } },
  vendor: { select: { id: true, name: true } },
  _count: { select: { movements: true, reservations: true } },
} satisfies Prisma.StockBatchInclude;

// ---------------------------------------------------------------------------
// GET — the batch register
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const guard = await requireStock('view');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const where: Prisma.StockBatchWhereInput = { deletedAt: null };

  if (sp.get('itemId')) where.itemId = sp.get('itemId') as string;
  if (sp.get('locationId')) where.locationId = sp.get('locationId') as string;
  if (sp.get('status')) where.status = sp.get('status') as never;
  if (sp.get('owner')) where.owner = sp.get('owner') as never;
  if (sp.get('vendorId')) where.vendorId = sp.get('vendorId') as string;

  const q = sp.get('q')?.trim();
  if (q) {
    where.OR = [
      { batchNumber: { contains: q, mode: 'insensitive' } },
      { lotNumber: { contains: q, mode: 'insensitive' } },
      { barcode: { contains: q, mode: 'insensitive' } },
      { item: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }

  // "Expiring" is a question about the shelf, so it is asked of the database
  // rather than by loading every batch and filtering in memory.
  const expiringDays = Number(sp.get('expiringWithinDays') ?? 0);
  if (expiringDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + expiringDays);
    where.expiryDate = { not: null, lte: cutoff };
  }

  try {
    const rows = await prisma.stockBatch.findMany({
      where,
      include: LIST_INCLUDE,
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }],
      take: Math.min(500, Number(sp.get('limit') ?? 200) || 200),
    });

    return NextResponse.json({
      batches: rows.map((b) => ({ ...b, expired: isExpired(b.expiryDate) })),
    });
  } catch (error) {
    console.error('[stock] batch list failed:', error);
    return NextResponse.json({ error: 'Failed to load stock batches' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — receive a delivery
// ---------------------------------------------------------------------------
interface ReceiveBody {
  id?: string;
  itemId?: string;
  locationId?: string | null;
  batchNumber?: string;
  lotNumber?: string | null;
  quantity?: number;
  expiryDate?: string | null;
  manufactureDate?: string | null;
  manufacturer?: string | null;
  brand?: string | null;
  owner?: string;
  vendorId?: string | null;
  purchasePrice?: number;
  sellingPrice?: number;
  hospitalPrice?: number;
  vendorPrice?: number;
  minimumLevel?: number | null;
  maximumLevel?: number | null;
  reorderLevel?: number | null;
  shelfLocation?: string | null;
  storageTemperature?: string | null;
  barcode?: string | null;
  notes?: string | null;
}

export async function POST(request: NextRequest) {
  const guard = await requireStock('receive');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: ReceiveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { itemId, batchNumber, quantity } = body;
  if (!itemId || !batchNumber?.trim()) {
    return NextResponse.json({ error: 'An item and a batch number are required.' }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || (quantity ?? 0) <= 0) {
    return NextResponse.json(
      { error: 'The quantity received must be a whole number greater than zero.' },
      { status: 400 }
    );
  }
  if (body.owner === 'VENDOR' && !body.vendorId) {
    return NextResponse.json(
      { error: 'Consignment stock must name the vendor that owns it.' },
      { status: 400 }
    );
  }
  // Receiving stock that has already expired is almost always a keying slip,
  // and it would sit in the store unusable while looking like cover.
  if (body.expiryDate && isExpired(body.expiryDate)) {
    return NextResponse.json(
      { error: 'That expiry date has already passed. Check the date before receiving this delivery.' },
      { status: 400 }
    );
  }

  // A delivery queued offline must not be received twice — that would invent
  // stock the hospital does not have.
  const idemKey = idempotencyKeyFrom(request);
  const replayed = await replayIfSeen(idemKey);
  if (replayed) return replayed;

  try {
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true, name: true } });
    if (!item) return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });

    const allocatedCode = body.barcode?.trim() ? normaliseScan(body.barcode) : generateBatchCode();

    const created = await prisma.$transaction(async (tx) => {
      // A repeat delivery of the same lot into the same store tops up the batch
      // that is already there rather than creating a second row for the same
      // physical shelf position.
      const existing = await tx.stockBatch.findFirst({
        where: { itemId, batchNumber: batchNumber.trim(), locationId: body.locationId ?? null, deletedAt: null },
      });

      const patch = applyMovement('RECEIVE', quantity as number);

      const batch = existing
        ? await tx.stockBatch.update({
            where: { id: existing.id },
            data: {
              quantityReceived: { increment: patch.quantityReceived ?? 0 },
              updatedById: actor.userId,
            },
            include: LIST_INCLUDE,
          })
        : await tx.stockBatch.create({
            data: {
              ...(body.id ? { id: body.id } : {}),
              itemId,
              locationId: body.locationId ?? null,
              batchNumber: batchNumber.trim(),
              lotNumber: body.lotNumber ?? null,
              expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
              manufactureDate: body.manufactureDate ? new Date(body.manufactureDate) : null,
              manufacturer: body.manufacturer ?? null,
              brand: body.brand ?? null,
              owner: (body.owner as never) ?? 'HOSPITAL',
              vendorId: body.vendorId ?? null,
              purchasePrice: body.purchasePrice ?? 0,
              sellingPrice: body.sellingPrice ?? 0,
              hospitalPrice: body.hospitalPrice ?? 0,
              vendorPrice: body.vendorPrice ?? 0,
              quantityReceived: patch.quantityReceived ?? 0,
              minimumLevel: body.minimumLevel ?? null,
              maximumLevel: body.maximumLevel ?? null,
              reorderLevel: body.reorderLevel ?? null,
              shelfLocation: body.shelfLocation ?? null,
              storageTemperature: body.storageTemperature ?? null,
              // Labelled on receipt, always. A lot with no code cannot be
              // scanned, and stock that cannot be scanned gets counted by hand.
              // A manufacturer's barcode is honoured when given.
              barcode: allocatedCode,
              qrPayload: qrPayloadFor(allocatedCode, request.nextUrl.origin),
              notes: body.notes ?? null,
              createdById: actor.userId,
              updatedById: actor.userId,
            },
            include: LIST_INCLUDE,
          });

      // The movement that explains the quantity. Same transaction, always.
      await tx.stockMovement.create({
        data: {
          batchId: batch.id,
          type: 'RECEIVE',
          quantity: quantity as number,
          toLocationId: body.locationId ?? null,
          ownerAfter: (body.owner as never) ?? 'HOSPITAL',
          actorId: actor.userId,
          actorName: actor.fullName,
          reason: existing ? 'Further delivery against an existing lot' : 'Goods received',
          scannedCode: allocatedCode,
        },
      });

      return batch;
    });

    const payload = { batch: created, success: true };
    await rememberResult(idemKey, 201, payload);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    // A duplicate barcode is a user-fixable mistake, not a server fault.
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'That barcode is already registered to another batch.' },
        { status: 409 }
      );
    }
    console.error('[stock] receive failed:', error);
    return NextResponse.json({ error: 'Failed to receive the stock' }, { status: 500 });
  }
}
