// ============================================================
// What one case needs, and what could not be supplied
// ------------------------------------------------------------
//   GET   — the case's special needs, for the surgeon, the store and
//           pharmacy. Everyone sees the same list.
//   PATCH — mark a line out of stock, or back in. Store and pharmacy only:
//           it is a statement about their shelf, and the slip a patient is
//           sent out with is printed from it.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';

export const dynamic = 'force-dynamic';

const SUPPLIER_ROLES = [
  'PHARMACIST',
  'HEAD_OF_PHARMACY',
  'THEATRE_STORE_KEEPER',
  'CONSUMABLE_PACK_PROVIDER',
  'PROCUREMENT_OFFICER',
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
];

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const needs = await prisma.surgerySpecialNeed.findMany({
      where: { surgeryId: params.id },
      include: { item: true },
      orderBy: [{ fromBundle: 'desc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json({ needs });
  } catch (err) {
    console.error('[special-needs] read failed:', err);
    return NextResponse.json({ error: 'Could not read what this case needs' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { role?: string; name?: string | null };
  if (!SUPPLIER_ROLES.includes(user.role ?? '')) {
    return NextResponse.json(
      { error: 'Only pharmacy or the consumable store can mark an item out of stock.' },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const needId = String(body?.needId ?? '');
    if (!needId) return NextResponse.json({ error: 'Which item?' }, { status: 400 });

    const outOfStock = Boolean(body?.outOfStock);

    // Scoped to this surgery as well as the id. Without the surgeryId an id
    // from anywhere would edit any case's list.
    const result = await prisma.surgerySpecialNeed.updateMany({
      where: { id: needId, surgeryId: params.id },
      data: {
        outOfStock,
        outOfStockAt: outOfStock ? new Date() : null,
        outOfStockByName: outOfStock ? (user.name ?? null) : null,
      },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: 'That item is not on this case' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[special-needs] update failed:', err);
    return NextResponse.json({ error: 'Could not record that' }, { status: 500 });
  }
}
