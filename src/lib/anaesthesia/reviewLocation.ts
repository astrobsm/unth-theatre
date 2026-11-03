// ============================================================
// Where the anaesthetist was when they recorded the review
// ------------------------------------------------------------
// Asked for by the theatre on 3 November, alongside the fix that lets an
// anaesthetist record "the patient was not in the ward". The two belong
// together: once attendance can be claimed without a review attached, the
// claim needs something behind it. A position taken at the moment the record
// is written is that something.
//
// WHAT THIS IS FOR. A pre-operative review is a bedside act. The whole value
// of it — the airway you looked at, the pressure you measured, the consent you
// took — comes from having stood next to the patient. A review entered from a
// car park is not the same thing, and until now nothing in the system could
// tell the two apart. Nor could an anaesthetist who DID walk to the ward and
// found nobody there prove that they went.
//
// IT IS NOT A GATE, and the reason is the same one written into geofence.ts
// and then learned again the hard way on the anaesthesia setup log:
//
//   A ward on the far side of a concrete building, a handset with the radio
//   turned off, a page served over plain http — all three produce "no
//   position". If a missing fix blocked the review, the review would not be
//   entered at all, and we would have traded a record with a gap in it for no
//   record whatsoever. Every one of these functions therefore has an answer
//   for "nothing arrived", and that answer is never "refuse".
//
// IT IS ALSO NOT A VERDICT ON THE PERSON. ON_SITE corroborates; OFF_SITE does
// not refute. Phones are left in changing rooms, borrowed, and wrong. What
// this produces is one line a human reads next to the record, in the knowledge
// that they are reading a machine's guess about a radio signal.
//
// The hospital site is the only geofence available: UNTH Ituku-Ozalla has no
// per-ward coordinates recorded, so "at the ward" cannot be checked and is not
// claimed. What CAN be said is on site or not, and the exact point is kept so
// a human can open it on a map and see which block it was.
// ============================================================

import { assessFix, VERDICT_LABEL, type FixVerdict } from '@/lib/theatreOps/geofence';
import { fixQuality, FIX_QUALITY_LABEL, mapLink, type FixQuality } from '@/lib/staffLocation';

/** A position as a handset reported it, straight off the wire or out of a row. */
export interface ReviewFix {
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  /** Why no position arrived. Only meaningful when there is no fix. */
  unavailableReason?: string | null;
}

export interface ReviewLocationSummary {
  /** True when a usable position arrived at all. */
  hasFix: boolean;
  verdict: FixVerdict;
  /** Metres from the site centre, rounded to 10 m. Null unless placeable. */
  distanceM: number | null;
  quality: FixQuality;
  /** "On site", "Position not confirmed" — what a board shows. */
  label: string;
  /** A link a human can open. Null when there is nothing to open. */
  mapUrl: string | null;
  /**
   * Whether the position supports a claim of having been at the hospital.
   *
   * False is NOT a finding. It is false for a doctor standing in the ward
   * whose phone never got a fix, which is most of them.
   */
  corroborated: boolean;
  /** One sentence, for the record and for a board. */
  sentence: string;
}

/** Trim a reason to something a record can hold without becoming an essay. */
export function tidyReason(reason: string | null | undefined, max = 200): string | null {
  const r = (reason || '').trim();
  if (!r) return null;
  return r.length > max ? `${r.slice(0, max - 1)}…` : r;
}

/**
 * Describe a stored or incoming fix.
 *
 * `what` names the act, so the same function serves a completed review and an
 * attendance where the patient was absent.
 */
export function summariseReviewLocation(
  fix: ReviewFix | null | undefined,
  what = 'This review was recorded',
): ReviewLocationSummary {
  const assessment = assessFix({
    latitude: fix?.latitude ?? null,
    longitude: fix?.longitude ?? null,
    accuracyM: fix?.accuracyM ?? null,
  });
  const quality = fixQuality(fix?.accuracyM ?? null);
  const hasFix = assessment.verdict !== 'NO_FIX';

  const point = { latitude: fix?.latitude ?? null, longitude: fix?.longitude ?? null };
  const url = mapLink(point as never);

  let sentence: string;
  if (!hasFix) {
    const why = tidyReason(fix?.unavailableReason);
    // Said as a fact about the handset, never as a doubt about the doctor.
    sentence = why
      ? `${what} without a position: ${why}.`
      : `${what} without a position from the handset.`;
  } else if (assessment.verdict === 'IMPRECISE') {
    sentence =
      `${what} with a position too vague to place — the handset reported `
      + `±${Math.round(fix?.accuracyM ?? 0)} m, which on this campus cannot tell one `
      + 'building from another.';
  } else if (assessment.verdict === 'ON_SITE') {
    sentence =
      `${what} from inside the hospital site, about ${assessment.distanceM} m from the `
      + 'centre of the campus.';
  } else {
    sentence =
      `${what} from about ${assessment.distanceM} m from the centre of the campus, which `
      + 'is outside the site boundary. A handset left behind or a poor fix reads the same '
      + 'way, so this is a question to ask rather than an answer.';
  }

  return {
    hasFix,
    verdict: assessment.verdict,
    distanceM: assessment.distanceM,
    quality,
    label: VERDICT_LABEL[assessment.verdict],
    mapUrl: url,
    corroborated: assessment.verdict === 'ON_SITE',
    sentence,
  };
}

/**
 * What to store for a fix, having assessed it on the server.
 *
 * The verdict and distance are computed HERE and not taken from the client: a
 * browser that could name its own verdict could claim to have been on site
 * from anywhere, which would make the whole record worthless. The coordinates
 * are stored as sent — unlike the presence check-in, which keeps only the
 * verdict — because the theatre asked to be able to see the point on a map,
 * and a distance from a centre describes a circle rather than a place.
 */
export function fixColumns(fix: ReviewFix | null | undefined): {
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  fixVerdict: FixVerdict;
  distanceM: number | null;
  unavailableReason: string | null;
} {
  const summary = summariseReviewLocation(fix);
  const usable = summary.verdict !== 'NO_FIX';
  return {
    latitude: usable ? (fix?.latitude ?? null) : null,
    longitude: usable ? (fix?.longitude ?? null) : null,
    accuracyM: usable ? (fix?.accuracyM ?? null) : null,
    fixVerdict: summary.verdict,
    distanceM: summary.distanceM,
    // Kept only when there is no position: a reason beside a good fix is
    // leftover state, and it reads as a doubt about a record that is fine.
    unavailableReason: usable ? null : tidyReason(fix?.unavailableReason),
  };
}
