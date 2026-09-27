// ============================================================
// GET /api/consumable-provider/consumption?pt=... — a supplier's own lines
// ------------------------------------------------------------
// The same consumption record as accounts reads, filtered to the supplier
// asking and valued at the price agreed with them. It answers the question a
// provider actually has: of what I supplied, what was used on this patient,
// and what am I owed for it.
//
// ── THE SCOPING IS THE WHOLE POINT ──────────────────────────────────────────
//
// These lines carry item, quantity and price. Shown unscoped, every provider
// would see every other provider's supply and pricing — commercially
// sensitive information the hospital has no right to disclose and no reason
// to. So the filter is not a convenience, it is the security boundary, and it
// is taken from the signed-in account's own vendorId rather than from
// anything the caller can send.
//
// A provider account with no vendor attached sees NOTHING, and is told why.
// Failing closed is the only safe direction here: the alternative is an
// unlinked account seeing everybody's.
//
// ── AND NOTHING CLINICAL ────────────────────────────────────────────────────
//
// The statement carries the procedure the items went into, because a supplier
// reconciling a hip prosthesis needs to know it went into a hip. It carries
// no diagnosis, no history, no notes. A supplier is a commercial counterparty,
// not a member of the care team.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { buildPatientStatement } from '@/lib/consumption/patientStatement';

export const dynamic = 'force-dynamic';

/**
 * Roles that read this as a supplier, scoped to their own vendor.
 *
 * Hospital staff who oversee supply are handled separately below: they are
 * not a supplier, so scoping them to one would show them nothing.
 */
const SUPPLIER_ROLES = ['CONSUMABLE_PACK_PROVIDER'];

/** Hospital-side roles that may see every supplier's lines. */
const OVERSIGHT_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'PROCUREMENT_OFFICER', 'THEATRE_STORE_KEEPER',
];

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = (session.user.role ?? '').toUpperCase();
  const isSupplier = SUPPLIER_ROLES.includes(role);
  const isOversight = OVERSIGHT_ROLES.includes(role);

  if (!isSupplier && !isOversight) {
    return NextResponse.json(
      { error: 'Not permitted to read consumption records.' }, { status: 403 });
  }

  const pt = request.nextUrl.searchParams.get('pt')?.trim();
  if (!pt) {
    return NextResponse.json(
      { error: 'Give a PT number: ?pt=PT12345' }, { status: 400 });
  }

  try {
    // The scope comes from the account, never from the request. A vendorId in
    // a query string would let any provider read any other provider's lines
    // by changing one parameter.
    let vendorId: string | null = null;

    if (isSupplier) {
      const me = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { vendorId: true },
      });
      vendorId = me?.vendorId ?? null;

      if (!vendorId) {
        // Fails closed, and says what to do about it. An unlinked provider
        // account seeing everything is the failure this endpoint exists to
        // prevent.
        return NextResponse.json({
          error: 'This provider account is not linked to a supplier, so there is nothing '
            + 'it may see. An administrator can attach it on the user record.',
          code: 'NO_VENDOR_LINK',
        }, { status: 403 });
      }
    }

    const statement = await buildPatientStatement(
      { ptNumber: pt },
      // A supplier is owed their agreed price; the hospital side looks at what
      // the patient is billed.
      { vendorId, valuation: isSupplier ? 'VENDOR' : 'PATIENT' },
    );

    if (!statement) {
      return NextResponse.json(
        { error: `No patient with PT number "${pt}".`, code: 'PATIENT_NOT_FOUND' },
        { status: 404 },
      );
    }

    return NextResponse.json({ ...statement, currency: 'NGN', amountUnit: 'kobo' });
  } catch (error) {
    return apiError('consumable-provider/consumption', error);
  }
}
