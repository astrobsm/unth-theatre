/**
 * INPATIENT OR DAY CASE — asked once, at booking, and not optional.
 *
 * WHY THIS FILE EXISTS. The day-case flag was built and shipped on every
 * screen an anaesthetist works from, and then reported as still missing. It
 * was not missing: nothing was ever flagged, because of how the answer was
 * collected. `isDayCase` was a checkbox, unchecked by default, sitting in the
 * "Post-operative disposition" block beside the post-op destination — a
 * section about where the patient goes AFTER surgery, two steps into the
 * wizard. A booker who never noticed it booked an inpatient, silently, and
 * that is the same case the anaesthetist then walks to a ward for.
 *
 * A DEFAULT IS AN ANSWER NOBODY GAVE. An unchecked box cannot be told apart
 * from a considered "no", so every case in the database claimed to be an
 * inpatient on equal authority — the ones somebody decided and the ones
 * nobody read. The fix is not a louder checkbox. It is a field with no
 * default, which the form refuses to send without.
 *
 * SO: a two-option dropdown, required, on the Schedule step beside the date
 * and time — because whether the patient sleeps in the hospital the night
 * before is a scheduling fact, not a discharge detail, and the Schedule step
 * is reached by everyone, including the surgeons who book from the early
 * "Book now" button and never walk to the end of the wizard.
 *
 * WHAT IS STORED IS UNCHANGED. The column is still the boolean `isDayCase`,
 * and every reader of it — four APIs, three boards, the research variable,
 * the call-for-patient page, the holding-area gate — keeps working untouched.
 * This module is only the one place that converts between the answer a person
 * gives and the boolean the database holds, in both directions, so neither
 * conversion can be written twice and drift.
 */

/** The answer, once given. '' is the absence of an answer, never a default. */
export type AdmissionType = 'INPATIENT' | 'DAY_CASE';

/** What the dropdown offers, in the order it offers it. */
export const ADMISSION_TYPE_OPTIONS: {
  value: AdmissionType;
  /** The option text. Says the consequence, not only the category. */
  label: string;
}[] = [
  {
    value: 'INPATIENT',
    label: 'Inpatient — admitted to a ward before surgery',
  },
  {
    value: 'DAY_CASE',
    // The sentence that stops the walk, in the place where the decision is
    // actually made. "Day case" alone reads as a statement about discharge.
    label: 'Day case — comes in on the morning of surgery, home the same day',
  },
];

/**
 * Has the booker answered at all?
 *
 * Separate from the conversion below on purpose: `isDayCaseFrom('')` is
 * false, which is correct for storage and useless as a test of whether
 * anybody chose. The gate asks this; the payload asks that.
 */
export function admissionTypeChosen(value: string | null | undefined): boolean {
  return value === 'INPATIENT' || value === 'DAY_CASE';
}

/** The answer, as the column holds it. */
export function isDayCaseFrom(value: string | null | undefined): boolean {
  return value === 'DAY_CASE';
}

/**
 * The reverse: a stored case, as the dropdown should show it.
 *
 * Note the asymmetry with the draft reader below. A case that has been SAVED
 * with isDayCase false was saved by a form that required the question, so
 * false is an answer. An unsent draft carrying false may predate the
 * question, so it is not.
 */
export function admissionTypeOf(isDayCase: boolean | null | undefined): AdmissionType {
  return isDayCase === true ? 'DAY_CASE' : 'INPATIENT';
}

/**
 * Restoring a draft saved before this field existed.
 *
 * `isDayCase: false` in an old draft means "the checkbox was never touched",
 * which is exactly the thing this change exists to stop being read as an
 * answer. So only a true carries over; a false restores as unanswered and
 * the booker is asked. One extra question on a resumed draft is cheaper than
 * one more case mislabelled.
 */
export function admissionTypeFromDraft(
  draft: { admissionType?: string | null; isDayCase?: boolean | null } | null | undefined,
): AdmissionType | '' {
  if (!draft) return '';
  if (admissionTypeChosen(draft.admissionType)) return draft.admissionType as AdmissionType;
  return draft.isDayCase === true ? 'DAY_CASE' : '';
}

/**
 * The words for a list, a board or a printed sheet.
 *
 * Short, because it sits under a patient's name in a table cell. The
 * explanation of what a day case implies lives in DayCaseFlag, which is what
 * a day case gets; an inpatient gets this word and the ward line it already
 * had.
 */
export function admissionLabel(isDayCase: boolean | null | undefined): string {
  return isDayCase === true ? 'Day case' : 'Inpatient';
}

/**
 * Picking "day case" implies a same-day discharge, so offer it — once.
 *
 * Only fills a destination the booker has left empty. Overwriting a chosen
 * destination would silently contradict them, and a day case can legitimately
 * be planned to recovery-then-discharge rather than straight home.
 */
export function postOpDestinationFor(
  admission: string | null | undefined,
  current: string | null | undefined,
): string {
  if (isDayCaseFrom(admission) && !current) return 'DAY_CASE_DISCHARGE';
  return current || '';
}

/** What the booking form says when the question has been skipped. */
export const ADMISSION_MISSING_MESSAGE =
  'whether this is an inpatient or a day case';
