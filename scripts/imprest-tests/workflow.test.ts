import { describe, expect, it } from 'vitest';
import { ApprovalDecision, RetirementStatus, UserRole, WorkflowStage } from '../../src/lib/imprest/enums';
import { canActOnStage, hasPermission, Permission, permissionsForRole, rolesForStage } from '../../src/lib/imprest/permissions';
import {
  applyClosure,
  applyDecision,
  applyReopen,
  applySubmission,
  buildWorkflowTimeline,
  initialApprovalSlots,
  isReviewStage,
  isTerminalStage,
  nextStage,
  stageProgress,
  statusForStage,
  WorkflowError,
} from '../../src/lib/imprest/workflow';

describe('chain shape', () => {
  it('advances through every office in order', () => {
    expect(nextStage(WorkflowStage.PREPARED)).toBe(WorkflowStage.SUBMITTED);
    expect(nextStage(WorkflowStage.SUBMITTED)).toBe(WorkflowStage.ACCOUNTS_REVIEW);
    expect(nextStage(WorkflowStage.ACCOUNTS_REVIEW)).toBe(WorkflowStage.INTERNAL_AUDIT);
    expect(nextStage(WorkflowStage.INTERNAL_AUDIT)).toBe(WorkflowStage.CHIEF_ACCOUNTANT_REVIEW);
    expect(nextStage(WorkflowStage.CHIEF_ACCOUNTANT_REVIEW)).toBe(WorkflowStage.MEDICAL_DIRECTOR_REVIEW);
    expect(nextStage(WorkflowStage.MEDICAL_DIRECTOR_REVIEW)).toBe(WorkflowStage.APPROVED);
    expect(nextStage(WorkflowStage.APPROVED)).toBe(WorkflowStage.COMPLETED);
    expect(nextStage(WorkflowStage.COMPLETED)).toBeNull();
  });

  it('classifies review and terminal stages', () => {
    expect(isReviewStage(WorkflowStage.CHIEF_ACCOUNTANT_REVIEW)).toBe(true);
    expect(isReviewStage(WorkflowStage.APPROVED)).toBe(false);
    expect(isTerminalStage(WorkflowStage.COMPLETED)).toBe(true);
    expect(isTerminalStage(WorkflowStage.REJECTED)).toBe(true);
    expect(isTerminalStage(WorkflowStage.INTERNAL_AUDIT)).toBe(false);
  });

  it('maps each stage to a retirement status', () => {
    expect(statusForStage(WorkflowStage.PREPARED)).toBe(RetirementStatus.DRAFT);
    expect(statusForStage(WorkflowStage.CHIEF_ACCOUNTANT_REVIEW)).toBe(RetirementStatus.UNDER_REVIEW);
    expect(statusForStage(WorkflowStage.APPROVED)).toBe(RetirementStatus.APPROVED);
    expect(statusForStage(WorkflowStage.COMPLETED)).toBe(RetirementStatus.COMPLETED);
    expect(statusForStage(WorkflowStage.REJECTED)).toBe(RetirementStatus.REJECTED);
  });

  it('reports progress along the chain', () => {
    expect(stageProgress(WorkflowStage.PREPARED)).toBe(0);
    expect(stageProgress(WorkflowStage.COMPLETED)).toBe(100);
    expect(stageProgress(WorkflowStage.INTERNAL_AUDIT)).toBeGreaterThan(0);
    expect(stageProgress(WorkflowStage.INTERNAL_AUDIT)).toBeLessThan(100);
  });

  it('seeds one approval slot per reviewing office', () => {
    const slots = initialApprovalSlots();
    expect(slots).toHaveLength(4);
    expect(slots.map((s) => s.stage)).toEqual([
      WorkflowStage.ACCOUNTS_REVIEW,
      WorkflowStage.INTERNAL_AUDIT,
      WorkflowStage.CHIEF_ACCOUNTANT_REVIEW,
      WorkflowStage.MEDICAL_DIRECTOR_REVIEW,
    ]);
    expect(slots.map((s) => s.sequence)).toEqual([1, 2, 3, 4]);
  });
});

describe('applySubmission', () => {
  it('places a prepared retirement before the Account Officer', () => {
    const result = applySubmission(WorkflowStage.PREPARED);
    expect(result.stage).toBe(WorkflowStage.ACCOUNTS_REVIEW);
    expect(result.status).toBe(RetirementStatus.UNDER_REVIEW);
  });

  it('refuses to resubmit a packet already in the chain', () => {
    expect(() => applySubmission(WorkflowStage.ACCOUNTS_REVIEW)).toThrow(WorkflowError);
  });
});

