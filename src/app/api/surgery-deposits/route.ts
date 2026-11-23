/**
 * Deposits and collections for theatre cases.
 *
 * GET is open to any signed-in member of staff, because the ward nurse, the
 * anaesthetist and the pack provider all need to know whether a patient has
 * paid before the patient is wheeled anywhere. Writing is not: recording a
 * payment is the hospital saying money changed hands, and recording a
 * collection is the hospital saying a named person took the controlled drugs.
 *
 * THE DEPOSIT ROW IS CREATED ON DEMAND, NOT AT BOOKING. A case that nobody has
 * yet taken money for has no row and is reported as REQUESTED with the band
 * computed live. Raising two rows for every booking would fill the table with
 * thousands of untouched records and would freeze a price at booking time for
 * cases that get re-graded afterwards.
 *
 * THE BAND IS SNAPSHOTTED AT PAYMENT, and only then. Until somebody pays, the
 * figure shown is the live tariff; from the moment of payment it is whatever
 * was on the receipt. See the migration's note.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import {
  DEPOSIT_KINDS,
  STREAMS,
  allFeeFields,
  bandAmount,
  canAdvance,
  advanceRefusal,
  normaliseCategory,
  streamSpec,
  type DepositKind,
  type DepositStatus,
} from '@/lib/deposits/depositBands';

export const dynamic = 'force-dynamic';

/**
 * Who may record money and handovers.
 *
 * The consumable office and the store keeper for packs, the pharmacy for
 * drugs, theatre management and administrators over both. A scrub nurse is
 * deliberately NOT on this list even though they are the one collecting: the
 * person who takes the pack does not get to be the person who records that
 * they took it.
 */
const CONSUMABLE_WRITERS = [
  'CONSUMABLE_PACK_PROVIDER',
  'THEATRE_STORE_KEEPER',
  'THEATRE_MANAGER',
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
];

const PHARMACY_WRITERS = [
  'PHARMACIST',
  'HEAD_OF_PHARMACY',
  'THEATRE_STORE_KEEPER',
  'THEATRE_MANAGER',
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
];

function mayWrite(role: string | null | undefined, kind: DepositKind): boolean {
  const r = (role ?? '').trim();
  return (kind === 'CONSUMABLE' ? CONSUMABLE_WRITERS : PHARMACY_WRITERS).includes(r);
}

/** The settings row, as a plain object of strings so Decimal does not leak. */
async function feeSettings(): Promise<Record<string, string | null>> {
  const s = await prisma.theatreSetting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
  const out: Record<string, string | null> = {};
  for (const f of allFeeFields()) {
    const v = (s as unknown as Record<string, unknown>)[f] as { toString(): string } | null;
    out[f] = v == null ? null : v.toString();
  }
  return out;
}

const dec = (v: unknown): string | null =>
  v == null ? null : (v as { toString(): string }).toString();

function serialiseDeposit(d: Record<string, any>) {
  return {
    id: d.id,
    surgeryId: d.surgeryId,
    kind: d.kind as DepositKind,
    status: d.status as DepositStatus,
    expectedAmount: dec(d.expectedAmount),
    magnitudeAtPricing: d.magnitudeAtPricing,
    amountPaid: dec(d.amountPaid),
    receiptNumber: d.receiptNumber,
    paidAt: d.paidAt ? d.paidAt.toISOString() : null,
    paidRecordedByName: d.paidRecordedByName,
    waivedAt: d.waivedAt ? d.waivedAt.toISOString() : null,
    waivedByName: d.waivedByName,
    waivedReason: d.waivedReason,
    notes: d.notes,
  };
}

function serialiseCollection(c: Record<string, any>) {
  return {
    id: c.id,
    surgeryId: c.surgeryId,
    stream: c.stream,
    kind: c.kind,
    collectedById: c.collectedById,
    collectedByName: c.collectedByName,
    collectorKind: c.collectorKind,
    collectedAt: c.collectedAt ? c.collectedAt.toISOString() : null,
    recordedByName: c.recordedByName,
    notes: c.notes,
  };
}

