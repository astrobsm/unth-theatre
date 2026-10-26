// ============================================================
// The hospital's price list
// ------------------------------------------------------------
//   GET  — what the list holds and how it compares to what is stored, so
//          nobody presses the button without knowing what it will change.
//   POST — load it. Fills blank prices by default; overwrites only when
//          explicitly asked, and the differences were shown first.
//
// NOT RUN BY THE BUILD, for the same reason the standard catalogue is not:
// several hundred rows inserted as a side effect of a deployment turns one
// bad row into a blocked release, and on this project a failed migration
// step stops everything shipping.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/apiMiddleware';
import { importPriceList } from '@/lib/specialNeeds/importPriceList';
import { priceListSummary, UNTH_PRICE_LIST } from '@/lib/specialNeeds/unthPriceList';
import { toKobo } from '@/lib/specialNeeds/pricing';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'THEATRE_STORE_KEEPER',
  'HEAD_OF_PHARMACY',
] as const;

export async function GET() {
  const { error } = await requireRole(ADMIN_ROLES as never);
  if (error) return error;

  try {
    const summary = priceListSummary();

    const existing = await prisma.specialNeedItem.findMany({
      select: { category: true, name: true, size: true, brand: true, unitPrice: true, sourceCode: true },
    });

    const byCode = new Map(existing.filter((e) => e.sourceCode).map((e) => [e.sourceCode!, e]));
    const byNatural = new Map(
      existing.map((e) => [
        `${e.category}\u0000${e.name}\u0000${e.size ?? ''}\u0000${e.brand ?? ''}`,
        e,
      ]),
    );

    // A DRY RUN, so the button can say what it would do. Counted the same
    // way the import decides, so the preview and the result agree.
    let wouldAdd = 0;
    let wouldPrice = 0;
    let wouldDiffer = 0;

    UNTH_PRICE_LIST.forEach((item) => {
      const row =
        byCode.get(item.code) ??
        byNatural.get(`${item.category}\u0000${item.name}\u0000${item.size ?? ''}\u0000`);
      if (!row) {
        wouldAdd += 1;
        return;
      }
      if (!item.unitPrice) return;
      if (row.unitPrice == null) {
        wouldPrice += 1;
        return;
      }
      if (toKobo(String(row.unitPrice)) !== toKobo(item.unitPrice)) wouldDiffer += 1;
    });

    const [inCatalogue, pricedInCatalogue] = await Promise.all([
      prisma.specialNeedItem.count({ where: { isActive: true } }),
      prisma.specialNeedItem.count({ where: { isActive: true, unitPrice: { not: null } } }),
    ]);

    return NextResponse.json({
      list: summary,
      catalogue: { total: inCatalogue, priced: pricedInCatalogue },
      wouldAdd,
      wouldPrice,
      wouldDiffer,
    });
  } catch (err) {
    console.error('[price-list] preview failed:', err);
    return NextResponse.json({ error: 'Could not compare the price list' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireRole(ADMIN_ROLES as never);
  if (error) return error;

  try {
    let overwritePrices = false;
    try {
      const body = await request.json();
      overwritePrices = body?.overwritePrices === true;
    } catch {
      /* no body is the ordinary fill-the-blanks case */
    }

    const name = (session!.user as { name?: string | null }).name ?? null;
    const result = await importPriceList({
      overwritePrices,
      byName: name ? `${name} (price list)` : 'UNTH price list',
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[price-list] import failed:', err);
    return NextResponse.json(
      { error: 'Could not load the price list. Nothing that was already priced was changed.' },
      { status: 500 },
    );
  }
}
