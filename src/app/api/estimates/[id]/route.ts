import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { replaceLines, autoBuildLines, isLocked } from '@/lib/estimates/service';
import { EstimateError, type DraftLine } from '@/lib/estimates/calculate';

export const dynamic = 'force-dynamic';

/**
 * GET   /api/estimates/[id]
 * PATCH /api/estimates/[id]     edit header, replace lines, autofill, approve
 *
 * The client sends lines WITHOUT trusting it on money: `unitPriceKobo` is
 * accepted only for a manual override, which must carry a reason and is recorded
 * as an override. Everything else is priced from the master.
 */

const EDIT_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CONSULTANT_SURGEON', 'SURGEON', 'ACCOUNTANT', 'BILLING_OFFICER',
];
/** Approving is what makes an estimate issuable, so it is a narrower group. */
const APPROVE_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ACCOUNTANT',
];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const estimate = await prisma.surgeryEstimate.findUnique({
    where: { id: params.id },
    include: { lines: { orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }] } },
  });
  if (!estimate) return NextResponse.json({ error: 'Estimate not found.' }, { status: 404 });

  return NextResponse.json({ estimate });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; name?: string; role?: string } | undefined;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!EDIT_ROLES.includes(user.role ?? '')) {
    return NextResponse.json({ error: 'Not permitted to edit estimates.' }, { status: 403 });
  }

  let body: {
    action?: 'AUTOFILL' | 'SAVE_LINES' | 'APPROVE' | 'CANCEL';
    lines?: DraftLine[];
    expectedStayDays?: number;
    admissionType?: 'DAY_CASE' | 'INPATIENT';
    depositPercent?: number;
    notes?: string;
    validDays?: number;
    // AUTOFILL inputs
    procedureCode?: string;
    anaesthesiaCode?: string;
    theatreCode?: string;
    admissionBaseCode?: string;
    ward?: string;
    cancelReason?: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  const estimate = await prisma.surgeryEstimate.findUnique({
    where: { id: params.id },
    select: {
      id: true, status: true, estimateNumber: true, subspecialty: true,
      plannedDate: true, expectedStayDays: true, admissionType: true, totalKobo: true,
    },
  });
  if (!estimate) return NextResponse.json({ error: 'Estimate not found.' }, { status: 404 });

  // An ISSUED estimate is a document a family is holding. Editing it in place
  // would rewrite what they were told; the correct move is a new revision, which
  // is why supersedesId exists on the model.
  if (isLocked(estimate.status) && body.action !== 'CANCEL') {
    return NextResponse.json({
      error: `This estimate is ${estimate.status} and cannot be edited. Create a revision instead.`,
    }, { status: 409 });
  }

  const on = estimate.plannedDate ?? new Date();

  try {
    if (body.action === 'CANCEL') {
      await prisma.surgeryEstimate.update({
        where: { id: estimate.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: body.cancelReason?.trim() || 'No reason given',
        },
      });
      return NextResponse.json({ ok: true, status: 'CANCELLED' });
    }

    if (body.action === 'APPROVE') {
      if (!APPROVE_ROLES.includes(user.role ?? '')) {
        return NextResponse.json({ error: 'Not permitted to approve estimates.' }, { status: 403 });
      }
      // Approving an empty estimate would produce a document quoting nothing,
      // which reads to a family as "the operation is free".
      if (estimate.totalKobo <= 0) {
        return NextResponse.json({
          error: 'Nothing has been costed on this estimate yet.',
        }, { status: 409 });
      }
      const approved = await prisma.surgeryEstimate.update({
        where: { id: estimate.id },
        data: {
          status: 'APPROVED',
          approvedById: user.id ?? null,
          approvedByName: user.name ?? null,
          approvedAt: new Date(),
          validUntil: body.validDays
            ? new Date(Date.now() + body.validDays * 86_400_000)
            : undefined,
        },
        select: { status: true, approvedByName: true, approvedAt: true },
      });
      if (user.id) {
        await prisma.auditLog.create({
          data: {
            userId: user.id, action: 'ESTIMATE_APPROVED',
            tableName: 'surgery_estimates', recordId: estimate.id,
            changes: JSON.stringify({
              estimateNumber: estimate.estimateNumber, totalKobo: estimate.totalKobo,
            }),
          },
        });
      }
      return NextResponse.json({ ok: true, ...approved });
    }

    // Header fields that affect the calculation are saved first, so the recompute
    // below uses them.
    const stayDays = body.expectedStayDays ?? estimate.expectedStayDays;
    const admissionType = body.admissionType
      ?? (estimate.admissionType as 'DAY_CASE' | 'INPATIENT');

    await prisma.surgeryEstimate.update({
      where: { id: estimate.id },
      data: {
        expectedStayDays: stayDays,
        admissionType: admissionType as never,
        notes: body.notes !== undefined ? body.notes : undefined,
      },
    });

    let lines: DraftLine[] = body.lines ?? [];
    let unpriced: { description: string; kind: string; code?: string; reason: string }[] = [];

    if (body.action === 'AUTOFILL') {
      const built = await autoBuildLines({
        subspecialty: estimate.subspecialty,
        procedureCode: body.procedureCode ?? null,
        anaesthesiaCode: body.anaesthesiaCode ?? null,
        theatreCode: body.theatreCode ?? null,
        admissionBaseCode: body.admissionBaseCode ?? null,
        ward: body.ward ?? null,
        expectedStayDays: stayDays,
        admissionType,
        on,
      });
      // Autofill ADDS to what a person has already entered rather than replacing
      // it. Silently discarding manual work is unforgivable in a form somebody
      // has spent ten minutes on.
      lines = [...(body.lines ?? []), ...built.lines];
      unpriced = built.unpriced;
    }

    const totals = await replaceLines(estimate.id, lines, {
      expectedStayDays: stayDays,
      admissionType,
      depositPercent: body.depositPercent,
    });

    return NextResponse.json({ ok: true, totals, unpriced });
  } catch (err) {
    // A calculation error is the user's to fix — a bad quantity, a missing
    // reason — so it is reported as 400 with the message, not swallowed as a 500.
    if (err instanceof EstimateError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
