// ============================================================
// "Nobody in theatre has picked this case up."
// ------------------------------------------------------------
// Asked for on 7 November:
//
//   "add a button to chase the theatre manager if the booked emergency have
//    not been acknowledged by the nurses, add a message of how they will
//    assign theatre and scrub and circulating nurses"
//
//   "ensure that the chase message will also inform the consultant
//    anaesthetist about the booked case reviewed or not reviewed by the
//    anaesthetist, i meant how they will assign a theatre for the case"
//
// WHAT "NOT ACKNOWLEDGED" MEANS HERE. Assigning a theatre IS the
// acknowledgement: api/emergency-booking/assign-theatre does the room, the
// acknowledgement and the radio announcement in one press, precisely because
// in a real emergency nobody performs three administrative steps. So a case
// still sitting at SUBMITTED or APPROVED is a case no one in theatre has
// taken, and the surgeon who booked it has no way of knowing whether it was
// seen at all. On the live board the day this was written, 82 of 221
// bookings were still SUBMITTED.
//
// WHY THE MESSAGE CARRIES THE INSTRUCTIONS. The people who can assign a room
// are nurses and the theatre manager, not daily users of this screen, and the
// controls are three unlabelled dropdowns inside a red panel on a card. A
// chase that says "please assign a theatre" to somebody who has not found
// that panel produces nothing but irritation. The steps name the controls in
// the words printed on them, so the message can be followed with one thumb
// while walking.
//
// WHY THE ANAESTHETIST IS IN IT. The second instruction. Assigning a room
// does not make a case ready: the trolley does not move until the
// pre-anaesthetic review is on the app, so a theatre assigned to a case with
// no review is a room standing empty with a team in it. The consultant
// anaesthetist is therefore told, in the same message, whether this patient
// has been reviewed — and if not, that naming an anaesthetist is the thing
// being waited on. Both facts travel together because they are the two halves
// of the same delay, and a hospital that sends them separately gets each one
// actioned by somebody waiting on the other.
//
// EVERY RECIPIENT GETS BOTH FACTS AND ONE DUTY. The same lesson as every
// other chase in this application: a message that treats a scrub nurse and a
// consultant anaesthetist alike is read as spam and answered by nobody.
// ============================================================

import { withNetworkNotice } from '@/lib/comms/networkNotice';
import { askBlock, closing, isConsultantRole, opening } from './consultantTone';
import { HOUR_RULE_NOTICE, deadlineClock, type HourRuleStanding } from './hourRule';

/** Statuses that mean nobody in theatre has taken the case yet. */
export const UNACKNOWLEDGED = ['SUBMITTED', 'APPROVED'] as const;

/**
 * Is this case still waiting for somebody in theatre to pick it up?
 *
 * Status is the authority, not the theatre name. The assign endpoint writes
 * both together, but a name left over from a cancelled assignment would
 * otherwise silence the chase on a case nobody owns.
 */
export function needsAssignment(booking: { status: string | null | undefined }): boolean {
  return (UNACKNOWLEDGED as readonly string[]).includes(booking.status ?? '');
}

