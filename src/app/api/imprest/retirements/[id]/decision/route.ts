// ============================================================
// Retirement approval chain — submit, and record a decision
// ------------------------------------------------------------
// Every rule about WHO may act at WHICH stage, and what the stage becomes
// afterwards, lives in the ported workflow module and is covered by the imprest
// system's own tests. This route does three things only: check the actor holds
// the duty, ask the state machine, and persist what it says.
//
// Writing those rules again here is exactly how an approval chain drifts out of
// step with the printed approval sheet.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireImprest } from '@/lib/imprest/access';
import { Permission } from '@/lib/imprest/permissions';
import { ApprovalDecision, AuditAction, RetirementStatus, WorkflowStage } from '@/lib/imprest/enums';
import { applyDecision, applySubmission, applyClosure, WorkflowError } from '@/lib/imprest/workflow';
import { serialize } from '@/lib/imprest/serialize';
import { detectConflict } from '@/lib/concurrency';

export const dynamic = 'force-dynamic';

type Action = 'SUBMIT' | 'DECIDE' | 'CLOSE';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  // A duty is required; which permission depends on the action, checked below.
  const guard = await requireImprest();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: { action?: Action; decision?: string; comment?: string; balanceReturned?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const action = body.action;
  if (!action) return NextResponse.json({ error: 'An action is required' }, { status: 400 });

  try {
    const retirement = await prisma.retirement.findUnique({
      where: { id: params.id },
      include: { imprest: { select: { id: true, imprestNumber: true, departmentId: true } } },
    });
    if (!retirement) return NextResponse.json({ error: 'Retirement not found' }, { status: 404 });

    if (actor.departmentId && retirement.imprest.departmentId !== actor.departmentId) {
      return NextResponse.json({ error: 'This retirement belongs to another department.' }, { status: 403 });
    }

    // A decision recorded while this device was offline must not overwrite a
    // decision somebody else has since made on the same retirement.
    const conflict = detectConflict(request, retirement, 'retirement');
    if (conflict) return conflict;

    const currentStage = retirement.currentStage as WorkflowStage;

    // --- Ask the state machine -------------------------------------------
    let transition;
    let auditAction: AuditAction;

    if (action === 'SUBMIT') {
      if (!actor.permissions.includes(Permission.RETIREMENT_SUBMIT)) {
        return NextResponse.json({ error: 'Your duty cannot submit a retirement.' }, { status: 403 });
      }
      transition = applySubmission(currentStage);
      auditAction = AuditAction.SUBMIT;
    } else if (action === 'CLOSE') {
      if (!actor.permissions.includes(Permission.RETIREMENT_CLOSE)) {
        return NextResponse.json({ error: 'Your duty cannot close a retirement.' }, { status: 403 });
      }
      transition = applyClosure(currentStage);
      auditAction = AuditAction.CLOSE;
    } else {
      const decision = body.decision as ApprovalDecision | undefined;
      if (!decision || !Object.values(ApprovalDecision).includes(decision)) {
        return NextResponse.json({ error: 'A decision of APPROVE, REJECT or QUERY is required' }, { status: 400 });
      }
      // canActOnStage inside applyDecision enforces the stage-to-duty rule.
      transition = applyDecision({ currentStage, decision, actorRole: actor.role });
      auditAction = decision === ApprovalDecision.APPROVE ? AuditAction.APPROVE : decision === ApprovalDecision.REJECT ? AuditAction.REJECT : AuditAction.QUERY;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.retirement.update({
        where: { id: retirement.id },
        data: {
          currentStage: transition.stage,
          status: transition.status,
          ...(action === 'SUBMIT' ? { submittedAt: new Date() } : {}),
          ...(transition.status === RetirementStatus.CLOSED ? { closedAt: new Date() } : {}),
          // Witness the officer at the stage they acted on.
          ...(currentStage === WorkflowStage.ACCOUNT_OFFICER_REVIEW
            ? { checkedById: actor.userId, checkedAt: new Date() }
            : {}),
          ...(transition.status === RetirementStatus.APPROVED
            ? { approvedById: actor.userId, approvedAt: new Date() }
            : {}),
          version: { increment: 1 },
          updatedById: actor.userId,
        },
        include: {
          imprest: { select: { id: true, imprestNumber: true } },
          preparedBy: { select: { fullName: true } },
        },
      });

      if (action === 'DECIDE') {
        // Position in the chain for this retirement, so the approval sheet
        // prints the decisions in the order they were actually made.
        const priorDecisions = await tx.approval.count({ where: { retirementId: retirement.id } });

        // Only the newest decision is the live one.
        await tx.approval.updateMany({
          where: { retirementId: retirement.id, isCurrent: true },
          data: { isCurrent: false },
        });

        await tx.approval.create({
          data: {
            retirementId: retirement.id,
            stage: currentStage,
            sequence: priorDecisions + 1,
            decision: body.decision as ApprovalDecision,
            comments: body.comment,
            actorId: actor.userId,
            // Denormalised witness fields: a printed approval sheet must still
            // read correctly after the officer transfers or is renamed.
            actorName: actor.fullName,
            actorDesignation: actor.designation,
            actedAt: new Date(),
            isCurrent: true,
          },
        });
      }

      await tx.imprestAuditLog.create({
        data: {
          action: auditAction,
          entity: 'RETIREMENT',
          entityId: row.id,
          entityLabel: row.retirementNumber,
          actorId: actor.userId,
          actorName: actor.fullName,
          actorRole: actor.role,
          notes: body.comment,
        },
      });

      return row;
    });

    return NextResponse.json({
      retirement: serialize(updated),
      stage: transition.stage,
      status: transition.status,
      success: true,
    });
  } catch (error) {
    // The state machine's own refusals are user-facing, and better worded than
    // anything this route would invent.
    if (error instanceof WorkflowError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error('[imprest] retirement decision failed:', error);
    return NextResponse.json({ error: 'Failed to record the decision' }, { status: 500 });
  }
}
