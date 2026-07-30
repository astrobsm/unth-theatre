import { describe, expect, it } from 'vitest';
import { ApprovalDecision, RetirementStatus, UserRole, WorkflowStage } from './enums';
import { canActOnStage, hasPermission, Permission, permissionsForRole, rolesForStage } from './permissions';
import {
  applyClosure,
  applyDecision,
  applySubmission,
  buildWorkflowTimeline,
  initialApprovalSlots,
  isReviewStage,
  isTerminalStage,
  nextStage,
  stageProgress,
  statusForStage,
  WorkflowError,
} from './workflow';

describe('chain shape', () => {
  it('advances through every office in order', () => {
    expect(nextStage(WorkflowStage.PREPARED)).toBe(WorkflowStage.SUBMITTED);
    expect(nextStage(WorkflowStage.SUBMITTED)).toBe(WorkflowStage.ACCOUNT_OFFICER_REVIEW);
    expect(nextStage(WorkflowStage.ACCOUNT_OFFICER_REVIEW)).toBe(WorkflowStage.CHAIRMAN_REVIEW);
    expect(nextStage(WorkflowStage.CHAIRMAN_REVIEW)).toBe(WorkflowStage.FINANCE_REVIEW);
    expect(nextStage(WorkflowStage.FINANCE_REVIEW)).toBe(WorkflowStage.INTERNAL_AUDIT);
    expect(nextStage(WorkflowStage.INTERNAL_AUDIT)).toBe(WorkflowStage.APPROVED);
    expect(nextStage(WorkflowStage.APPROVED)).toBe(WorkflowStage.CLOSED);
    expect(nextStage(WorkflowStage.CLOSED)).toBeNull();
  });

  it('classifies review and terminal stages', () => {
    expect(isReviewStage(WorkflowStage.CHAIRMAN_REVIEW)).toBe(true);
    expect(isReviewStage(WorkflowStage.APPROVED)).toBe(false);
    expect(isTerminalStage(WorkflowStage.CLOSED)).toBe(true);
    expect(isTerminalStage(WorkflowStage.REJECTED)).toBe(true);
    expect(isTerminalStage(WorkflowStage.INTERNAL_AUDIT)).toBe(false);
  });

  it('maps each stage to a retirement status', () => {
    expect(statusForStage(WorkflowStage.PREPARED)).toBe(RetirementStatus.DRAFT);
    expect(statusForStage(WorkflowStage.FINANCE_REVIEW)).toBe(RetirementStatus.IN_REVIEW);
    expect(statusForStage(WorkflowStage.APPROVED)).toBe(RetirementStatus.APPROVED);
    expect(statusForStage(WorkflowStage.CLOSED)).toBe(RetirementStatus.CLOSED);
    expect(statusForStage(WorkflowStage.REJECTED)).toBe(RetirementStatus.REJECTED);
  });

  it('reports progress along the chain', () => {
    expect(stageProgress(WorkflowStage.PREPARED)).toBe(0);
    expect(stageProgress(WorkflowStage.CLOSED)).toBe(100);
    expect(stageProgress(WorkflowStage.CHAIRMAN_REVIEW)).toBeGreaterThan(0);
    expect(stageProgress(WorkflowStage.CHAIRMAN_REVIEW)).toBeLessThan(100);
  });

  it('seeds one approval slot per reviewing office', () => {
    const slots = initialApprovalSlots();
    expect(slots).toHaveLength(4);
    expect(slots.map((s) => s.stage)).toEqual([
      WorkflowStage.ACCOUNT_OFFICER_REVIEW,
      WorkflowStage.CHAIRMAN_REVIEW,
      WorkflowStage.FINANCE_REVIEW,
      WorkflowStage.INTERNAL_AUDIT,
    ]);
    expect(slots.map((s) => s.sequence)).toEqual([1, 2, 3, 4]);
  });
});

