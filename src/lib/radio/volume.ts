// ============================================================
// How loud the theatre radio actually plays
// ------------------------------------------------------------
// The volume is set centrally and applied by every open radio window on its
// next queue poll, so the corridor speaker can be turned down from home at
// two in the morning without anybody walking to the theatre.
//
// THE WHOLE DIFFICULTY IS THE FLOOR. Whoever sets this is, by definition,
// not in the room. They cannot hear the result, and the failure is silent:
// an announcement that plays at zero still plays. The player marks it as
// delivered and the queue retires it, so nobody in theatre ever hears it and
// nothing anywhere records that they did not.
//
// That is not hypothetical. The same fault already existed for the per-device
// mute, and the comment left in RadioPlayer when it was fixed says it
// exactly: "a muted emergency was therefore not merely silent, it was
// consumed". A remote volume control is the same bug with a longer reach and
// a less accountable hand on it.
//
// So an emergency is never quieter than EMERGENCY_FLOOR, whatever the
// setting says, and the floor lives here rather than in the database, where
// whoever is holding the slider could edit it.
//
// Routine traffic may be taken all the way to silence. That is the point of
// the feature, and a routine announcement nobody hears costs a repeat, not a
// patient.
// ============================================================

/**
 * The quietest an emergency may be played, however low the radio is set.
 *
 * Half volume: audible across a theatre corridor over normal background
 * noise, while still being a clear reduction for anybody who turned the
 * radio down because it was too loud.
 */
export const EMERGENCY_FLOOR = 0.5;

/** The volume a fresh install plays at. */
export const DEFAULT_VOLUME = 1;

export interface RadioVolumeSetting {
  volume?: number | null;
  /** Silences routine traffic hospital-wide. Emergencies still sound. */
  routineMuted?: boolean | null;
}

/**
 * Force a stored or submitted value into 0..1.
 *
 * Anything unusable — absent, NaN, a string that did not parse, Infinity —
 * becomes DEFAULT_VOLUME rather than 0. A corrupt setting must fail loud,
 * not silent: a radio that has gone quiet because a number could not be read
 * is indistinguishable from a radio nobody is using.
 */
export function clampVolume(value: unknown): number {
  // null and '' are checked BEFORE Number(), because Number(null) and
  // Number('') are both 0 — so an unset column or a cleared form field would
  // have come through as a deliberate silence. That is the precise failure
  // this function exists to prevent, and it very nearly shipped inside it.
  if (value === null || value === undefined) return DEFAULT_VOLUME;
  if (typeof value === 'string' && value.trim() === '') return DEFAULT_VOLUME;
  if (typeof value === 'boolean') return DEFAULT_VOLUME;

  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * What this announcement actually plays at.
 *
 * `urgent` is the player's own judgement from isUrgentAnnouncement — the same
 * flag that already decides whether mute applies — so the two cannot disagree
 * about what counts as an emergency.
 */
export function effectiveVolume(
  setting: RadioVolumeSetting | null | undefined,
  urgent: boolean,
): number {
  const base = clampVolume(setting?.volume ?? DEFAULT_VOLUME);

  if (urgent) {
    // Both the hospital-wide routine mute and a low setting are overridden.
    // Never raised ABOVE what was asked for, only lifted to the floor: a
    // radio set to 0.8 does not get louder because the case is an emergency.
    return Math.max(base, EMERGENCY_FLOOR);
  }

  if (setting?.routineMuted) return 0;
  return base;
}

/** Whether this announcement will produce any sound at all. */
export function willBeAudible(
  setting: RadioVolumeSetting | null | undefined,
  urgent: boolean,
): boolean {
  return effectiveVolume(setting, urgent) > 0;
}

/**
 * How the current setting reads on the admin screen.
 *
 * Says the consequence rather than the number. "40%" does not tell somebody
 * at home what they have just done to a corridor two hundred miles away.
 */
export function describeVolume(setting: RadioVolumeSetting | null | undefined): string {
  const v = clampVolume(setting?.volume ?? DEFAULT_VOLUME);
  if (setting?.routineMuted) {
    return 'Routine announcements are silenced. Emergencies still sound, at half volume or above.';
  }
  if (v === 0) {
    return 'Routine announcements are silenced. Emergencies still sound, at half volume or above.';
  }
  if (v >= 0.99) return 'Full volume.';
  if (v < EMERGENCY_FLOOR) {
    return `Routine announcements at ${Math.round(v * 100)}%. Emergencies are raised to `
      + `${Math.round(EMERGENCY_FLOOR * 100)}% so they stay audible.`;
  }
  return `All announcements at ${Math.round(v * 100)}%.`;
}
