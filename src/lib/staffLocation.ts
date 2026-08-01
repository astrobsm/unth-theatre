// ============================================================
// Staff location — distance, freshness, and how much to trust a fix
// ------------------------------------------------------------
// A coordinate on a workforce board is only useful if three questions can be
// answered honestly: how far away is this person, how long ago was that true,
// and how good was the fix?
//
// Getting the third wrong is the dangerous one. A phone indoors routinely
// returns a position accurate to two kilometres. Shown as a plain dot on a map
// that reads as certainty, and somebody calls the wrong anaesthetist in an
// emergency. So accuracy travels with every position and is stated in words.
//
// Pure functions: the board, the emergency card and the tests all use these,
// and nothing here needs a database or a browser.
// ============================================================

export type LocationSource = 'GPS' | 'NETWORK' | 'MANUAL';

export interface StaffPosition {
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  capturedAt?: Date | string | null;
  source?: LocationSource | string | null;
}

/**
 * The availability snapshot as it is stored on the user row.
 *
 * Its columns are named `currentLatitude` and so on, because on a User row
 * "latitude" alone would say nothing about which latitude. A ping row uses the
 * plain names. Rather than loosen the types to accept either, `positionOf`
 * converts one to the other explicitly — the difference is intentional and
 * worth keeping visible.
 */
export interface StaffSnapshot {
  currentLatitude?: number | null;
  currentLongitude?: number | null;
  locationAccuracyM?: number | null;
  locationCapturedAt?: Date | string | null;
  locationSource?: string | null;
}

/** Read a stored availability snapshot as a position. */
export function positionOf(s: StaffSnapshot): StaffPosition {
  return {
    latitude: s.currentLatitude ?? null,
    longitude: s.currentLongitude ?? null,
    accuracyM: s.locationAccuracyM ?? null,
    capturedAt: s.locationCapturedAt ?? null,
    source: (s.locationSource as LocationSource | null) ?? null,
  };
}

/** Does this record actually carry a usable position? */
export function hasPosition(p: StaffPosition | null | undefined): boolean {
  return (
    !!p &&
    typeof p.latitude === 'number' &&
    typeof p.longitude === 'number' &&
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    // 0,0 is in the Gulf of Guinea. It is almost always a failed fix rather
    // than a staff member on a boat, and treating it as real puts a marker
    // hundreds of kilometres from the hospital.
    !(p.latitude === 0 && p.longitude === 0)
  );
}

/**
 * Metres between two points, by the haversine formula.
 *
 * Good to a fraction of a percent at hospital-campus distances, which is far
 * beyond what a phone fix justifies anyway.
 */
export function distanceMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Distance for a person to read: metres up close, kilometres beyond that. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${metres} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

export type Freshness = 'LIVE' | 'RECENT' | 'STALE' | 'OLD' | 'UNKNOWN';

/**
 * How much a position is still worth.
 *
 * The thresholds are deliberately short. In a theatre complex somebody moves
 * between rooms in minutes, so a twenty-minute-old position is a hint about
 * where to start looking, not a statement of fact — and the board says so
 * rather than showing every marker with equal confidence.
 */
export function freshnessOf(capturedAt: Date | string | null | undefined, now: Date = new Date()): Freshness {
  if (!capturedAt) return 'UNKNOWN';
  const ageMs = now.getTime() - new Date(capturedAt).getTime();
  if (ageMs < 0) return 'LIVE'; // clock skew on the device; not worth punishing
  const minutes = ageMs / 60_000;
  if (minutes <= 2) return 'LIVE';
  if (minutes <= 15) return 'RECENT';
  if (minutes <= 60) return 'STALE';
  return 'OLD';
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  LIVE: 'Live',
  RECENT: 'Recent',
  STALE: 'Stale',
  OLD: 'Out of date',
  UNKNOWN: 'Never shared',
};

