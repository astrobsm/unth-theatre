// ============================================================
// Deposits and packing for one case
// ------------------------------------------------------------
//   GET — anybody on the case, because "has my patient paid" is the
//         question the whole feature exists to answer.
//   PUT — pharmacy records the pharmacy side, the store records the
//         consumable side, and administrators can do either.
//
// THE TWO SIDES ARE SEPARATELY PERMISSIONED on purpose. A pharmacist
// marking the consumable pack as made up is recording something they
// cannot see, and the surgeon acting on it would be acting on a guess.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';

export const dynamic = 'force-dynamic';

const PHARMACY_ROLES = ['PHARMACIST', 'HEAD_OF_PHARMACY'];
const STORE_ROLES = ['THEATRE_STORE_KEEPER', 'CONSUMABLE_PACK_PROVIDER', 'PROCUREMENT_OFFICER'];
const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

const STATUSES = ['UNPAID', 'PAID', 'WAIVED'];

function serialise(row: Record<string, unknown> | null) {
  if (!row) return null;
  const dec = (v: unknown) => (v == null ? null : String(v));
  return {
    ...row,
    consumableAmount: dec(row.consumableAmount),
    pharmacyAmount: dec(row.pharmacyAmount),
    // The breakdown, so a receipt can show the contingency apart from the
    // consumables it is held against rather than one lump the patient
    // cannot question.
    consumableSubtotal: dec(row.consumableSubtotal),
    consumableContingency: dec(row.consumableContingency),
    pharmacySubtotal: dec(row.pharmacySubtotal),
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const row = await prisma.caseDepositStatus.findUnique({ where: { surgeryId: params.id } });
    return NextResponse.json({ deposit: serialise(row as never) });
  } catch (err) {
    console.error('[deposit] read failed:', err);
    return NextResponse.json({ error: 'Could not read the deposit status' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { role?: string; name?: string | null };
  const role = user.role ?? '';
  const isAdmin = ADMIN_ROLES.includes(role);
  const mayPharmacy = isAdmin || PHARMACY_ROLES.includes(role);
  const mayStore = isAdmin || STORE_ROLES.includes(role);

  if (!mayPharmacy && !mayStore) {
    return NextResponse.json(
      { error: 'Only pharmacy or the consumable store can record this.' },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const side = String(body?.side ?? '');
    if (side !== 'pharmacy' && side !== 'consumable') {
      return NextResponse.json({ error: 'Which side — pharmacy or consumable?' }, { status: 400 });
    }
    if (side === 'pharmacy' && !mayPharmacy) {
      return NextResponse.json({ error: 'Only pharmacy can record the pharmacy side.' }, { status: 403 });
    }
    if (side === 'consumable' && !mayStore) {
      return NextResponse.json({ error: 'Only the store can record the consumable side.' }, { status: 403 });
    }

    const data: Record<string, unknown> = {};
    const now = new Date();

    if (body?.status !== undefined) {
      const status = String(body.status);
      if (!STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
      }
      // A WAIVER WITHOUT A REASON IS INDISTINGUISHABLE FROM A MISTAKE, and
      // this is money a patient did not pay. Required, not encouraged.
      if (status === 'WAIVED' && !String(body?.waiverReason ?? '').trim()) {
        return NextResponse.json(
          { error: 'Say why the deposit is being waived.' },
          { status: 400 },
        );
      }
      data[`${side}Status`] = status;
      data[`${side}PaidAt`] = status === 'UNPAID' ? null : now;
      data[`${side}PaidByName`] = status === 'UNPAID' ? null : (user.name ?? null);
      if (status === 'WAIVED') data.waiverReason = String(body.waiverReason).trim().slice(0, 300);
    }

    if (body?.packed !== undefined) {
      const packedNow = Boolean(body.packed);
      data[`${side}PackedAt`] = packedNow ? now : null;
      data[`${side}PackedByName`] = packedNow ? (user.name ?? null) : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const row = await prisma.caseDepositStatus.upsert({
      where: { surgeryId: params.id },
      create: Object.assign({ surgeryId: params.id }, data) as never,
      update: data as never,
    });

    return NextResponse.json({ deposit: serialise(row as never) });
  } catch (err) {
    console.error('[deposit] update failed:', err);
    return NextResponse.json({ error: 'Could not record that' }, { status: 500 });
  }
}
