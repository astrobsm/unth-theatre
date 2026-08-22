// ============================================================
// Validating a check-in against the hospital site
// ------------------------------------------------------------
// A team member confirming they are present sends a position with it. The
// operational question that position answers is "are you here?" — not "where
// exactly are you?".
//
// So the fix is checked against the site and then THROWN AWAY. What is stored
// is the verdict and a distance. A distance from a known centre describes a
// circle, not a point; it tells the coordinator that someone is twenty minutes
// out without recording which house they are standing in. Everything a theatre
// needs, nothing it does not.
//
// The check is also NOT a gate. A scrub nurse standing in a windowless theatre
// with no satellite fix must still be able to say she is present. A verdict of
// "position not confirmed" is information; refusing her check-in would be an
// obstruction, and she would work around it by not checking in at all.
// ============================================================

import { FACILITY_COORDS } from '@/lib/constants';
import { distanceMetres } from '@/lib/staffLocation';

/**
 * UNTH Ituku-Ozalla, approximate centre. The same coordinates the emergency
 * team-availability route has used since before this module existed — one
 * hospital, one set of numbers.
 *
 * Overridable per deployment, because a second site should not need a code
 * change to work.
 */
export const HOSPITAL_CENTRE = {
  // Defaults come from FACILITY_COORDS so there is ONE measured position for
  // this hospital. There used to be three — 6.4025/7.5103 here, 6.4041/7.5199
  // in constants, 6.3936/7.5078 in team-availability — disagreeing with each
  // other by more than a kilometre and with the theatre complex by thirteen.
  latitude: Number(process.env.NEXT_PUBLIC_HOSPITAL_LAT ?? FACILITY_COORDS.latitude),
  longitude: Number(process.env.NEXT_PUBLIC_HOSPITAL_LNG ?? FACILITY_COORDS.longitude),
};

/**
 * How far from the centre still counts as "on site".
 *
 * UNTH Ituku-Ozalla is a large campus — wards, theatres, car parks and the
 * gate are spread over the better part of a kilometre. A radius that hugged
 * the theatre block would report half the staff who are demonstrably at work
 * as off site, and a board that is wrong about people at work is worse than no
 * board.
 */
export const SITE_RADIUS_METRES = Number(process.env.HOSPITAL_SITE_RADIUS_M ?? 900);

/**
 * A fix this vague cannot place anyone. Phone network positioning indoors is
 * routinely accurate to a kilometre or worse, and treating that as a location
 * would put staff on either side of the fence at random.
 */
export const MAX_USABLE_ACCURACY_METRES = 500;

export type FixVerdict =
  /** The device places them inside the site. */
  | 'ON_SITE'
  /** The device places them outside it. */
  | 'OFF_SITE'
  /** A fix arrived but is too vague to place anyone. */
  | 'IMPRECISE'
  /** No usable fix. Not a judgement about the person. */
  | 'NO_FIX';

export interface FixAssessment {
  verdict: FixVerdict;
  /** Metres from the site centre, rounded to 10 m. Null unless placeable. */
  distanceM: number | null;
  /** What a board should show beside the name. */
  label: string;
}

export const VERDICT_LABEL: Record<FixVerdict, string> = {
  ON_SITE: 'On site',
  OFF_SITE: 'Off site',
  IMPRECISE: 'Position unclear',
  NO_FIX: 'Position not confirmed',
};

export interface RawFix {
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
}

/** Round to the nearest 10 m. The extra digits are noise, and they identify. */
function coarse(metres: number): number {
  return Math.round(metres / 10) * 10;
}

/**
 * Assess a device fix against the hospital site.
 *
 * Deliberately returns no coordinates. Callers store what comes back; the
 * position they passed in is not theirs to keep.
 */
export function assessFix(fix: RawFix | null | undefined): FixAssessment {
  const lat = fix?.latitude;
  const lng = fix?.longitude;

  const usable =
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    // 0,0 is in the Gulf of Guinea — a failed fix, not a staff member at sea.
    !(lat === 0 && lng === 0);

  if (!usable) return { verdict: 'NO_FIX', distanceM: null, label: VERDICT_LABEL.NO_FIX };

  const accuracy = fix?.accuracyM;
  if (typeof accuracy === 'number' && accuracy > MAX_USABLE_ACCURACY_METRES) {
    return { verdict: 'IMPRECISE', distanceM: null, label: VERDICT_LABEL.IMPRECISE };
  }

  const metres = distanceMetres(
    { latitude: lat, longitude: lng },
    { latitude: HOSPITAL_CENTRE.latitude, longitude: HOSPITAL_CENTRE.longitude }
  );

  const verdict: FixVerdict = metres <= SITE_RADIUS_METRES ? 'ON_SITE' : 'OFF_SITE';
  return { verdict, distanceM: coarse(metres), label: VERDICT_LABEL[verdict] };
}

/**
 * Whether a claim of being present is supported by the device.
 *
 * Note what this is NOT: a contradiction is not a lie. A phone with no fix, a
 * theatre with thick walls and a staff member who left their phone in the
 * changing room all produce the same answer. The board shows the verdict and
 * lets a coordinator draw their own conclusion, which is the only honest thing
 * software can do with it.
 */
export function corroboratesPresence(verdict: FixVerdict): boolean {
  return verdict === 'ON_SITE';
}