/** The surgery ids a request is asking about, however it asked. */
async function targetSurgeryIds(request: NextRequest): Promise<string[] | null> {
  const p = request.nextUrl.searchParams;
  const one = p.get('surgeryId');
  if (one) return [one];

  const many = p.get('surgeryIds');
  if (many) {
    const ids = many.split(',').map((s) => s.trim()).filter(Boolean);
    // A cap, because this comes from a query string. 400 cases is far more
    // than any one theatre day and still a single cheap query.
    return ids.slice(0, 400);
  }

  const date = p.get('date');
  if (date) {
    const from = new Date(`${date}T00:00:00`);
    const to = new Date(`${date}T23:59:59.999`);
    if (isNaN(from.getTime())) return [];
    const rows = await prisma.surgery.findMany({
      where: { scheduledDate: { gte: from, lte: to } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  return null;
}

export async function GET(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const settings = await feeSettings();
    const ids = await targetSurgeryIds(request);

    if (ids === null) {
      // No target named. The bands alone are a legitimate thing to ask for —
      // the booking form quotes them before any case exists.
      return NextResponse.json({ settings, deposits: [], collections: [] });
    }
    if (ids.length === 0) {
      return NextResponse.json({ settings, deposits: [], collections: [] });
    }

    const [deposits, collections] = await Promise.all([
      prisma.surgeryDeposit.findMany({ where: { surgeryId: { in: ids } } }),
      prisma.surgeryPackCollection.findMany({ where: { surgeryId: { in: ids } } }),
    ]);

    return NextResponse.json({
      settings,
      deposits: deposits.map(serialiseDeposit),
      collections: collections.map(serialiseCollection),
    });
  } catch (err: any) {
    console.error('[surgery-deposits] GET failed:', err);
    return NextResponse.json(
      { error: err?.message || 'Could not load deposits' },
      { status: 500 },
    );
  }
}

/**
 * Record a payment, undo one, or waive a deposit.
 *
 * The status machine is in the lib, not here, and a refusal is returned in the
 * words it supplies: "Record the payment first" tells the person at the
 * counter what to do, where "invalid transition" tells them nothing.
 */
export async function PATCH(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error || !session) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const surgeryId = String(body?.surgeryId ?? '').trim();
    const kind = String(body?.kind ?? '').trim() as DepositKind;
    const action = String(body?.action ?? '').trim();

    if (!surgeryId) return NextResponse.json({ error: 'No case named.' }, { status: 400 });
    if (!DEPOSIT_KINDS.includes(kind)) {
      return NextResponse.json({ error: 'Unknown deposit kind.' }, { status: 400 });
    }
    if (!mayWrite((session.user as any).role, kind)) {
      return NextResponse.json(
        {
          error:
            kind === 'CONSUMABLE'
              ? 'Only the consumable office, the store keeper or theatre management can record a consumable deposit.'
              : 'Only the pharmacy, the store keeper or theatre management can record a pharmacy deposit.',
        },
        { status: 403 },
      );
    }

    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      select: { id: true, magnitude: true },
    });
    if (!surgery) return NextResponse.json({ error: 'Case not found.' }, { status: 404 });

    const existing = await prisma.surgeryDeposit.findUnique({
      where: { surgeryId_kind: { surgeryId, kind } },
    });
    const from: DepositStatus = (existing?.status as DepositStatus) ?? 'REQUESTED';

    const to: DepositStatus =
      action === 'MARK_PAID' ? 'PAID'
      : action === 'UNDO_PAID' ? 'REQUESTED'
      : action === 'WAIVE' ? 'WAIVED'
      : action === 'UNDO_WAIVE' ? 'REQUESTED'
      : (null as never);

    if (!to) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    if (!canAdvance(from, to)) {
      return NextResponse.json({ error: advanceRefusal(from, to) }, { status: 409 });
    }

    const who = session.user as any;
    const nowIso = new Date();

    const data: Record<string, unknown> = { status: to, kind, surgeryId };

    if (to === 'PAID') {
      // The band is frozen HERE and nowhere else. Up to this moment the screen
      // quotes the live tariff; from this moment it quotes the receipt.
      const expected = bandAmount(await feeSettings(), kind, surgery.magnitude);
      const category = normaliseCategory(surgery.magnitude);
      const typed = body?.amountPaid == null || body.amountPaid === '' ? null : Number(body.amountPaid);

      data.expectedAmount = expected;
      data.magnitudeAtPricing = category;
      data.amountPaid = typed != null && Number.isFinite(typed) ? typed : expected;
      data.receiptNumber = String(body?.receiptNumber ?? '').trim() || null;
      data.paidAt = nowIso;
      data.paidRecordedById = who.id;
      data.paidRecordedByName = who.fullName || who.name || null;
    }

    if (to === 'WAIVED') {
      const reason = String(body?.reason ?? '').trim();
      if (!reason) {
        return NextResponse.json(
          { error: 'Say why the deposit is being waived. A waiver with no reason is not a record.' },
          { status: 400 },
        );
      }
      data.waivedAt = nowIso;
      data.waivedById = who.id;
      data.waivedByName = who.fullName || who.name || null;
      data.waivedReason = reason;
    }

    if (to === 'REQUESTED') {
      // Undoing clears the half it undid, and only that half.
      if (from === 'PAID') {
        data.paidAt = null;
        data.amountPaid = null;
        data.receiptNumber = null;
        data.paidRecordedById = null;
        data.paidRecordedByName = null;
      } else {
        data.waivedAt = null;
        data.waivedById = null;
        data.waivedByName = null;
        data.waivedReason = null;
      }
    }

    if (body?.notes !== undefined) data.notes = String(body.notes ?? '').trim() || null;

    const saved = await prisma.surgeryDeposit.upsert({
      where: { surgeryId_kind: { surgeryId, kind } },
      create: data as any,
      update: data as any,
    });

    await prisma.auditLog.create({
      data: {
        userId: who.id,
        action: `SURGERY_DEPOSIT_${action}`,
        tableName: 'surgery_deposits',
        recordId: saved.id,
        changes: JSON.stringify({ surgeryId, kind, from, to, receipt: data.receiptNumber ?? null }),
      },
    }).catch((e) => console.error('[surgery-deposits] audit failed:', e));

    return NextResponse.json(serialiseDeposit(saved as any));
  } catch (err: any) {
    console.error('[surgery-deposits] PATCH failed:', err);
    return NextResponse.json(
      { error: err?.message || 'Could not save the deposit' },
      { status: 500 },
    );
  }
}

