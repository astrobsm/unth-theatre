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
        'First warning. This is the first elective case you have booked after the 15:00 deadline since tracking began.',
    };
  }

  if (offenceNumber === 2) {
    return {
      level: 'SECOND_WARNING',
      offenceNumber,
      copyToHeadOfDepartment: false,
      raisesQuery: false,
      summary:
        'Second warning. A third late booking will result in a formal query copied to your head of department.',
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
    summary: `Formal query. This is late booking number ${offenceNumber} since tracking began, and a written response is required.`,
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
 * The WhatsApp chase sent to whoever booked the case.
 *
 * WRITTEN TO BE READ BY A TIRED REGISTRAR ON A PHONE. It states the case, the
 * rule, what happens next and who to talk to — in that order, because the
 * first line is all some people will read. It does not scold: the purpose is
 * a booking made on time tomorrow, not a person who feels got at.
 */
export function buildChaseMessage(input: {
  personName: string;
  patientLabel: string;
  procedureName: string;
  scheduledFor: string;
  bookedAtLabel: string;
  decision: EscalationDecision;
  unit: string;
}): string {
  const { decision } = input;

  const lines = [
    `UNTH Theatre — late elective booking`,
    ``,
    `Dear ${input.personName},`,
    ``,
    `This case was booked after the 15:00 deadline:`,
    `• Patient: ${input.patientLabel}`,
    `• Procedure: ${input.procedureName}`,
    `• Scheduled for: ${input.scheduledFor}`,
    `• Booked: ${input.bookedAtLabel}`,
    `• Unit: ${input.unit}`,
    ``,
    `Elective cases must be booked before 15:00 on the day before surgery. After that the list is planned, CSSD has begun setting up, and pharmacy and the consumable store have already drawn their packs — a case arriving later displaces work that is finished.`,
    ``,
    `${ESCALATION_LABELS[decision.level].toUpperCase()}: ${decision.summary}`,
  ];

  if (decision.copyToHeadOfDepartment) {
    lines.push(
      ``,
      `This query has been copied to your head of department. Please submit a written response.`,
    );
  }

  lines.push(
    ``,
    `From 1 November 2026, elective cases booked after the deadline will not have a nurse or a theatre assigned.`,
    ``,
    `If something genuinely prevents you booking before 15:00, tell the Theatre Manager or the Theatre Chairman before 12 noon on the day before. A difficulty raised in advance is always accommodated; one raised afterwards cannot be.`,
    ``,
    `Thank you.`,
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
