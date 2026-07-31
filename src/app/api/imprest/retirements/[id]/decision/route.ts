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
import {
  ApprovalDecision,
  AuditAction,
  AuditEntity,
  RetirementStatus,
  WorkflowStage,
} from '@/lib/imprest/enums';
import { writeAudit } from '@/lib/imprest/audit';
import { canSubmitRetirement, releasesNextQuarter } from '@/lib/imprest/quarterlyRules';
import {
  applyDecision,
  applySubmission,
  applyClosure,
  applyReopen,
  WorkflowError,
} from '@/lib/imprest/workflow';
import { serialize } from '@/lib/imprest/serialize';
import { detectConflict } from '@/lib/concurrency';

export const dynamic = 'force-dynamic';

type Action = 'SUBMIT' | 'DECIDE' | 'CLOSE' | 'REOPEN';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  // A duty is required; which permission depends on the action, checked below.
  const guard = await requireImprest();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: {
    action?: Action;
    decision?: string;
    comment?: string;
    balanceReturned?: number;
    reason?: string;
  };
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
      include: {
        imprest: { select: { id: true, imprestNumber: true, departmentId: true, status: true } },
      },
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

      // Financial Regulations: no line goes forward for certification without a
      // receipt, invoice or voucher behind it. Checked at submission rather
      // than at compilation, so an officer can assemble the retirement and
      // gather the missing paperwork afterwards.
      const lines = await prisma.expenditure.findMany({
        where: { retirementId: retirement.id, deletedAt: null },
        select: {
          id: true,
          expenseNumber: true,
          description: true,
          status: true,
          _count: { select: { attachments: { where: { deletedAt: null } } } },
        },
      });
      const documented = canSubmitRetirement(
        lines.map((l) => ({
          id: l.id,
          expenseNumber: l.expenseNumber,
          description: l.description,
          status: l.status,
          attachmentCount: l._count.attachments,
        }))
      );
      if (!documented.allowed) {
        return NextResponse.json(
          { error: documented.message, code: documented.code },
          { status: 422 }
        );
      }

      transition = applySubmission(currentStage);
      auditAction = AuditAction.SUBMIT;
    } else if (action === 'CLOSE') {
      if (!actor.permissions.includes(Permission.RETIREMENT_CLOSE)) {
        return NextResponse.json({ error: 'Your duty cannot close a retirement.' }, { status: 403 });
      }
      transition = applyClosure(currentStage);
      auditAction = AuditAction.CLOSE;
    } else if (action === 'REOPEN') {
      // The one act that can alter a certified record. Restricted to the
      // Administrator duty, and refused without a stated reason — an unlock
      // nobody has to justify is not a control.
      if (!actor.permissions.includes(Permission.RETIREMENT_REOPEN)) {
        return NextResponse.json(
          { error: 'Only an administrator may reopen an approved retirement.' },
          { status: 403 }
        );
      }
      const reason = body.reason?.trim();
      if (!reason || reason.length < 10) {
        return NextResponse.json(
          { error: 'State why this retirement is being reopened (at least 10 characters).' },
          { status: 400 }
        );
      }
      transition = applyReopen(currentStage);
      auditAction = AuditAction.REOPEN;
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
          // Closure now ends at COMPLETED; CLOSED is the superseded spelling.
          ...(transition.status === RetirementStatus.COMPLETED ||
          transition.status === RetirementStatus.CLOSED
            ? { closedAt: new Date() }
            : {}),
          // Witness the officer at the stage they acted on. Both names for the
          // Accounts stage are honoured, so retirements that entered the chain
          // before it was renamed still record their checker.
          ...(currentStage === WorkflowStage.ACCOUNTS_REVIEW ||
          currentStage === WorkflowStage.ACCOUNT_OFFICER_REVIEW
            ? { checkedById: actor.userId, checkedAt: new Date() }
            : {}),
          ...(transition.status === RetirementStatus.APPROVED
            ? { approvedById: actor.userId, approvedAt: new Date() }
            : {}),
          // Reopening rescinds the certification: the approval and closure
          // marks come off, so nothing reads as approved while it is being
          // corrected. The Approval rows themselves are kept — the audit trail
          // must still show that the signature was once given.
          ...(action === 'REOPEN'
            ? {
                approvedById: null,
                approvedAt: null,
                closedAt: null,
              }
            : {}),
          version: { increment: 1 },
          updatedById: actor.userId,
        },
        include: {
          imprest: { select: { id: true, imprestNumber: true } },
          preparedBy: { select: { fullName: true } },
        },
      });

      // Final approval is what releases the next quarter's imprest. Until the
      // Medical Director signs, `eligibleForNextQuarter` stays false and
      // canRaiseQuarterlyImprest refuses to open Q(n+1).
      //
      // The regulation is "fully retired AND approved", so an approved PARTIAL
      // retirement is not enough: the imprest must also have reached
      // FULLY_RETIRED. Otherwise an officer could retire a tenth of the float,
      // have that certified, and open the next quarter still holding the rest.
      if (transition.status === RetirementStatus.APPROVED) {
        await tx.imprest.update({
          where: { id: retirement.imprest.id },
          data: {
            eligibleForNextQuarter: releasesNextQuarter({
              retirementStatus: transition.status,
              imprestStatus: retirement.imprest.status,
            }),
            approvalDate: new Date(),
            retirementDate: row.retirementDate,
            version: { increment: 1 },
            updatedById: actor.userId,
          },
        });
      }

      // And reopening withdraws it again. A quarter already raised on the
      // strength of the old approval stands — that money has been released —
      // but no further quarter may be opened until this is settled again.
      if (action === 'REOPEN') {
        await tx.imprest.update({
          where: { id: retirement.imprest.id },
          data: {
            eligibleForNextQuarter: false,
            approvalDate: null,
            version: { increment: 1 },
            updatedById: actor.userId,
          },
        });
      }

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

      await writeAudit(tx, request, actor, {
        action: auditAction,
        entity: AuditEntity.RETIREMENT,
        entityId: row.id,
        entityLabel: row.retirementNumber,
        notes: body.comment,
        // The stated justification for an override, kept in its own column so
        // an auditor can find every reopening without reading free-text notes.
        reason: action === 'REOPEN' ? body.reason?.trim() : null,
        changes: {
          stage: { from: currentStage, to: transition.stage },
          status: { from: retirement.status, to: transition.status },
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
