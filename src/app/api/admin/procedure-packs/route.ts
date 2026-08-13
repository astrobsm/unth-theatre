import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { suggestPacks, packItemKey } from '@/lib/procedurePacks';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/procedure-packs?subspecialty=&unmappedOnly=1
 * POST /api/admin/procedure-packs   { mappings: [...] }
 *
 * The review screen behind procedure-to-pack mapping.
 *
 * GET returns every procedure the hospital actually books, each with its existing
 * mapping or a set of SUGGESTIONS carrying how the match was made and how far to
 * trust it. POST records what a person confirmed.
 *
 * Suggestions are never applied on their own. Which pack a hemicolectomy needs is
 * a clinical judgement, and auto-requesting the wrong pack is worse than
 * requesting none because somebody opens it before noticing. One person confirms
 * once; booking then reads the mapping and never guesses.
 */

const ADMIN_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CONSULTANT_SURGEON', 'NURSE_MANAGER',
];

/** Same normalisation as the mapping key, so lookups cannot drift apart. */
const keyFor = (name: string) => packItemKey({ name, quantity: 1 });

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role ?? '')) {
    return NextResponse.json({ error: 'Not permitted.' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const subspecialty = sp.get('subspecialty');
  const unmappedOnly = sp.get('unmappedOnly') === '1';

  // The procedures actually booked, not a catalogue nobody uses. Reviewing 2,000
  // theoretical procedures is a task nobody finishes; reviewing the 150 this
  // hospital books is an afternoon.
  const booked = await prisma.surgery.groupBy({
    by: ['procedureName', 'subspecialty'],
    where: subspecialty ? { subspecialty } : undefined,
    _count: { _all: true },
    orderBy: { _count: { procedureName: 'desc' } },
    take: 400,
  });

  const packs = await prisma.surgicalPack.findMany({
    where: { isActive: true },
    select: { id: true, name: true, subspecialty: true, kind: true },
  });

  const existing = await prisma.procedurePackMap.findMany({
    where: { isActive: true },
    select: {
      procedureKey: true, procedureName: true,
      consumablePackId: true, consumablePackName: true,
      pharmacyPackId: true, pharmacyPackName: true,
      confirmedAt: true, confirmedByName: true, suggestedBasis: true,
    },
  });
  const byKey = new Map(existing.map((m) => [m.procedureKey, m]));

  const rows = booked.map((b) => {
    const key = keyFor(b.procedureName);
    const mapped = byKey.get(key) ?? null;
    return {
      procedureKey: key,
      procedureName: b.procedureName,
      subspecialty: b.subspecialty,
      timesBooked: b._count._all,
      mapping: mapped,
      // Only computed where there is nothing confirmed. A confirmed mapping is a
      // decision; re-suggesting alternatives beside it invites second-guessing a
      // choice somebody already made.
      suggestions: mapped?.confirmedAt
        ? []
        : suggestPacks(b.procedureName, packs, b.subspecialty),
    };
  });

  const filtered = unmappedOnly ? rows.filter((r) => !r.mapping?.confirmedAt) : rows;

  return NextResponse.json({
    procedures: filtered,
    packs,
    summary: {
      total: rows.length,
      confirmed: rows.filter((r) => r.mapping?.confirmedAt).length,
      // What is left to do, which is the number the person doing this cares about.
      outstanding: rows.filter((r) => !r.mapping?.confirmedAt).length,
      withNoSuggestion: rows.filter((r) => !r.mapping && r.suggestions.length === 0).length,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; name?: string; role?: string } | undefined;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role ?? '')) {
    return NextResponse.json({ error: 'Not permitted.' }, { status: 403 });
  }

  let body: {
    mappings?: {
      procedureName: string;
      subspecialty?: string | null;
      consumablePackId?: string | null;
      pharmacyPackId?: string | null;
      notes?: string | null;
    }[];
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  const mappings = body.mappings ?? [];
  if (mappings.length === 0) {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  }

  const packIds = Array.from(new Set(
    mappings.flatMap((m) => [m.consumablePackId, m.pharmacyPackId]).filter(Boolean) as string[]
  ));
  const packs = packIds.length
    ? await prisma.surgicalPack.findMany({
        where: { id: { in: packIds } }, select: { id: true, name: true },
      })
    : [];
  const packName = new Map(packs.map((p) => [p.id, p.name]));

  if (packs.length !== packIds.length) {
    return NextResponse.json({ error: 'One or more packs were not found.' }, { status: 404 });
  }

  let saved = 0;
  await prisma.$transaction(async (tx) => {
    for (const m of mappings) {
      const key = keyFor(m.procedureName);
      if (!key) continue;

      const data = {
        procedureName: m.procedureName.trim(),
        subspecialty: m.subspecialty ?? null,
        consumablePackId: m.consumablePackId ?? null,
        pharmacyPackId: m.pharmacyPackId ?? null,
        // Snapshotted, so a renamed pack does not make an old mapping unreadable.
        consumablePackName: m.consumablePackId ? packName.get(m.consumablePackId) ?? null : null,
        pharmacyPackName: m.pharmacyPackId ? packName.get(m.pharmacyPackId) ?? null : null,
        notes: m.notes ?? null,
        // Confirmed by a person, which is what makes the mapping usable at
        // booking. Saving IS confirming — there is no separate step, because a
        // two-stage confirmation is a stage nobody completes.
        confirmedAt: new Date(),
        confirmedById: user.id ?? null,
        confirmedByName: user.name ?? null,
        suggestedBasis: 'CONFIRMED_BY_PERSON',
        isActive: true,
      };

      await tx.procedurePackMap.upsert({
        where: { procedureKey: key },
        create: { procedureKey: key, ...data },
        update: data,
      });
      saved++;
    }

    if (user.id) {
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'PROCEDURE_PACKS_MAPPED',
          tableName: 'procedure_pack_maps',
          changes: JSON.stringify({
            count: saved,
            procedures: mappings.map((m) => m.procedureName).slice(0, 50),
          }),
        },
      });
    }
  });

  return NextResponse.json({
    ok: true, saved,
    message: `${saved} procedure${saved === 1 ? '' : 's'} mapped. Bookings will now attach these packs automatically.`,
  });
}
