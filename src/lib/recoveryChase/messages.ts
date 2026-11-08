// ============================================================
// Writing to the nurse who answers for a recovery record that does not exist
// ------------------------------------------------------------
// THE HARDEST MESSAGE IN THIS APPLICATION TO GET RIGHT, because it has to
// carry a real medicolegal warning to somebody who may well have given
// excellent care, and the two commonest ways to write it both fail:
//
//   Too soft and it reads as a reminder about paperwork, which is precisely
//   what this is not — it is the absence of the only evidence that the care
//   happened.
//
//   Too hard and it reads as an accusation of neglect. The nurse who held an
//   airway for forty minutes and did not reach a handset has not neglected
//   anybody, and a message that implies she has will be shown to colleagues as
//   proof that the system is against them. Nothing after that gets read.
//
// So the message separates the two things completely and says so out loud:
// nobody is suggesting the care was not given; what is missing is the record of
// it, and the record is what the hospital and the nurse are both defended by.
// The risk is put as a risk they SHARE with the hospital, because it is.
//
// "EVEN IF IT IS ON PAPER" IS ANSWERED WITH REASONS, NOT WITH A RULE. It was
// asked for explicitly, and "it must be on the ORM" on its own invites the
// obvious reply — that the observations were charted properly and filed. So
// the message gives the three reasons paper is not enough here, and the third
// is the one that is in the nurse's own interest: duty performance credits the
// nurse who opened the record, so work done only on paper is recorded against
// her as nothing done.
//
// NOTHING IS ALLEGED THAT THE DATA DOES NOT SHOW. The message says what the
// ORM holds, never what the nurse did. And it names ICU as the one answer that
// settles a case, because a patient taken straight from theatre to intensive
// care genuinely never entered recovery and the system has no field that
// records it.
// ============================================================

import { withNetworkNotice } from '@/lib/comms/networkNotice';
import { RECOVERY_GAPS, type RecoveryGapCode } from './gaps';
import type { RecoveryChaseCase, RecipientSource } from './collect';

