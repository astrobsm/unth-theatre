// ============================================================
// One day's list, as a consultant anaesthetist needs to read it
// ------------------------------------------------------------
// The consultant's question before a list runs is narrow and always the same:
// which of today's cases has not been reviewed, which patient has been found
// unfit, and which drug prescription is still waiting for me. Everything here
// exists to answer that at a glance rather than by opening every case.
//
// Pure, because the interesting part is not fetching the rows — it is deciding
// what "reviewed" and "prescribed" mean when the underlying records disagree,
// and those rules should be exercised without a database.
//
// TWO PLACES WHERE THE OBVIOUS READING IS WRONG:
//
//   A REVIEW THAT EXISTS IS NOT A REVIEW THAT IS FINISHED. The row is created
//   when the anaesthetist opens the form, so a half-typed review looks
//   identical to a completed one unless status is read. A board that counted
//   rows would report a list as fully reviewed while half of it was drafts.
//
//   A PRESCRIPTION HAS VERSIONS. Amending one supersedes it rather than
//   editing it, deliberately, so a case can hold several rows of which exactly
//   one is live. Taking the newest by date is not enough either: the live one
//   is the one nothing has superseded.
// ============================================================

export type ReviewState = 'NONE' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED';
export type RxState =
  | 'NONE'
  | 'DRAFT'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'IN_PHARMACY'
  | 'CANCELLED';

export interface BoardCase {
  id: string;
  patientName: string;
  folderNumber: string | null;
  age: number | null;
  gender: string | null;
  ward: string | null;
  procedureName: string;
  unit: string;
  subspecialty: string | null;
  scheduledTime: string;
  status: string;
  surgeryType: string | null;
  location: string | null;
  theatre: string | null;
  anaesthesiaType: string | null;
  surgeonName: string | null;
  /** Assigned on the surgery. Null is a real state and is counted. */
  anaesthetist: { id: string; name: string; phone: string | null } | null;
  review: {
    state: ReviewState;
    /** Who actually did it — usually a registrar, not the consultant. */
    byName: string | null;
    consultantName: string | null;
    reviewedAt: string | null;
    fitness: 'FIT' | 'NOT_FIT' | null;
    asaClass: string | null;
  };
  prescription: {
    id: string | null;
    state: RxState;
    version: number | null;
    itemCount: number;
    prescribedByName: string | null;
    approvedByName: string | null;
    /** More than one version exists — the case has been amended. */
    amended: boolean;
  };
  /** Reviewed, found fit, and drugs approved. What "nothing outstanding" means. */
  readyForTheatre: boolean;
  /** Ordered, human, and safe to show verbatim on the board. */
  outstanding: string[];
}

interface RawReview {
  status: string;
  reviewDate: Date | string | null;
  anesthetistName: string | null;
  consultantName: string | null;
  fitnessDecision: string | null;
  approvedAt: Date | string | null;
  asaClass: string | null;
}

interface RawRx {
  id: string;
  status: string;
  version: number;
  prescribedByName: string | null;
  approvedByName: string | null;
  supersededById: string | null;
  _count?: { prescriptionItems: number };
}

export interface SummariseInput {
  surgery: Omit<BoardCase, 'review' | 'prescription' | 'readyForTheatre' | 'outstanding' | 'patientName'> & {
    patientName: string | null;
  };
  review: RawReview | null;
  prescriptions: RawRx[];
}

/**
 * The live prescription: the one nothing has superseded.
 *
 * Falling back to the highest version matters — a chain whose supersededById
 * links are incomplete (an amendment interrupted mid-write, a row that arrived
 * from the other node before its parent) would otherwise report NO live
 * prescription for a case that plainly has one, which reads as "not prescribed"
 * and sends a consultant looking for a prescription that is sitting right
 * there.
 */
export function livePrescription(rows: RawRx[]): RawRx | null {
  if (!rows.length) return null;
  const live = rows.filter((r) => !r.supersededById && r.status !== 'SUPERSEDED');
  const pool = live.length ? live : rows;
  return pool.reduce((best, r) => (r.version > best.version ? r : best), pool[0]);
}

