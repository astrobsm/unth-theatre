// ============================================================
// A patient left theatre and the ORM cannot say what happened next
// ------------------------------------------------------------
// Asked for on 8 November:
//
//   "add a place to chase the recovery room nurses (supervisor - from the duty
//    roster) for completed surgeries without recovery records or discharge
//    from recovery room, let them know the medicolegal implication and the
//    risk they expose the hospital to, even if they are on paper, it must be
//    documented on ORM."
//
// TWO GAPS, AND THEY ARE NOT THE SAME FAILURE.
//
//   NO_RECOVERY_RECORD   The operation is marked completed and no recovery
//                        record was ever opened. On the ORM this patient left
//                        the operating table and vanished.
//   NOT_DISCHARGED       A record was opened and never closed. On the ORM the
//                        patient is still in recovery — in one case for
//                        seventy-one days, which is where the "102711 min" on
//                        the transfer slip came from.
//
// The first is a patient with no post-anaesthetic observations at all. The
// second is a patient with observations and no evidence they were ever fit to
// leave: no discharge time, no Aldrete score at discharge, no named ward nurse
// who took them. They need different sentences, so they are different codes.
//
// WHY THERE IS A GRACE PERIOD, AND WHY IT IS NOT GENEROUS. A nurse receiving a
// patient at 14:05 is holding an airway, not a handset. Duty performance
// already allows thirty minutes from the patient leaving theatre before the
// admission counts as late, and the same thirty minutes is used here so the
// two boards cannot disagree about the same case. Discharge is due by the end
// of the day the patient was received — again the deadline duty performance
// already uses. A chase that fires while the patient is still on the trolley
// is a chase nobody reads the second time.
//
// A DEATH IS NOT A MISSING RECORD. A patient who died in theatre has a
// mortality record and no recovery record, correctly. Asking a supervisor why
// there are no recovery observations for that patient would be indefensible,
// so a case with a mortality on file yields no gaps at all — not a softened
// message, none.
//
// AND ICU IS NOT AN EXCUSE WE INVENT ON THEIR BEHALF. A patient taken straight
// from theatre to ICU may genuinely never enter recovery. There is no field
// that records that, so this file does NOT guess it away: the case is still
// listed, with `needICU` carried alongside it, and the message names ICU as
// the one answer that settles it. Dropping every ICU-flagged case would hide
// real gaps; dropping none without saying so would make the board arguable.
// ============================================================

import { watDay, watDayRange, watMinutesOfDay } from '@/lib/watDay';

export type RecoveryGapCode = 'NO_RECOVERY_RECORD' | 'NOT_DISCHARGED';

export const RECOVERY_GAP_CODES: RecoveryGapCode[] = [
  'NO_RECOVERY_RECORD', 'NOT_DISCHARGED',
];

/**
 * How long after the patient leaves theatre the recovery record is due.
 *
 * Thirty minutes, which is the figure duty performance already judges the PACU
 * admission duty on. Changing it here without changing it there would give one
 * patient two different verdicts on two screens.
 */
export const RECORD_DUE_MINUTES = 30;

export interface RecoveryGapDefinition {
  code: RecoveryGapCode;
  /** For a heading or a column. */
  label: string;
  /** Inside a sentence: "this case has …". */
  short: string;
  /** What is actually absent from the record, stated plainly. */
  missing: string;
  /** What it means if this is ever examined. The persuasive half. */
  medicolegal: string;
  /** What to do, and where. */
  fix: string;
}

/**
 * Everything a gap says about itself, in one place.
 *
 * The same discipline the case-chase gaps keep: a message, a column heading
 * and a tooltip that each describe a gap in their own words will eventually
 * describe it differently, and the one that is wrong is the one somebody
 * quotes back.
 *
 * The medicolegal sentences are deliberately specific about WHAT IS ABSENT
 * rather than about what law says. "There is no record of the airway or the
 * conscious level" is something nobody can argue with and everybody
 * understands the weight of. A citation of a statute would be both easier to
 * write and easier to dismiss, and if it were slightly wrong the whole message
 * would go with it.
 */
export const RECOVERY_GAPS: Record<RecoveryGapCode, RecoveryGapDefinition> = {
  NO_RECOVERY_RECORD: {
    code: 'NO_RECOVERY_RECORD',
    label: 'No recovery record',
    short: 'has no recovery record at all',
    missing:
      'There is nothing on the ORM about the airway, the conscious level, the oxygen '
      + 'saturation, the blood pressure, the pain score or the Aldrete score at any point '
      + 'after this patient left the operating table.',
    medicolegal:
      'If this patient’s recovery is ever questioned — by the family, in a claim against '
      + 'the hospital, at a mortality audit, or in an enquiry into an individual nurse’s '
      + 'practice — the only thing that can be produced in the hospital’s defence is the '
      + 'record made at the time. For this patient there is none. Every such enquiry starts '
      + 'from the same working rule, and it is not a rule the hospital can argue its way '
      + 'out of: what was not recorded is treated as not done. The hospital cannot rebut it, '
      + 'because there is nothing to put in front of anyone. The nurse who actually received '
      + 'the patient will be asked to account for those hours from memory, possibly years '
      + 'later, with nothing to support what they say.',
    fix:
      'Open the case under Recovery (PACU) and complete the admission record for the hours '
      + 'the patient was genuinely with you. A record completed late and dated honestly is '
      + 'worth a great deal. No record is worth nothing to anybody, least of all to the '
      + 'nurse who gave the care.',
  },
  NOT_DISCHARGED: {
    code: 'NOT_DISCHARGED',
    label: 'Never discharged from recovery',
    short: 'has a recovery record that was opened and never closed',
    missing:
      'There is no discharge time, nothing to show the discharge criteria were met, no '
      + 'record of where the patient went, and no named ward nurse who took the patient over.',
    medicolegal:
      'On the ORM this patient is still in the recovery room. The record says they were '
      + 'received and then stops: there is no evidence anybody judged them fit to leave, no '
      + 'evidence of the state they were in when they left, and nobody named as having '
      + 'accepted responsibility for them afterwards. If that patient deteriorated on the '
      + 'ward the same night, the first question asked is who discharged them and on what '
      + 'grounds — and an open record answers it with silence, which is the worst of the '
      + 'available answers. An unclosed record also reports the recovery stay as days long: '
      + 'one of them has already printed on a patient transfer slip as 102,711 minutes.',
    fix:
      'Open the record under Recovery (PACU) and complete the discharge — the time, the '
      + 'discharge criteria, where the patient went, and the nurse who received them.',
  },
};

