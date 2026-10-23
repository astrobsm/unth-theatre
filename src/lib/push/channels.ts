// ============================================================
// Android notification channels
// ------------------------------------------------------------
// WHY THIS FILE EXISTS: the server sends to `channelId: 'orm_alerts'`, and
// until now nothing ever created that channel. On Android 8 and later a
// notification aimed at a channel that does not exist is not shown as sent —
// Firebase quietly falls back to its own "Miscellaneous" channel at DEFAULT
// importance, which means no heads-up banner, no sound and no lock-screen
// wake. The notification arrives, silently, in the shade. That is the whole
// difference between this app and WhatsApp.
//
// A CHANNEL IS WRITTEN ONCE AND THEN FROZEN. After an app first creates a
// channel, the app can never raise its importance again — only the user can,
// in system settings. So these values have to be right the first time a
// handset sees them, and a mistake cannot be fixed by a later release: it
// needs a NEW channel id. That is also why these ids carry no version suffix
// that would tempt someone to "just bump it" and silently orphan everyone's
// existing preferences.
//
// Three channels rather than one, because a list changing at 2pm and a
// cardiac arrest call must not make the same sound. Staff can silence the
// first without silencing the second, which is the only thing that keeps the
// urgent one urgent.
// ============================================================

export type OrmChannel = {
  id: string;
  name: string;
  description: string;
  /** 5 = MAX: heads-up banner, sound, wakes the screen. 3 = DEFAULT: sound, no banner. */
  importance: 1 | 2 | 3 | 4 | 5;
  /** 1 = PUBLIC (full text on the lock screen), 0 = PRIVATE (hidden until unlocked). */
  visibility: -1 | 0 | 1;
  vibration: boolean;
  lights: boolean;
};

/**
 * The id the server already targets in src/lib/fcm.ts. If this string changes,
 * change it there too — a mismatch is silent and looks exactly like push being
 * broken, which is how this bug went unnoticed in the first place.
 */
export const ALERTS_CHANNEL = 'orm_alerts';
export const EMERGENCY_CHANNEL = 'orm_emergency';
export const ROUTINE_CHANNEL = 'orm_routine';

export const ORM_CHANNELS: OrmChannel[] = [
  {
    id: EMERGENCY_CHANNEL,
    name: 'Emergencies and arrest calls',
    description:
      'Cardiac arrest, emergency theatre activation and major incidents. The most intrusive alert the phone allows.',
    importance: 5,
    // Shown in full on the lock screen. An arrest call that reads "1 new
    // notification" costs whatever time it takes to unlock a phone with
    // gloved or wet hands.
    visibility: 1,
    vibration: true,
    lights: true,
  },
  {
    id: ALERTS_CHANNEL,
    name: 'Theatre alerts',
    description:
      'Your cases, pre-operative reviews, list changes, and anything assigned to you or your unit.',
    importance: 5,
    visibility: 1,
    vibration: true,
    lights: true,
  },
  {
    id: ROUTINE_CHANNEL,
    name: 'Routine and informational',
    description: 'Announcements, reminders and summaries that are not time-critical.',
    importance: 3,
    // PRIVATE: the body is hidden on the lock screen. Routine traffic is the
    // bulk of it, it carries patient names, and a theatre phone spends its
    // day face-up on a bench that anyone walking past can read.
    visibility: 0,
    vibration: false,
    lights: false,
  },
];
