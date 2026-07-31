// ============================================================
// Retirement — compiling an imprest for certification
// ------------------------------------------------------------
// A retirement gathers the posted expenditure on an imprest, states what cash
// is being returned, and enters the statutory approval chain.
//
// The chain itself is NOT implemented here: applySubmission/applyDecision/
// applyClosure and the stage-to-role rules come from the ported workflow module,
// which the imprest system's own tests cover. This route persists what that
// state machine decides.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireImprest } from '@/lib/imprest/access';
import { canActOnStage, Permission } from '@/lib/imprest/permissions';
import {
  ExpenditureStatus,
  ImprestStatus,
  RetirementStatus,
  UserRole,
  WorkflowStage,
} from '@/lib/imprest/enums';
import { AuditAction, AuditEntity } from '@/lib/imprest/enums';
import { writeAudit } from '@/lib/imprest/audit';
import { computeRetirementPosition } from '@/lib/imprest/quarterlyRules';
import { REVIEW_STAGES } from '@/lib/imprest/workflow';
import { createRetirementSchema } from '@/lib/imprest/validation/retirement';
import { koboToBigInt, serialize } from '@/lib/imprest/serialize';
import { idempotencyKeyFrom, replayIfSeen, rememberResult } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

const LIST_INCLUDE = {
  imprest: {
    select: {
      id: true,
      imprestNumber: true,
      purpose: true,
      // Carried so the printed retirement form can state the period and the
      // treasury voucher without a second round trip.
      quarter: true,
      treasuryVoucherNumber: true,
      financialYear: { select: { label: true } },
      department: { select: { code: true, name: true } },
    },
  },
  preparedBy: { select: { id: true, fullName: true } },
  checkedBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  _count: { select: { expenditures: true, approvals: true } },
} satisfies Prisma.RetirementInclude;

