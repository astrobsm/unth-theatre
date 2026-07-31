// ============================================================
// A single imprest — detail, and recording receipt of funds
// ------------------------------------------------------------
// The detail view carries the expenditure lines, because the question staff
// actually ask of an imprest is "what is left on it, and what was it spent on?"
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireImprest } from '@/lib/imprest/access';
import { Permission } from '@/lib/imprest/permissions';
import { ImprestStatus } from '@/lib/imprest/enums';
import { koboToBigInt, serialize } from '@/lib/imprest/serialize';
import { detectConflict } from '@/lib/concurrency';

export const dynamic = 'force-dynamic';

const DETAIL_INCLUDE = {
  financialYear: { select: { id: true, label: true, isClosed: true } },
  department: { select: { id: true, code: true, name: true } },
  budgetHead: { select: { id: true, code: true, name: true } },
  voteCode: { select: { id: true, code: true, name: true } },
  costCentre: { select: { id: true, code: true, name: true } },
  receivingOfficer: { select: { id: true, fullName: true, staffCode: true } },
  expenditures: {
    where: { deletedAt: null },
    orderBy: { date: 'desc' },
    include: {
      category: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
      attachments: { where: { deletedAt: null }, select: { id: true, kind: true, fileName: true } },
    },
  },
  // `satisfies` rather than `as const`: it type-checks the shape against Prisma
  // while keeping the literal types Prisma needs to infer the result — `as const`
  // made orderBy a readonly tuple, which Prisma rejects, and that silently cost
  // the included relations their types.
} satisfies Prisma.ImprestInclude;

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireImprest(Permission.IMPREST_VIEW);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const imprest = await prisma.imprest.findUnique({
      where: { id: params.id },
      include: DETAIL_INCLUDE,
    });
    if (!imprest) return NextResponse.json({ error: 'Imprest not found' }, { status: 404 });

    // A duty scoped to one department must not read another department's funds.
    if (guard.actor.departmentId && imprest.departmentId !== guard.actor.departmentId) {
      return NextResponse.json(
        { error: 'This imprest belongs to another department.' },
        { status: 403 }
      );
    }

    const spent = imprest.expenditures.reduce((sum, e) => sum + Number(e.totalCost), 0);

    return NextResponse.json(
      serialize({
        imprest,
        summary: {
          spent,
          expenditureCount: imprest.expenditures.length,
          retiredPercent:
            Number(imprest.amountReceived) > 0
              ? Math.round((spent / Number(imprest.amountReceived)) * 100)
              : 0,
        },
      })
    );
  } catch (error) {
    console.error('[imprest] detail failed:', error);
    return NextResponse.json({ error: 'Failed to load the imprest' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH — record receipt of funds against an approved imprest, activating it
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireImprest(Permission.IMPREST_ACTIVATE);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: { amountReceived?: number; dateReceived?: string; voucherNumber?: string; remarks?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body.amountReceived !== 'number' || body.amountReceived <= 0) {
    return NextResponse.json({ error: 'An amount received is required' }, { status: 400 });
  }

  try {
    const existing = await prisma.imprest.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Imprest not found' }, { status: 404 });

    // Refuse to overwrite a receipt someone else recorded while this device was
    // offline — the money would otherwise be double counted.
    const conflict = detectConflict(request, existing, 'imprest');
    if (conflict) return conflict;

    if (existing.status === ImprestStatus.CLOSED || existing.status === ImprestStatus.CANCELLED) {
      return NextResponse.json(
        { error: 'A closed or cancelled imprest can no longer receive funds.' },
        { status: 409 }
      );
    }

    const received = koboToBigInt(body.amountReceived);
    if (received > existing.amountApproved) {
      return NextResponse.json(
        { error: 'The amount received cannot exceed the amount approved.' },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.imprest.update({
        where: { id: params.id },
        data: {
          amountReceived: received,
          // Receipt tops up what is available to spend.
          balance: received - (existing.amountReceived - existing.balance),
          dateReceived: body.dateReceived ? new Date(body.dateReceived) : new Date(),
          voucherNumber: body.voucherNumber ?? existing.voucherNumber,
          remarks: body.remarks ?? existing.remarks,
          status: ImprestStatus.ACTIVE,
          version: { increment: 1 },
          updatedById: actor.userId,
        },
        include: DETAIL_INCLUDE,
      });

      await tx.imprestAuditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'IMPREST',
          entityId: row.id,
          entityLabel: row.imprestNumber,
          actorId: actor.userId,
          actorName: actor.fullName,
          actorRole: actor.role,
        },
      });

      return row;
    });

    return NextResponse.json({ imprest: serialize(updated), success: true });
  } catch (error) {
    console.error('[imprest] receipt failed:', error);
    return NextResponse.json({ error: 'Failed to record receipt' }, { status: 500 });
  }
}