const SIGN_OFF = 'Theatre Management, UNTH Ituku-Ozalla';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** "Monday 3 November" — the way a duty day is said aloud. */
export function dayWords(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${WEEKDAYS[d.getUTCDay()]} ${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

/** The patient, named for the nurse who is being asked about them. */
export function patientWords(c: RecoveryChaseCase): string {
  if (!c.patientName) return 'a patient';
  return c.folderNumber ? `${c.patientName} (${c.folderNumber})` : c.patientName;
}

/** One line about one case: when it finished, who, what, and what is absent. */
export function caseLine(c: RecoveryChaseCase): string {
  const bits: string[] = [];
  if (c.gaps.indexOf('NO_RECOVERY_RECORD') !== -1) bits.push('no recovery record');
  if (c.gaps.indexOf('NOT_DISCHARGED') !== -1) {
    bits.push(c.hoursOpen != null
      ? `record open since ${c.openedClock ?? 'admission'} — ${c.hoursOpen} h, never discharged`
      : 'never discharged');
  }
  if (c.needICU) bits.push('booked as needing ICU');
  const when = c.scheduledTime ? ` ${c.scheduledTime}` : '';
  return `• ${patientWords(c)} —${when} ${c.procedureName} — ${bits.join('; ')}`;
}

/** Which gaps appear in this set, in the canonical order. */
export function gapsPresent(cases: readonly RecoveryChaseCase[]): RecoveryGapCode[] {
  const out: RecoveryGapCode[] = [];
  (['NO_RECOVERY_RECORD', 'NOT_DISCHARGED'] as RecoveryGapCode[]).forEach((code) => {
    if (cases.some((c) => c.gaps.indexOf(code) !== -1)) out.push(code);
  });
  return out;
}

/** How many cases are named before the message quotes a count instead. */
export const MAX_CASES_LISTED = 10;

/**
 * Why a chart in the folder does not answer this.
 *
 * Asked for in terms: "even if they are on paper, it must be documented on
 * ORM". Three reasons, because the instruction on its own invites the reply
 * that the observations were charted properly — and that reply is usually
 * true, which is exactly why it has to be answered rather than overruled.
 */
export const PAPER_IS_NOT_ENOUGH: string[] = [
  '*If the observations were written on the recovery chart and filed in the folder,*'
  + ' that is real nursing and nobody is suggesting otherwise. It is still not enough,'
  + ' and not as a matter of preference:',
  '',
  '1. *The ward cannot see it.* The nurse receiving your patient reads the ORM. A chart '
  + 'that travelled inside one folder is invisible to everybody who needs it next.',
  '2. *The hospital cannot produce it.* When a query or a claim arrives two or three years '
  + 'later, what is produced is what is on the system. One sheet in one folder among '
  + 'thousands is, in practice, lost — and "it was charted" cannot be proved by saying so.',
  '3. *It is not credited to you.* Duty performance credits the nurse who opened the '
  + 'record. Observations done on paper and nowhere else are recorded against the nurse '
  + 'who did them as nothing done at all. The record protects you as much as the patient.',
];

export interface RecoveryChaseInput {
  personName: string;
  /** Their role, in words, where it is known. */
  roleLabel?: string | null;
  /** Why they are the one being written to. */
  source: RecipientSource;
  /** The roster shift they were on, where the roster says. */
  shift?: string | null;
  /** The WAT day. */
  day: string;
  /** Completed operations on that day — the denominator. */
  completedCount: number;
  /** The cases being asked about. */
  cases: readonly RecoveryChaseCase[];
}

/** How the message opens, which is the only part that differs by source. */
function opening(input: RecoveryChaseInput): string[] {
  const n = input.cases.length;
  const subject = `${n} ${n === 1 ? 'operation' : 'operations'}`;
  const shift = input.shift ? ` on the ${String(input.shift).toLowerCase()} shift` : '';
  const of = input.completedCount > 0
    ? ` of the ${input.completedCount} completed that day`
    : '';

  if (input.source === 'RECORD_HOLDER') {
    return [
      `You are named on the ORM as the nurse who received ${n === 1 ? 'this patient' : 'these patients'} `
      + `into the recovery room on ${dayWords(input.day)}. The ${n === 1 ? 'record is' : 'records are'} `
      + 'still open: nothing has been entered to show the patient was discharged from recovery.',
    ];
  }
  if (input.source === 'RECOVERY_NURSE') {
    return [
      `You were rostered to the recovery room on ${dayWords(input.day)}${shift}. `
      + `${subject}${of} have no recovery documentation on the ORM.`,
    ];
  }
  return [
    `You were the nurse supervisor on duty on ${dayWords(input.day)}${shift}, `
    + `and we are writing to you as the supervisor rather than to any individual nurse. `
    + `${subject}${of} have no recovery documentation on the ORM.`,
  ];
}

/**
 * The message.
 *
 * One builder for all three kinds of recipient, so the medicolegal paragraphs
 * exist in exactly one copy. A second builder would be a second wording, and
 * the one that drifted would be the one somebody was shown.
 */
export function buildRecoveryChase(input: RecoveryChaseInput): string {
  const present = gapsPresent(input.cases);
  const lines: string[] = [
    'UNTH Theatre — recovery records outstanding',
    dayWords(input.day),
    '',
    `Dear ${input.personName},`,
    '',
  ];

  opening(input).forEach((l) => lines.push(l));

  lines.push('', '*The cases*');
  input.cases.slice(0, MAX_CASES_LISTED).forEach((c) => lines.push(caseLine(c)));
  if (input.cases.length > MAX_CASES_LISTED) {
    lines.push(`• …and ${input.cases.length - MAX_CASES_LISTED} more on the same day.`);
  }

  lines.push('', '*What is absent from the record*');
  present.forEach((code) => lines.push(RECOVERY_GAPS[code].missing));

  // The care and the record are separated here, explicitly, before any
  // warning. A warning that arrives before this separation is read as an
  // accusation, and then nothing after it is read at all.
  lines.push(
    '',
    '*This is not a suggestion that the care was not given.* It is almost always given, '
    + 'and often given very well, by nurses who were holding an airway rather than a '
    + 'handset. What is missing is the record of it — and the record is the only part '
    + 'that survives the shift.',
  );

  lines.push('', '*Why this matters, and the risk it carries for all of us*');
  present.forEach((code) => lines.push(RECOVERY_GAPS[code].medicolegal));
  lines.push(
    '',
    'That risk is not the hospital’s alone. In any enquiry the hospital and the nurse are '
    + 'defended by the same document, and when it does not exist neither of them has '
    + 'anything to stand on.',
  );

  lines.push('', ...PAPER_IS_NOT_ENOUGH);

  lines.push('', '*What is needed*');
  present.forEach((code) => lines.push(`• ${RECOVERY_GAPS[code].fix}`));
  lines.push(
    '• Enter it for the hours the patient was actually with you, and date it honestly. A '
    + 'record completed late is a late record, which is a far smaller thing than no record.',
  );

  // The one legitimate answer the system cannot see for itself.
  if (input.cases.some((c) => c.needICU)) {
    lines.push(
      '',
      '*If a patient on this list never came to recovery at all* — taken from theatre '
      + 'straight to intensive care, which some of these were booked for — please say so '
      + 'and it will be recorded against the case. The ORM has no field that knows this, '
      + 'so it cannot settle it without being told.',
    );
  } else {
    lines.push(
      '',
      '*If a patient on this list never came to recovery at all* — taken from theatre '
      + 'straight to intensive care, for instance — please say so and it will be recorded '
      + 'against the case. The ORM has no field that knows this on its own.',
    );
  }

  lines.push(
    '',
    'If anything here is wrong, please say so and it will be corrected — a board that '
    + 'cannot be corrected is a board nobody should trust. If something is preventing the '
    + 'record being entered — a handset with no connection, a screen that will not save, '
    + 'an account that cannot open the case — tell the Theatre Manager, because a '
    + 'difficulty raised is one that can be fixed.',
    '',
    'With thanks for the work you do in recovery,',
    SIGN_OFF,
  );

  return withNetworkNotice(lines.join('\n'));
}

/** The short line for a notification title or a board column. */
export function recoveryHeadline(cases: readonly RecoveryChaseCase[]): string {
  const noRecord = cases.filter((c) => c.gaps.indexOf('NO_RECOVERY_RECORD') !== -1).length;
  const open = cases.filter((c) => c.gaps.indexOf('NOT_DISCHARGED') !== -1).length;
  const parts: string[] = [];
  if (noRecord > 0) parts.push(`${noRecord} with no recovery record`);
  if (open > 0) parts.push(`${open} never discharged`);
  const n = cases.length;
  return `${n} ${n === 1 ? 'case' : 'cases'}: ${parts.join(', ')}`;
}