// ---------------------------------------------------------------------------
// GET — retirements, optionally filtered to a stage or an imprest
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const guard = await requireImprest(Permission.RETIREMENT_VIEW);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const where: Prisma.RetirementWhereInput = { deletedAt: null };
  if (sp.get('imprestId')) where.imprestId = sp.get('imprestId') as string;
  if (sp.get('status')) where.status = sp.get('status') as RetirementStatus;
  if (sp.get('stage')) where.currentStage = sp.get('stage') as WorkflowStage;

  // "Awaiting me" — the queue a reviewer actually wants to see.
  if (sp.get('mine') === 'true') {
    where.currentStage = { in: stagesFor(guard.actor.role) };
  }

  try {
    const rows = await prisma.retirement.findMany({
      where,
      include: LIST_INCLUDE,
      orderBy: [{ retirementDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return NextResponse.json(serialize({ retirements: rows }));
  } catch (error) {
    console.error('[imprest] retirement list failed:', error);
    return NextResponse.json({ error: 'Failed to load retirements' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — compile a retirement from an imprest's posted expenditure
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requireImprest(Permission.RETIREMENT_CREATE);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = createRetirementSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'The retirement could not be prepared', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const idemKey = idempotencyKeyFrom(request);
  const replayed = await replayIfSeen(idemKey);
  if (replayed) return replayed;

  try {
    const imprest = await prisma.imprest.findFirst({
      where: { id: input.imprestId, deletedAt: null },
      include: {
        expenditures: {
          where: { deletedAt: null, status: ExpenditureStatus.POSTED },
          select: { id: true, totalCost: true, vendorId: true, vendorName: true, attachments: { where: { deletedAt: null }, select: { id: true } } },
        },
      },
    });
    if (!imprest) return NextResponse.json({ error: 'Imprest not found' }, { status: 404 });

    if (guard.actor.departmentId && imprest.departmentId !== guard.actor.departmentId) {
      return NextResponse.json({ error: 'This imprest belongs to another department.' }, { status: 403 });
    }
    if (imprest.status === ImprestStatus.CANCELLED || imprest.status === ImprestStatus.CLOSED) {
      return NextResponse.json(
        { error: 'A closed or cancelled imprest cannot be retired.' },
        { status: 409 }
      );
    }

    // Default is everything posted; ids are supplied only for a partial retirement.
    const chosen = input.expenditureIds?.length
      ? imprest.expenditures.filter((e) => input.expenditureIds!.includes(e.id))
      : imprest.expenditures;

    if (chosen.length === 0) {
      return NextResponse.json(
        { error: 'There is no posted expenditure on this imprest to retire.' },
        { status: 409 }
      );
    }

    const totalExpenditure = chosen.reduce((sum, e) => sum + Number(e.totalCost), 0);
    const received = Number(imprest.amountReceived);
    // Unspent cash the officer is handing back. Stated explicitly when given;
    // otherwise it is simply what is left.
    const balanceReturned = input.balanceReturned ?? Math.max(0, received - totalExpenditure);

    if (totalExpenditure + balanceReturned > received) {
      return NextResponse.json(
        {
          error:
            'Expenditure plus cash returned exceeds the amount received. Check the figures before certifying.',
        },
        { status: 400 }
      );
    }

    // Opening imprest, less expenditure, less cash handed back — what the
    // officer still owes. Accounts chase this figure, so it is stored rather
    // than recomputed differently by each report.
    const position = computeRetirementPosition({
      openingImprest: received,
      totalExpenditure,
      balanceReturned,
    });

    const created = await prisma.$transaction(async (tx) => {
      const year = new Date(input.retirementDate).getFullYear();
      const seq = await tx.retirement.count({ where: { retirementNumber: { startsWith: `RET/${year}/` } } });
      const retirementNumber = input.retirementNumber?.trim() || `RET/${year}/${String(seq + 1).padStart(4, '0')}`;

      const row = await tx.retirement.create({
        data: {
          retirementNumber,
          imprestId: imprest.id,
          amountReceived: imprest.amountReceived,
          totalExpenditure: koboToBigInt(totalExpenditure),
          balanceReturned: koboToBigInt(balanceReturned),
          refundDue: koboToBigInt(position.refundDue),
          receiptCount: chosen.filter((e) => e.attachments.length > 0).length,
          vendorCount: new Set(chosen.map((e) => e.vendorId ?? e.vendorName)).size,
          expenditureCount: chosen.length,
          returnReceiptNumber: null,
          retirementDate: new Date(input.retirementDate),
          status: RetirementStatus.DRAFT,
          currentStage: WorkflowStage.PREPARED,
          preparedById: actor.userId,
          certificationText:
            input.certificationText ??
            'I certify that the expenditure listed above was incurred for the purpose for which the imprest was granted, and that the balance shown has been returned.',
          remarks: input.remarks,
          createdById: actor.userId,
          updatedById: actor.userId,
          // Attach the lines to this retirement so they cannot be retired twice.
          expenditures: { connect: chosen.map((e) => ({ id: e.id })) },
        },
        include: LIST_INCLUDE,
      });

      await tx.expenditure.updateMany({
        where: { id: { in: chosen.map((e) => e.id) } },
        data: { status: ExpenditureStatus.RETIRED, updatedById: actor.userId },
      });

      await tx.imprest.update({
        where: { id: imprest.id },
        data: {
          status:
            totalExpenditure + balanceReturned >= received
              ? ImprestStatus.FULLY_RETIRED
              : ImprestStatus.PARTIALLY_RETIRED,
          version: { increment: 1 },
          updatedById: actor.userId,
        },
      });

      await writeAudit(tx, request, actor, {
        action: AuditAction.CREATE,
        entity: AuditEntity.RETIREMENT,
        entityId: row.id,
        entityLabel: row.retirementNumber,
        changes: {
          totalExpenditure: { from: null, to: totalExpenditure },
          balanceReturned: { from: null, to: balanceReturned },
          refundDue: { from: null, to: position.refundDue },
        },
      });

      return row;
    });

    const body = { retirement: serialize(created), success: true };
    await rememberResult(idemKey, 201, body);
    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    console.error('[imprest] retirement create failed:', error);
    return NextResponse.json({ error: 'Failed to prepare the retirement' }, { status: 500 });
  }
}

/**
 * Review stages this duty may act on — used by the "awaiting me" filter.
 *
 * Derived from the permission matrix rather than listed by hand: the earlier
 * hard-coded switch named the superseded stages, so after the chain was
 * rewritten it silently returned an empty queue for the new offices.
 */
function stagesFor(role: string): WorkflowStage[] {
  return REVIEW_STAGES.filter((stage) => canActOnStage(role as UserRole, stage));
}
