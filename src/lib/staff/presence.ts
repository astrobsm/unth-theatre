// ============================================================
// Is the person on duty actually here?
// ------------------------------------------------------------
// The availability board records what somebody says they are. It cannot tell
// whether they are in the building, so a member of staff could mark themselves
// present at the start of a shift and leave, and the first anybody knew was
// when the work did not happen.
//
// WHAT THIS ANSWERS, AND ONLY THIS: is this person, right now, inside the
// hospital perimeter, during a shift they are rostered for. In or out. The
// theatre's question is "is the on-call radiographer on site"; it is not "where
// has the radiographer been today", and nothing here answers the second.
//
// THE RULES THAT MAKE THAT TRUE, all enforced here rather than in a screen:
//
//   Only while on duty. Outside a rostered shift nothing is recorded at all.
//   Somebody's own time is their own, and no operational question needs it.
//
//   Only for statuses that already permit a position — the same list the
//   availability board uses. Off Duty and On Leave carry no position, and so
//   carry no presence check either.
//
//   A poor fix is NOT an absence. A phone reporting a position accurate to two
//   kilometres cannot place anybody inside a four-hundred-metre perimeter, and
//   a system that reads that as "left the facility" accuses people of things
//   the evidence cannot support. It is recorded as unknown.
//
//   No fix is not an absence either. A basement has no signal; that is a fact
//   about the building.
//
// A presence record that cries wolf gets switched off within a week, and then
// nobody has anything. The thresholds below exist to stop it crying wolf.
// ============================================================

/** Statuses that mean "at work and findable" — the availability board's list. */
export const ON_DUTY_STATUSES = [
  'AVAILABLE', 'BUSY', 'IN_THEATRE', 'TRANSPORTING_PATIENT',
  'PREPARING_THEATRE', 'CLEANING_THEATRE', 'ON_EMERGENCY_CASE', 'BREAK',
] as const;

export const isOnDutyStatus = (s: string | null | undefined): boolean =>
  !!s && (ON_DUTY_STATUSES as readonly string[]).includes(s);

/**
 * A fix worse than this cannot place anybody, and is recorded as unknown.
 *
 * Set against the default perimeter rather than plucked: a 400 m geofence and a
 * 500 m accuracy circle overlap so heavily that "outside" means nothing.
 */
export const USELESS_ACCURACY_M = 500;

/**
 * How far outside the perimeter before it counts as off site.
 *
 * A margin, because a phone sitting on a bench by the wall will wander either
 * side of the line all morning, and a record that flips every few minutes is
 * noise that hides the one departure that mattered.
 */
export const BOUNDARY_MARGIN_M = 100;

/** Metres between two positions. Haversine; the earth is close enough to round. */
export function distanceMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

export interface Geofence {
  latitude: number;
  longitude: number;
  radiusMetres: number;
}

export interface Fix {
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
}

export interface PresenceVerdict {
  /** null means the check could not answer — never rendered as absence. */
  onSite: boolean | null;
  distanceM: number | null;
  /** Why, in words, for the record and for the person's own screen. */
  reason: string;
}

/**
 * In, out, or cannot say.
 *
 * The third answer is the one that keeps this honest. Most systems of this kind
 * collapse it into "out", and then a nurse in a basement theatre with no signal
 * is marked as having left the hospital.
 */
export function evaluate(fix: Fix, fence: Geofence | null): PresenceVerdict {
  if (!fence) {
    return { onSite: null, distanceM: null, reason: 'No facility perimeter has been set.' };
  }

  const hasFix = typeof fix.latitude === 'number' && typeof fix.longitude === 'number'
    // 0,0 is the Gulf of Guinea and is what a failed fix reports.
    && !(fix.latitude === 0 && fix.longitude === 0);

  if (!hasFix) {
    return { onSite: null, distanceM: null, reason: 'The device did not report a position.' };
  }

  const accuracy = typeof fix.accuracyM === 'number' ? fix.accuracyM : null;
  const distance = distanceMetres(
    { latitude: fix.latitude as number, longitude: fix.longitude as number },
    fence,
  );

  if (accuracy !== null && accuracy > USELESS_ACCURACY_M) {
    return {
      onSite: null,
      distanceM: distance,
      reason: `The position was only accurate to about ${Math.round(accuracy)} m, which cannot place anybody.`,
    };
  }

  if (distance <= fence.radiusMetres) {
    return { onSite: true, distanceM: distance, reason: 'Inside the hospital perimeter.' };
  }

  if (distance <= fence.radiusMetres + BOUNDARY_MARGIN_M) {
    // On the line. Called present, because a boundary case should not become
    // an accusation.
    return { onSite: true, distanceM: distance, reason: 'At the edge of the perimeter.' };
  }

  return {
    onSite: false,
    distanceM: distance,
    reason: `About ${formatDistance(distance)} from the hospital.`,
  };
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;
}

