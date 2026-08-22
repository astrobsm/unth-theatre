// ============================================================
// What a team check-in is worth at the meal counter
// ------------------------------------------------------------
// Lunch is for people who worked. The board and a staff member's own
// eligibility check read the same sources for exactly that reason — a person
// told "you are eligible" on their phone and refused at the counter is worse
// than either answer on its own.
//
// A check-in is evidence, but not all check-ins are the same evidence:
//
//   PRESENT      an affirmative, timestamped, attributable statement that they
//                are here for a case — often corroborated by the geofence.
//                Stronger than being assigned, and treated as work.
//
//   EN_ROUTE     they said they were coming. At lunchtime that is a promise
//   DELAYED      from earlier in the day, and the system has no later signal
//                unless the case actually ran. Enough to be EXPECTED and have
//                somebody confirm; not enough to wave through, because a person
//                who set off and never arrived would otherwise collect a meal.
//
//   UNAVAILABLE  they said they are NOT doing the case. Someone else is.
//   REPLACED     No claim on the case, and so none on its meal.
//
// This is deliberately NOT the `counted` flag from checkIn.ts. That answers
// "is this person expected in theatre?", which is the right question for a
// readiness board and the wrong one for a meal: it treats a promise to come
// and an arrival as the same thing.
// ============================================================

import type { CheckInStatus } from '@/lib/theatreOps/checkIn';

export type MealCredit =
  /** Counts as work. Eligible, verified. */
  | 'QUALIFYING'
  /** Expected. Eligible, but somebody should confirm before dispensing. */
  | 'EXPECTED'
  /** No claim. */
  | 'NONE';

/** What a single check-in status is worth. */
export function creditForCheckIn(status: string | null | undefined): MealCredit {
  switch (status) {
    case 'PRESENT':
      return 'QUALIFYING';
    case 'EN_ROUTE':
    case 'DELAYED':
      return 'EXPECTED';
    case 'UNAVAILABLE':
    case 'REPLACED':
    default:
      return 'NONE';
  }
}

/**
 * The best credit across a person's check-ins for the day.
 *
 * Somebody may be on three cases: unavailable for the first, present for the
 * second. They worked. Taking the best answer is what stops one honest
 * "I cannot do that list" from costing a person their lunch — and honesty
 * about the first case is exactly the behaviour the check-in board exists to
 * encourage.
 */
export function bestCheckInCredit(
  statuses: Array<string | null | undefined>,
): MealCredit {
  let best: MealCredit = 'NONE';
  for (const s of statuses) {
    const c = creditForCheckIn(s);
    if (c === 'QUALIFYING') return 'QUALIFYING';
    if (c === 'EXPECTED') best = 'EXPECTED';
  }
  return best;
}

/** What the counter is told, so a refusal or an approval can be explained. */
export function checkInReason(status: CheckInStatus | string | null | undefined): string {
  switch (status) {
    case 'PRESENT':
      return 'Checked in as present for a case today.';
    case 'EN_ROUTE':
      return 'Checked in as on the way to a case — confirm they arrived.';
    case 'DELAYED':
      return 'Checked in as delayed for a case — confirm they arrived.';
    case 'UNAVAILABLE':
      return 'Checked in as unavailable for their case today.';
    case 'REPLACED':
      return 'Was replaced on their case today.';
    default:
      return 'No check-in recorded today.';
  }
}
