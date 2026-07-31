// ============================================================
// Expenditure lines — list and post
// ------------------------------------------------------------
// Posting a line spends imprest money, so the arithmetic is deliberately NOT
// re-implemented here: computeExpenditureAmounts and checkOverspend come from
// the ported domain layer and are covered by the imprest system's own tests
// (npm run test:imprest). This route's job is authorisation, persistence and
// keeping the imprest balance in step — inside one transaction.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireImprest } from '@/lib/imprest/access';
import { Permission } from '@/lib/imprest/permissions';
import { AuditAction, AuditEntity, ExpenditureStatus, ImprestStatus } from '@/lib/imprest/enums';
import { writeAudit } from '@/lib/imprest/audit';
import { createExpenditureSchema } from '@/lib/imprest/validation/expenditure';
import { computeExpenditureAmounts, checkOverspend } from '@/lib/imprest/calculations';
import { koboToBigInt, quantityToMilli, serialize } from '@/lib/imprest/serialize';
import { idempotencyKeyFrom, replayIfSeen, rememberResult } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

const LINE_INCLUDE = {
  category: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
  officerResponsible: { select: { id: true, fullName: true } },
  attachments: { where: { deletedAt: null }, select: { id: true, kind: true, fileName: true } },
} satisfies Prisma.ExpenditureInclude;

