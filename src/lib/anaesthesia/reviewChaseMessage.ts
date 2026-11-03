// ============================================================
// Writing to an anaesthetist whose pre-operative review has not been done
// ------------------------------------------------------------
// TWO LETTERS, NOT ONE WITH A WORD CHANGED.
//
// At 7pm the review is late. At 9pm it has been missed, the surgical team is
// building tomorrow's list around a patient nobody has assessed, and the case
// is now a finding. Those are different conversations, and sending the heavy
// one at 7pm is how a chase comes to be deleted unread.
//
// BOTH HALVES ARE DELIBERATE. The appeal comes first and is written to one
// colleague by another: a registrar who has been in theatre since seven does
// not need to be told what a pre-op review is, and a message that opens with
// consequences reads as an accusation and gets answered last.
//
// The second half states, plainly and without threat, what the absence of a
// review means once the patient reaches theatre. It is written in the
// language of the record rather than of punishment, because that is the
// accurate language: nobody is being disciplined by a WhatsApp message, but
// the gap IS permanent, it IS attributable, and if the patient comes to harm
// it is the first thing anybody will read. Saying so is a kindness. Finding
// it out afterwards is not.
//
// WHAT THIS DOES NOT DO. It does not quote statutes or name penalties. An
// invented citation would discredit the whole message the first time somebody
// checked it, and the true facts -- a permanent record, a duty of care, an
// unassessed patient on a list -- are heavy enough on their own.
// ============================================================

import { withNetworkNotice } from '@/lib/comms/networkNotice';

export type ReviewChaseRegister =
  /** Past the 7pm hand-back window, still unreviewed. Late, not yet missed. */
  | 'LATE'
  /** Past the 9pm deadline. The review has been missed. */
  | 'MISSED';

export interface ReviewChaseInput {
  /** The reviewer being written to. First name is enough and reads better. */
  reviewerName: string;
  patientName?: string | null;
  folderNumber?: string | null;
  procedureName?: string | null;
  /** "Tuesday, 3 November 2026" -- the day of SURGERY, not of the message. */
  surgeryDay?: string | null;
  scheduledTime?: string | null;
  unit?: string | null;
  surgeonName?: string | null;
  register: ReviewChaseRegister;
  /** Who is sending. A chase from nobody is easy to ignore. */
  fromName?: string | null;
  fromRole?: string | null;
}

const SIGN_OFF = 'Department of Anaesthesia, UNTH Ituku-Ozalla';