/**
 * Record (or undo) a collection of one half of a pack.
 *
 * A collection cannot be recorded before the matching deposit is paid or
 * waived — that is the whole point of the two tracks sitting beside each
 * other. The deposit advances to COLLECTED only when BOTH of its halves are
 * out, because a consumable deposit that has released the surgical pack but
 * not the anaesthetic consumables is not finished with.
 */
export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error || !session) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const surgeryId = String(body?.surgeryId ?? '').trim();
    const stream = String(body?.stream ?? '').trim();
    const undo = body?.undo === true;

    const spec = streamSpec(stream);
    if (!surgeryId || !spec) {
      return NextResponse.json({ error: 'No case or no pack named.' }, { status: 400 });
    }
    if (!mayWrite((session.user as any).role, spec.kind)) {
      return NextResponse.json(
        { error: `Only the ${spec.kind === 'CONSUMABLE' ? 'consumable office' : 'pharmacy'}, the store keeper or theatre management can sign a pack out.` },
        { status: 403 },
      );
    }

    const who = session.user as any;

    if (undo) {
      await prisma.surgeryPackCollection.deleteMany({ where: { surgeryId, stream } });
      await syncDepositCollected(surgeryId, spec.kind);
      return NextResponse.json({ ok: true, undone: true });
    }

    const collectedById = String(body?.collectedById ?? '').trim() || null;
    let collectedByName = String(body?.collectedByName ?? '').trim();

    if (collectedById) {
      // Trust the id over the name the browser sent. A stale dropdown would
      // otherwise write yesterday's name against today's account id.
      const u = await prisma.user.findUnique({
        where: { id: collectedById },
        select: { fullName: true },
      });
      if (u?.fullName) collectedByName = u.fullName;
    }

    if (!collectedByName) {
      return NextResponse.json(
        { error: `Name the ${spec.collectorLabel} who collected it. "Theatre" is not a name anybody can be asked about later.` },
        { status: 400 },
      );
    }

    const deposit = await prisma.surgeryDeposit.findUnique({
      where: { surgeryId_kind: { surgeryId, kind: spec.kind } },
      select: { status: true },
    });
    const paid = deposit?.status === 'PAID' || deposit?.status === 'COLLECTED' || deposit?.status === 'WAIVED';
    if (!paid) {
      return NextResponse.json(
        { error: 'Record the payment first. A pack cannot be collected before it has been paid for.' },
        { status: 409 },
      );
    }

    const data = {
      surgeryId,
      stream,
      kind: spec.kind,
      collectedById,
      collectedByName,
      collectorKind: spec.collector,
      collectedAt: new Date(),
      recordedById: who.id,
      recordedByName: who.fullName || who.name || null,
      notes: String(body?.notes ?? '').trim() || null,
    };

    const saved = await prisma.surgeryPackCollection.upsert({
      where: { surgeryId_stream: { surgeryId, stream } },
      create: data,
      update: data,
    });

    await syncDepositCollected(surgeryId, spec.kind);

    await prisma.auditLog.create({
      data: {
        userId: who.id,
        action: 'SURGERY_PACK_COLLECTED',
        tableName: 'surgery_pack_collections',
        recordId: saved.id,
        changes: JSON.stringify({ surgeryId, stream, collectedByName }),
      },
    }).catch((e) => console.error('[surgery-deposits] collection audit failed:', e));

    return NextResponse.json(serialiseCollection(saved as any));
  } catch (err: any) {
    console.error('[surgery-deposits] POST failed:', err);
    return NextResponse.json(
      { error: err?.message || 'Could not record the collection' },
      { status: 500 },
    );
  }
}