export interface ReviewLike {
  status?: string | null;
  reviewerName?: string | null;
  fitnessDecision?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface ReviewState {
  /** A review exists and is finished. */
  done: boolean;
  /** A review has been opened but not completed. */
  started: boolean;
  reviewerName: string | null;
  at: Date | null;
  fitness: string | null;
}

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Where the pre-anaesthetic review stands for this patient.
 *
 * COMPLETED and APPROVED both count as done; PENDING and IN_PROGRESS mean
 * somebody has opened it and stopped. The distinction matters to the person
 * being chased: "nobody has looked at this patient" and "Dr X started and did
 * not finish" are different problems with different people to ring.
 */
export function readReviewState(reviews: readonly ReviewLike[]): ReviewState {
  if (reviews.length === 0) {
    return { done: false, started: false, reviewerName: null, at: null, fitness: null };
  }

  const finished = reviews.find((r) => r.status === 'COMPLETED' || r.status === 'APPROVED');
  const chosen = finished ?? reviews[0];

  return {
    done: Boolean(finished),
    started: !finished,
    reviewerName: (chosen.reviewerName ?? '').trim() || null,
    at: asDate(chosen.updatedAt) ?? asDate(chosen.createdAt),
    fitness: chosen.fitnessDecision ?? null,
  };
}

const clock = (d: Date | null): string => (d ? deadlineClock(d) : 'an unrecorded time');

/**
 * The review, said to whoever is reading.
 *
 * Written so the fact is unmissable on a phone: the state in capitals, then
 * what follows from it. "Not reviewed" on its own is a status; "not reviewed,
 * so the holding area will not take the patient" is a reason to move.
 */
export function reviewSentence(state: ReviewState): string {
  if (state.done) {
    const fit = state.fitness
      ? ` Fitness recorded as *${state.fitness.replace(/_/g, ' ').toLowerCase()}*.`
      : '';
    return `*ANAESTHETIC REVIEW: RECORDED* by ${state.reviewerName ?? 'an anaesthetist'} `
      + `at ${clock(state.at)}.${fit}`;
  }
  if (state.started) {
    return '*ANAESTHETIC REVIEW: STARTED BUT NOT FINISHED.* '
      + `${state.reviewerName ?? 'An anaesthetist'} opened the review and it is not completed. `
      + 'An unfinished review holds the case up exactly as much as no review at all.';
  }
  return '*ANAESTHETIC REVIEW: NOT DONE.* No pre-anaesthetic review is on the app for this '
    + 'patient. Until one is recorded the theatre has no anaesthetic plan, the pharmacy has no '
    + 'prescription, and the holding area will not take the patient.';
}

/**
 * How a theatre is actually assigned, in the words printed on the controls.
 *
 * Checked against the screen rather than written from memory: the panel is
 * red, the three selects read "-- Choose theatre --", "-- scrub nurse --" and
 * "-- circulating nurse --", and the button says "Assign theatre, team &
 * acknowledge". If those labels change in
 * app/dashboard/emergency-booking/page.tsx, change them here too — a step
 * that names a control nobody can find is worse than no step, because the
 * person stops trusting the rest of the message.
 */
export const ASSIGNMENT_STEPS = [
  '*HOW TO ASSIGN A THEATRE FOR THIS CASE:*',
  '1. Open the app and sign in.',
  '2. Go to *Emergency Surgery Booking* in the menu.',
  '3. Find this patient under *Active Emergency Cases*.',
  '4. On the case card there is a red panel. Choose the room from '
    + '*“-- Choose theatre --”*.',
  '5. Choose the *“-- scrub nurse --”*.',
  '6. Choose the *“-- circulating nurse --”*.',
  '7. Press *“Assign theatre, team & acknowledge”*.',
  '',
  'That one press does four things: it gives the case a room, it acknowledges '
    + 'the booking so the surgeon knows theatre has seen it, it names the team on '
    + 'the theatre readiness board, and it announces the case on the theatre radio.',
  '',
  'The anaesthetic team and the anaesthetic technicians are assigned separately — '
    + 'open *“Team Status”* on the same card.',
].join('\n');

export type ChaseKind = 'MANAGER' | 'NURSE' | 'ANAESTHETIST' | 'MANAGEMENT';

/**
 * What each kind of recipient is being waited on for.
 *
 * One duty each, in the imperative. Everybody receives the same two facts —
 * no room, and where the review stands — but only one instruction, because a
 * message with four instructions in it is a message in which none of them is
 * yours.
 */
export const ASSIGNMENT_DUTY: Record<ChaseKind, string> = {
  MANAGER:
    'No theatre has been assigned to this emergency and nobody in theatre has '
    + 'acknowledged it. Give it a room and a team now, or say which case it is waiting '
    + 'behind.',
  NURSE:
    'This emergency has no theatre, no scrub nurse and no circulating nurse. '
    + 'Acknowledge it and assign the room — the steps are below, and the whole thing is '
    + 'one press once the three boxes are chosen.',
  ANAESTHETIST:
    'You are told because the anaesthetic half of this case is yours. If no anaesthetist '
    + 'has reviewed this patient, name one now or see the patient yourself: a theatre '
    + 'assigned to a case with no review is a room standing empty with a team in it.',
  MANAGEMENT:
    'Nobody in theatre has acknowledged this emergency. Assign it a room, or find '
    + 'somebody who will.',
};

export interface AssignmentCaseFacts {
  patientName: string;
  folderNumber?: string | null;
  procedureName: string;
  surgeonName?: string | null;
  ward?: string | null;
  priority?: string | null;
  /** Who pressed the chase. A chase from nobody is easy to ignore. */
  chasedByName?: string | null;
}

/** How long the case has been sitting unacknowledged, in words. */
export function waitingFor(bookedAt: Date | string, now: Date = new Date()): string {
  const booked = asDate(bookedAt);
  if (!booked) return 'an unrecorded length of time';
  const mins = Math.max(0, Math.round((now.getTime() - booked.getTime()) / 60_000));
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r === 0 ? `${h} hour${h === 1 ? '' : 's'}` : `${h} h ${r} m`;
}

/**
 * The chase, as one person receives it.
 *
 * Order is fixed: what is wrong, which case, how long is left, what YOU must
 * do, where the review stands, how to assign the room, and the rule. A
 * message read in a corridor is read from the top until it stops being new,
 * so the two facts that make somebody move are above the instructions that
 * tell them how.
 */
export function buildAssignmentChaseMessage(input: {
  recipientName: string;
  /** Why this person is getting it: "Theatre Manager", "Scrub Nurse on call". */
  recipientLabel: string;
  /** Their role on the system. Decides the register; see consultantTone. */
  recipientRole?: string | null;
  kind: ChaseKind;
  facts: AssignmentCaseFacts;
  standing: HourRuleStanding;
  review: ReviewState;
  bookedAt: Date | string;
  /** Anything the sender wants to add. */
  note?: string | null;
  now?: Date;
}): string {
  const { facts, standing, review } = input;
  const consultant = isConsultantRole(input.recipientRole);
  const lines: string[] = [];

  lines.push(
    standing.overdue
      ? '🚨🚨 *EMERGENCY NOT ACKNOWLEDGED — PAST THE HOUR* 🚨🚨'
      : '🚨 *EMERGENCY NOT ACKNOWLEDGED — NO THEATRE ASSIGNED* 🚨',
  );
  lines.push('');
  opening({ name: input.recipientName, label: input.recipientLabel, consultant })
    .forEach((l) => lines.push(l));
  lines.push('');

  lines.push(
    `*The case:* ${facts.patientName}${facts.folderNumber ? ` (${facts.folderNumber})` : ''}`
    + ` — ${facts.procedureName}${facts.ward ? `, from ${facts.ward}` : ''}`,
  );
  if (facts.surgeonName) lines.push(`Surgeon: ${facts.surgeonName}`);
  if (facts.priority) lines.push(`Priority: ${facts.priority}`);

  lines.push('');
  lines.push(
    `*It has been booked for ${waitingFor(input.bookedAt, input.now)} and no theatre has been `
    + 'assigned to it.* Nobody in theatre has acknowledged it, so the surgeon who booked it '
    + 'has no way of knowing it has been seen.',
  );

  lines.push('');
  lines.push(
    standing.deadline
      ? (standing.overdue
        ? `*It should have been on the table by ${deadlineClock(standing.deadline)}. `
          + `It is now ${standing.label}.*`
        : `*It must be on the table by ${deadlineClock(standing.deadline)} — ${standing.label}.*`)
      : '*This case is waiting to start.*',
  );

  lines.push('');
  askBlock(ASSIGNMENT_DUTY[input.kind], consultant).forEach((l) => lines.push(l));

  // The review, for everybody. The theatre manager assigning a room needs to
  // know the case cannot go yet as much as the anaesthetist does -- that is
  // the difference between a room held and a room wasted.
  lines.push('');
  lines.push(reviewSentence(review));
  if (!review.done && input.kind !== 'ANAESTHETIST') {
    lines.push(
      'The consultant anaesthetist has been told the same thing in this round of chasing.',
    );
  }

  lines.push('');
  lines.push(ASSIGNMENT_STEPS);

  if ((input.note ?? '').trim()) {
    lines.push('');
    lines.push(`*Note:* ${(input.note ?? '').trim()}`);
  }

  // The standing notice, last and whole, for the same reason it is last on
  // the team chase: what this person must do in the next ten minutes has to
  // be read before the rule they already know.
  lines.push('');
  lines.push('────────────────────');
  lines.push(HOUR_RULE_NOTICE);
  lines.push('────────────────────');
  closing(consultant).forEach((l) => { lines.push(''); lines.push(l); });
  lines.push('');
  lines.push(
    facts.chasedByName
      ? `— ${facts.chasedByName}, UNTH Theatre`
      : '— UNTH Theatre, Operative Resource Manager',
  );

  return withNetworkNotice(lines.join('\n'));
}

/** The short line for the in-app bell, where there is no room for the above. */
export function assignmentNotificationLine(
  kind: ChaseKind,
  standing: HourRuleStanding,
  review: ReviewState,
): string {
  const duty = kind === 'ANAESTHETIST'
    ? (review.done ? 'Review recorded — the case still has no theatre' : 'No anaesthetic review yet')
    : 'Assign a theatre, scrub nurse and circulating nurse';
  return `${standing.overdue ? 'PAST THE HOUR' : standing.label}. `
    + `No theatre assigned. ${duty}.`;
}

/** One line for a board: how far this case has got. */
export function assignmentSummary(review: ReviewState): string {
  return `No theatre assigned · ${review.done
    ? 'anaesthetic review recorded'
    : review.started ? 'review started, not finished' : 'no anaesthetic review'}`;
}
