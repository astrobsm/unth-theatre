// ============================================================
// What happens when somebody books an elective case late
// ------------------------------------------------------------
// The ladder, agreed by the theatre management:
//
//   1st late booking   → first written warning
//   2nd late booking   → second written warning
//   3rd and after      → a formal query, copied to the head of department
//                        for the subspecialty
//
// PURE FUNCTIONS WITH AN EXPLICIT COUNT, for the same reason
// bookingLateness.ts is pure: this decides whether a named clinician
// receives a disciplinary query, and that judgement has to be reproducible,
// testable, and identical wherever it is shown. A ladder that counts
// differently on the report and in the email is one that cannot be defended
// in a meeting.
//
// COUNTED PER PERSON, NOT PER UNIT. A unit does not book a case; a person
// does. Aggregating offences to the unit would put a query in front of
// somebody who booked nothing, and let a repeat offender hide inside a busy
// firm.
//
// COUNTED FROM A START DATE, NOT FROM ALL HISTORY. Nobody may be escalated
// for something they did before the rule was announced. The date is stored
// rather than hard-coded so the hospital can state it, and so this file does
// not have to be redeployed to change it.
// ============================================================

export type EscalationLevel = 'FIRST_WARNING' | 'SECOND_WARNING' | 'QUERY';

export const ESCALATION_LABELS: Record<EscalationLevel, string> = {
  FIRST_WARNING: 'First warning',
  SECOND_WARNING: 'Second warning',
  QUERY: 'Formal query',
};

/**
 * The default date the ladder starts counting from.
 *
 * Offences before this are reported — the theatre still needs to see the
 * scale of the problem — but they never escalate. Announced as the date the
 * tracking began.
 */
export const DEFAULT_COUNTING_FROM = '2026-10-29';

/** The date the "no nurse, no theatre" sanction begins. */
export const ENFORCEMENT_FROM = '2026-11-01';

export interface EscalationDecision {
  level: EscalationLevel;
  /** 1 for the first offence, 2 for the second, and so on. */
  offenceNumber: number;
  /** Does this one go to the head of department? */
  copyToHeadOfDepartment: boolean;
  /** Does this one create a formal disciplinary query? */
  raisesQuery: boolean;
  /** Plain words for the person receiving it. */
  summary: string;
}

/**
 * What this late booking earns, given how many the same person already had.
 *
 * `priorOffences` counts offences ALREADY RECORDED for this person since the
 * counting start date, not including this one.
 */
export function escalationFor(priorOffences: number): EscalationDecision {
  const offenceNumber = Math.max(0, Math.floor(priorOffences)) + 1;

  if (offenceNumber === 1) {
    return {
      level: 'FIRST_WARNING',
      offenceNumber,
      copyToHeadOfDepartment: false,
      raisesQuery: false,
      summary:
        'This is the first elective case you have booked after the 15:00 deadline since tracking began.',
    };
  }

  if (offenceNumber === 2) {
    return {
      level: 'SECOND_WARNING',
      offenceNumber,
      copyToHeadOfDepartment: false,
      raisesQuery: false,
      summary:
        'This is your second since tracking began. A third late booking will result in a formal query copied to your head of department.',
    };
  }

  // Third and every one after it. DELIBERATELY NOT "third only": a person on
  // their fifth late booking has not stopped offending, and dropping back to
  // a silent record after the third would make the ladder a three-strike
  // amnesty.
  return {
    level: 'QUERY',
    offenceNumber,
    copyToHeadOfDepartment: true,
    raisesQuery: true,
    summary: `This is late booking number ${offenceNumber} since tracking began, and a written response is required.`,
  };
}

/**
 * Is this offence inside the counting window?
 *
 * Anything booked before the start date is reported but never escalated —
 * sanctioning somebody for conduct that preceded the rule is indefensible,
 * and one such case destroys the standing of every warning issued after it.
 */
export function countsTowardsEscalation(
  bookedAt: Date | string | null | undefined,
  countingFrom: Date | string = DEFAULT_COUNTING_FROM,
): boolean {
  if (!bookedAt) return false;
  const booked = bookedAt instanceof Date ? bookedAt : new Date(bookedAt);
  const from = countingFrom instanceof Date ? countingFrom : new Date(countingFrom);
  if (Number.isNaN(booked.getTime()) || Number.isNaN(from.getTime())) return false;
  return booked.getTime() >= from.getTime();
}

/**
 * The booker's own record, quoted back to them in the chase.
 *
 * Optional because a chase must still be sendable when the figures cannot be
 * computed. An absent record means the appeal is made without a percentage,
 * never with a guessed one.
 */
export interface BookerStanding {
  electiveTotal: number;
  late: number;
  /** late / electiveTotal, 0–1. */
  lateRate: number | null;
  /** "the last 90 days" — what the figures above cover. */
  periodLabel: string;
}

