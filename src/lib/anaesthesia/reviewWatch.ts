// ============================================================
// Was tomorrow's case reviewed in time, and if not, who answers for it
// ------------------------------------------------------------
// A case that reaches the morning without a preoperative anaesthetic review
// does not start on time. The anaesthetist meets the patient for the first
// time at the theatre door, finds an uncontrolled blood pressure or a fasting
// breach or no crossmatch, and the list slips for everybody behind it. So the
// review has a deadline — 9pm the evening before — and missing it brings a
// summons to the theatre audit.
//
// THE WHOLE DIFFICULTY IS WHO THE SUMMONS NAMES. A summons issued against the
// wrong person is worse than none at all: it is read once, resented, and from
// then on the entire scheme is treated as noise. Three ways the obvious
// answer — "the anaesthetist assigned to the case" — is wrong:
//
//   THE CASE WAS BOOKED TOO LATE TO REVIEW. A surgeon who books at 8pm for
//   the next morning has left nobody any window at all. Summoning the
//   anaesthetist for that is indefensible. The booking is the failure, and
//   the booker is who the audit needs in the room.
//
//   THE NAME CAME FROM A FALLBACK, NOT A ROSTER. When no anaesthetist is
//   rostered to a specialty the booking route falls back to the day's on-call
//   cover, which is right for cover and wrong for accountability — that
//   person never agreed to review fifteen lists. classifyAnaesthetistAssignment
//   already tells these apart; this uses it. A fallback assignment is a rota
//   gap, and a rota gap belongs to the HOD.
//
//   THEY SAID THEY COULD NOT DO IT, IN TIME, AND NOBODY REASSIGNED. The rule
//   the department set is that an anaesthetist who cannot review must tell the
//   HOD before 7pm so somebody else can be found. An anaesthetist who did that
//   has discharged their duty. If no replacement was named, the HOD answers,
//   not them.
//
// Everything here is pure so these rules can be proved rather than argued
// about in the meeting they feed.
//
// Both deadlines are WALL CLOCK IN ENUGU. The servers run UTC and browsers run
// whatever the handset is set to, so the hour is pinned to WAT the same way
// every other deadline in this system is.
// ============================================================

import { WAT_OFFSET_MINUTES } from '@/lib/watDay';
import type { AnaesthetistAssignmentSource } from '@/lib/anaesthetistAssignment';

/**
 * The hour by which an anaesthetist who cannot review must have told the HOD,
 * leaving two hours to find somebody else before the review deadline.
 */
export const HANDBACK_DEADLINE_HOUR = 19;

/** The hour by which the review itself must be done. */
export const REVIEW_DEADLINE_HOUR = 21;

/**
 * A WAT wall-clock hour on the day BEFORE the operating date, as a UTC instant.
 *
 * Reads the operating date as a calendar day in WAT rather than as an instant:
 * a date stored as midnight UTC is still "that day" to the theatre, and
 * treating it as an instant would shift the deadline by an hour.
 */
function eveningBefore(surgeryDate: Date | string, hour: number): Date {
  const d = surgeryDate instanceof Date ? surgeryDate : new Date(surgeryDate);
  const local = new Date(d.getTime() + WAT_OFFSET_MINUTES * 60_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 1, hour, 0, 0)
    - WAT_OFFSET_MINUTES * 60_000,
  );
}

/** 7pm WAT the evening before: the last moment to hand a case back to the HOD. */
export function handbackDeadline(surgeryDate: Date | string): Date {
  return eveningBefore(surgeryDate, HANDBACK_DEADLINE_HOUR);
}

/** 9pm WAT the evening before: the last moment for the review itself. */
export function reviewDeadline(surgeryDate: Date | string): Date {
  return eveningBefore(surgeryDate, REVIEW_DEADLINE_HOUR);
}

export interface ReviewWatchInput {
  /** The operating date. */
  surgeryDate: Date | string;
  /** When the case was booked — Surgery.createdAt. */
  bookedAt: Date | string | null | undefined;
  /** Surgery status, so settled cases stop being chased. */
  status?: string | null;