describe('applySubmission', () => {
  it('places a prepared retirement before the Account Officer', () => {
    const result = applySubmission(WorkflowStage.PREPARED);
    expect(result.stage).toBe(WorkflowStage.ACCOUNT_OFFICER_REVIEW);
    expect(result.status).toBe(RetirementStatus.IN_REVIEW);
  });

  it('refuses to resubmit a packet already in the chain', () => {
    expect(() => applySubmission(WorkflowStage.CHAIRMAN_REVIEW)).toThrow(WorkflowError);
  });
});

describe('applyDecision', () => {
  it('walks an approved packet up the chain', () => {
    const step1 = applyDecision({
      currentStage: WorkflowStage.ACCOUNT_OFFICER_REVIEW,
      decision: ApprovalDecision.APPROVE,
      actorRole: UserRole.ACCOUNT_OFFICER,
    });
    expect(step1.stage).toBe(WorkflowStage.CHAIRMAN_REVIEW);
    expect(step1.isFinalApproval).toBe(false);

    const step2 = applyDecision({
      currentStage: WorkflowStage.CHAIRMAN_REVIEW,
      decision: ApprovalDecision.APPROVE,
      actorRole: UserRole.CHAIRMAN,
    });
    expect(step2.stage).toBe(WorkflowStage.FINANCE_REVIEW);

    const step3 = applyDecision({
      currentStage: WorkflowStage.FINANCE_REVIEW,
      decision: ApprovalDecision.APPROVE,
      actorRole: UserRole.FINANCE,
    });
    expect(step3.stage).toBe(WorkflowStage.INTERNAL_AUDIT);

    const step4 = applyDecision({
      currentStage: WorkflowStage.INTERNAL_AUDIT,
      decision: ApprovalDecision.APPROVE,
      actorRole: UserRole.INTERNAL_AUDITOR,
    });
    expect(step4.stage).toBe(WorkflowStage.APPROVED);
    expect(step4.status).toBe(RetirementStatus.APPROVED);
    expect(step4.isFinalApproval).toBe(true);
  });

  it('rejects terminally from any reviewing office', () => {
    const result = applyDecision({
      currentStage: WorkflowStage.FINANCE_REVIEW,
      decision: ApprovalDecision.REJECT,
      actorRole: UserRole.FINANCE,
    });
    expect(result.stage).toBe(WorkflowStage.REJECTED);
    expect(result.status).toBe(RetirementStatus.REJECTED);
  });

  it('returns a queried packet to the preparer, not to the previous office', () => {
    const result = applyDecision({
      currentStage: WorkflowStage.INTERNAL_AUDIT,
      decision: ApprovalDecision.QUERY,
      actorRole: UserRole.INTERNAL_AUDITOR,
    });
    // A corrected schedule must be re-examined by every office, so the packet
    // goes back to PREPARED rather than resuming at Finance.
    expect(result.stage).toBe(WorkflowStage.PREPARED);
    expect(result.status).toBe(RetirementStatus.QUERIED);
  });

  it('stops the wrong office from acting out of turn', () => {
    expect(() =>
      applyDecision({
        currentStage: WorkflowStage.CHAIRMAN_REVIEW,
        decision: ApprovalDecision.APPROVE,
        actorRole: UserRole.CASHIER,
      }),
    ).toThrow(/not authorised/i);

    expect(() =>
      applyDecision({
        currentStage: WorkflowStage.FINANCE_REVIEW,
        decision: ApprovalDecision.APPROVE,
        actorRole: UserRole.CHAIRMAN,
      }),
    ).toThrow(WorkflowError);
  });

  it('refuses a decision on a finished retirement', () => {
    expect(() =>
      applyDecision({
        currentStage: WorkflowStage.CLOSED,
        decision: ApprovalDecision.APPROVE,
        actorRole: UserRole.FINANCE,
      }),
    ).toThrow(/no longer be acted upon/i);
  });

  it('refuses a decision at a non-reviewing stage', () => {
    expect(() =>
      applyDecision({
        currentStage: WorkflowStage.PREPARED,
        decision: ApprovalDecision.APPROVE,
        actorRole: UserRole.ACCOUNT_OFFICER,
      }),
    ).toThrow(WorkflowError);
  });
});

