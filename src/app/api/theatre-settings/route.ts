// ============================================================
// Theatre-wide settings
// ------------------------------------------------------------
//   GET — readable by any signed-in member of staff, because the booking
//         form and the anaesthesia review both need the deposit notice and
//         the fees in order to render.
//   PUT — administrators only. These numbers are what a patient is asked to
//         pay, and the notice tells wards to stop writing prescriptions.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/apiMiddleware';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
] as const;

const FEE_FIELDS = [
  'minorConsumableFee',
  'intermediateConsumableFee',
  'majorConsumableFee',
  'minorPharmacyFee',
  'intermediatePharmacyFee',
  'majorPharmacyFee',
] as const;

/** Ensure the singleton exists, so no caller has to cope with its absence. */
async function readSettings() {
  return prisma.theatreSetting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
}

/**
 * Decimal columns come back as Prisma Decimal, which does not survive
 * JSON.stringify as a number. Sent as strings so no rounding happens on the
 * way out — these are amounts of money.
 */
function serialise(s: Awaited<ReturnType<typeof readSettings>>) {
  const fees: Record<string, string | null> = {};
  for (const f of FEE_FIELDS) {
    const v = s[f as keyof typeof s] as unknown as { toString(): string } | null;
    fees[f] = v == null ? null : v.toString();
  }
  return {
    depositNoticeEnabled: s.depositNoticeEnabled,
    depositNoticeText: s.depositNoticeText,
    ...fees,
    updatedAt: s.updatedAt,
    updatedByName: s.updatedByName,
  };
}

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    return NextResponse.json(serialise(await readSettings()));
  } catch (err) {
    console.error('[theatre-settings] read failed:', err);
    return NextResponse.json({ error: 'Could not load settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { error, session } = await requireRole(ADMIN_ROLES as never);
  if (error) return error;

  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (typeof body?.depositNoticeEnabled === 'boolean') {
      data.depositNoticeEnabled = body.depositNoticeEnabled;
    }
    if (typeof body?.depositNoticeText === 'string' && body.depositNoticeText.trim()) {
      data.depositNoticeText = body.depositNoticeText.trim().slice(0, 500);
    }

    for (const f of FEE_FIELDS) {
      if (!(f in (body ?? {}))) continue;
      const raw = body[f];

      // CLEARING A FEE AND SETTING IT TO ZERO ARE DIFFERENT THINGS. Null
      // means nobody has decided yet, and the booking form says so rather
      // than telling a cashier to collect nothing.
      if (raw === null || raw === '') {
        data[f] = null;
        continue;
      }

      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: `${f} must be a positive amount, or empty to clear it.` },
          { status: 400 },
        );
      }
      data[f] = n;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const user = session!.user as { id?: string; name?: string | null };
    data.updatedById = user.id ?? null;
    data.updatedByName = user.name ?? null;

    const updated = await prisma.theatreSetting.upsert({
      where: { id: 'singleton' },
      create: Object.assign({ id: 'singleton' }, data) as never,
      update: data as never,
    });

    return NextResponse.json(serialise(updated));
  } catch (err) {
    console.error('[theatre-settings] update failed:', err);
    return NextResponse.json({ error: 'Could not save settings' }, { status: 500 });
  }
}