/**
 * Move a deposit to COLLECTED once both of its halves are out, and back when
 * one is undone.
 *
 * Recomputed from the collection rows rather than counted up as they arrive,
 * so an undo cannot leave the deposit claiming a pack is still out.
 */
async function syncDepositCollected(surgeryId: string, kind: DepositKind) {
  const wanted = STREAMS.filter((s) => s.kind === kind).map((s) => s.stream);
  const out = await prisma.surgeryPackCollection.findMany({
    where: { surgeryId, stream: { in: wanted } },
    select: { stream: true, collectedAt: true },
  });
  const allOut = wanted.every((s) => out.some((r) => r.stream === s && r.collectedAt));

  const deposit = await prisma.surgeryDeposit.findUnique({
    where: { surgeryId_kind: { surgeryId, kind } },
    select: { id: true, status: true, paidAt: true, waivedAt: true },
  });
  if (!deposit) return;

  if (allOut && deposit.status !== 'COLLECTED') {
    await prisma.surgeryDeposit.update({
      where: { id: deposit.id },
      data: { status: 'COLLECTED' },
    });
  } else if (!allOut && deposit.status === 'COLLECTED') {
    // Back to whichever way it was settled. A waived deposit must not come
    // back as PAID — nobody paid it.
    await prisma.surgeryDeposit.update({
      where: { id: deposit.id },
      data: { status: deposit.waivedAt ? 'WAIVED' : 'PAID' },
    });
  }
}
