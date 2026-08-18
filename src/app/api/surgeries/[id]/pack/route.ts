import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import {
  changeSummary, checkAddition, checkRemoval, canEditPack,
} from '@/lib/theatreOps/packAmendment';
import { pushToUsers } from '@/lib/pushAll';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/surgeries/[id]/pack   — both lists, withdrawn lines included
 * POST /api/surgeries/[id]/pack   — add, remove, and submit the changes
 *
 * The consumables and pharmacy lists were fixed at booking. A surgeon who
 * changed their mind afterwards had no way to say so, so the change happened
 * verbally at the theatre door and the pack provider found out by being handed
 * a request they had no record of.
 *
 * Withdrawn lines are RETURNED, not filtered out. The provider may already
 * have picked the item, and a list that silently loses a line looks like a
 * list that never had it.
 */

const changeSchema = z.object({
  add: z.array(z.object({
    list: z.enum(['CONSUMABLE', 'PHARMACY']),
    name: z.string().min(1),
    quantity: z.number().int().min(1),
    unit: z.string().optional(),
    category: z.string().optional(),
    type: z.string().optional(),
    dosage: z.string().nullish(),
    route: z.string().nullish(),
    reason: z.string(),
  })).optional(),
  remove: z.array(z.object({
    list: z.enum(['CONSUMABLE', 'PHARMACY']),
    id: z.string().min(1),
    reason: z.string(),
  })).optional(),
  /** Notify the providers that the list has changed. */
  submit: z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [consumables, pharmacy, surgery] = await Promise.all([
    prisma.surgeryConsumableRequest.findMany({
      where: { surgeryId: params.id }, orderBy: { createdAt: 'asc' },
    }),
    prisma.surgeryDrugDressingRequest.findMany({
      where: { surgeryId: params.id }, orderBy: { createdAt: 'asc' },
    }),
    prisma.surgery.findUnique({
      where: { id: params.id },
      select: { id: true, procedureName: true, scheduledDate: true, scheduledTime: true, status: true },
    }),
  ]);

  if (!surgery) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });

  return NextResponse.json({
    surgery,
    consumables,
    pharmacy,
    canEdit: canEditPack((session.user as { role?: string }).role),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const role = (session.user as { role?: string }).role ?? null;
    const userId = (session.user as { id?: string }).id ?? null;

    if (!canEditPack(role)) {
      return NextResponse.json(
        { error: 'Only the surgical team may change what a case is packed with.' },
        { status: 403 },
      );
    }

    const input = changeSchema.parse(await req.json());
    const surgery = await prisma.surgery.findUnique({
      where: { id: params.id },
      select: {
        id: true, procedureName: true, scheduledDate: true, scheduledTime: true,
        surgeonId: true, scrubNurseId: true,
        patient: { select: { name: true, folderNumber: true } },
      },
    });
    if (!surgery) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });

    const problems: string[] = [];
    let notice = false;
    const added: Array<{ id: string; name: string; quantity: number; status: string }> = [];
    const removed: Array<{ id: string; name: string; quantity: number; status: string }> = [];

    // ---- Removals, validated before anything is written --------------------
    for (const r of input.remove ?? []) {
      const row = r.list === 'CONSUMABLE'
        ? await prisma.surgeryConsumableRequest.findUnique({ where: { id: r.id } })
        : await prisma.surgeryDrugDressingRequest.findUnique({ where: { id: r.id } });

      if (!row || row.surgeryId !== params.id) {
        problems.push('An item to remove does not belong to this case.');
        continue;
      }
      const verdict = checkRemoval({
        currentStatus: row.status, reason: r.reason, byId: userId, byRole: role,
      });
      if (!verdict.ok) { problems.push(`${row.name}: ${verdict.problem}`); continue; }
      notice = notice || verdict.requiresProviderNotice;

      const data = {
        status: 'CANCELLED' as const,
        removedById: userId,
        removedAt: new Date(),
        removalReason: r.reason.trim(),
      };
      if (r.list === 'CONSUMABLE') {
        await prisma.surgeryConsumableRequest.update({ where: { id: r.id }, data });
      } else {
        await prisma.surgeryDrugDressingRequest.update({ where: { id: r.id }, data });
      }
      removed.push({ id: row.id, name: row.name, quantity: row.quantity, status: 'CANCELLED' });
    }

    // ---- Additions ---------------------------------------------------------
    for (const a of input.add ?? []) {
      const verdict = checkAddition({
        name: a.name, quantity: a.quantity, reason: a.reason, byId: userId, byRole: role,
      });
      if (!verdict.ok) { problems.push(`${a.name || 'New item'}: ${verdict.problem}`); continue; }

      if (a.list === 'CONSUMABLE') {
        const row = await prisma.surgeryConsumableRequest.create({
          data: {
            surgeryId: params.id,
            name: a.name.trim(),
            category: (a.category as never) ?? 'OTHER',
            unit: a.unit ?? 'piece',
            quantity: a.quantity,
            requestedById: userId,
            requestedByName: session.user.name ?? null,
            addedAfterBooking: true,
            additionReason: a.reason.trim(),
          },
        });
        added.push({ id: row.id, name: row.name, quantity: row.quantity, status: row.status });
      } else {
        const row = await prisma.surgeryDrugDressingRequest.create({
          data: {
            surgeryId: params.id,
            name: a.name.trim(),
            type: (a.type as never) ?? 'OTHER',
            dosage: a.dosage ?? null,
            route: a.route ?? null,
            unit: a.unit ?? 'vial',
            quantity: a.quantity,
            addedAfterBooking: true,
            additionReason: a.reason.trim(),
          },
        });
        added.push({ id: row.id, name: row.name, quantity: row.quantity, status: row.status });
      }
    }

    const caseLabel = `${surgery.patient?.name ?? 'Patient'}${
      surgery.patient?.folderNumber ? ` (${surgery.patient.folderNumber})` : ''} · ${surgery.procedureName}`;
    const summary = changeSummary(added, removed, caseLabel);

    // ---- Tell the providers ------------------------------------------------
    // Only when something actually changed. Resubmitting an unchanged list to
    // a provider's phone is how a notification channel stops being read.
    if (input.submit && (added.length || removed.length)) {
      const providers = await prisma.user.findMany({
        where: {
          role: { in: ['CONSUMABLE_PACK_PROVIDER', 'PHARMACIST', 'THEATRE_STORE_KEEPER'] },
          status: 'APPROVED',
        },
        select: { id: true },
      });
      if (providers.length) {
        await pushToUsers(providers.map((p) => p.id), {
          title: notice ? 'Pack list changed AFTER packing' : 'Pack list changed',
          body: summary,
          url: `/dashboard/surgeries/${params.id}`,
        }).catch(() => {
          // A failed push must not lose the change itself, which is already
          // written by this point.
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'surgery_pack_requests',
        recordId: params.id,
        changes: JSON.stringify({
          added: added.map((a) => ({ id: a.id, name: a.name, quantity: a.quantity })),
          removed: removed.map((r) => ({ id: r.id, name: r.name })),
          reasons: {
            added: (input.add ?? []).map((a) => a.reason),
            removed: (input.remove ?? []).map((r) => r.reason),
          },
          by: { userId, role },
          notifiedProviders: !!input.submit && (added.length > 0 || removed.length > 0),
        }),
      },
    }).catch(() => {});

    return NextResponse.json({
      added, removed, summary,
      requiresProviderNotice: notice,
      // Reported rather than thrown: a request that adds three items and gets
      // one wrong should apply the two that were right, and say which failed.
      problems,
      message: problems.length
        ? `${summary} ${problems.length} change${problems.length === 1 ? '' : 's'} could not be applied.`
        : summary,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid change', details: error.errors }, { status: 400 });
    }
    console.error('Error amending pack list:', error);
    return NextResponse.json({ error: 'Failed to change the pack list' }, { status: 500 });
  }
}