describe('applyDecision', () => {
  it('walks an approved packet up the chain', () => {
    const step1 = applyDecision({
      currentStage: WorkflowStage.ACCOUNTS_REVIEW,
      decision: ApprovalDecision.APPROVE,
      actorRole: UserRole.ACCOUNT_OFFICER,
    });
    expect(step1.stage).toBe(WorkflowStage.INTERNAL_AUDIT);
    expect(step1.isFinalApproval).toBe(false);

    const step2 = applyDecision({
      currentStage: WorkflowStage.INTERNAL_AUDIT,
      decision: ApprovalDecision.APPROVE,
      actorRole: UserRole.INTERNAL_AUDITOR,
    });
    expect(step2.stage).toBe(WorkflowStage.CHIEF_ACCOUNTANT_REVIEW);

    const step3 = applyDecision({
      currentStage: WorkflowStage.CHIEF_ACCOUNTANT_REVIEW,
      decision: ApprovalDecision.APPROVE,
      actorRole: UserRole.CHIEF_ACCOUNTANT,
    });
    expect(step3.stage).toBe(WorkflowStage.MEDICAL_DIRECTOR_REVIEW);

    const step4 = applyDecision({
      currentStage: WorkflowStage.MEDICAL_DIRECTOR_REVIEW,
      decision: ApprovalDecision.APPROVE,
      actorRole: UserRole.MEDICAL_DIRECTOR,
    });
    expect(step4.stage).toBe(WorkflowStage.APPROVED);
    expect(step4.status).toBe(RetirementStatus.APPROVED);
    expect(step4.isFinalApproval).toBe(true);
  });

  it('rejects terminally from any reviewing office', () => {
    const result = applyDecision({
      currentStage: WorkflowStage.CHIEF_ACCOUNTANT_REVIEW,
      decision: ApprovalDecision.REJECT,
      actorRole: UserRole.CHIEF_ACCOUNTANT,
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
        currentStage: WorkflowStage.MEDICAL_DIRECTOR_REVIEW,
        decision: ApprovalDecision.APPROVE,
        actorRole: UserRole.CASHIER,
      }),
    ).toThrow(/not authorised/i);

    expect(() =>
      applyDecision({
        currentStage: WorkflowStage.CHIEF_ACCOUNTANT_REVIEW,
        decision: ApprovalDecision.APPROVE,
        actorRole: UserRole.CHAIRMAN,
      }),
    ).toThrow(WorkflowError);
  });

  it('refuses a decision on a finished retirement', () => {
    expect(() =>
      applyDecision({
        currentStage: WorkflowStage.COMPLETED,
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
    expect(result.stage).toBe(WorkflowStage.COMPLETED);
    expect(result.status).toBe(RetirementStatus.COMPLETED);
  });

  it('will not close a packet still under review', () => {
    expect(() => applyClosure(WorkflowStage.INTERNAL_AUDIT)).toThrow(WorkflowError);
  });
});

describe('applyReopen', () => {
  it('returns an approved retirement for correction', () => {
    const result = applyReopen(WorkflowStage.APPROVED);
    expect(result.stage).toBe(WorkflowStage.RETURNED);
    expect(result.status).toBe(RetirementStatus.RETURNED);
    expect(result.isFinalApproval).toBe(false);
  });

  it('reopens a completed retirement as well as an approved one', () => {
    expect(applyReopen(WorkflowStage.COMPLETED).stage).toBe(WorkflowStage.RETURNED);
    expect(applyReopen(WorkflowStage.REJECTED).stage).toBe(WorkflowStage.RETURNED);
  });

  it('refuses a retirement that is not concluded — there is nothing to unlock', () => {
    expect(() => applyReopen(WorkflowStage.INTERNAL_AUDIT)).toThrow(WorkflowError);
    expect(() => applyReopen(WorkflowStage.PREPARED)).toThrow(WorkflowError);
  });

  it('sends it back to the start of the chain, not to where it left off', () => {
    // RETURNED, not MEDICAL_DIRECTOR_REVIEW: the earlier signatures no longer
    // stand once the figures can change.
    expect(applyReopen(WorkflowStage.APPROVED).stage).toBe(WorkflowStage.RETURNED);
  });
});

describe('buildWorkflowTimeline', () => {
  it('marks completed, current and pending stages', () => {
    const timeline = buildWorkflowTimeline(WorkflowStage.CHIEF_ACCOUNTANT_REVIEW);
    const states = Object.fromEntries(timeline.map((s) => [s.stage, s.state]));

    expect(states[WorkflowStage.PREPARED]).toBe('complete');
    expect(states[WorkflowStage.INTERNAL_AUDIT]).toBe('complete');
    expect(states[WorkflowStage.CHIEF_ACCOUNTANT_REVIEW]).toBe('current');
    expect(states[WorkflowStage.MEDICAL_DIRECTOR_REVIEW]).toBe('pending');
    expect(states[WorkflowStage.COMPLETED]).toBe('pending');
  });

  it('skips the whole chain once rejected', () => {
    const timeline = buildWorkflowTimeline(WorkflowStage.REJECTED);
    expect(timeline.filter((s) => s.state === 'skipped').length).toBe(timeline.length - 1);
  });
});

describe('role-based access control', () => {
  it('grants each reviewing office exactly its own stage', () => {
    expect(canActOnStage(UserRole.ACCOUNT_OFFICER, WorkflowStage.ACCOUNTS_REVIEW)).toBe(true);
    expect(canActOnStage(UserRole.ACCOUNT_OFFICER, WorkflowStage.MEDICAL_DIRECTOR_REVIEW)).toBe(false);
    expect(canActOnStage(UserRole.MEDICAL_DIRECTOR, WorkflowStage.MEDICAL_DIRECTOR_REVIEW)).toBe(true);
    expect(canActOnStage(UserRole.CHIEF_ACCOUNTANT, WorkflowStage.CHIEF_ACCOUNTANT_REVIEW)).toBe(true);
    expect(canActOnStage(UserRole.INTERNAL_AUDITOR, WorkflowStage.INTERNAL_AUDIT)).toBe(true);
  });

  it('keeps the Administrator out of the approval chain', () => {
    // An account that can edit the figures must not also be able to certify them.
    for (const stage of [
      WorkflowStage.ACCOUNTS_REVIEW,
      WorkflowStage.MEDICAL_DIRECTOR_REVIEW,
      WorkflowStage.CHIEF_ACCOUNTANT_REVIEW,
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
    expect(rolesForStage(WorkflowStage.MEDICAL_DIRECTOR_REVIEW)).toEqual([UserRole.MEDICAL_DIRECTOR]);
    expect(rolesForStage(WorkflowStage.PREPARED)).toEqual([]);
  });
});
