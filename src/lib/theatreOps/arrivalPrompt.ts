// ============================================================
// "You are on a case today. Are you here?"
// ------------------------------------------------------------
// Asked for on 6 November:
//
//   "when a user arrives at the hospital and opens logs in, if his name is
//    on any booked case he gets a pop up to indicate his availability
//    status (location must be accessible, if denied by the user, notify him
//    that his availability status can not be ascertained and may be
//    considered absent)"
//
// WHY A POP-UP WHEN A CARD ALREADY EXISTS. TeamCheckInCard has sat at the
// top of every dashboard since the check-in board was built, and it is
// skipped, because a panel on a page is something you scroll past on the way
// to what you came for. The people whose answer the theatre actually needs
// at 07:40 are the ones least likely to stop and give it. A dialogue in
// front of the page is harder to not answer, and it is asked once, at the
// moment they sign in, which is the moment they have just arrived.
//
// WHAT THIS FILE IS. The parts of that prompt that are decisions rather than
// markup: which answers are offered, what each one means in each of the two
// tables that record attendance, when a reason is compulsory, and exactly
// what the person is told when their handset gives no position. Pure, so the
// wording of an accusation of absence can be read and tested without
// standing up a browser.
//
// THE TWO TABLES. An elective case records TeamCheckInStatus (PRESENT,
// EN_ROUTE, DELAYED, UNAVAILABLE, REPLACED); an emergency records
// AvailabilityStatus (AVAILABLE, EN_ROUTE, ARRIVED, UNAVAILABLE,
// ON_ANOTHER_CASE). They were built a year apart for different boards and
// neither is going to be rewritten for a pop-up, so the prompt offers three
// plain answers and maps each to whichever vocabulary the case uses. The
// nuanced answers stay on the full boards, which the prompt links to.
//
// LOCATION IS ASKED FOR, AND REFUSING IT DOES NOT BLOCK THE ANSWER. The
// hospital's instruction is that location must be accessible and that a
// refusal leaves the person unverifiable and possibly recorded absent —
// which is a warning, not a gate, and the difference matters. The lesson is
// written into requestFix.ts and was learned from the anaesthesia setup log:
// a position that can refuse becomes a position that stops staff working,
// and what you get is not better data but no data and a technician who
// stopped using the screen. So the refusal is recorded, with its reason, and
// said back plainly to the person; it never swallows their answer.
// ============================================================

/** The three answers the prompt offers, in the order they are shown. */
export const ARRIVAL_ANSWERS = [
  {
    key: 'HERE',
    label: 'I am here',
    hint: 'In the hospital now',
    /** TeamCheckInStatus on an elective case. */
    surgeryStatus: 'PRESENT',
    /** AvailabilityStatus on an emergency booking. */
    emergencyStatus: 'ARRIVED',
    needsReason: false,
  },
  {
    key: 'ON_MY_WAY',
    label: 'On my way',
    hint: 'Travelling in',
    surgeryStatus: 'EN_ROUTE',
    emergencyStatus: 'EN_ROUTE',
    needsReason: false,
  },
  {
    key: 'NOT_AVAILABLE',
    label: 'Not available',
    hint: 'Say why, so somebody can be found',
    surgeryStatus: 'UNAVAILABLE',
    emergencyStatus: 'UNAVAILABLE',
    // UNAVAILABLE with no reason reads the same as silence to anybody trying
    // to plan around it, and the elective endpoint refuses it outright.
    needsReason: true,
  },
] as const;

export type ArrivalAnswerKey = (typeof ARRIVAL_ANSWERS)[number]['key'];
export type CaseKind = 'SURGERY' | 'EMERGENCY';

export const isArrivalAnswer = (k: unknown): k is ArrivalAnswerKey =>
  typeof k === 'string' && ARRIVAL_ANSWERS.some((a) => a.key === k);

export function answerFor(key: ArrivalAnswerKey) {
  const found = ARRIVAL_ANSWERS.find((a) => a.key === key);
  if (!found) throw new Error(`Unknown arrival answer: ${key}`);
  return found;
}

/** What this answer is called in the table that will store it. */
export function statusFor(key: ArrivalAnswerKey, kind: CaseKind): string {
  const a = answerFor(key);
  return kind === 'EMERGENCY' ? a.emergencyStatus : a.surgeryStatus;
}

/** The shortest reason worth recording. */
export const MIN_REASON = 3;

/** Why this answer cannot be sent yet, or null. */
export function answerProblem(
  key: ArrivalAnswerKey | null | undefined,
  reason: string | null | undefined,
): string | null {
  if (!key || !isArrivalAnswer(key)) return 'Choose one.';
  if (answerFor(key).needsReason && (reason ?? '').trim().length < MIN_REASON) {
    return 'Say briefly why you are not available — one line is enough, so somebody can be found.';
  }
  return null;
}

export interface MyCase {
  kind: CaseKind;
  id: string;
  /** What the case is called on screen. */
  label: string;
  /** Their part in it. */
  myRole: string | null;
  /** Their answer so far, in whichever vocabulary the case uses. */
  myStatus: string | null;
}

/**
 * Is there anything to ask this person?
 *
 * Only unanswered cases count. Somebody who has already said they are here
 * must not be stopped by the same dialogue on their next page — that is how
 * a prompt becomes a thing people dismiss without reading, which costs the
 * one time it mattered.
 */
export function unanswered(cases: readonly MyCase[]): MyCase[] {
  return cases.filter((c) => !c.myStatus);
}

export function shouldPrompt(cases: readonly MyCase[]): boolean {
  return unanswered(cases).length > 0;
}

export interface FixLike {
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  unavailableReason?: string | null;
}

export const hasPosition = (fix: FixLike | null | undefined): boolean =>
  typeof fix?.latitude === 'number' && typeof fix?.longitude === 'number';

/**
 * What the person is told about their own location, before they answer.
 *
 * The warning is the hospital's, said plainly and once. It is about the
 * RECORD, not about them: "cannot be confirmed" and "may be recorded as
 * absent" are facts about what the board will be able to show. It does not
 * call anybody a liar, and it does not pretend the system knows they are
 * not here — a theatre basement produces exactly the same silence as a
 * refusal, which is why the reason is stored beside the verdict.
 */
export function locationNotice(fix: FixLike | null | undefined): {
  tone: 'ok' | 'warn';
  title: string;
  detail: string;
} {
  if (hasPosition(fix)) {
    return {
      tone: 'ok',
      title: 'Your location has been read',
      detail:
        'It is checked against the hospital site and stored as a verdict and a '
        + 'rough distance — not as a trail of where you have been.',
    };
  }

  const why = (fix?.unavailableReason ?? '').trim();
  return {
    tone: 'warn',
    title: 'Your location could not be read',
    detail:
      `${why ? `${why}. ` : ''}`
      + 'Your availability cannot be confirmed without it, and an unconfirmed '
      + 'answer may be treated as absence when the case is reviewed. You can '
      + 'still record your status now — it will be saved, and it will be marked '
      + 'as unverified. If you refused the location request, allow it in your '
      + 'browser and answer again.',
  };
}

/** One line for the record, so a board can say why a check-in is unverified. */
export function storedReason(
  fix: FixLike | null | undefined,
  max = 200,
): string | null {
  if (hasPosition(fix)) return null;
  const why = (fix?.unavailableReason ?? '').trim();
  if (!why) return 'The handset gave no position.';
  return why.length > max ? `${why.slice(0, max - 1)}…` : why;
}