// ---------------------------------------------------------------------------
// GET — the cash book, optionally for one imprest
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const guard = await requireImprest(Permission.EXPENDITURE_VIEW);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const where: Prisma.ExpenditureWhereInput = { deletedAt: null };
  if (sp.get('imprestId')) where.imprestId = sp.get('imprestId') as string;
  if (sp.get('status')) where.status = sp.get('status') as ExpenditureStatus;
  const q = sp.get('q')?.trim();
  if (q) {
    where.OR = [
      { expenseNumber: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { vendorName: { contains: q, mode: 'insensitive' } },
      { receiptNumber: { contains: q, mode: 'insensitive' } },
    ];
  }

  try {
    const rows = await prisma.expenditure.findMany({
      where,
      include: LINE_INCLUDE,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(500, Number(sp.get('limit') ?? 200) || 200),
    });
    return NextResponse.json(serialize({ expenditures: rows }));
  } catch (error) {
    console.error('[imprest] expenditure list failed:', error);
    return NextResponse.json({ error: 'Failed to load expenditure' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — post a line against an imprest
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requireImprest(Permission.EXPENDITURE_CREATE);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = createExpenditureSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'The expenditure could not be saved', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // A queued offline line must not be posted twice — that would spend the money
  // twice over.
  const idemKey = idempotencyKeyFrom(request);
  const replayed = await replayIfSeen(idemKey);
  if (replayed) return replayed;

  // Arithmetic from the domain layer, so a mis-keyed tax or a quantity/unit-cost
  // mismatch is rejected by the same rules the imprest system has always used.
  let amounts;
  try {
    amounts = computeExpenditureAmounts({
      quantity: input.quantity,
      unitCost: input.unitCost,
      totalCostOverride: input.totalCost ?? null,
      vat: input.vat,
      withholdingTax: input.withholdingTax,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  try {
    const imprest = await prisma.imprest.findFirst({
      where: { id: input.imprestId, deletedAt: null },
      include: { expenditures: { where: { deletedAt: null }, select: { totalCost: true, status: true } } },
    });
    if (!imprest) return NextResponse.json({ error: 'Imprest not found' }, { status: 404 });

    if (guard.actor.departmentId && imprest.departmentId !== guard.actor.departmentId) {
      return NextResponse.json({ error: 'This imprest belongs to another department.' }, { status: 403 });
    }

    // Only lines that actually consume funds count against the balance — a
    // voided line does not.
    const currentSpend = imprest.expenditures
      .filter((e) => e.status !== ExpenditureStatus.VOIDED)
      .reduce((sum, e) => sum + Number(e.totalCost), 0);

    const check = checkOverspend({
      imprestStatus: imprest.status as ImprestStatus,
      amountReceived: Number(imprest.amountReceived),
      currentExpenditure: currentSpend,
      proposedAmount: amounts.totalCost,
    });
    if (!check.allowed) {
      return NextResponse.json({ error: check.message, code: check.code }, { status: 409 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const expenseNumber =
        input.expenseNumber?.trim() ||
        `${imprest.imprestNumber.replace(/\//g, '-')}-${String(imprest.expenditures.length + 1).padStart(3, '0')}`;

      const row = await tx.expenditure.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          expenseNumber,
          imprestId: input.imprestId,
          date: new Date(input.date),
          vendorId: input.vendorId,
          // Witness copy: the printed cash book must still name the vendor
          // correctly years later, after the vendor record is renamed.
          vendorName: input.vendorName,
          vendorPhone: input.vendorPhone,
          vendorAddress: input.vendorAddress,
          vendorTin: input.vendorTin,
          description: input.description,
          purpose: input.purpose,
          categoryId: input.categoryId,
          subcategoryId: input.subcategoryId,
          quantityMilli: quantityToMilli(input.quantity),
          unitOfMeasure: input.unitOfMeasure,
          unitCost: koboToBigInt(input.unitCost),
          totalCost: koboToBigInt(amounts.totalCost),
          vat: koboToBigInt(amounts.vat),
          withholdingTax: koboToBigInt(amounts.withholdingTax),
          // amountPaid is what left the imprest; netAmount is that less
          // withholding tax, i.e. what the vendor actually received.
          amountPaid: koboToBigInt(amounts.amountPaid),
          netAmount: koboToBigInt(amounts.netAmount),
          paymentMethod: input.paymentMethod,
          voucherNumber: input.voucherNumber,
          paymentVoucherNumber: input.paymentVoucherNumber,
          chequeNumber: input.chequeNumber,
          bankReference: input.bankReference,
          receiptNumber: input.receiptNumber,
          invoiceNumber: input.invoiceNumber,
          receiptDate: input.receiptDate ? new Date(input.receiptDate) : null,
          budgetHeadId: input.budgetHeadId,
          voteCodeId: input.voteCodeId,
          remarks: input.remarks,
          officerResponsibleId: input.officerResponsibleId,
          witnessName: input.witnessName,
          witnessDesignation: input.witnessDesignation,
          gpsLatitude: input.gpsLatitude,
          gpsLongitude: input.gpsLongitude,
          gpsAccuracy: input.gpsAccuracy,
          status: ExpenditureStatus.POSTED,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
        include: LINE_INCLUDE,
      });

      // Keep the imprest balance in step inside the same transaction, so the
      // register can never show a balance that the cash book contradicts.
      const spentAfter = currentSpend + amounts.totalCost;
      await tx.imprest.update({
        where: { id: imprest.id },
        data: {
          balance: koboToBigInt(Number(imprest.amountReceived) - spentAfter),
          status:
            spentAfter >= Number(imprest.amountReceived)
              ? ImprestStatus.PARTIALLY_RETIRED
              : imprest.status,
          version: { increment: 1 },
          updatedById: actor.userId,
        },
      });

      await writeAudit(tx, request, actor, {
        action: AuditAction.CREATE,
        entity: AuditEntity.EXPENDITURE,
        entityId: row.id,
        entityLabel: row.expenseNumber,
        changes: {
          totalCost: { from: null, to: amounts.totalCost },
          imprestBalance: {
            from: Number(imprest.amountReceived) - currentSpend,
            to: Number(imprest.amountReceived) - spentAfter,
          },
        },
      });

      return row;
    });

    const body = {
      expenditure: serialize(created),
      success: true,
      // Surfaced so the form can warn when the imprest is nearly exhausted.
      warning: check.isWarning ? check.message : undefined,
    };
    await rememberResult(idemKey, 201, body);
    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    console.error('[imprest] expenditure create failed:', error);
    return NextResponse.json({ error: 'Failed to post the expenditure' }, { status: 500 });
  }
}