  /** The anaesthetist the case names. */
  expectedReviewerId?: string | null;
  /**
   * How that name was arrived at. A fallback is not an assignment — see the
   * header. Omitted is treated as a real assignment, which is the safe
   * default only because the caller that omits it has no roster to check.
   */
  assignmentSource?: AnaesthetistAssignmentSource | null;

  /** Set when the review exists. */
  reviewedAt?: Date | string | null;
  reviewedById?: string | null;

  /** Set when the assigned anaesthetist declared they could not review. */
  handedBackAt?: Date | string | null;
  /** Set when the HOD named somebody else. */
  reassignedToId?: string | null;
  reassignedAt?: Date | string | null;
}

/** Where a case stands against the two deadlines. */
export type ReviewWatchStatus =
  /** Done. */
  | 'REVIEWED'
  /** Still within the window, nothing to say yet. */
  | 'AWAITING'
  /** Handed back in time; waiting for the HOD to name a replacement. */
  | 'AWAITING_REASSIGNMENT'
  /** Past 7pm, unreviewed, nobody told. The clean window has closed. */
  | 'HANDBACK_WINDOW_CLOSED'
  /** Past 9pm, unreviewed. A summons is due. */
  | 'LAPSED'
  /** Cancelled or already operated — no longer anybody's problem. */
  | 'SETTLED';

/** Who answers for a lapse, and on what grounds. */
export interface Accountability {
  /** The person, when it is a person. Null when it is a rota gap. */
  userId: string | null;
  /**
   * What the summons is for. Decides both the wording and, where userId is
   * null, which role is called instead.
   */
  ground:
    | 'did-not-review'
    | 'reassigned-and-did-not-review'
    | 'handed-back-too-late'
    | 'hod-did-not-reassign'
    | 'rota-gap'
    | 'booked-too-late';
  /** One line, in the words the summons should use. */
  reason: string;
}

/** Statuses that mean the case is no longer waiting on a review. */
export const SETTLED_STATUSES = ['COMPLETED', 'CANCELLED', 'IN_PROGRESS'] as const;

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Was the case booked so late that no review window existed?
 *
 * Measured against the HANDBACK deadline, not the review deadline. A case
 * booked at 8pm leaves two hours to review, which is tight but possible — so
 * it is not excused. A case booked at 7:30pm has already passed the moment
 * when the anaesthetist could have handed it back, so the one obligation they
 * could still have met was never available to them.
 */
export function bookedTooLateToReview(input: ReviewWatchInput): boolean {
  const booked = asDate(input.bookedAt);
  if (!booked) return false;
  return booked.getTime() > handbackDeadline(input.surgeryDate).getTime();
}

/**
 * A name that came from a fallback is cover, not an assignment.
 *
 * 'unrostered' is deliberately NOT in here. Somebody named by hand on the case
 * was chosen by a person who meant it, which is a weaker claim than a roster
 * but a real one. 'on-call' and 'other-specialty' are the system filling a
 * hole, and the hole is the finding.
 */
export function isFallbackAssignment(source: AnaesthetistAssignmentSource | null | undefined): boolean {
  return source === 'on-call' || source === 'other-specialty' || source === 'none';
}

/** Where this case stands right now. */
export function reviewWatchState(input: ReviewWatchInput, now: Date): ReviewWatchStatus {
  if (input.status && (SETTLED_STATUSES as readonly string[]).includes(input.status)) {
    return 'SETTLED';
  }
  if (asDate(input.reviewedAt)) return 'REVIEWED';

  const t = now.getTime();
  const handback = handbackDeadline(input.surgeryDate).getTime();
  const review = reviewDeadline(input.surgeryDate).getTime();

  if (t >= review) return 'LAPSED';

  // Handed back and not yet replaced. Stays in this state up to the review
  // deadline whichever side of 7pm it was declared — the HOD still has time to
  // act, and saying "window closed" while they can still fix it would send
  // them the wrong message.
  const handedBack = asDate(input.handedBackAt);
  if (handedBack && !input.reassignedToId) return 'AWAITING_REASSIGNMENT';

  if (t >= handback) return 'HANDBACK_WINDOW_CLOSED';
  return 'AWAITING';
}

