// ============================================================
// Imprest register — list and create
// ------------------------------------------------------------
// Ported from the imprest system's Express router + service. Differences that
// matter, all consequences of the merge into this app:
//
//   • Auth is the NextAuth session plus an imprest DUTY (see lib/imprest/access),
//     not the old JWT middleware.
//   • Money stays BIGINT kobo in the database and is serialised to a JSON number
//     on the way out — never a float, and never a JS BigInt (which JSON.stringify
//     refuses).
//   • Writes go through the app's ordinary fetch path, so an offline device
//     queues them with everything else instead of using a second sync engine.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireImprest } from '@/lib/imprest/access';
import { Permission } from '@/lib/imprest/permissions';
import { AuditAction, AuditEntity, ImprestStatus } from '@/lib/imprest/enums';
import { writeAudit } from '@/lib/imprest/audit';
import {
  canRaiseQuarterlyImprest,
  checkStandingImprestAmount,
  quarterOf,
} from '@/lib/imprest/quarterlyRules';
import { createImprestSchema } from '@/lib/imprest/validation/imprest';
import { koboToBigInt, serialize } from '@/lib/imprest/serialize';
import { idempotencyKeyFrom, replayIfSeen, rememberResult } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

const LIST_INCLUDE = {
  financialYear: { select: { id: true, label: true } },
  department: { select: { id: true, code: true, name: true } },
  budgetHead: { select: { id: true, code: true, name: true } },
  receivingOfficer: { select: { id: true, fullName: true, staffCode: true } },
  _count: { select: { expenditures: true } },
} as const;

