// ============================================================
// Stock availability — what is on the shelf, per catalogue item
// ------------------------------------------------------------
// The endpoint behind "no surgery should be booked blindly" (spec section 13).
// A surgeon about to book asks this what exists, what is already spoken for by
// other cases, and what is about to expire.
//
// The arithmetic is NOT done here: summariseAvailability in lib/stock/allocate
// is the single definition, shared with the allocator that will later pick the
// batches. A screen that computed availability its own way would eventually
// disagree with the reservation it produced.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireStock } from '@/lib/stock/access';
import { summariseAvailability } from '@/lib/stock/allocate';
import { daysUntilExpiry } from '@/lib/stock/rules';

export const dynamic = 'force-dynamic';

const BATCH_SELECT = {
  id: true,
  batchNumber: true,
  status: true,
  expiryDate: true,
  owner: true,
  sellingPrice: true,
  quantityReceived: true,
  quantityReserved: true,
  quantityIssued: true,
  quantityReturned: true,
  quantityUsed: true,
  quantityDamaged: true,
  quantityExpired: true,
  quantityDisposed: true,
  location: { select: { id: true, name: true, isEmergency: true, isControlled: true, isConsignment: true } },
} satisfies Prisma.StockBatchSelect;

export async function GET(request: NextRequest) {
  const guard = await requireStock('view');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const itemId = sp.get('itemId');
  const q = sp.get('q')?.trim();
  const locationId = sp.get('locationId');
  const lowOnly = sp.get('lowOnly') === 'true';
  const limit = Math.min(200, Number(sp.get('limit') ?? 100) || 100);

  try {
    const items = await prisma.inventoryItem.findMany({
      where: {
        ...(itemId ? { id: itemId } : {}),
        ...(q
          ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] }
          : {}),
      },
      select: {
        id: true,
        name: true,
        category: true,
        reorderLevel: true,
        // The legacy single-quantity field. Still returned so existing screens
        // that read it keep working while batches are being adopted.
        quantity: true,
        stockBatches: {
          where: {
            deletedAt: null,
            ...(locationId ? { locationId } : {}),
          },
          select: BATCH_SELECT,
        },
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    const rows = items.map((item) => {
      const summary = summariseAvailability(
        item.stockBatches.map((b) => ({
          ...b,
          location: b.location ?? null,
          status: b.status as string,
        })),
        { reorderLevel: item.reorderLevel }
      );

      return {
        itemId: item.id,
        name: item.name,
        category: item.category,
        reorderLevel: item.reorderLevel,
        /**
         * `legacyQuantity` is InventoryItem.quantity — the pre-batch figure.
         * Surfaced alongside rather than instead of the batch total so a store
         * can see where the two disagree while stock is being brought onto
         * batches, rather than silently trusting whichever it happened to read.
         */
        legacyQuantity: item.quantity,
        ...summary,
        batches: item.stockBatches
          .map((b) => ({
            id: b.id,
            batchNumber: b.batchNumber,
            status: b.status,
            owner: b.owner,
            expiryDate: b.expiryDate,
            daysUntilExpiry: daysUntilExpiry(b.expiryDate),
            sellingPrice: b.sellingPrice,
            quantityReserved: b.quantityReserved,
            location: b.location,
          }))
          // Soonest expiry first, matching the order stock will actually be drawn.
          .sort((a, x) => {
            const av = a.daysUntilExpiry ?? Number.POSITIVE_INFINITY;
            const xv = x.daysUntilExpiry ?? Number.POSITIVE_INFINITY;
            return av - xv;
          }),
      };
    });

    const filtered = lowOnly ? rows.filter((r) => r.belowReorderLevel || r.available === 0) : rows;

    return NextResponse.json({
      items: filtered,
      totals: {
        items: filtered.length,
        outOfStock: filtered.filter((r) => r.available === 0).length,
        belowReorder: filtered.filter((r) => r.belowReorderLevel).length,
        expiringSoon: filtered.reduce((s, r) => s + r.expiringSoon, 0),
      },
    });
  } catch (error) {
    console.error('[stock] availability failed:', error);
    return NextResponse.json({ error: 'Failed to load stock availability' }, { status: 500 });
  }
}
