// ============================================================
// The cases with one anaesthetist's name on them, and what each still needs
// ------------------------------------------------------------
// The Anaesthetist Review Board answers "can today's list run". This answers a
// narrower and more personal question: what is waiting on ME, across the days
// ahead, on the cases I have been assigned to.
//
// It exists because the board is a day at a time and a consultant's
// outstanding work is not. A prescription for Thursday's list written on
// Monday sits unapproved until somebody opens Thursday — and pharmacy cannot
// pack it until he does. Nothing told him it was there.
//
// WHY A CASE CAN NEED SEVERAL THINGS AT ONCE. An unreviewed case can still
// have a prescription waiting for approval: a registrar can write up the drugs
// before completing the review form, and often does. Filing each case under
// one heading would hide the second thing, so a case carries a list of needs
// rather than a single state.
//
// Pure, so the rules can be proved without a database.
// ============================================================

import type { BoardCase } from './board';

/** WAT is UTC+1 all year, so a calendar day never needs a timezone table. */
export function watToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** YYYY-MM-DD, n days on. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type MyCaseNeed =
  /** A live prescription is sitting at PENDING_APPROVAL. The one he can clear. */
  | 'APPROVE_PRESCRIPTION'
  /** Nobody has opened a review for this case. */
  | 'NOT_REVIEWED'
  /** A review was started and never finished. */
  | 'REVIEW_UNFINISHED'
  /** Reviewed, but no anaesthetic prescription has been written. */
  | 'NO_PRESCRIPTION'
  /** Written but never submitted, so it is not waiting on anybody yet. */
  | 'PRESCRIPTION_DRAFT'
  /** Sent back; somebody has to rewrite it. */
  | 'PRESCRIPTION_REJECTED'
  /** The patient was assessed unfit. Disqualifying, and he should know. */
  | 'NOT_FIT';

export interface MyCase extends BoardCase {
  /** YYYY-MM-DD. The board works a day at a time; this list spans days. */
  scheduledDate: string;
  needs: MyCaseNeed[];
}

export const NEED_LABEL: Record<MyCaseNeed, string> = {
  APPROVE_PRESCRIPTION: 'Prescription awaiting your approval',
  NOT_REVIEWED: 'Not yet reviewed',
  REVIEW_UNFINISHED: 'Review started, not completed',
  NO_PRESCRIPTION: 'No anaesthetic prescription',
  PRESCRIPTION_DRAFT: 'Prescription still a draft',
  PRESCRIPTION_REJECTED: 'Prescription rejected — needs rewriting',
  NOT_FIT: 'Patient assessed NOT FIT',
};

/**
 * Severity order, which is also the order they are listed on a case.
 *
 * NOT_FIT leads because it changes what the rest of the list means: approving
 * drugs for a patient who has been found unfit is the one action here that is
 * worse than doing nothing.
 */
const NEED_RANK: Record<MyCaseNeed, number> = {
  NOT_FIT: 0,
  APPROVE_PRESCRIPTION: 1,
  NOT_REVIEWED: 2,
  REVIEW_UNFINISHED: 3,
  PRESCRIPTION_REJECTED: 4,
  NO_PRESCRIPTION: 5,
  PRESCRIPTION_DRAFT: 6,
};

/** What this case still needs from the anaesthetist whose name is on it. */
export function needsOf(c: BoardCase): MyCaseNeed[] {
  const needs: MyCaseNeed[] = [];

  if (c.review.fitness === 'NOT_FIT') needs.push('NOT_FIT');
  if (c.review.state === 'NONE') needs.push('NOT_REVIEWED');
  else if (c.review.state === 'IN_PROGRESS') needs.push('REVIEW_UNFINISHED');

  switch (c.prescription.state) {
    case 'AWAITING_APPROVAL': needs.push('APPROVE_PRESCRIPTION'); break;
    case 'NONE': needs.push('NO_PRESCRIPTION'); break;
    case 'DRAFT': needs.push('PRESCRIPTION_DRAFT'); break;
    case 'REJECTED': needs.push('PRESCRIPTION_REJECTED'); break;
    default: break; // APPROVED, IN_PHARMACY and CANCELLED need nothing of him.
  }

  return needs.sort((a, b) => NEED_RANK[a] - NEED_RANK[b]);
}

/** Is there anything on this case for him to do? */
export function waitingOnMe(c: BoardCase): boolean {
  return needsOf(c).length > 0;
}

/**
 * The prescriptions he could approve right now.
 *
 * Only AWAITING_APPROVAL, and only where the id survived the summary — a case
 * whose prescription has no id is a case nothing can be done to, and offering
 * it in an "approve all" count would make the count a lie.
 */
export function approvablePrescriptionIds(cases: BoardCase[]): string[] {
  const out: string[] = [];
  cases.forEach((c) => {
    if (c.prescription.state === 'AWAITING_APPROVAL' && c.prescription.id) {
      out.push(c.prescription.id);
    }
  });
  return out;
}

/**
 * Soonest first.
 *
 * Date before anything else, because a case tomorrow with one problem is more
 * urgent than a case next week with three, and pharmacy packs the night
 * before. Within a day, the cases that need something lead, then by theatre
 * time.
 */
export function sortForConsultant(cases: MyCase[]): MyCase[] {
  return [...cases].sort((a, b) => (
    a.scheduledDate.localeCompare(b.scheduledDate)
    || (b.needs.length > 0 ? 1 : 0) - (a.needs.length > 0 ? 1 : 0)
    || (a.scheduledTime || '').localeCompare(b.scheduledTime || '')
    || a.patientName.localeCompare(b.patientName)
  ));
}

export interface MyCasesSummary {
  total: number;
  waiting: number;
  awaitingApproval: number;
  notReviewed: number;
  reviewUnfinished: number;
  noPrescription: number;
  notFit: number;
  ready: number;
}

export function summarise(cases: MyCase[]): MyCasesSummary {
  const has = (c: MyCase, n: MyCaseNeed) => c.needs.indexOf(n) !== -1;
  return {
    total: cases.length,
    waiting: cases.filter((c) => c.needs.length > 0).length,
    awaitingApproval: cases.filter((c) => has(c, 'APPROVE_PRESCRIPTION')).length,
    notReviewed: cases.filter((c) => has(c, 'NOT_REVIEWED')).length,
    reviewUnfinished: cases.filter((c) => has(c, 'REVIEW_UNFINISHED')).length,
    noPrescription: cases.filter((c) => has(c, 'NO_PRESCRIPTION')).length,
    notFit: cases.filter((c) => has(c, 'NOT_FIT')).length,
    ready: cases.filter((c) => c.readyForTheatre).length,
  };
}

/**
 * One line for the top of the card.
 *
 * Approvals lead because they are the only thing on this card he can finish
 * from the dashboard itself; everything else is a journey to another screen.
 */
export function headline(s: MyCasesSummary): string {
  if (s.total === 0) return 'No cases assigned to you in this period.';
  if (s.waiting === 0) return `All ${s.total} of your cases are ready.`;

  const parts: string[] = [];
  if (s.awaitingApproval > 0) {
    parts.push(`${s.awaitingApproval} prescription${s.awaitingApproval === 1 ? '' : 's'} awaiting your approval`);
  }
  const unreviewed = s.notReviewed + s.reviewUnfinished;
  if (unreviewed > 0) parts.push(`${unreviewed} not yet reviewed`);
  if (s.notFit > 0) parts.push(`${s.notFit} assessed not fit`);

  if (parts.length === 0) return `${s.waiting} of your cases still need something.`;
  if (parts.length === 1) return `${parts[0]}.`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`;
}