export interface Check {
  at: Date | string;
  onSite: boolean | null;
  status?: string | null;
}

export interface PresenceSummary {
  /** The most recent check that actually answered. */
  lastKnown: 'ON_SITE' | 'OFF_SITE' | 'UNKNOWN';
  /** When that was. */
  since: Date | null;
  /** Minutes off site, where they are. */
  minutesAway: number | null;
  /** Nothing has been heard for a long time. Not the same as being away. */
  stale: boolean;
  /** Worth a supervisor's attention, with the reason. */
  concern: string | null;
}

/** Longer than this without any check at all and the record has gone quiet. */
export const STALE_AFTER_MINUTES = 90;

/** Off site longer than this during a shift is worth somebody asking about. */
export const AWAY_CONCERN_MINUTES = 45;

/**
 * What the board should say about one person.
 *
 * Reads only checks that answered. A run of "cannot say" does not overwrite the
 * last real answer — it makes the record stale, which is reported as staleness
 * and not as absence.
 */
export function summarise(checks: Check[], now: Date = new Date()): PresenceSummary {
  const parsed = checks
    .map((c) => ({ ...c, at: c.at instanceof Date ? c.at : new Date(c.at) }))
    .filter((c) => !Number.isNaN(c.at.getTime()))
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  if (!parsed.length) {
    return { lastKnown: 'UNKNOWN', since: null, minutesAway: null, stale: false, concern: null };
  }

  const minutesSince = (d: Date) => Math.floor((now.getTime() - d.getTime()) / 60_000);
  const stale = minutesSince(parsed[0].at) > STALE_AFTER_MINUTES;

  const answered = parsed.filter((c) => c.onSite !== null);
  if (!answered.length) {
    return {
      lastKnown: 'UNKNOWN', since: parsed[0].at, minutesAway: null, stale,
      concern: stale ? 'No position has been reported for over an hour and a half.' : null,
    };
  }

  const latest = answered[0];

  if (latest.onSite) {
    return {
      lastKnown: 'ON_SITE', since: latest.at, minutesAway: null, stale,
      concern: stale ? 'Last confirmed on site over an hour and a half ago.' : null,
    };
  }

  // Off site. How long — from the FIRST off-site check in this unbroken run,
  // not the latest, or somebody four hours away would read as two minutes.
  let runStart = latest.at;
  for (const c of answered) {
    if (c.onSite === false) runStart = c.at; else break;
  }
  const away = minutesSince(runStart);

  return {
    lastKnown: 'OFF_SITE',
    since: runStart,
    minutesAway: away,
    stale,
    concern: away >= AWAY_CONCERN_MINUTES
      // Worded as a question. The board does not know why somebody is away, and
      // there are good reasons — collecting blood, escorting a patient to
      // another site, a genuine errand nobody recorded.
      ? `Away from the hospital for about ${away} minutes while on duty. Worth asking why.`
      : null,
  };
}

/**
 * Should a check be recorded at all?
 *
 * The gate that keeps this to duty hours. Everything else in this file assumes
 * it has already been asked.
 */
export function shouldRecord(input: {
  status?: string | null;
  onRoster: boolean;
}): { record: boolean; reason: string } {
  if (!input.onRoster) {
    return { record: false, reason: 'Not rostered for a shift now — nothing is recorded.' };
  }
  if (!isOnDutyStatus(input.status)) {
    return {
      record: false,
      reason: 'Presence is recorded only while on duty. Off duty and on leave carry no position.',
    };
  }
  return { record: true, reason: 'On duty and rostered.' };
}
