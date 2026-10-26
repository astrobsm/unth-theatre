// ============================================================
// Setting what things cost
// ------------------------------------------------------------
//   GET — the catalogue with prices, for whichever side is asking.
//   PUT — set a unit price.
//
// SPLIT BY WHO DISPENSES IT. The consumable store prices consumables, the
// pharmacy prices drugs, and neither can price the other's. A store keeper
// setting the price of ceftriaxone is guessing, and the number would be
// charged to a patient.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';

export const dynamic = 'force-dynamic';

const PHARMACY_ROLES = ['PHARMACIST', 'HEAD_OF_PHARMACY'];
const STORE_ROLES = ['THEATRE_STORE_KEEPER', 'CONSUMABLE_PACK_PROVIDER', 'PROCUREMENT_OFFICER'];
const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

function permissionsFor(role: string) {
  const isAdmin = ADMIN_ROLES.includes(role);
  return {
    pharmacy: isAdmin || PHARMACY_ROLES.includes(role),
    consumables: isAdmin || STORE_ROLES.includes(role),
  };
}

export async function GET(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const role = (session!.user as { role?: string }).role ?? '';
  const may = permissionsFor(role);
  if (!may.pharmacy && !may.consumables) {
    return NextResponse.json(
      { error: 'Only pharmacy or the consumable store can set prices.' },
      { status: 403 },
    );
  }

  try {
    const side = request.nextUrl.searchParams.get('side');
    // Default to whichever side this person can actually price, so the
    // page opens on their own list rather than an empty one.
    const wantPharmacy = side ? side === 'pharmacy' : may.pharmacy && !may.consumables;

    const items = await prisma.specialNeedItem.findMany({
      where: { isActive: true, dispensedByPharmacy: wantPharmacy },
      orderBy: [{ category: 'asc' }, { name: 'asc' }, { size: 'asc' }],
      select: {
        id: true,
        category: true,
        name: true,
        size: true,
        brand: true,
        unitPrice: true,
        pricedAt: true,
        pricedByName: true,
        dispensedByPharmacy: true,
      },
    });

    return NextResponse.json({
      side: wantPharmacy ? 'pharmacy' : 'consumables',
      may,
      items: items.map((i) => ({ ...i, unitPrice: i.unitPrice == null ? null : String(i.unitPrice) })),
      unpriced: items.filter((i) => i.unitPrice == null).length,
    });
  } catch (err) {
    console.error('[pricing] list failed:', err);
    return NextResponse.json({ error: 'Could not load prices' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { role?: string; name?: string | null };
  const may = permissionsFor(user.role ?? '');

  try {
    const body = await request.json();
    const itemId = String(body?.itemId ?? '');
    if (!itemId) return NextResponse.json({ error: 'Which item?' }, { status: 400 });

    const item = await prisma.specialNeedItem.findUnique({
      where: { id: itemId },
      select: { dispensedByPharmacy: true },
    });
    if (!item) return NextResponse.json({ error: 'No such item' }, { status: 404 });

    // The permission follows the ITEM, not the request. A store keeper
    // cannot price a drug by asking nicely.
    const allowed = item.dispensedByPharmacy ? may.pharmacy : may.consumables;
    if (!allowed) {
      return NextResponse.json(
        {
          error: item.dispensedByPharmacy
            ? 'Only pharmacy can price a drug.'
            : 'Only the consumable store can price a consumable.',
        },
        { status: 403 },
      );
    }

    const raw = body?.unitPrice;

    // CLEARING A PRICE AND SETTING IT TO ZERO ARE DIFFERENT. Null means
    // nobody has priced it and the deposit says so; zero means it is
    // genuinely free. Collapsing them would quietly undercharge.
    let unitPrice: number | null = null;
    if (raw !== null && raw !== '' && raw !== undefined) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: 'A price must be zero or more, or empty to clear it.' },
          { status: 400 },
        );
      }
      unitPrice = n;
    }

    const updated = await prisma.specialNeedItem.update({
      where: { id: itemId },
      data: {
        unitPrice,
        pricedAt: unitPrice === null ? null : new Date(),
        pricedByName: unitPrice === null ? null : (user.name ?? null),
      },
      select: { id: true, unitPrice: true, pricedAt: true, pricedByName: true },
    });

    return NextResponse.json({
      item: { ...updated, unitPrice: updated.unitPrice == null ? null : String(updated.unitPrice) },
    });
  } catch (err) {
    console.error('[pricing] update failed:', err);
    return NextResponse.json({ error: 'Could not save that price' }, { status: 500 });
  }
}
