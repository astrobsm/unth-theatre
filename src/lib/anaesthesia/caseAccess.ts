// ============================================================
// Whose case is this?
// ------------------------------------------------------------
// Until now any anaesthetist could approve any prescription in the hospital.
// The approval routes checked the ROLE and stopped there, so a registrar in
// Theatre 2 could sign off the drugs for a neurosurgical case he had never
// seen, and the day board showed every anaesthetist every case booked that
// day. Nobody did it on purpose; the door was simply open.
//
// This module answers one question -- is this case yours? -- and both the
// view and the approval are built on the same answer, so a case you cannot
// see is a case you cannot approve.
//
// Pure. It takes rows and returns a decision, so the rule can be proved
// instead of read, and so the same rule can be applied to a list of a hundred
// cases without a hundred queries.
// ============================================================

/**
 * Roles that oversee the whole theatre complex rather than carry a list.
 *
 * They are not anaesthetists and this restriction is not about them: a
 * theatre manager who could only see cases with her own name on them could
 * see nothing at all, and the board is how she runs the day.
 */
export const ANAESTHESIA_OVERSIGHT_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
];

/** The two grades who carry cases and therefore have a list of their own. */
export const ANAESTHETIST_ROLES = ['CONSULTANT_ANAESTHETIST', 'ANAESTHETIST'];

export interface CaseParties {
  /** The anaesthetist named on the surgery itself. */
  anesthetistId?: string | null;
  /** Every pre-op review written against this case. */
  reviews?: readonly {
    /** The registrar or consultant who conducted the review. */
    anesthetistId?: string | null;
    /** The consultant recorded as the one who will approve it. */
    consultantAnesthetistId?: string | null;
  }[];
  /** Every prescription version on this case. */
  prescriptions?: readonly { prescribedById?: string | null }[];
}

export type AttachmentReason =
  /** Named as the anaesthetist on the booking. */
  | 'NAMED_ON_CASE'
  /** Wrote the pre-op review. */
  | 'REVIEWED_IT'
  /** Recorded on the review as the consultant who will approve it. */
  | 'SUPERVISING_CONSULTANT'
  /** Wrote a prescription on it. */
  | 'PRESCRIBED_FOR_IT'
  /** Nobody is named on the case at all. */
  | 'UNCLAIMED'
  /** Somebody else's case. */
  | 'NOT_YOURS';

export interface CaseAccess {
  /** True when this person's name is on the case in one of the four ways. */
  attached: boolean;
  /** True when NO anaesthetist is named on the booking. */
  unclaimed: boolean;
  reason: AttachmentReason;
  mayView: boolean;
  mayApprove: boolean;
}

/**
 * Is this anaesthetist's name on this case, and how?
 *
 * FOUR WAYS, because a case passes through more than one pair of hands and a
 * rule that recognised only the booking would break the normal working
 * pattern -- registrar reviews and prescribes, his consultant approves. The
 * database has recorded the supervising consultant all along
 * (PreOperativeAnestheticReview.consultantAnesthetistId, commented in the
 * schema as "Consultant who will approve"); nothing was reading it.
 *
 * Note what is NOT a way: being on the day's roster for that specialty. It
 * looks like the natural fifth, and it is a trap. When a roster is not
 * published the booking route falls back to the day's on-call consultant, so
 * one person would be "attached" to every case in the hospital and the
 * restriction would quietly undo itself on exactly the chaotic days it
 * matters most. See src/lib/anaesthetistAssignment.ts, which exists because
 * that fallback was once displayed as though it were an assignment.
 */
export function decideCaseAccess(args: {
  userId: string;
  role: string | null | undefined;
  parties: CaseParties;
}): CaseAccess {
  const { userId, role, parties } = args;

  if (ANAESTHESIA_OVERSIGHT_ROLES.indexOf(role ?? '') !== -1) {
    // Not attached -- it is not their case -- but they see and may act on all
    // of it. Saying "attached" here would make the audit trail lie.
    return {
      attached: false,
      unclaimed: !parties.anesthetistId,
      reason: 'NOT_YOURS',
      mayView: true,
      mayApprove: true,
    };
  }

  const isAnaesthetist = ANAESTHETIST_ROLES.indexOf(role ?? '') !== -1;
  const unclaimed = !parties.anesthetistId;

  // BOTH SIDES MUST BE A REAL ID. Plain === would make an empty-string user
  // id match an empty-string column, so a malformed session would come out
  // "attached" to every case whose consultant field happens to be blank --
  // and blank is the common state, because the consultant is often filled in
  // later. A test caught this; it is the kind of thing that never shows up in
  // use until the one day it does.
  const me = (userId || '').trim();
  const isMe = (other: string | null | undefined) => !!me && !!other && other === me;

  const reason: AttachmentReason | null =
    isMe(parties.anesthetistId)
      ? 'NAMED_ON_CASE'
      : (parties.reviews ?? []).some((r) => isMe(r.consultantAnesthetistId))
        ? 'SUPERVISING_CONSULTANT'
        : (parties.reviews ?? []).some((r) => isMe(r.anesthetistId))
          ? 'REVIEWED_IT'
          : (parties.prescriptions ?? []).some((p) => isMe(p.prescribedById))
            ? 'PRESCRIBED_FOR_IT'
            : null;

  if (!isAnaesthetist) {
    return { attached: false, unclaimed, reason: 'NOT_YOURS', mayView: false, mayApprove: false };
  }

  if (reason) {
    return { attached: true, unclaimed, reason, mayView: true, mayApprove: true };
  }

  // Nobody is named on the booking.
  //
  // These stay VISIBLE to every anaesthetist, flagged, because the case that
  // belongs to nobody is precisely the one that reaches theatre unreviewed.
  // Hiding it would satisfy the letter of "only my cases" and cost a patient
  // their operation. geofence.ts makes the same argument about a check-in
  // nobody can file: a gap that hides itself is the expensive kind.
  //
  // Approving one is a different matter. A consultant may, because somebody
  // has to be able to or pharmacy can never pack the drugs; a registrar may
  // not, because approval is a consultant's signature. The route records that
  // it was approved by someone not named on the case.
  if (unclaimed) {
    return {
      attached: false,
      unclaimed: true,
      reason: 'UNCLAIMED',
      mayView: true,
      mayApprove: role === 'CONSULTANT_ANAESTHETIST',
    };
  }

  return { attached: false, unclaimed: false, reason: 'NOT_YOURS', mayView: false, mayApprove: false };
}

/** What to tell someone who has been refused, in words that say what to do. */
export function refusalMessage(access: CaseAccess): string {
  if (access.reason === 'UNCLAIMED') {
    return 'No anaesthetist is named on this case. A consultant anaesthetist can approve it, '
      + 'or ask the booking officer to assign it first.';
  }
  return 'This case is not assigned to you. Only the anaesthetist named on it, '
    + 'the one who reviewed it, or the consultant recorded as its approver can act on it.';
}
