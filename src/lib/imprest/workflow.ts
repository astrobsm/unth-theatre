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
  WorkflowStage.ACCOUNTS_REVIEW,
  WorkflowStage.INTERNAL_AUDIT,
  WorkflowStage.CHIEF_ACCOUNTANT_REVIEW,
  WorkflowStage.MEDICAL_DIRECTOR_REVIEW,
  WorkflowStage.APPROVED,
  WorkflowStage.COMPLETED,
];

/** Stages at which a named officer records a decision and signs. */
export const REVIEW_STAGES: WorkflowStage[] = [
  WorkflowStage.ACCOUNTS_REVIEW,
  WorkflowStage.INTERNAL_AUDIT,
  WorkflowStage.CHIEF_ACCOUNTANT_REVIEW,
  WorkflowStage.MEDICAL_DIRECTOR_REVIEW,
];

export const TERMINAL_STAGES: WorkflowStage[] = [
  WorkflowStage.COMPLETED,
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
    case WorkflowStage.ACCOUNTS_REVIEW:
    case WorkflowStage.INTERNAL_AUDIT:
    case WorkflowStage.CHIEF_ACCOUNTANT_REVIEW:
    case WorkflowStage.MEDICAL_DIRECTOR_REVIEW:
    // Superseded stages, so a historical row still resolves.
    case WorkflowStage.ACCOUNT_OFFICER_REVIEW:
    case WorkflowStage.CHAIRMAN_REVIEW:
    case WorkflowStage.FINANCE_REVIEW:
      // UNDER_REVIEW and COMPLETED are the civil-service spellings. IN_REVIEW
      // and CLOSED remain in the enum so rows written before the change still
      // read, but nothing writes them any more.
      return RetirementStatus.UNDER_REVIEW;
    case WorkflowStage.APPROVED:
      return RetirementStatus.APPROVED;
    case WorkflowStage.COMPLETED:
    case WorkflowStage.CLOSED:
      return RetirementStatus.COMPLETED;
    case WorkflowStage.RETURNED:
      return RetirementStatus.RETURNED;
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
    stage: WorkflowStage.ACCOUNTS_REVIEW,
    status: RetirementStatus.UNDER_REVIEW,
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
    stage: WorkflowStage.COMPLETED,
    status: RetirementStatus.COMPLETED,
    isFinalApproval: false,
  };
}

/**
 * Reopening an approved or completed retirement.
 *
 * This is deliberately not a stage in WORKFLOW_SEQUENCE — it is an override
 * that runs backwards through the chain, and treating it as an ordinary
 * transition would let it appear on the approval sheet as though the officers
 * had reconsidered. The retirement returns to RETURNED, which is the state the
 * chain already understands as "sent back for correction", so it re-enters at
 * the beginning rather than resuming mid-chain with stale approvals standing.
 */
export function applyReopen(currentStage: WorkflowStage): TransitionResult {
  const reopenable: WorkflowStage[] = [
    WorkflowStage.APPROVED,
    WorkflowStage.COMPLETED,
    WorkflowStage.CLOSED,
    WorkflowStage.REJECTED,
  ];
  if (!reopenable.includes(currentStage)) {
    throw new WorkflowError(
      'WORKFLOW_NOT_REOPENABLE',
      `Only a concluded retirement needs reopening; this one is at "${currentStage}" and can still be worked on.`,
    );
  }
  return {
    stage: WorkflowStage.RETURNED,
    status: RetirementStatus.RETURNED,
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
