/**
 * The retirement approval state machine.
 *
 * Prepared → Submitted → Account Officer → Chairman → Finance → Internal Audit
 *          → Approved → Closed
 *
 * Any reviewing stage may REJECT (terminal) or QUERY (returns the packet to
 * the preparer for correction). A queried retirement re-enters the chain at
 * SUBMITTED so every downstream office re-examines the corrected figures —
 * this is the behaviour auditors expect and it is why a query does not simply
 * resume where it left off.
 */

import {
  ApprovalDecision,
  RetirementStatus,
  UserRole,
  WorkflowStage,
} from './enums';
import { canActOnStage } from './permissions';

/** The ordered chain. Reviewing stages are the slice between the sentinels. */
export const WORKFLOW_SEQUENCE: WorkflowStage[] = [
  WorkflowStage.PREPARED,
  WorkflowStage.SUBMITTED,
  WorkflowStage.ACCOUNT_OFFICER_REVIEW,
  WorkflowStage.CHAIRMAN_REVIEW,
  WorkflowStage.FINANCE_REVIEW,
  WorkflowStage.INTERNAL_AUDIT,
  WorkflowStage.APPROVED,
  WorkflowStage.CLOSED,
];

/** Stages at which a named officer records a decision and signs. */
export const REVIEW_STAGES: WorkflowStage[] = [
  WorkflowStage.ACCOUNT_OFFICER_REVIEW,
  WorkflowStage.CHAIRMAN_REVIEW,
  WorkflowStage.FINANCE_REVIEW,
  WorkflowStage.INTERNAL_AUDIT,
];

export const TERMINAL_STAGES: WorkflowStage[] = [
  WorkflowStage.CLOSED,
  WorkflowStage.REJECTED,
];

export function isReviewStage(stage: WorkflowStage): boolean {
  return REVIEW_STAGES.includes(stage);
}

export function isTerminalStage(stage: WorkflowStage): boolean {
  return TERMINAL_STAGES.includes(stage);
}

export function stageIndex(stage: WorkflowStage): number {
  return WORKFLOW_SEQUENCE.indexOf(stage);
}

/** Zero-based position of a stage in the chain, for progress indicators. */
export function stageProgress(stage: WorkflowStage): number {
  if (stage === WorkflowStage.REJECTED) return 100;
  const index = stageIndex(stage);
  if (index < 0) return 0;
  return Math.round((index / (WORKFLOW_SEQUENCE.length - 1)) * 100);
}

/** The stage that follows `stage` on approval, or `null` at the end of the chain. */
export function nextStage(stage: WorkflowStage): WorkflowStage | null {
  const index = stageIndex(stage);
  if (index < 0 || index >= WORKFLOW_SEQUENCE.length - 1) return null;
  return WORKFLOW_SEQUENCE[index + 1] ?? null;
}

export interface TransitionInput {
  currentStage: WorkflowStage;
  decision: ApprovalDecision;
  actorRole: UserRole;
}

export interface TransitionResult {
  stage: WorkflowStage;
  status: RetirementStatus;
  /** True when the retirement reached APPROVED as a result of this decision. */
  isFinalApproval: boolean;
}

export class WorkflowError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
  }
}

/** Maps a stage to the retirement status that should accompany it. */
export function statusForStage(stage: WorkflowStage): RetirementStatus {
  switch (stage) {
    case WorkflowStage.PREPARED:
      return RetirementStatus.DRAFT;
    case WorkflowStage.SUBMITTED:
    case WorkflowStage.ACCOUNT_OFFICER_REVIEW:
    case WorkflowStage.CHAIRMAN_REVIEW:
    case WorkflowStage.FINANCE_REVIEW:
    case WorkflowStage.INTERNAL_AUDIT:
      return RetirementStatus.IN_REVIEW;
    case WorkflowStage.APPROVED:
      return RetirementStatus.APPROVED;
    case WorkflowStage.CLOSED:
      return RetirementStatus.CLOSED;
    case WorkflowStage.REJECTED:
      return RetirementStatus.REJECTED;
    default:
      return RetirementStatus.DRAFT;
  }
}

/**
 * Applies a decision and returns the resulting stage/status.
 * Throws `WorkflowError` rather than returning a sentinel, so an illegal
 * transition can never be mistaken for a successful one by a careless caller.
 */