/**
 * The WhatsApp chase sent to whoever booked the case.
 *
 * WRITTEN AS AN APPEAL, NOT A REPRIMAND. Theatre management asked for this
 * deliberately: the outcome wanted is a booking made on time tomorrow, and a
 * message that reads as an attack produces a defensive colleague rather than
 * an earlier booking. So it asks — plainly, by name, with their own figure in
 * front of them — for the rate to come down to the barest minimum.
 *
 * THE FACTS ARE NOT SOFTENED, only the framing. The level on the ladder, the
 * copy to the head of department and the enforcement date all remain stated
 * in full. A plea that conceals the consequence is a plea that leaves somebody
 * surprised by a query they were never warned about, and that is a worse
 * unkindness than saying it plainly.
 *
 * WRITTEN TO BE READ BY A TIRED REGISTRAR ON A PHONE. The ask is in the first
 * two lines, because the first two lines are all some people will read.
 */
export function buildChaseMessage(input: {
  personName: string;
  patientLabel: string;
  procedureName: string;
  scheduledFor: string;
  bookedAtLabel: string;
  decision: EscalationDecision;
  unit: string;
  /** Their record so far, when it is known. */
  standing?: BookerStanding | null;
}): string {
  const { decision, standing } = input;

  const lines = [
    `UNTH Theatre — a request about your elective bookings`,
    ``,
    `Dear ${input.personName},`,
    ``,
    `We are writing to ask for your help in bringing your late elective bookings down to the barest minimum. This is an appeal, not an accusation — we need your cooperation more than we need a record of the breach.`,
    ``,
    `The case concerned:`,
    `• Patient: ${input.patientLabel}`,
    `• Procedure: ${input.procedureName}`,
    `• Scheduled for: ${input.scheduledFor}`,
    `• Booked: ${input.bookedAtLabel}`,
    `• Unit: ${input.unit}`,
  ];

  // Their own figure, where we have it. A percentage somebody recognises as
  // theirs is the single most persuasive line in the message; a percentage
  // they can dispute would undo the whole appeal, which is why it is
  // computed from the record and never estimated.
  if (standing && standing.electiveTotal > 0 && standing.lateRate != null) {
    const pct = Math.round(standing.lateRate * 100);
    lines.push(
      ``,
      `Where you presently stand: ${standing.late} of your ${standing.electiveTotal} elective bookings in ${standing.periodLabel} were made after the deadline — ${pct}%.`,
      ``,
      pct >= 50
        ? `We are pleading with you to work this figure down. Every booking you move before 15:00 is one fewer list disrupted, and a colleague booking at your volume can change this percentage within a fortnight.`
        : `We are asking you to work this figure down further, towards nil. You are already booking most of your cases on time, and the few that slip are the ones that cost the theatre a nurse and a set.`,
    );
  } else {
    lines.push(
      ``,
      `We are pleading with you to keep your late bookings at the barest minimum — ideally nil.`,
    );
  }

  lines.push(
    ``,
    `Why we are asking. Elective cases must be booked before 15:00 on the day before surgery. By that hour the list has been planned, CSSD has begun sterilising, pharmacy and the consumable pack providers have drawn their packs, and the nursing officer has assigned staff to each theatre. A case arriving after that point does not join a queue — it displaces preparation already finished for another patient, and the patient who gets moved is rarely the one booked late.`,
    ``,
    `For the record, this is logged as a ${ESCALATION_LABELS[decision.level].toLowerCase()}. ${decision.summary}`,
  );

  if (decision.copyToHeadOfDepartment) {
    lines.push(
      ``,
      `This query has been copied to your head of department, and a written response is required. We would far rather have reached you with an appeal than with this, and we are still asking for the same thing: bring the figure down.`,
    );
  }

  lines.push(
    ``,
    `From 1 November 2026, elective cases booked after the deadline will not have a nurse or a theatre assigned. This is not aimed at anyone; it is the only way the theatre can protect the patients already prepared for.`,
    ``,
    `If something genuinely prevents you booking before 15:00 — a clinic that overruns, a result that arrives late, a patient travelling a long way — please tell the Theatre Manager or the Theatre Chairman before 12 noon on the day before. A difficulty raised in advance is always accommodated; one raised afterwards cannot be, because the work has already been done.`,
    ``,
    `Thank you for your cooperation, and for the cases you do book on time.`,
    `Theatre Management, UNTH Ituku-Ozalla`,
  );

  return lines.join('\n');
}

/** The in-app notice to the unit's supervising consultant. */
export function buildConsultantNotice(input: {
  bookerName: string;
  unit: string;
  patientLabel: string;
  procedureName: string;
  scheduledFor: string;
  decision: EscalationDecision;
}): { title: string; message: string } {
  return {
    title: `Late elective booking in ${input.unit}`,
    message:
      `${input.bookerName} booked ${input.procedureName} for ${input.patientLabel} ` +
      `(scheduled ${input.scheduledFor}) after the 15:00 deadline. ` +
      `This is late booking number ${input.decision.offenceNumber} for them since tracking began — ` +
      `${ESCALATION_LABELS[input.decision.level].toLowerCase()}.` +
      (input.decision.copyToHeadOfDepartment
        ? ' A formal query has been issued and copied to the head of department.'
        : ''),
  };
}
