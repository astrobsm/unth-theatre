// ============================================================
// What is missing from a booked case
// ------------------------------------------------------------
// Four things, and they are not interchangeable:
//
//   LATE BOOKING   — the case arrived after the list was already planned.
//   CONSENT        — nothing on the ORM shows the patient has consented.
//   PRESCRIPTION   — pharmacy has no drug list to prepare from.
//   CONSUMABLES    — the pack provider has no list to pick from.
//
// COMPUTED LIVE, NOT READ FROM THE STORED FIELD. Surgery.preopOutstanding is
// written once, at booking, and nothing updates it when the consent is
// uploaded the following morning or the pharmacy list is added an hour later.
// A chase built on that column would tell a surgeon their consent is missing
// for a case they completed yesterday, and the second such message is the one
// after which nobody reads any of them. So each gap is decided here from the
// rows that would actually be read by the person who needs them.
//
// AND IT SAYS "NOT ON THE ORM", NEVER "NOT DONE". A paper consent in a folder
// on the ward is a real consent; what we know is that the theatre cannot see
// it. Stating the stronger thing would be both wrong and insulting, and it is
// the fastest way to have a whole message dismissed by somebody who did the
// work.
// ============================================================

import { bookingLateness, LATE_CUTOFF_LABEL } from '@/lib/bookingLateness';

export type CaseGapCode = 'LATE_BOOKING' | 'CONSENT' | 'PRESCRIPTION' | 'CONSUMABLES';

export const GAP_CODES: CaseGapCode[] = [
  'LATE_BOOKING', 'CONSENT', 'PRESCRIPTION', 'CONSUMABLES',
];

export interface CaseGapDefinition {
  code: CaseGapCode;
  /** For a heading or a column. */
  label: string;
  /** Inside a sentence: "the case has no …". */
  short: string;
  /** Who downstream is stopped, in one sentence. This is the persuasive half. */
  consequence: string;
  /** What to do about it, and where. */
  fix: string;
}

/**
 * Everything a gap says about itself lives here and nowhere else.
 *
 * The same discipline as the duty definitions: a message, a column heading and
 * a tooltip that each describe a gap in their own words will eventually
 * describe it differently, and the one that is wrong will be the one a
 * consultant quotes back.
 */
export const CASE_GAPS: Record<CaseGapCode, CaseGapDefinition> = {
  LATE_BOOKING: {
    code: 'LATE_BOOKING',
    label: 'Booked late',
    short: `was booked after the ${LATE_CUTOFF_LABEL} cut-off`,
    consequence:
      `By ${LATE_CUTOFF_LABEL} the list has been planned, CSSD has begun sterilising, `
      + 'pharmacy and the pack providers have drawn their packs and the nursing officer '
      + 'has assigned staff to each theatre. A case arriving after that hour does not '
      + 'join a queue — it '
      + 'displaces preparation already finished for another patient, and the patient who '
      + 'gets moved is rarely the one booked late.',
    fix:
      `Book the following day’s cases before ${LATE_CUTOFF_LABEL}. Where a clinic overruns or a `
      + 'result arrives late, tell the Theatre Manager before noon and it will be '
      + 'accommodated.',
  },
  CONSENT: {
    code: 'CONSENT',
    label: 'No consent on the ORM',
    short: 'has no consent on the ORM',
    consequence:
      'The holding area will stop the patient at the door, and it stops them on the '
      + 'morning of surgery, in a gown, after they have fasted. A consent that exists on '
      + 'paper and not on the ORM protects nobody in that moment, because the nurse '
      + 'holding the list cannot see it.',
    fix:
      'Open the case and either upload the signed form or complete the consent form in '
      + 'the app. Either satisfies it; a photograph of the signed paper is enough.',
  },
  PRESCRIPTION: {
    code: 'PRESCRIPTION',
    label: 'No pharmacy prescription',
    short: 'has no pharmacy prescription',
    consequence:
      'Pharmacy prepares from this list and from nothing else. With no list the drugs '
      + 'are not packed, and the gap is discovered at induction — which is the worst '
      + 'possible moment to discover it, and the point at which it becomes the '
      + 'anaesthetist’s emergency rather than an administrative one.',
    fix:
      'Open the case and add the drugs and fluids under the pharmacy list. The templates '
      + 'for the procedure fill most of it in one tap.',
  },
  CONSUMABLES: {
    code: 'CONSUMABLES',
    label: 'No consumable pack request',
    short: 'has no consumable pack request',
    consequence:
      'The pack provider picks from this list. Without it the theatre is opened with the '
      + 'base pack and whatever the scrub nurse can find, and the item nobody listed is '
      + 'the one the operation stops for.',
    fix:
      'Open the case and add the consumables. The procedure’s standard pack can be '
      + 'accepted as it stands and added to.',
  },
};