// ---------------------------------------------------------------------------
// GET /api/imprest/imprests
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const guard = await requireImprest(Permission.IMPREST_VIEW);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(sp.get('pageSize') ?? 50) || 50));
  const q = sp.get('q')?.trim();

  const where: Record<string, unknown> = {
    // Nothing is ever hard deleted; the register shows live rows only unless
    // an auditor explicitly asks for the tombstones.
    deletedAt: sp.get('includeDeleted') === 'true' ? undefined : null,
  };
  if (sp.get('status')) where.status = sp.get('status');
  if (sp.get('quarter')) where.quarter = sp.get('quarter');
  if (sp.get('financialYearId')) where.financialYearId = sp.get('financialYearId');
  if (sp.get('departmentId')) where.departmentId = sp.get('departmentId');
  if (sp.get('receivingOfficerId')) where.receivingOfficerId = sp.get('receivingOfficerId');
  if (q) {
    where.OR = [
      { imprestNumber: { contains: q, mode: 'insensitive' } },
      { voucherNumber: { contains: q, mode: 'insensitive' } },
      { purpose: { contains: q, mode: 'insensitive' } },
    ];
  }

  // A duty scoped to one department only ever sees that department.
  if (guard.actor.departmentId) where.departmentId = guard.actor.departmentId;

  try {
    const [rows, total] = await Promise.all([
      prisma.imprest.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ dateApproved: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.imprest.count({ where }),
    ]);

    return NextResponse.json({
      imprests: serialize(rows),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error('[imprest] list failed:', error);
    return NextResponse.json({ error: 'Failed to load the imprest register' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/imprest/imprests
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requireImprest(Permission.IMPREST_CREATE);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = createImprestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'The imprest could not be saved', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // Replay protection: a queued offline create that reached the server but lost
  // its response must not book the money twice.
  const idemKey = idempotencyKeyFrom(request);
  const replayed = await replayIfSeen(idemKey);
  if (replayed) return replayed;

  try {
    const [financialYear, officer, department] = await Promise.all([
      prisma.financialYear.findFirst({ where: { id: input.financialYearId, deletedAt: null } }),
      prisma.user.findFirst({ where: { id: input.receivingOfficerId } }),
      prisma.department.findFirst({ where: { id: input.departmentId, deletedAt: null } }),
    ]);

    if (!financialYear) return NextResponse.json({ error: 'Financial year not found' }, { status: 404 });
    if (financialYear.isClosed) {
      return NextResponse.json(
        { error: `Financial year ${financialYear.label} is closed.` },
        { status: 409 }
      );
    }
    if (!officer) return NextResponse.json({ error: 'Receiving officer not found' }, { status: 404 });
    if (!department) return NextResponse.json({ error: 'Department not found' }, { status: 404 });

    // --- Financial Regulations -------------------------------------------
    // The quarter is part of the record, so derive it when the caller did not
    // send one rather than leaving the column null.
    const quarter = input.quarter ?? quarterOf(input.dateApproved);

    const capped = checkStandingImprestAmount(input.amountApproved);
    if (!capped.allowed) {
      return NextResponse.json({ error: capped.message, code: capped.code }, { status: 422 });
    }

    // Each department holds its own standing imprest, so the "one per quarter"
    // and "retire before the next" rules are judged within the department.
    const siblings = await prisma.imprest.findMany({
      where: {
        financialYearId: input.financialYearId,
        departmentId: input.departmentId,
        deletedAt: null,
      },
      select: {
        id: true,
        imprestNumber: true,
        quarter: true,
        financialYearId: true,
        status: true,
        eligibleForNextQuarter: true,
      },
    });

    const eligible = canRaiseQuarterlyImprest({
      quarter,
      financialYearId: input.financialYearId,
      existing: siblings,
    });
    if (!eligible.allowed) {
      return NextResponse.json({ error: eligible.message, code: eligible.code }, { status: 409 });
    }
    // ---------------------------------------------------------------------

    const created = await prisma.$transaction(async (tx) => {
      const imprestNumber = input.imprestNumber?.trim() || (await allocateImprestNumber(financialYear.label, tx));

      // Recording receipt at creation activates the imprest immediately;
      // otherwise it starts as a draft awaiting the cash.
      const status = input.amountReceived > 0 ? ImprestStatus.ACTIVE : ImprestStatus.DRAFT;

      const row = await tx.imprest.create({
        data: {
          // Honour a client-minted id so an offline device and the server agree
          // on this row's identity from the moment it is created.
          ...(input.id ? { id: input.id } : {}),
          imprestNumber,
          voucherNumber: input.voucherNumber,
          approvalNumber: input.approvalNumber,
          treasuryVoucherNumber: input.treasuryVoucherNumber,
          quarter,
          financialYearId: input.financialYearId,
          departmentId: input.departmentId,
          office: input.office,
          dateApproved: new Date(input.dateApproved),
          dateReceived: input.dateReceived ? new Date(input.dateReceived) : null,
          amountApproved: koboToBigInt(input.amountApproved),
          amountReceived: koboToBigInt(input.amountReceived),
          receivingOfficerId: input.receivingOfficerId,
          purpose: input.purpose,
          fundingSource: input.fundingSource,
          budgetHeadId: input.budgetHeadId,
          voteCodeId: input.voteCodeId,
          costCentreId: input.costCentreId,
          expectedRetirementDate: new Date(input.expectedRetirementDate),
          status,
          balance: koboToBigInt(input.amountReceived),
          remarks: input.remarks,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
        include: LIST_INCLUDE,
      });

      await writeAudit(tx, request, actor, {
        action: AuditAction.CREATE,
        entity: AuditEntity.IMPREST,
        entityId: row.id,
        entityLabel: row.imprestNumber,
        // The opening figures, so a later alteration has something to differ from.
        changes: {
          quarter: { from: null, to: quarter },
          amountApproved: { from: null, to: input.amountApproved },
          amountReceived: { from: null, to: input.amountReceived },
        },
      });

      return row;
    });

    const body = { imprest: serialize(created), success: true };
    await rememberResult(idemKey, 201, body);
    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    console.error('[imprest] create failed:', error);
    return NextResponse.json({ error: 'Failed to create the imprest' }, { status: 500 });
  }
}

/**
 * Next number in the register for a financial year, e.g. IMP/2026/0007.
 * Allocated inside the caller's transaction so two devices creating at once
 * cannot be handed the same number.
 */
async function allocateImprestNumber(
  yearLabel: string,
  tx: Prisma.TransactionClient
): Promise<string> {
  const year = yearLabel.replace(/[^0-9]/g, '').slice(0, 4) || String(new Date().getFullYear());
  const used = await tx.imprest.count({
    where: { imprestNumber: { startsWith: `IMP/${year}/` } },
  });
  return `IMP/${year}/${String(used + 1).padStart(4, '0')}`;
}
