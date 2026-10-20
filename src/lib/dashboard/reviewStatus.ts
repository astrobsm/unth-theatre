// ============================================================
// Where the anaesthetic review stands, on everybody's board
// ------------------------------------------------------------
// The preoperative anaesthetic review decided whether a case goes ahead, and
// the only people who could see its result were the anaesthetists. The
// surgeon learned the patient had been declared unfit when the list did not
// start; the registrar chasing a crossmatch did not know a review had already
// asked for one; the house officer asked to send for the patient had no way
// to know the case was on hold.
//
// So the state of the review now appears on the board of everybody on the
// case — surgeon, consultant, anaesthetist, scrub nurse, technician, and the
// registrars and house officers the booking names.
//
// FOUR STATES, AND THE ONE THAT MATTERS IS "NOT FIT". A case declared unfit
// with outstanding optimisation requirements is not a case waiting for
// anybody's attention in general; it is a case waiting for specific things to
// be done, and the people who can do them are exactly the ones this puts it
// in front of. That item is CRITICAL and says how many are outstanding.
//
// NOT REVIEWED IS NOT AUTOMATICALLY A WARNING. Tomorrow's case has until 9pm
// this evening, and a board that shouts at 8am about a review that is not due
// until 9pm teaches people to ignore it. The deadline is the one already used
// by the evening watch, so the board and the summons cannot disagree about
// when a review was late.
// ============================================================

import { reviewDeadline } from '@/lib/anaesthesia/reviewWatch';
import type { BoardSeverity } from '@/lib/dashboard/personalBoard';

export interface ReviewStatusInput {
  surgeryId: string;
  procedureName: string;
  patientName: string | null;
  /** The operating date. */
  surgeryDate: Date | string | null;
  /** Set when a review exists. */
  reviewedAt?: Date | string | null;
  reviewerName?: string | null;
  /** FIT | NOT_FIT, or null when the reviewer has not decided yet. */
  fitnessDecision?: string | null;
  /** Optimisation requirements still OUTSTANDING or IN_PROGRESS. */
  outstandingRequirements?: number;
  /** Surgery status, so a finished or cancelled case stops appearing. */
  status?: string | null;
}

export type ReviewState =
  /** Reviewed and fit for the proposed anaesthesia. */
  | 'FIT'
  /** Reviewed and NOT fit. The case is on hold until the list below is done. */
  | 'NOT_FIT'
  /** A review exists but the fitness decision has not been recorded. */
  | 'AWAITING_DECISION'
  /** No review, and the deadline has not passed. */
  | 'PENDING'
  /** No review, and 9pm the evening before has gone. */
  | 'OVERDUE'
  /** Nothing to say: the case is cancelled, done, or has no date. */
  | 'NONE';

export interface ReviewBadge {
  state: ReviewState;
  severity: BoardSeverity;
  title: string;
  detail: string;
  actionUrl: string;
}

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Statuses after which the review no longer matters to anybody. */
const SETTLED = ['COMPLETED', 'CANCELLED', 'IN_PROGRESS'];

/**
 * The review's state for one case, as it should read on a board.
 *
 * Pure. Whether a surgeon is told their patient is unfit is not something to
 * establish by logging in as them.
 */
export function reviewBadge(input: ReviewStatusInput, now: Date): ReviewBadge | null {
  if (input.status && SETTLED.includes(input.status.toUpperCase())) return null;

  const who = input.patientName ?? 'Patient';
  const what = input.procedureName;
  const url = `/dashboard/surgeries/${input.surgeryId}`;
  const reviewed = asDate(input.reviewedAt);

  if (reviewed) {
    const decision = (input.fitnessDecision ?? '').toUpperCase();
    const by = input.reviewerName ? ` by ${input.reviewerName}` : '';

    if (decision === 'NOT_FIT') {
      const n = input.outstandingRequirements ?? 0;
      return {
        state: 'NOT_FIT',
        // The whole point of putting this on everybody's board. Somebody on
        // the case can usually do the outstanding thing today.
        severity: 'CRITICAL',
        title: `${who} is NOT FIT for anaesthesia — ${what}`,
        detail: n > 0
          ? `Reviewed${by}. ${n} optimisation requirement${n === 1 ? '' : 's'} outstanding; `
            + 'the case does not go ahead until they are done.'
          : `Reviewed${by} and declared not fit. No optimisation requirements have been `
            + 'recorded, so nothing yet says what would change it.',
        actionUrl: url,
      };
    }

    if (decision === 'FIT') {
      return {
        state: 'FIT',
        severity: 'LOW',
        title: `Anaesthetic review done — ${who}, ${what}`,
        detail: `Fit for the proposed anaesthesia${by}.`,
        actionUrl: url,
      };
    }

    return {
      state: 'AWAITING_DECISION',
      severity: 'NORMAL',
      title: `Anaesthetic review started — ${who}, ${what}`,
      detail: `Recorded${by}, but fit or not fit has not been decided yet.`,
      actionUrl: url,
    };
  }

  const date = asDate(input.surgeryDate);
  if (!date) return null;

  // Past the deadline the evening watch uses, so the board and the summons
  // cannot disagree about when a review was late.
  if (now.getTime() >= reviewDeadline(date).getTime()) {
    return {
      state: 'OVERDUE',
      severity: 'HIGH',
      title: `No anaesthetic review — ${who}, ${what}`,
      detail: 'The 9pm deadline the evening before has passed and no review has been '
        + 'recorded. This case is likely to delay the morning list.',
      actionUrl: url,
    };
  }

  return {
    state: 'PENDING',
    severity: 'LOW',
    title: `Anaesthetic review not yet done — ${who}, ${what}`,
    detail: 'Due by 9pm the evening before surgery.',
    actionUrl: url,
  };
}

/**
 * Which states are worth a line on a busy board.
 *
 * FIT and PENDING are deliberately excluded by default: on a six-case list
 * they are six lines saying nothing is wrong, and a board that is mostly
 * reassurance is one people stop reading. They remain available to a screen
 * that wants to show the full picture.
 */
export const NOTEWORTHY_STATES: ReviewState[] = ['NOT_FIT', 'OVERDUE', 'AWAITING_DECISION'];

export function isNoteworthy(badge: ReviewBadge | null): boolean {
  return Boolean(badge && NOTEWORTHY_STATES.includes(badge.state));
}
