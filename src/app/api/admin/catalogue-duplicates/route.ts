/**
 * The same item, entered more than once — for an administrator to settle.
 *
 * GET  — the groups that look like one item under several names.
 * POST — keep one of them, or say they are genuinely different.
 *
 * NOTHING IS DELETED AND NOTHING IS AUTOMATIC. A template id is written onto
 * every pack line raised from it, so deleting one would orphan rows on cases
 * already booked. Retiring sets isActive = false and records which row took
 * its place: the history stays readable and the decision can be undone.
 *
 * AND THE CHOICE IS A PERSON'S. "10% Dextrous water" and "Dextrose 10% (1 L)"
 * are one fluid, but they are not equally good names and nothing here knows
 * which one the store calls it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { roleAllowed } from '@/lib/roleGroups';
import { groupDuplicates, retireCount, type CatalogueRow } from '@/lib/catalogue/duplicates';
import { nhiaItemByCode } from '@/lib/payer/nhiaPriceList';

export const dynamic = 'force-dynamic';

/** Who may retire a catalogue row. The NHIA desk maintains coverage, not this. */
const MAY_RESOLVE = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'];
const MAY_VIEW = [...MAY_RESOLVE, 'CONSUMABLE_PACK_PROVIDER', 'PHARMACIST', 'NHIA_PHARMACY'];

type Kind = 'CONSUMABLE' | 'PHARMACY';

async function loadRows(kind: Kind): Promise<CatalogueRow[]> {
  if (kind === 'CONSUMABLE') {
    const rows = await prisma.surgicalConsumableTemplate.findMany({
      where: { isActive: true, nhiaCode: { not: null }, dedupeConfirmedAt: null },
      select: {
        id: true, name: true, size: true, unit: true, defaultQuantity: true,
        isActive: true, nhiaCode: true, createdAt: true,
      },
    });
    if (rows.length === 0) return [];
    // How many pack lines have ever been raised from each. This is what the
    // suggestion turns on: the row the theatre has been ordering is the row
    // the theatre knows, whatever anybody thinks of its spelling.
    const used = await prisma.surgeryConsumableRequest.groupBy({
      by: ['templateId'],
      where: { templateId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    const byId = new Map(used.map((u) => [u.templateId, u._count._all]));
    return rows.map((r) => ({ ...r, usage: byId.get(r.id) ?? 0 }));
  }

  const rows = await prisma.surgicalDrugDressingTemplate.findMany({
    where: { isActive: true, nhiaCode: { not: null }, dedupeConfirmedAt: null },
    select: {
      id: true, name: true, defaultDosage: true, unit: true, defaultQuantity: true,
      isActive: true, nhiaCode: true, createdAt: true,
    },
  });
  if (rows.length === 0) return [];
  const used = await prisma.surgeryDrugDressingRequest.groupBy({
    by: ['templateId'],
    where: { templateId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const byId = new Map(used.map((u) => [u.templateId, u._count._all]));
  return rows.map(({ defaultDosage, ...r }) => ({
    ...r, size: defaultDosage, usage: byId.get(r.id) ?? 0,
  }));
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? null;
  if (!roleAllowed(role, MAY_VIEW)) {
    return NextResponse.json({ error: 'Not authorised to read the catalogue.' }, { status: 403 });
  }

  const [consumables, pharmacy] = await Promise.all([loadRows('CONSUMABLE'), loadRows('PHARMACY')]);

  const decorate = (kind: Kind, rows: CatalogueRow[]) =>
    groupDuplicates(rows).map((g) => ({
      ...g,
      kind,
      // The Authority's own name for what these all are, so an admin is
      // choosing between spellings with the reference in front of them.
      nhiaName: nhiaItemByCode(g.nhiaCode)?.name ?? null,
      nhiaStrength: nhiaItemByCode(g.nhiaCode)?.strength ?? null,
    }));

  const groups = [
    ...decorate('CONSUMABLE', consumables),
    ...decorate('PHARMACY', pharmacy),
  ];

  return NextResponse.json({
    groups,
    totals: {
      groups: groups.length,
      wouldRetire: retireCount(groups),
    },
    canResolve: roleAllowed(role, MAY_RESOLVE),
  });
}

const resolveSchema = z.object({
  kind: z.enum(['CONSUMABLE', 'PHARMACY']),
  action: z.enum(['KEEP_ONE', 'ALL_DISTINCT']),
  /** Every row in the group, so the server never infers the set. */
  ids: z.array(z.string().min(1)).min(2).max(50),
  /** Required for KEEP_ONE, and must be one of `ids`. */
  keepId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = session.user as { id?: string; role?: string; name?: string; fullName?: string };
  if (!roleAllowed(user.role, MAY_RESOLVE)) {
    return NextResponse.json(
      { error: 'Only an administrator or the theatre manager may retire a catalogue item.' },
      { status: 403 },
    );
  }
  if (!user.id) {
    return NextResponse.json({ error: 'Sign in again — the change must be attributable.' }, { status: 401 });
  }

  let input: z.infer<typeof resolveSchema>;
  try {
    input = resolveSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Could not read that decision.', details: e.errors }, { status: 400 });
    }
    throw e;
  }

  if (input.action === 'KEEP_ONE' && (!input.keepId || !input.ids.includes(input.keepId))) {
    return NextResponse.json(
      { error: 'Choose which of these to keep.' },
      { status: 400 },
    );
  }

  const now = new Date();
  const who = user.fullName || user.name || null;
  const isConsumable = input.kind === 'CONSUMABLE';
  const model = isConsumable
    ? prisma.surgicalConsumableTemplate
    : prisma.surgicalDrugDressingTemplate;

  if (input.action === 'ALL_DISTINCT') {
    // Not duplicates after all. Marked so the pair stops being offered every
    // time somebody opens the screen — a review queue that keeps showing a
    // decision already taken is a queue nobody finishes.
    await (model as { updateMany: (a: unknown) => Promise<{ count: number }> }).updateMany({
      where: { id: { in: input.ids } },
      data: { dedupeConfirmedAt: now, dedupeConfirmedBy: who },
    });
  } else {
    const keepId = input.keepId!;
    const retire = input.ids.filter((id) => id !== keepId);
    await (model as { updateMany: (a: unknown) => Promise<{ count: number }> }).updateMany({
      where: { id: { in: retire } },
      data: {
        isActive: false,
        supersededById: keepId,
        dedupeConfirmedAt: now,
        dedupeConfirmedBy: who,
      },
    });
    // The survivor is confirmed too, or it comes back tomorrow paired with
    // the rows it just replaced.
    await (model as { updateMany: (a: unknown) => Promise<{ count: number }> }).updateMany({
      where: { id: keepId },
      data: { dedupeConfirmedAt: now, dedupeConfirmedBy: who },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'UPDATE',
      tableName: isConsumable ? 'surgical_consumable_templates' : 'surgical_drug_dressing_templates',
      recordId: input.ids.join(','),
      changes: JSON.stringify({
        catalogueDeduplication: input.action,
        kept: input.action === 'KEEP_ONE' ? input.keepId : null,
        // Retired, never deleted: the ids are here so the decision can be
        // read back and undone.
        retired: input.action === 'KEEP_ONE'
          ? input.ids.filter((id) => id !== input.keepId)
          : [],
        by: { userId: user.id, role: user.role ?? null },
      }),
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    message: input.action === 'ALL_DISTINCT'
      ? 'Kept apart. These will not be offered for review again.'
      : `Kept one. ${input.ids.length - 1} row(s) retired — not deleted, and still readable on every case that used them.`,
  });
}
