// ============================================================
// What each size of case is given automatically
// ------------------------------------------------------------
//   GET    — the bundle for every magnitude, with prices, so an
//            administrator can see what a case of that size will cost
//            before anybody books one.
//   PUT    — add or change a line.
//   DELETE — remove a line.
//
// These were hard-coded. What a minor case needs is a clinical judgement
// belonging to this hospital, not to the code, and changing it should not
// require a deployment.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/apiMiddleware';
import { MAGNITUDES, quoteFor, type Magnitude } from '@/lib/specialNeeds/pricing';
import { seedMagnitudeBundles } from '@/lib/specialNeeds/seedBundles';

export const dynamic = 'force-dynamic';

const EDIT_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'THEATRE_STORE_KEEPER',
  'HEAD_OF_PHARMACY',
] as const;

// READABLE BY ANYONE WHO CAN BOOK, not just by those who can edit.
//
// The booking form resolves what a case carries from this, so a surgeon
// has to be able to read it. Gating the read to administrators is what
// made the editor cosmetic: the form could not see the table, so it fell
// back to the built-in list and every edit made here changed nothing.
// Editing stays restricted below.
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const rows = await prisma.magnitudeBundleItem.findMany({
      include: { item: true },
      orderBy: [{ magnitude: 'asc' }, { createdAt: 'asc' }],
    });

    const byMagnitude = MAGNITUDES.map((m) => {
      const lines = rows.filter((r) => r.magnitude === m);
      // Priced here as well as listed, because "what will a major case
      // cost" is the question an administrator is actually asking, and
      // adding it up by hand from twenty lines invites arithmetic errors.
      const quote = quoteFor(
        lines.map((l) => ({
          unitPrice: l.item.unitPrice == null ? null : String(l.item.unitPrice),
          quantity: l.quantity,
          dispensedByPharmacy: l.item.dispensedByPharmacy,
          name: l.item.name,
        })),
      );
      return {
        magnitude: m,
        lines: lines.map((l) => ({
          id: l.id,
          itemId: l.itemId,
          quantity: l.quantity,
          name: l.item.name,
          size: l.item.size,
          category: l.item.category,
          dispensedByPharmacy: l.item.dispensedByPharmacy,
          unitPrice: l.item.unitPrice == null ? null : String(l.item.unitPrice),
        })),
        quote,
      };
    });

    return NextResponse.json({ bundles: byMagnitude });
  } catch (err) {
    console.error('[bundles] list failed:', err);
    return NextResponse.json({ error: 'Could not load the bundles' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { error, session } = await requireRole(EDIT_ROLES as never);
  if (error) return error;

  try {
    const body = await request.json();
    const magnitude = String(body?.magnitude ?? '') as Magnitude;
    const itemId = String(body?.itemId ?? '');
    const quantity = Math.max(1, Math.floor(Number(body?.quantity) || 1));

    if (!(MAGNITUDES as string[]).includes(magnitude)) {
      return NextResponse.json({ error: 'Unknown magnitude' }, { status: 400 });
    }
    if (!itemId) return NextResponse.json({ error: 'Which item?' }, { status: 400 });

    const exists = await prisma.specialNeedItem.findUnique({
      where: { id: itemId },
      select: { id: true },
    });
    if (!exists) return NextResponse.json({ error: 'No such item' }, { status: 404 });

    const name = (session!.user as { name?: string | null }).name ?? null;

    // Upsert on (magnitude, itemId): adding the same glove twice is a
    // change of quantity, not a second line. Two lines for one item would
    // be two picks in the store and two charges on the deposit.
    const row = await prisma.magnitudeBundleItem.upsert({
      where: { magnitude_itemId: { magnitude, itemId } },
      create: { magnitude, itemId, quantity, updatedByName: name },
      update: { quantity, updatedByName: name },
    });

    return NextResponse.json({ line: row });
  } catch (err) {
    console.error('[bundles] save failed:', err);
    return NextResponse.json({ error: 'Could not save that line' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { error } = await requireRole(EDIT_ROLES as never);
  if (error) return error;

  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Which line?' }, { status: 400 });
    await prisma.magnitudeBundleItem.deleteMany({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[bundles] delete failed:', err);
    return NextResponse.json({ error: 'Could not remove that line' }, { status: 500 });
  }
}

// ============================================================
// POST — copy the built-in standard bundles into this table.
//
// Separate from PUT because it is a different act: PUT is one line being
// changed by a person, this is four bundles arriving at once. Adds only
// what is absent, so pressing it after the theatre has edited a bundle
// does not undo the edit, and a line somebody deliberately removed stays
// removed.
// ============================================================
export async function POST() {
  const { error, session } = await requireRole(EDIT_ROLES as never);
  if (error) return error;

  try {
    const name = (session!.user as { name?: string | null }).name ?? null;
    const result = await seedMagnitudeBundles(name ? `${name} (standard bundles)` : null);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[bundles] seeding failed:', err);
    return NextResponse.json(
      { error: 'Could not load the standard bundles. Nothing already set was changed.' },
      { status: 500 },
    );
  }
}