function reviewState(review: RawReview | null): ReviewState {
  if (!review) return 'NONE';
  switch (review.status) {
    case 'APPROVED': return 'APPROVED';
    case 'COMPLETED': return 'COMPLETED';
    // PENDING and IN_PROGRESS are both "started, not finished". They are one
    // state to a consultant: not yet something to act on.
    default: return 'IN_PROGRESS';
  }
}

function rxState(rx: RawRx | null): RxState {
  if (!rx) return 'NONE';
  switch (rx.status) {
    case 'DRAFT': return 'DRAFT';
    case 'PENDING_APPROVAL': return 'AWAITING_APPROVAL';
    case 'REJECTED': return 'REJECTED';
    case 'CANCELLED': return 'CANCELLED';
    case 'APPROVED': return 'APPROVED';
    // Everything past approval — dispensed, packed, collected, in use,
    // reconciled — is approved as far as this board is concerned. The
    // consultant's decision has been made and pharmacy has taken it on.
    default: return 'IN_PHARMACY';
  }
}

const iso = (d: Date | string | null | undefined): string | null =>
  d ? (typeof d === 'string' ? d : d.toISOString()) : null;

export function summariseAnaesthesiaCase(input: SummariseInput): BoardCase {
  const { surgery, review, prescriptions } = input;

  const rState = reviewState(review);
  const rx = livePrescription(prescriptions);
  const pState = rxState(rx);

  const fitness =
    review?.fitnessDecision === 'FIT' || review?.fitnessDecision === 'NOT_FIT'
      ? review.fitnessDecision
      : null;

  // What is still owed, in the order a consultant would chase it. Phrased as
  // things to be done rather than as statuses, because this text goes straight
  // onto the board and "PENDING_APPROVAL" is not a sentence.
  const outstanding: string[] = [];
  if (!surgery.anaesthetist) outstanding.push('No anaesthetist assigned');
  if (rState === 'NONE') outstanding.push('Not yet reviewed');
  else if (rState === 'IN_PROGRESS') outstanding.push('Review started, not completed');
  if (fitness === 'NOT_FIT') outstanding.push('Patient assessed NOT FIT');
  if (pState === 'NONE') outstanding.push('No anaesthetic prescription');
  else if (pState === 'DRAFT') outstanding.push('Prescription still a draft');
  else if (pState === 'AWAITING_APPROVAL') outstanding.push('Prescription awaiting your approval');
  else if (pState === 'REJECTED') outstanding.push('Prescription rejected — needs rewriting');
  else if (pState === 'CANCELLED') outstanding.push('Prescription cancelled — none in force');

  // Deliberately strict. NOT_FIT is disqualifying even with everything else in
  // place: a fit-to-proceed board that shows a green tick beside an unfit
  // patient is worse than no board.
  const readyForTheatre =
    !!surgery.anaesthetist &&
    (rState === 'COMPLETED' || rState === 'APPROVED') &&
    fitness !== 'NOT_FIT' &&
    (pState === 'APPROVED' || pState === 'IN_PHARMACY');

  return {
    ...surgery,
    // A patient always has a name; this is belt and braces for a board that a
    // consultant reads at speed, where a blank line is worse than a label.
    patientName: surgery.patientName?.trim() || 'Unnamed patient',
    review: {
      state: rState,
      byName: review?.anesthetistName ?? null,
      consultantName: review?.consultantName ?? null,
      reviewedAt: iso(review?.reviewDate ?? null),
      fitness,
      asaClass: review?.asaClass ?? null,
    },
    prescription: {
      id: rx?.id ?? null,
      state: pState,
      version: rx?.version ?? null,
      itemCount: rx?._count?.prescriptionItems ?? 0,
      prescribedByName: rx?.prescribedByName ?? null,
      approvedByName: rx?.approvedByName ?? null,
      amended: prescriptions.length > 1,
    },
    readyForTheatre,
    outstanding,
  };
}
