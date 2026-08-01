// ============================================================
// Vendors — the register, and maintaining it
// ------------------------------------------------------------
// Reuses the existing Vendor model rather than introducing a second one. It was
// added for imprest expenditure and already carries what consignment settlement
// needs: bank details, and a TIN encrypted at rest.
//
// It existed but was READ-ONLY and empty — listed by the imprest reference
// endpoint with no way to create or edit a row anywhere in the app. So a
// consignment batch had no owner it could name. That is what this route fixes.
//
// No vendor is ever hardcoded. Every supplier — including the consumable pack
// providers already working with the unit — is a row somebody can add, rename
// or retire without a deployment.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireStock } from '@/lib/stock/access';
import { idempotencyKeyFrom, replayIfSeen, rememberResult } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

const SELECT = {
  id: true,
  name: true,
  phone: true,
  address: true,
  bankName: true,
  accountNumber: true,
  isActive: true,
  createdAt: true,
  _count: { select: { stockBatches: true } },
} satisfies Prisma.VendorSelect;

// ---------------------------------------------------------------------------
// GET — the vendor register
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const guard = await requireStock('view');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const q = sp.get('q')?.trim();

  try {
    const vendors = await prisma.vendor.findMany({
      where: {
        deletedAt: null,
        ...(sp.get('activeOnly') === 'true' ? { isActive: true } : {}),
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      select: SELECT,
      orderBy: { name: 'asc' },
      take: 200,
    });

    // The TIN is deliberately not returned: it is encrypted at rest precisely so
    // it is not handed out to every screen that lists suppliers.
    return NextResponse.json({ vendors });
  } catch (error) {
    console.error('[stock] vendor list failed:', error);
    return NextResponse.json({ error: 'Failed to load vendors' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — add a vendor
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requireStock('receive');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body: {
    name?: string;
    phone?: string | null;
    address?: string | null;
    bankName?: string | null;
    accountNumber?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'A vendor name is required.' }, { status: 400 });

  const idemKey = idempotencyKeyFrom(request);
  const replayed = await replayIfSeen(idemKey);
  if (replayed) return replayed;

  try {
    // Two rows for the same supplier would split its consignment stock and its
    // settlement between them, so a near-duplicate is refused rather than
    // silently created.
    const clash = await prisma.vendor.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, deletedAt: null },
      select: { id: true, name: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: `${clash.name} is already on the vendor register.`, vendorId: clash.id },
        { status: 409 }
      );
    }

    const vendor = await prisma.vendor.create({
      data: {
        name,
        phone: body.phone?.trim() || null,
        address: body.address?.trim() || null,
        bankName: body.bankName?.trim() || null,
        accountNumber: body.accountNumber?.trim() || null,
      },
      select: SELECT,
    });

    const payload = { vendor, success: true };
    await rememberResult(idemKey, 201, payload);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    console.error('[stock] vendor create failed:', error);
    return NextResponse.json({ error: 'Failed to add the vendor' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH — edit one, or retire it
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const guard = await requireStock('receive');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'Which vendor?' }, { status: 400 });

  try {
    const existing = await prisma.vendor.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, _count: { select: { stockBatches: true } } },
    });
    if (!existing) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });

    // A vendor that still owns consignment stock cannot be retired — that stock
    // is their property and somebody has to be able to settle for it.
    if (body.isActive === false && existing._count.stockBatches > 0) {
      const held = await prisma.stockBatch.count({
        where: { vendorId: id, deletedAt: null, owner: 'VENDOR', status: { notIn: ['DISPOSED', 'EXPIRED'] } },
      });
      if (held > 0) {
        return NextResponse.json(
          {
            error: `${existing.name} still owns ${held} consignment lot(s). Settle or return them before retiring the vendor.`,
            code: 'VENDOR_HAS_STOCK',
          },
          { status: 409 }
        );
      }
    }

    const data: Prisma.VendorUpdateInput = {};
    for (const field of ['name', 'phone', 'address', 'bankName', 'accountNumber'] as const) {
      if (typeof body[field] === 'string') {
        (data as Record<string, unknown>)[field] = (body[field] as string).trim() || null;
      }
    }
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
    }

    const vendor = await prisma.vendor.update({ where: { id }, data, select: SELECT });
    return NextResponse.json({ vendor, success: true });
  } catch (error) {
    console.error('[stock] vendor update failed:', error);
    return NextResponse.json({ error: 'Failed to update the vendor' }, { status: 500 });
  }
}