export function applyDecision(input: TransitionInput): TransitionResult {
  const { currentStage, decision, actorRole } = input;

  if (isTerminalStage(currentStage)) {
    throw new WorkflowError(
      'WORKFLOW_TERMINAL',
      `This retirement is ${currentStage.toLowerCase()} and can no longer be acted upon.`,
    );
  }

  if (!isReviewStage(currentStage)) {
    throw new WorkflowError(
      'WORKFLOW_NOT_REVIEWABLE',
      `No decision can be recorded while the retirement is at the "${currentStage}" stage.`,
    );
  }

  if (!canActOnStage(actorRole, currentStage)) {
    throw new WorkflowError(
      'WORKFLOW_FORBIDDEN',
      `Your role is not authorised to act at the "${currentStage}" stage.`,
    );
  }

  switch (decision) {
    case ApprovalDecision.REJECT:
      return {
        stage: WorkflowStage.REJECTED,
        status: RetirementStatus.REJECTED,
        isFinalApproval: false,
      };

    case ApprovalDecision.QUERY:
      // Back to the preparer; resubmission restarts the chain from SUBMITTED.
      return {
        stage: WorkflowStage.PREPARED,
        status: RetirementStatus.QUERIED,
        isFinalApproval: false,
      };

    case ApprovalDecision.APPROVE: {
      const next = nextStage(currentStage);
      if (!next) {
        throw new WorkflowError(
          'WORKFLOW_NO_NEXT_STAGE',
          `"${currentStage}" has no following stage.`,
        );
      }
      return {
        stage: next,
        status: statusForStage(next),
        isFinalApproval: next === WorkflowStage.APPROVED,
      };
    }

    default:
      throw new WorkflowError('WORKFLOW_UNKNOWN_DECISION', `Unknown decision: ${decision}`);
  }
}

/** Transition for submitting a prepared (or queried) retirement into the chain. */
export function applySubmission(currentStage: WorkflowStage): TransitionResult {
  if (currentStage !== WorkflowStage.PREPARED) {
    throw new WorkflowError(
      'WORKFLOW_NOT_SUBMITTABLE',
      `Only a prepared retirement may be submitted; this one is at "${currentStage}".`,
    );
  }
  // SUBMITTED is a bookkeeping marker; the packet immediately awaits the
  // Account Officer, so we advance past it in one step.
  return {
    stage: WorkflowStage.ACCOUNT_OFFICER_REVIEW,
    status: RetirementStatus.IN_REVIEW,
    isFinalApproval: false,
  };
}

/** Transition for the Finance office closing an approved retirement. */
export function applyClosure(currentStage: WorkflowStage): TransitionResult {
  if (currentStage !== WorkflowStage.APPROVED) {
    throw new WorkflowError(
      'WORKFLOW_NOT_CLOSEABLE',
      `Only an approved retirement may be closed; this one is at "${currentStage}".`,
    );
  }
  return {
    stage: WorkflowStage.CLOSED,
    status: RetirementStatus.CLOSED,
    isFinalApproval: false,
  };
}

export interface WorkflowStep {
  stage: WorkflowStage;
  sequence: number;
  isReviewStage: boolean;
  state: 'complete' | 'current' | 'pending' | 'skipped';
}

/** Renders the chain for the approval progress tracker in the UI. */
export function buildWorkflowTimeline(currentStage: WorkflowStage): WorkflowStep[] {
  if (currentStage === WorkflowStage.REJECTED) {
    return WORKFLOW_SEQUENCE.map((stage, index) => ({
      stage,
      sequence: index,
      isReviewStage: isReviewStage(stage),
      state: index === 0 ? 'complete' : 'skipped',
    }));
  }

  const current = stageIndex(currentStage);
  return WORKFLOW_SEQUENCE.map((stage, index) => ({
    stage,
    sequence: index,
    isReviewStage: isReviewStage(stage),
    state: index < current ? 'complete' : index === current ? 'current' : 'pending',
  }));
}

/** Seeds one approval row per reviewing stage when a retirement is created. */
export function initialApprovalSlots(): Array<{ stage: WorkflowStage; sequence: number }> {
  return REVIEW_STAGES.map((stage, index) => ({ stage, sequence: index + 1 }));
}