describe('applyClosure', () => {
  it('closes an approved retirement', () => {
    const result = applyClosure(WorkflowStage.APPROVED);
    expect(result.stage).toBe(WorkflowStage.CLOSED);
    expect(result.status).toBe(RetirementStatus.CLOSED);
  });

  it('will not close a packet still under review', () => {
    expect(() => applyClosure(WorkflowStage.INTERNAL_AUDIT)).toThrow(WorkflowError);
  });
});

describe('buildWorkflowTimeline', () => {
  it('marks completed, current and pending stages', () => {
    const timeline = buildWorkflowTimeline(WorkflowStage.FINANCE_REVIEW);
    const states = Object.fromEntries(timeline.map((s) => [s.stage, s.state]));

    expect(states[WorkflowStage.PREPARED]).toBe('complete');
    expect(states[WorkflowStage.CHAIRMAN_REVIEW]).toBe('complete');
    expect(states[WorkflowStage.FINANCE_REVIEW]).toBe('current');
    expect(states[WorkflowStage.INTERNAL_AUDIT]).toBe('pending');
    expect(states[WorkflowStage.CLOSED]).toBe('pending');
  });

  it('skips the whole chain once rejected', () => {
    const timeline = buildWorkflowTimeline(WorkflowStage.REJECTED);
    expect(timeline.filter((s) => s.state === 'skipped').length).toBe(timeline.length - 1);
  });
});

describe('role-based access control', () => {
  it('grants each reviewing office exactly its own stage', () => {
    expect(canActOnStage(UserRole.ACCOUNT_OFFICER, WorkflowStage.ACCOUNT_OFFICER_REVIEW)).toBe(true);
    expect(canActOnStage(UserRole.ACCOUNT_OFFICER, WorkflowStage.CHAIRMAN_REVIEW)).toBe(false);
    expect(canActOnStage(UserRole.CHAIRMAN, WorkflowStage.CHAIRMAN_REVIEW)).toBe(true);
    expect(canActOnStage(UserRole.FINANCE, WorkflowStage.FINANCE_REVIEW)).toBe(true);
    expect(canActOnStage(UserRole.INTERNAL_AUDITOR, WorkflowStage.INTERNAL_AUDIT)).toBe(true);
  });

  it('keeps the Administrator out of the approval chain', () => {
    // An account that can edit the figures must not also be able to certify them.
    for (const stage of [
      WorkflowStage.ACCOUNT_OFFICER_REVIEW,
      WorkflowStage.CHAIRMAN_REVIEW,
      WorkflowStage.FINANCE_REVIEW,
      WorkflowStage.INTERNAL_AUDIT,
    ]) {
      expect(canActOnStage(UserRole.ADMINISTRATOR, stage)).toBe(false);
    }
  });

  it('gives the view-only auditor no write permission at all', () => {
    const granted = permissionsForRole(UserRole.VIEW_ONLY_AUDITOR);
    const writes = granted.filter((p) =>
      /(create|update|delete|manage|upload|submit|close|void|approval:)/.test(p),
    );
    expect(writes).toEqual([]);
    expect(granted).toContain(Permission.AUDIT_VIEW);
  });

  it('does not let a cashier approve or manage settings', () => {
    expect(hasPermission(UserRole.CASHIER, Permission.APPROVE_ACCOUNT_OFFICER)).toBe(false);
    expect(hasPermission(UserRole.CASHIER, Permission.SETTINGS_MANAGE)).toBe(false);
    expect(hasPermission(UserRole.CASHIER, Permission.EXPENDITURE_CREATE)).toBe(true);
  });

  it('addresses approval alerts to the roles that can act', () => {
    expect(rolesForStage(WorkflowStage.CHAIRMAN_REVIEW)).toEqual([UserRole.CHAIRMAN]);
    expect(rolesForStage(WorkflowStage.PREPARED)).toEqual([]);
  });
});
