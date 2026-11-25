/**
 * The NHIA Pharmacy's own queue, and the one action only it may take.
 *
 * GET  — every line routed to the scheme's counter, grouped by case.
 * POST — send selected lines on, with a reason, to the Theatre Pharmacy
 *        (drugs) or the Consumable Pack Providers (consumables).
 *
 * WHY THIS IS NOT A FILTER ON THE EXISTING TWO ENDPOINTS. The pack providers
 * read consumables and the Theatre Pharmacy reads drugs; this counter reads
 * BOTH, because the scheme covers both and a pharmacist working a case wants
 * one screen for it. The two lists are kept apart in the payload, because
 * what you do with them differs.
 *
 * THE REASSIGNMENT IS ONE-DIRECTIONAL and the rule lives in
 * src/lib/payer/reassign.ts, not here: a line moves AWAY from the scheme,
 * never back to it without an administrator. Two counters each insisting the
 * other owns an item is how a patient waits for both.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { roleAllowed } from '@/lib/roleGroups';
import { pushToUsers } from '@/lib/pushAll';
import { parsePayerCategory } from '@/lib/payer/categories';
import { FULFILMENT_LABEL, type PackListKind } from '@/lib/payer/routing';
import {
  REASSIGN_REASON_CODES, canReassign, checkReassign,
  reassignNote, reassignTargetFor, splitQuantities,
} from '@/lib/payer/reassign';

export const dynamic = 'force-dynamic';

/** Who may look at the scheme's queue. Reading is wider than acting on it. */
const MAY_VIEW = [
  'NHIA_PHARMACY', 'HEAD_OF_PHARMACY',
  'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ADMIN', 'SYSTEM_ADMINISTRATOR',
];

const CASE_SELECT = {
  id: true,
  procedureName: true,
  scheduledDate: true,
  scheduledTime: true,
  subspecialty: true,
  unit: true,
  location: true,
  surgeonName: true,
  surgeryType: true,
  status: true,
  payerCategory: true,
  payerSchemeId: true,
  payerIsNyscCorps: true,
  patient: { select: { id: true, name: true, folderNumber: true, ward: true } },
} as const;

const LINE_SELECT = {
  id: true,
  name: true,
  quantity: true,
  unit: true,
  status: true,
  routedTo: true,
  coverageNote: true,
  reassignedFrom: true,
  reassignReason: true,
  reassignedAt: true,
  splitFromId: true,
  addedAfterBooking: true,
} as const;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? null;
  if (!roleAllowed(role, MAY_VIEW)) {
    return NextResponse.json(
      { error: 'Only the NHIA Pharmacy and theatre management may open this queue.' },
      { status: 403 },
    );
  }

  const sp = new URL(req.url).searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  const status = sp.get('status');
  const payer = parsePayerCategory(sp.get('payer'));
  const unit = sp.get('unit');
  const surgeon = sp.get('surgeon');
  const theatre = sp.get('theatre');

  const surgeryWhere: Record<string, unknown> = {};
  if (from || to) {
    surgeryWhere.scheduledDate = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
    };
  }
  if (payer) surgeryWhere.payerCategory = payer;
  if (unit) surgeryWhere.unit = unit;
  if (surgeon) surgeryWhere.surgeonName = { contains: surgeon, mode: 'insensitive' };
  if (theatre) surgeryWhere.location = { contains: theatre, mode: 'insensitive' };

  const where = {
    routedTo: 'NHIA_PHARMACY' as const,
    ...(status ? { status: status as never } : {}),
    ...(Object.keys(surgeryWhere).length ? { surgery: surgeryWhere } : {}),
  };

  const [consumables, drugs] = await Promise.all([
    prisma.surgeryConsumableRequest.findMany({
      where,
      select: { ...LINE_SELECT, category: true, size: true, surgery: { select: CASE_SELECT } },
      orderBy: [{ surgery: { scheduledDate: 'asc' } }, { createdAt: 'asc' }],
      take: 1000,
    }),
    prisma.surgeryDrugDressingRequest.findMany({
      where,
      select: { ...LINE_SELECT, type: true, dosage: true, route: true, surgery: { select: CASE_SELECT } },
      orderBy: [{ surgery: { scheduledDate: 'asc' } }, { createdAt: 'asc' }],
      take: 1000,
    }),
  ]);

  // Grouped by case, because a pharmacist works one patient at a time and
  // the two lists for one patient are one conversation with the ward.
  const cases = new Map<string, {
    surgery: unknown;
    consumables: unknown[];
    pharmacy: unknown[];
  }>();
  const put = (row: { surgery: { id: string } }, list: 'consumables' | 'pharmacy') => {
    const id = row.surgery.id;
    if (!cases.has(id)) cases.set(id, { surgery: row.surgery, consumables: [], pharmacy: [] });
    const { surgery, ...line } = row as Record<string, unknown> & { surgery: unknown };
    cases.get(id)![list].push(line);
  };
  for (const c of consumables) put(c as never, 'consumables');
  for (const d of drugs) put(d as never, 'pharmacy');

  return NextResponse.json({
    cases: Array.from(cases.values()),
    totals: { consumables: consumables.length, pharmacy: drugs.length, cases: cases.size },
    canReassign: canReassign(role),
  });
}