/** A recovery record, as this module needs to see it. */
export interface RecoveryRecordFacts {
  admissionTime: Date;
  dischargeTime: Date | null;
  /** When the record was opened, as against the hour it claims. */
  createdAt: Date;
  /** The nurse who received the patient, where one is on the record. */
  receivedBy: string | null;
}

/** One completed case, as the chase needs to see it. */
export interface CaseForRecoveryGaps {
  /** The WAT day the case was listed for. */
  scheduledDay: string;
  /** When the patient left the operating table, where that was recorded. */
  leftTheatreAt: Date | null;
  recovery: RecoveryRecordFacts | null;
  /** A mortality record exists for this case. No gaps are raised against it. */
  diedInTheatre: boolean;
  /** Booked as needing ICU. Carried for context, never used to drop the case. */
  needICU?: boolean;
}

/**
 * When the recovery record became due.
 *
 * Thirty minutes from the patient leaving theatre. Where no end time was
 * recorded there is no finer deadline available, so the END OF THE LISTED DAY
 * stands in — which means a case with no recorded end time is never chased on
 * the day it happened. That is the right way round: the alternative is
 * guessing an hour and chasing somebody against it.
 */
export function recordDueAt(c: CaseForRecoveryGaps): Date {
  if (c.leftTheatreAt) {
    return new Date(c.leftTheatreAt.getTime() + RECORD_DUE_MINUTES * 60_000);
  }
  return watDayRange(c.scheduledDay).end;
}

/**
 * When the discharge became due: the end of the WAT day the patient was
 * received into recovery.
 *
 * The deadline duty performance already uses for the discharge duty. A patient
 * received at 23:30 is therefore due discharged within half an hour, which
 * sounds harsh and is not: that patient is due discharged *or* still in
 * recovery with observations running, and the second is not what this board
 * reports — it reports records nobody ever closed.
 */
export function dischargeDueAt(c: CaseForRecoveryGaps): Date | null {
  if (!c.recovery) return null;
  return watDayRange(watDay(c.recovery.admissionTime)).end;
}

/**
 * What is missing from this case, now.
 *
 * At most one code. The two gaps are states of the same record, in sequence: a
 * case with no record cannot also be a record that was never closed, and
 * reporting both would double every count on the board.
 */
export function recoveryGaps(
  c: CaseForRecoveryGaps,
  now: Date = new Date(),
): RecoveryGapCode[] {
  // See the header. A death in theatre is not a documentation failure.
  if (c.diedInTheatre) return [];

  if (!c.recovery) {
    return now.getTime() >= recordDueAt(c).getTime() ? ['NO_RECOVERY_RECORD'] : [];
  }
  if (!c.recovery.dischargeTime) {
    const due = dischargeDueAt(c);
    return due && now.getTime() >= due.getTime() ? ['NOT_DISCHARGED'] : [];
  }
  return [];
}

/** Whole hours an unclosed record has been open. Null when it is closed. */
export function hoursOpen(c: CaseForRecoveryGaps, now: Date = new Date()): number | null {
  if (!c.recovery || c.recovery.dischargeTime) return null;
  const ms = now.getTime() - c.recovery.admissionTime.getTime();
  return ms > 0 ? Math.floor(ms / 3_600_000) : 0;
}

/**
 * The moment the accountable shift is read from.
 *
 * The hour the patient was in recovery, not the hour the list was booked for.
 * A case that ran late and was received at 19:40 belongs to the evening
 * supervisor, and resolving it from the booked 08:00 would send the whole
 * day's chase to the morning supervisor regardless of when anything happened.
 */
export function accountableMoment(c: CaseForRecoveryGaps): Date {
  return c.recovery?.admissionTime
    ?? c.leftTheatreAt
    ?? watDayRange(c.scheduledDay).start;
}

/** The WAT wall clock an unclosed record was opened at, for a message. */
export const openedAtMinutes = (c: CaseForRecoveryGaps): number | null =>
  (c.recovery ? watMinutesOfDay(c.recovery.admissionTime) : null);

/** A gap's label inside a sentence, with ORM left as ORM. */
export const recoveryGapWords = (code: RecoveryGapCode): string =>
  RECOVERY_GAPS[code].label.toLowerCase().replace(/\borm\b/g, 'ORM');
