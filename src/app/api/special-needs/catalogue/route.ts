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

    // UNPRICED ITEMS ARE NOT OFFERED AT BOOKING.
    //
    // An item with no price cannot be deposited for, so putting it on a
    // case produces a figure the patient is told is incomplete and a
    // difference somebody asks them for at the theatre door. They are held
    // in the pricing queue in Settings instead, and the moment the store or
    // pharmacy prices one it reappears here on its own — nothing has to be
    // re-added, because this filter is the only thing keeping it out.
    //
    // includeUnpriced=1 is for the screens whose whole job is to find them.
    const includeUnpriced = request.nextUrl.searchParams.get('includeUnpriced') === '1';

    const items = await prisma.specialNeedItem.findMany({
      where: {
        isActive: true,
        ...(includeUnpriced ? {} : { unitPrice: { not: null } }),
        ...(category && (CATEGORIES as readonly string[]).includes(category)
          ? { category: category as never }
          : {}),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }, { size: 'asc' }],
    });

    return NextResponse.json({
      items,
      // So a caller can say "12 more are waiting to be priced" rather than
      // leaving a surgeon wondering where an item they know exists has gone.
      // Counts only what the PICKER would otherwise have shown. Bundled
      // categories are not offered there whether they are priced or not,
      // so counting them would tell a surgeon that items are missing from
      // a list they were never going to appear in.
      withheldUnpriced: includeUnpriced
        ? 0
        : await prisma.specialNeedItem.count({
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