/**
 * Who answers for a lapsed case.
 *
 * Only meaningful once the state is LAPSED; callers check that first. Returns
 * null when the case was reviewed, which should not happen but is cheaper to
 * handle than to assert.
 */
export function accountableFor(input: ReviewWatchInput): Accountability | null {
  if (asDate(input.reviewedAt)) return null;

  // Checked before everything else. However the case was assigned and whoever
  // was told, nobody could have reviewed a case that did not exist yet.
  if (bookedTooLateToReview(input)) {
    return {
      userId: null,
      ground: 'booked-too-late',
      reason:
        'The case was booked after 7pm the evening before, leaving no window for a '
        + 'preoperative review. The booking is the delay, not the review.',
    };
  }

  const handedBack = asDate(input.handedBackAt);
  const handbackBy = handbackDeadline(input.surgeryDate);

  // Said so in time, and somebody else was named: that person owns it now.
  if (handedBack && input.reassignedToId) {
    return {
      userId: input.reassignedToId,
      ground: 'reassigned-and-did-not-review',
      reason:
        'Reassigned this case after the original anaesthetist handed it back, and did '
        + 'not review it before 9pm.',
    };
  }

  // Said so in time, and nobody was named. The duty was discharged; the
  // reassignment is what failed.
  if (handedBack && handedBack.getTime() <= handbackBy.getTime()) {
    return {
      userId: null,
      ground: 'hod-did-not-reassign',
      reason:
        'The assigned anaesthetist handed this case back before 7pm as required, and no '
        + 'replacement was named before the 9pm review deadline.',
    };
  }

  // Said so, but after the window — too late for anybody to be found.
  if (handedBack) {
    return {
      userId: input.expectedReviewerId ?? null,
      ground: 'handed-back-too-late',
      reason:
        'Handed this case back after 7pm, leaving no time for the HOD to reassign it, '
        + 'and it was not reviewed before 9pm.',
    };
  }

  // No roster behind the name, or no name at all. Summoning whoever the
  // fallback landed on would be summoning them for the rota's failure.
  if (!input.expectedReviewerId || isFallbackAssignment(input.assignmentSource)) {
    return {
      userId: null,
      ground: 'rota-gap',
      reason:
        'No anaesthetist was rostered to review this case. It reached the 9pm deadline '
        + 'unreviewed because nobody was assigned to it, not because an assignment was '
        + 'ignored.',
    };
  }

  return {
    userId: input.expectedReviewerId,
    ground: 'did-not-review',
    reason:
      'Assigned to review this case and did not do so before 9pm the evening before, '
      + 'nor notify the HOD of Anaesthesia before 7pm so that it could be reassigned.',
  };
}

/**
 * The role to summon when no individual is accountable.
 *
 * A rota gap and an unreassigned handback are both the department head's.
 * A late booking is not — that one belongs to whoever booked it, and the
 * caller has the surgery to find them from.
 */
export function roleAccountableFor(ground: Accountability['ground']): string | null {
  switch (ground) {
    case 'rota-gap':
    case 'hod-did-not-reassign':
      return 'HEAD_OF_ANAESTHESIA';
    default:
      return null;
  }
}

/**
 * Does the HOD need telling about this case right now?
 *
 * True between 7pm and the review deadline for anything unreviewed — whether
 * it was handed back or simply left. The HOD is the only person who can still
 * do anything about it in that window, and telling them at 9pm, when the
 * summons is already due, would be telling them too late to help.
 */
export function needsHodNotice(input: ReviewWatchInput, now: Date): boolean {
  const state = reviewWatchState(input, now);
  if (state !== 'HANDBACK_WINDOW_CLOSED' && state !== 'AWAITING_REASSIGNMENT') return false;
  // Nothing the HOD can do about a case that did not exist in time.
  return !bookedTooLateToReview(input);
}