/** One case, as the chase needs to see it. */
export interface CaseForGaps {
  /** The operation date. */
  scheduledDate: Date | string | null;
  /** When the booking was made — Surgery.createdAt. */
  bookedAt: Date | string | null;
  /** ELECTIVE | URGENT | EMERGENCY. Only an elective case can be booked late. */
  surgeryType: string | null;

  /** Consent, as the theatre can actually see it. */
  consentFileName?: string | null;
  consentUploadedAt?: Date | string | null;
  consentSignedElectronically?: boolean | null;
  consentCompletedAt?: Date | string | null;

  /** How many pharmacy lines exist for this case. */
  prescriptionCount?: number | null;
  /** How many consumable pack lines exist for this case. */
  consumableCount?: number | null;
}

/** Is there a consent the theatre can see? */
export function hasConsent(c: CaseForGaps): boolean {
  return Boolean(
    c.consentFileName
    || c.consentUploadedAt
    || c.consentSignedElectronically
    || c.consentCompletedAt,
  );
}

/**
 * What is missing from this case, in the order a person would fix it.
 *
 * Lateness first because it is already true and cannot be fixed — it is
 * context for the rest — then consent, which stops the patient at the door,
 * then the two lists, which stop the case once it is through it.
 */
export function caseGaps(c: CaseForGaps): CaseGapCode[] {
  const out: CaseGapCode[] = [];

  const late = bookingLateness({
    scheduledDate: c.scheduledDate ?? new Date(0),
    bookedAt: c.bookedAt,
    surgeryType: c.surgeryType,
  });
  if (c.scheduledDate && late.isLate) out.push('LATE_BOOKING');

  if (!hasConsent(c)) out.push('CONSENT');
  if (!((c.prescriptionCount ?? 0) > 0)) out.push('PRESCRIPTION');
  if (!((c.consumableCount ?? 0) > 0)) out.push('CONSUMABLES');

  return out;
}

/**
 * How late, in hours, or null.
 *
 * Exposed separately so a message can say "nineteen hours past the cut-off"
 * rather than only that the case was late. A figure somebody can check against
 * their own memory of the afternoon is far harder to wave away.
 */
export function hoursLate(c: CaseForGaps): number | null {
  if (!c.scheduledDate) return null;
  return bookingLateness({
    scheduledDate: c.scheduledDate,
    bookedAt: c.bookedAt,
    surgeryType: c.surgeryType,
  }).hoursLate;
}

/**
 * A gap's label inside a sentence.
 *
 * Lower case, except that ORM stays ORM. "no consent on the orm" is how this
 * read for a fortnight, in letters to consultants, and an initialism written
 * as a word is the kind of thing that makes a careful reader doubt the rest
 * of the figures.
 */
export function gapWords(code: CaseGapCode): string {
  return CASE_GAPS[code].label.toLowerCase().replace(/\borm\b/g, 'ORM');
}

/** The gaps, listed the way somebody says them: "a, b and c". */
export function listGaps(codes: readonly CaseGapCode[]): string {
  const words = codes.map((c) => gapWords(c));
  if (words.length === 0) return '';
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** Only the gaps that are still somebody's to close. Lateness is history. */
export function fixableGaps(codes: readonly CaseGapCode[]): CaseGapCode[] {
  return codes.filter((c) => c !== 'LATE_BOOKING');
}