const reassignSchema = z.object({
  items: z.array(z.object({
    list: z.enum(['CONSUMABLE', 'PHARMACY']),
    id: z.string().min(1),
    /** Omitted moves the whole line. Fewer splits it. */
    moveQuantity: z.number().int().min(1).optional(),
  })).min(1).max(200),
  reasonCode: z.enum(REASSIGN_REASON_CODES as [string, ...string[]]),
  detail: z.string().max(400).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = session.user as { id?: string; role?: string; name?: string };
  // Named, not anonymous. Every reassignment is somebody's decision and the
  // audit row below has nowhere to put "unknown".
  if (!user.id) {
    return NextResponse.json(
      { error: 'The person making the change must be identified. Sign in again.' },
      { status: 401 },
    );
  }
  if (!canReassign(user.role)) {
    return NextResponse.json(
      { error: 'Only the NHIA Pharmacy may send an item on.' },
      { status: 403 },
    );
  }

  let input: z.infer<typeof reassignSchema>;
  try {
    input = reassignSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Choose at least one item and a reason.', details: e.errors },
        { status: 400 },
      );
    }
    throw e;
  }

  const note = reassignNote(input.reasonCode as never, input.detail);
  const now = new Date();
  const problems: string[] = [];
  const moved: Array<{ id: string; name: string; quantity: number; to: string; surgeryId: string }> = [];
  const touchedSurgeries = new Set<string>();

  for (const item of input.items) {
    const isConsumable = item.list === 'CONSUMABLE';
    const row = isConsumable
      ? await prisma.surgeryConsumableRequest.findUnique({ where: { id: item.id } })
      : await prisma.surgeryDrugDressingRequest.findUnique({ where: { id: item.id } });

    if (!row) { problems.push('An item no longer exists.'); continue; }

    const verdict = checkReassign({
      currentUnit: row.routedTo as never,
      currentStatus: row.status,
      currentQuantity: row.quantity,
      moveQuantity: item.moveQuantity ?? null,
      reasonCode: input.reasonCode,
      detail: input.detail,
      byId: user.id ?? null,
      byRole: user.role ?? null,
    });
    if (!verdict.ok) { problems.push(`${row.name}: ${verdict.problem}`); continue; }

    const target = reassignTargetFor(item.list as PackListKind);
    const { stays, moves } = splitQuantities(row.quantity, item.moveQuantity ?? null);

    const movedFields = {
      routedTo: target,
      routedAt: now,
      reassignedFrom: 'NHIA_PHARMACY' as const,
      reassignReason: note,
      reassignedById: user.id ?? null,
      reassignedByName: user.name ?? null,
      reassignedAt: now,
      coverageNote: input.reasonCode === 'NOT_COVERED'
        ? 'Not covered by the scheme. Patient pays.'
        : row.coverageNote,
    };

    if (!verdict.splits) {
      // The whole line moves. One row, one owner, as before.
      if (isConsumable) {
        await prisma.surgeryConsumableRequest.update({ where: { id: row.id }, data: movedFields });
      } else {
        await prisma.surgeryDrugDressingRequest.update({ where: { id: row.id }, data: movedFields });
      }
    } else {
      // PARTIAL COVER SPLITS THE LINE. The original keeps what the scheme
      // will supply; a new row carries the remainder and points back at it,
      // so the two halves read as one decision rather than as a duplicate
      // somebody ought to delete.
      if (isConsumable) {
        const r = row as typeof row & {
          category: never; size: string | null;
          requestedById: string | null; requestedByName: string | null;
        };
        await prisma.$transaction([
          prisma.surgeryConsumableRequest.update({
            where: { id: row.id },
            data: { quantity: stays },
          }),
          prisma.surgeryConsumableRequest.create({
            data: {
              surgeryId: row.surgeryId,
              templateId: row.templateId,
              name: row.name,
              category: r.category,
              size: r.size,
              unit: row.unit,
              quantity: moves,
              requestedById: r.requestedById,
              requestedByName: r.requestedByName,
              addedAfterBooking: row.addedAfterBooking,
              additionReason: row.additionReason,
              splitFromId: row.id,
              ...movedFields,
            },
          }),
        ]);
      } else {
        const r = row as typeof row & { type: never; dosage: string | null; route: string | null };
        await prisma.$transaction([
          prisma.surgeryDrugDressingRequest.update({
            where: { id: row.id },
            data: { quantity: stays },
          }),
          prisma.surgeryDrugDressingRequest.create({
            data: {
              surgeryId: row.surgeryId,
              templateId: row.templateId,
              name: row.name,
              type: r.type,
              dosage: r.dosage,
              route: r.route,
              unit: row.unit,
              quantity: moves,
              addedAfterBooking: row.addedAfterBooking,
              additionReason: row.additionReason,
              splitFromId: row.id,
              ...movedFields,
            },
          }),
        ]);
      }
    }

    moved.push({
      id: row.id, name: row.name, quantity: moves,
      to: FULFILMENT_LABEL[target], surgeryId: row.surgeryId,
    });
    touchedSurgeries.add(row.surgeryId);
  }

  // ---- Tell the receiving unit, and the team whose case it is ------------
  if (moved.length > 0) {
    const toPharmacy = moved.filter((m) => m.to === FULFILMENT_LABEL.THEATRE_PHARMACY);
    const toPacks = moved.filter((m) => m.to === FULFILMENT_LABEL.CONSUMABLE_PACK);

    const tell = async (roles: string[], body: string) => {
      const people = await prisma.user.findMany({
        where: { role: { in: roles as never[] }, status: 'APPROVED' },
        select: { id: true },
      });
      if (!people.length) return;
      await pushToUsers(people.map((p) => p.id), {
        title: 'Reassigned from NHIA Pharmacy',
        body,
        url: roles.includes('PHARMACIST') ? '/dashboard/prescriptions' : '/dashboard/theatre-supply',
      }).catch(() => {
        // A failed push must not lose the reassignment, which is written.
      });
    };

    if (toPharmacy.length) {
      await tell(
        ['PHARMACIST', 'HEAD_OF_PHARMACY'],
        `${toPharmacy.length} drug line${toPharmacy.length === 1 ? '' : 's'} sent to the `
        + `Theatre Pharmacy by the NHIA Pharmacy — ${note}.`,
      );
    }
    if (toPacks.length) {
      await tell(
        ['CONSUMABLE_PACK_PROVIDER', 'THEATRE_STORE_KEEPER'],
        `${toPacks.length} consumable line${toPacks.length === 1 ? '' : 's'} sent to the pack `
        + `providers by the NHIA Pharmacy — ${note}.`,
      );
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        tableName: 'surgery_pack_routing',
        recordId: Array.from(touchedSurgeries).join(','),
        changes: JSON.stringify({
          reassigned: moved,
          from: 'NHIA_PHARMACY',
          reasonCode: input.reasonCode,
          reason: note,
          by: { userId: user.id ?? null, role: user.role ?? null },
        }),
      },
    }).catch(() => {});
  }

  return NextResponse.json({
    moved,
    problems,
    message: moved.length
      ? `${moved.length} item${moved.length === 1 ? '' : 's'} sent on. ${note}.`
      : 'Nothing was sent on.',
  });
}