/** "just now", "6 minutes ago", "3 hours ago" — what a board should show. */
export function timeAgo(at: Date | string | null | undefined, now: Date = new Date()): string {
  if (!at) return 'never';
  const ms = now.getTime() - new Date(at).getTime();
  if (ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

export type FixQuality = 'PRECISE' | 'APPROXIMATE' | 'VAGUE' | 'UNUSABLE';

/**
 * How much to trust the fix itself.
 *
 * A phone indoors — which is where hospital staff are — commonly reports
 * hundreds or thousands of metres. Anything beyond about 500m cannot tell one
 * building from another on a hospital campus, and saying so is the whole point.
 */
export function fixQuality(accuracyM: number | null | undefined): FixQuality {
  if (accuracyM == null || !Number.isFinite(accuracyM)) return 'UNUSABLE';
  if (accuracyM <= 25) return 'PRECISE';
  if (accuracyM <= 150) return 'APPROXIMATE';
  if (accuracyM <= 1000) return 'VAGUE';
  return 'UNUSABLE';
}

export const FIX_QUALITY_LABEL: Record<FixQuality, string> = {
  PRECISE: 'Precise',
  APPROXIMATE: 'Approximate',
  VAGUE: 'Rough area only',
  UNUSABLE: 'Too imprecise to place',
};

/**
 * Whether a position should be drawn on a map at all.
 *
 * An unusable fix is better shown as "location shared, but too imprecise to
 * place" than as a confident marker somebody will act on.
 */
export function isMappable(p: StaffPosition): boolean {
  return hasPosition(p) && fixQuality(p.accuracyM) !== 'UNUSABLE';
}

/** A link anyone can open, without this app needing a mapping SDK or a key. */
export function mapLink(p: StaffPosition): string | null {
  if (!hasPosition(p)) return null;
  return `https://www.google.com/maps?q=${p.latitude},${p.longitude}`;
}

// ---------------------------------------------------------------------------
// Finding the nearest
// ---------------------------------------------------------------------------

export interface NearbyStaff<T> {
  staff: T;
  metres: number;
  freshness: Freshness;
  quality: FixQuality;
}

/**
 * Sort staff by distance from a point — the emergency question.
 *
 * Anyone with no usable position is EXCLUDED rather than sorted last: a list
 * that ends with people whose whereabouts are unknown invites somebody to ring
 * the bottom of it believing they are simply far away.
 *
 * Ordering is by distance alone. Freshness and quality travel with each row so
 * the screen can show them, but they are not folded into a score — a single
 * number that blends "close" with "recent" cannot be reasoned about at 3am.
 */
export function nearest<T extends StaffPosition>(
  from: { latitude: number; longitude: number },
  staff: T[],
  opts: { maxMetres?: number; now?: Date } = {}
): NearbyStaff<T>[] {
  const { maxMetres, now = new Date() } = opts;

  return staff
    .filter((s) => isMappable(s))
    .map((s) => ({
      staff: s,
      metres: distanceMetres(from, { latitude: s.latitude as number, longitude: s.longitude as number }),
      freshness: freshnessOf(s.capturedAt, now),
      quality: fixQuality(s.accuracyM),
    }))
    .filter((r) => (maxMetres == null ? true : r.metres <= maxMetres))
    .sort((a, b) => a.metres - b.metres);
}

/**
 * One sentence describing a position, for a board row.
 *
 * States the uncertainty rather than hiding it, because the reader is deciding
 * whether to rely on it.
 */
export function describePosition(p: StaffPosition, now: Date = new Date()): string {
  if (!hasPosition(p)) return 'No location shared';
  const quality = fixQuality(p.accuracyM);
  const when = timeAgo(p.capturedAt, now);
  if (quality === 'UNUSABLE') {
    return `Location shared ${when}, but the fix was too imprecise to place`;
  }
  const within = p.accuracyM ? ` to within ${Math.round(p.accuracyM)} m` : '';
  return `Located${within}, ${when}`;
}
