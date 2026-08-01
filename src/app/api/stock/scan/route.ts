// ============================================================
// Scanning — turning a code into the thing it identifies
// ------------------------------------------------------------
// One endpoint behind every scan in the workflow: receiving, reserving,
// issuing, returning, consuming. A handheld scanner is a keyboard — it types
// the code and presses Enter — so the client sends whatever was typed and this
// answers with what it means.
//
// Resolution is deliberately ordered and exact. A code is matched against the
// batch barcode, then the QR payload, then the batch number. No fuzzy matching
// and no partial matching: a scan that resolves to the wrong lot is worse than
// one that resolves to nothing, because nobody checks a confident answer.
//
// An ambiguous code is refused outright rather than resolved to a first match.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireStock } from '@/lib/stock/access';
import { available, onHand } from '@/lib/stock/quantities';
import { daysUntilExpiry, isExpired } from '@/lib/stock/rules';

export const dynamic = 'force-dynamic';

const BATCH_SELECT = {
  id: true,
  batchNumber: true,
  lotNumber: true,
  barcode: true,
  status: true,
  owner: true,
  expiryDate: true,
  sellingPrice: true,
  quantityReceived: true,
  quantityReserved: true,
  quantityIssued: true,
  quantityReturned: true,
  quantityUsed: true,
  quantityDamaged: true,
  quantityExpired: true,
  quantityDisposed: true,
  item: { select: { id: true, name: true, category: true } },
  location: { select: { id: true, name: true, isControlled: true, isEmergency: true, isConsignment: true } },
  vendor: { select: { id: true, name: true } },
};

export async function GET(request: NextRequest) {
  const guard = await requireStock('view');
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const code = request.nextUrl.searchParams.get('code')?.trim();
  if (!code) {
    return NextResponse.json({ error: 'Nothing was scanned.' }, { status: 400 });
  }

  // A surgery id turns the answer into "what is reserved for this case", which
  // is what a scanner at the theatre door actually needs.
  const surgeryId = request.nextUrl.searchParams.get('surgeryId');

  try {
    const matches = await prisma.stockBatch.findMany({
      where: {
        deletedAt: null,
        OR: [{ barcode: code }, { qrPayload: code }, { batchNumber: code }],
      },
      select: BATCH_SELECT,
      take: 5,
    });

    if (matches.length === 0) {
      return NextResponse.json(
        {
          found: false,
          code,
          error: `Nothing matches "${code}". Check the label, or receive this stock before scanning it.`,
        },
        { status: 404 }
      );
    }

    if (matches.length > 1) {
      // Batch numbers are only unique within an item and a store, so the same
      // printed number can legitimately exist twice. Better to ask than guess.
      return NextResponse.json(
        {
          found: false,
          ambiguous: true,
          code,
          error: `"${code}" matches ${matches.length} lots. Scan the barcode rather than keying the batch number, or pick the right lot.`,
          candidates: matches.map((b) => ({
            id: b.id,
            batchNumber: b.batchNumber,
            item: b.item.name,
            location: b.location?.name ?? null,
            expiryDate: b.expiryDate,
          })),
        },
        { status: 409 }
      );
    }

    const batch = matches[0];
    const expired = isExpired(batch.expiryDate);

    // What this case has against this lot, so a scan at the theatre door can
    // say "three of these are yours" rather than just naming the item.
    const reservations = surgeryId
      ? await prisma.stockReservation.findMany({
          where: { surgeryId, batchId: batch.id },
          select: {
            id: true,
            quantityReserved: true,
            quantityIssued: true,
            quantityReturned: true,
            quantityUsed: true,
            quantityWasted: true,
            status: true,
          },
        })
      : [];

    // Warnings a person must see before this stock is used on a patient.
    const warnings: string[] = [];
    if (expired) warnings.push(`This lot expired on ${new Date(batch.expiryDate!).toLocaleDateString('en-GB')} and must not be used.`);
    else if (daysUntilExpiry(batch.expiryDate) !== null && daysUntilExpiry(batch.expiryDate)! <= 30) {
      warnings.push(`This lot expires in ${daysUntilExpiry(batch.expiryDate)} days — use it before newer stock.`);
    }
    if (batch.status === 'QUARANTINED') warnings.push('This lot is quarantined and must not be used.');
    if (batch.location?.isControlled) warnings.push('Controlled drug: issuing and discarding both need a witness.');
    if (batch.location?.isEmergency) warnings.push('Emergency stock: an elective case needs authorisation to draw on it.');
    if (batch.owner === 'VENDOR') warnings.push(`Consignment stock owned by ${batch.vendor?.name ?? 'a vendor'} until it is used.`);

    return NextResponse.json({
      found: true,
      code,
      batch: {
        ...batch,
        expired,
        daysUntilExpiry: daysUntilExpiry(batch.expiryDate),
        onHand: onHand(batch),
        available: available(batch),
      },
      reservations: reservations.map((r) => ({
        ...r,
        outstanding: r.quantityIssued - r.quantityReturned - r.quantityUsed - r.quantityWasted,
      })),
      warnings,
      // The client uses this to decide whether to offer an action at all.
      usable: !expired && batch.status !== 'QUARANTINED' && batch.status !== 'DISPOSED',
    });
  } catch (error) {
    console.error('[stock] scan failed:', error);
    return NextResponse.json({ error: 'Failed to resolve the scan' }, { status: 500 });
  }
}
