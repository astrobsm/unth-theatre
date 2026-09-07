// ============================================================
// Is this announcement one the room has to hear?
// ------------------------------------------------------------
// One predicate, because there were three, and they disagreed.
//
// The radio player asked this question in three places and answered it
// differently each time:
//
//   the alert badge      requireAck || category EMERGENCY || priority >= 90
//   the playback gate                  category EMERGENCY || priority >= 90
//   the status line                    category EMERGENCY || priority >= 90
//
// An announcement raised with requireAck and an ordinary category therefore
// rendered a full-width green ACKNOWLEDGE EMERGENCY banner — the badge said
// urgent — while the playback gate filed it as routine radio chatter and left
// it to the elected leader window. If that window was not the one in front of
// the nurse, nothing was spoken, and the status line, using the same narrow
// test, printed "Being announced in your other open window" underneath the
// emergency banner.
//
// It usually was not being announced anywhere.
//
// requireAck is the strongest signal of the three. It means somebody has to
// press a button before this stops repeating, which is not something asked of
// routine traffic. If it is worth an acknowledgement it is worth being heard.
// ============================================================

/** Priority at or above which an announcement is treated as an emergency. */
export const URGENT_PRIORITY = 90;

/** The fields that decide urgency. Deliberately loose — callers hold wider types. */
export interface UrgencySignals {
  category?: string | null;
  priority?: number | null;
  requireAck?: boolean | null;
}

/**
 * Does this announcement bypass mute, the leader election and the warm-up
 * wait, and get spoken immediately in every open window?
 */
export function isUrgentAnnouncement(a: UrgencySignals | null | undefined): boolean {
  if (!a) return false;
  // Anything demanding an acknowledgement is urgent by construction.
  if (a.requireAck === true) return true;
  if ((a.category ?? '').trim().toUpperCase() === 'EMERGENCY') return true;
  return typeof a.priority === 'number' && a.priority >= URGENT_PRIORITY;
}
