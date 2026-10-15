// ============================================================
// Has a scheduled radio broadcast fallen due?
// ------------------------------------------------------------
// This replaced an exact-minute equality test:
//
//   if (b.timeOfDay === hhmm) { ... }
//
// which fires only if a poll happens to land inside the one minute the
// broadcast is due. The queue is polled by whichever browsers have the radio
// open, so that minute is not guaranteed to anybody. If the last clinician
// closed their laptop at 17:58 and the next opened one at 18:02, the 18:00
// broadcast did not fire late — it did not fire at all, and nothing recorded
// that it had been missed.
//
// So a due time now STAYS due. The broadcast fires on the first poll at or
// after it, and `lastTriggered` moving past the due instant is what stops it
// firing twice.
//
// WITH A LIMIT, because "stays due" taken literally is its own fault. A
// six-o'clock-in-the-morning call to send for the first patients, read out
// at half past ten at night because nobody opened the page all day, is not
// the announcement arriving late. It is a different and wrong announcement.
// Two hours is the window: long enough to cover a closed browser, a redeploy
// or a server restart, short enough that what is read out still means
// something. Past it the broadcast is skipped, and skipped deliberately.
//
// Pure, because the alternative is reasoning about a clock by watching a
// corridor speaker.
// ============================================================

import { watDay, watInstantFrom } from '@/lib/watDay';

/**
 * How late a timed broadcast may still be read out.
 *
 * Covers the gaps that actually happen — a closed browser overnight, a
 * Vercel redeploy, the theatre server restarting — without reading out a
 * morning call in the evening.
 */
export const CATCH_UP_MINUTES = 120;

export interface BroadcastSchedule {
  /** "HH:MM" in WAT. Takes precedence over the interval, as it always did. */
  timeOfDay?: string | null;
  intervalMins?: number | null;
  lastTriggered?: Date | string | null;
}

export type DueVerdict =
  /** Fire it. */
  | 'due'
  /** Not yet. */
  | 'waiting'
  /** Already read out for this due time. */
  | 'done'
  /** The due time passed more than CATCH_UP_MINUTES ago. Deliberately silent. */
  | 'missed'
  /** Neither a time nor an interval — nothing to schedule. */
  | 'unscheduled';

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * The verdict, rather than a boolean.
 *
 * 'missed' and 'done' both mean "do not fire" and are completely different
 * facts. A queue that cannot tell them apart cannot report that the 6am call
 * was silently dropped, which is the failure this whole file exists for.
 */
export function broadcastDue(b: BroadcastSchedule, now: Date): DueVerdict {
  const last = asDate(b.lastTriggered);

  if (b.timeOfDay) {
    const dueAt = watInstantFrom(watDay(now), b.timeOfDay);
    // An unparseable time is not a schedule. Treated as unscheduled rather
    // than as "due", because guessing would put a broadcast on the speaker
    // at an hour nobody chose.
    if (!dueAt) return 'unscheduled';

    const lateByMinutes = (now.getTime() - dueAt.getTime()) / 60_000;
    if (lateByMinutes < 0) return 'waiting';

    // DONE IS TESTED BEFORE MISSED, and the order is the whole point of
    // having both. A broadcast that fired at 18:00 and is asked about at
    // 22:00 is four hours past due AND was read out perfectly. Checking
    // lateness first would label it 'missed' and have a diagnostic report a
    // dropped broadcast that in fact went out on time — the most expensive
    // kind of wrong, because somebody then goes looking for a fault that is
    // not there.
    if (last && last.getTime() >= dueAt.getTime()) return 'done';

    if (lateByMinutes > CATCH_UP_MINUTES) return 'missed';
    return 'due';
  }

  if (b.intervalMins && b.intervalMins > 0) {
    if (!last) return 'due';
    const elapsed = (now.getTime() - last.getTime()) / 60_000;
    return elapsed >= b.intervalMins ? 'due' : 'waiting';
  }

  return 'unscheduled';
}

/** How late this firing is, in whole minutes. Null for an interval broadcast. */
export function minutesLate(b: BroadcastSchedule, now: Date): number | null {
  if (!b.timeOfDay) return null;
  const dueAt = watInstantFrom(watDay(now), b.timeOfDay);
  if (!dueAt) return null;
  return Math.max(0, Math.floor((now.getTime() - dueAt.getTime()) / 60_000));
}
