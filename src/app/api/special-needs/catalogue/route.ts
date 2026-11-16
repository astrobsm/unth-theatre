// ============================================================
// The special-needs catalogue
// ------------------------------------------------------------
//   GET  — what the booking form offers, optionally one category at a time.
//   POST — the OTHER path: add something the catalogue does not have.
//
// POST IS OPEN TO ANY SIGNED-IN CLINICIAN ON PURPOSE. A surgeon who needs a
// size the list does not carry is standing at a booking form at seven in
// the morning; routing that through an administrator means the case gets
// booked without it. The protection against nonsense is not a permission,
// it is the duplicate check and the minimum-name rule — and the fact that
// anything added is attributed and flagged isLocallyAdded, so a bad entry
// can be found and removed later rather than blocking a list now.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import { findDuplicate, isUsableName } from '@/lib/specialNeeds/normalise';
import { NOT_IN_PICKER } from '@/lib/specialNeeds/bundle';

export const dynamic = 'force-dynamic';

const CATEGORIES = [
  'SUTURE',
  'URETHRAL_CATHETER',
  'DRAIN',
  'HAEMOSTATIC_AGENT',
  'TRACHEOSTOMY_TUBE',
  'MESH',
  'CHEST_TUBE',
  'CHEST_DRAIN_BOTTLE',
  'ANTIBIOTIC',
  'SYRINGE',
  'IV_CANNULA',
  'GIVING_SET',
  'PLASTER',
  'GLOVES',
  'WATER_FOR_INJECTION',
  'BANDAGE',
  'CASTING',
  'LOCAL_ANAESTHETIC',
  'TRANSFUSION_ADJUNCT',
  'OTHER',
] as const;

export async function GET(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const category = request.nextUrl.searchParams.get('category');

    // AN UNPRICED ITEM IS STILL OFFERED, AND STILL BUNDLED.
    //
    // This used to withhold them. The reasoning was sound as far as it
    // went — a case carrying an unpriced line produces a deposit the
    // patient is told is incomplete — but the cost fell in the wrong
    // place. Several hundred items sat unpriced, so the magnitude
    // bundles silently dropped them, and a theatre list went down with a
    // pack short of things the store had on the shelf. A deposit that
    // says "this is not the full amount" is a conversation at the
    // cashier; a chest drain nobody ordered is a conversation in
    // theatre.
    //
    // So the price no longer decides whether an item can be issued. It
    // decides what the deposit SAYS: every unpriced line is counted,
    // carried on the case, named on the quote, and declared as a figure
    // still to be added. The pricing queue in Settings is now about the
    // money being right, not about the pack being complete.
    //
    // includeUnpriced is accepted and ignored: callers that passed it to
    // see the whole catalogue now get the whole catalogue either way.

    const items = await prisma.specialNeedItem.findMany({
      where: {
        isActive: true,
        ...(category && (CATEGORIES as readonly string[]).includes(category)
          ? { category: category as never }
          : {}),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }, { size: 'asc' }],
    });

    return NextResponse.json({
      items,
      // NOT "withheld" any more — nothing is. This is how many of the
      // items on offer carry no price, so a surgeon can be told that
      // choosing one is fine and that the deposit will say it is short
      // rather than being left to wonder why a figure looks low.
      //
      // Counted over the PICKER's categories only. The bundled ones
      // never appear there, priced or not, so including them would
      // report a shortfall against a list the surgeon cannot see.
      unpricedOnOffer: await prisma.specialNeedItem.count({
        where: {
          isActive: true,
          unitPrice: null,
          category: { notIn: NOT_IN_PICKER as never },
          ...(category && (CATEGORIES as readonly string[]).includes(category)
            ? { category: category as never }
            : {}),
        },
      }),
    });
  } catch (err) {
    console.error('[special-needs/catalogue] list failed:', err);
    return NextResponse.json({ error: 'Could not load the catalogue' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const category = String(body?.category ?? '').trim();
    const name = String(body?.name ?? '').trim();

    if (!(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: 'Unknown category' }, { status: 400 });
    }
    if (!isUsableName(name)) {
      return NextResponse.json(
        { error: 'Give the item a name of at least two characters.' },
        { status: 400 },
      );
    }

    const size = body?.size ? String(body.size).trim() || null : null;
    const brand = body?.brand ? String(body.brand).trim() || null : null;
    const specification = body?.specification ? String(body.specification).trim() || null : null;
    const dispensedByPharmacy = Boolean(body?.dispensedByPharmacy);

    // Compare against everything in the category rather than relying on the
    // unique index alone: the index is exact, and the whole point here is
    // catching "3-0" against "3/0".
    const candidates = await prisma.specialNeedItem.findMany({
      where: { category: category as never },
      select: { id: true, name: true, size: true, brand: true, category: true },
    });

    const duplicate = findDuplicate({ category, name, size, brand }, candidates);
    if (duplicate) {
      // Not an error. The surgeon wanted this item on the case and it
      // exists — hand back the row they meant so the form can select it.
      const existing = await prisma.specialNeedItem.findUnique({ where: { id: duplicate.id } });
      return NextResponse.json({ item: existing, alreadyExisted: true });
    }

    const user = session!.user as { id?: string; name?: string | null };
    const item = await prisma.specialNeedItem.create({
      data: {
        category: category as never,
        name,
        size,
        brand,
        specification,
        dispensedByPharmacy,
        isLocallyAdded: true,
        createdById: user.id ?? null,
        createdByName: user.name ?? null,
      },
    });

    return NextResponse.json({ item, alreadyExisted: false });
  } catch (err) {
    console.error('[special-needs/catalogue] create failed:', err);
    return NextResponse.json({ error: 'Could not add the item' }, { status: 500 });
  }
}