/** "Dr Okonna" from whatever the roster spells. Never "Dr Dr". */
export function courtesyName(name: string | null | undefined): string {
  const clean = (name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return 'Doctor';
  return /^(dr|prof|professor)\b/i.test(clean) ? clean : `Dr ${clean}`;
}

/**
 * The case, named so precisely that no second message is needed to ask which
 * one. An anaesthetist may have four cases on one list, and "your case has
 * not been reviewed" fits all of them.
 */
export function caseLine(input: ReviewChaseInput): string {
  const who = input.patientName
    ? `${input.patientName}${input.folderNumber ? ` (${input.folderNumber})` : ''}`
    : 'a patient on your list';
  const bits = [
    input.procedureName ? `for ${input.procedureName}` : null,
    input.unit ? `${input.unit}` : null,
    input.scheduledTime ? `at ${input.scheduledTime}` : null,
    input.surgeryDay ? `on ${input.surgeryDay}` : null,
  ].filter(Boolean);
  const surgeon = input.surgeonName ? `\nSurgeon: ${input.surgeonName}` : '';
  return `*${who}*${bits.length ? `\n${bits.join(' · ')}` : ''}${surgeon}`;
}

/**
 * What the absence of a recorded review actually means.
 *
 * Note the second sentence. The commonest version of this failure is not an
 * unassessed patient -- it is a patient who WAS seen, in a corridor, and
 * whose assessment exists only in the anaesthetist's head. To the surgical
 * team, to the ward, to pharmacy and to the record, that is identical to
 * never having been seen, and the person who did the work gets none of the
 * credit and all of the finding.
 */
const WHAT_IT_MEANS =
  'What this means, plainly. Until the review is recorded, this patient is, for every '
  + 'purpose the hospital can act on, unassessed. If you have in fact seen the patient '
  + 'but have not entered the outcome, the position is the same: the surgical team, the '
  + 'ward and pharmacy cannot read an assessment that exists only in conversation, and '
  + 'you receive no record of work you have actually done.\n\n'
  + 'The consequences are not administrative. The list is built overnight on the '
  + 'assumption that every patient on it has been assessed and found fit. A patient '
  + 'taken to theatre without a recorded anaesthetic assessment is exposed to a risk '
  + 'that the assessment exists to find, and the theatre may be stood down in the '
  + 'morning with the patient already starved and prepared.\n\n'
  + 'This board is a permanent record. The case, the deadline, the name of the '
  + 'anaesthetist the case was assigned to and the time the review was or was not '
  + 'entered are all retained and auditable. In the event of an adverse outcome it is '
  + 'among the first documents that would be examined, by the hospital and by anyone '
  + 'acting for the patient. The duty to assess carries with it the duty to communicate '
  + 'the outcome to the surgical team, and an outcome that was never written down '
  + 'cannot be shown to have been communicated.';

export function buildReviewChaseMessage(input: ReviewChaseInput): string {
  const dr = courtesyName(input.reviewerName);
  const from = input.fromName
    ? `${input.fromName}${input.fromRole ? `, ${input.fromRole}` : ''}`
    : SIGN_OFF;

  if (input.register === 'LATE') {
    // Still recoverable, and written that way. Nobody is in trouble at 7pm.
    return withNetworkNotice([
      `Good evening ${dr},`,
      '',
      'The pre-operative anaesthetic review for this case has not yet been recorded, '
        + 'and the 9pm deadline is approaching.',
      '',
      caseLine(input),
      '',
      'If you have already seen the patient, it needs only the outcome entering on the '
        + 'app so the surgical team and the ward can read it. If you are not able to '
        + 'review this case tonight, please press *"I cannot review this"* on the '
        + "Tomorrow's Reviews board and say briefly why — that reaches the HOD "
        + 'immediately and the case can be reassigned while there is still time.',
      '',
      'Either answer is fine. Silence is the only one that is not, because the list is '
        + 'built overnight on the assumption that this patient has been assessed.',
      '',
      `Thank you,\n${from}`,
    ].join('\n'));
  }

  return withNetworkNotice([
    `Good evening ${dr},`,
    '',
    'The 9pm deadline has passed and no pre-operative anaesthetic review has been '
      + 'recorded for the following case, which is on tomorrow’s list:',
    '',
    caseLine(input),
    '',
    'I am asking you, as a colleague, to deal with it tonight — enter the review if '
      + 'you have seen the patient, or press *"I cannot review this"* on the '
      + "Tomorrow's Reviews board so the case can be reassigned before morning. It takes "
      + 'a few minutes and it settles the matter.',
    '',
    WHAT_IT_MEANS,
    '',
    'If there is a reason this could not be done — an emergency, an illness, a case '
      + 'that ran — please say so in reply. It will be recorded alongside, and it '
      + 'matters.',
    '',
    `${from}`,
  ].join('\n'));
}

/**
 * Which letter a case has earned.
 *
 * Only these two states are chaseable. A case still inside its window has not
 * defaulted, and writing to somebody who is not yet late is how a chase stops
 * being read. Returns null when there is nothing to chase about.
 */
export function registerForState(state: string): ReviewChaseRegister | null {
  if (state === 'LAPSED') return 'MISSED';
  if (state === 'HANDBACK_WINDOW_CLOSED') return 'LATE';
  return null;
}
