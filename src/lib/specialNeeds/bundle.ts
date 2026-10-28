// ============================================================
// What a case gets without anybody choosing it
// ------------------------------------------------------------
// The operative magnitude already decides the base pack. This extends that
// to the staples a case cannot run without — syringes, cannulae, gloves,
// plaster, water for injection — so a scrub nurse is not discovering at
// eight in the morning that nobody ordered a green cannula.
//
// THE BUNDLE IS A FLOOR, NOT A CEILING. Everything here can be removed by
// the surgeon and anything can be added on top. What it must never do is
// silently omit something a case of that size always needs.
//
// Two additions are NOT driven by magnitude, because they follow from
// clinical decisions made elsewhere on the form:
//
//   LOCAL ANAESTHETIC — only when the anaesthesia type is local, and then
//   only the agent the surgeon names. Plain and with-adrenaline are not
//   interchangeable and must never be defaulted or inferred.
//
//   TRANSFUSION ADJUNCTS — only when transfusion is anticipated, and then
//   as a complete set, because the moment they are wanted is the moment
//   nobody has time to send to pharmacy for them.
// ============================================================

import {
  SYRINGES,
  IV_CANNULAE,
  GIVING_SETS,
  PLASTERS,
  GLOVES,
  WATER_FOR_INJECTION,
  TRANSFUSION_ADJUNCTS,
} from './standardCatalogue';

export type Magnitude = 'MINOR' | 'INTERMEDIATE' | 'MAJOR' | 'SUPER_MAJOR';

/** One line of a bundle: what to look up in the catalogue, and how many. */
export type BundleLine = {
  category: string;
  /** Matched against SpecialNeedItem.name exactly. */
  name: string;
  /** Matched against SpecialNeedItem.size exactly when given. */
  size?: string;
  quantity: number;
};

/**
 * Quantities are per case and deliberately modest.
 *
 * Over-issuing is not free: it is stock off the shelf, a bigger deposit for
 * the patient, and items opened then wasted. A surgeon who needs a second
 * one adds it; one that was never ordered cannot be conjured mid-case.
 */
/**
 * How many of each size is carried as standard.
 *
 * Two, of every size, for everything in BUNDLED_CATEGORIES. Not one,
 * because the second is what a dropped or contaminated item is replaced
 * from without sending out of theatre; not more, because every one of
 * these is stock off the shelf and naira on the family's deposit.
 */
export const STANDARD_QUANTITY = 2;

/**
 * The categories a case carries automatically, and which are therefore
 * NOT offered in "Special consumables and drugs".
 *
 * These are the things every operation needs in a range of sizes, and the
 * theatre cannot know in advance which size the scrub nurse will reach
 * for. Asking a surgeon to tick six glove sizes at a booking form is how
 * the wrong one gets ordered; carrying two of each removes the question.
 *
 * Because they always arrive, offering them in the picker as well is a
 * way of ordering them twice.
 */
export const BUNDLED_CATEGORIES = [
  'SYRINGE',
  'IV_CANNULA',
  'GIVING_SET',
  'PLASTER',
  'GLOVES',
  'WATER_FOR_INJECTION',
] as const;

/**
 * Bundled too, but only on a decision made elsewhere on the form, so they
 * are kept out of the picker for the same reason and added by rule.
 *
 *   TRANSFUSION_ADJUNCT — only when transfusion is anticipated.
 *   LOCAL_ANAESTHETIC — only when the anaesthesia type is local, and only
 *   the agent the surgeon names. Plain and with-adrenaline are not
 *   interchangeable and must never be defaulted or inferred.
 */
export const CONDITIONALLY_BUNDLED_CATEGORIES = ['TRANSFUSION_ADJUNCT'] as const;

/** Everything the picker must not offer. */
export const NOT_IN_PICKER: readonly string[] = [
  ...BUNDLED_CATEGORIES,
  ...CONDITIONALLY_BUNDLED_CATEGORIES,
];

/**
 * Built from the standard catalogue rather than retyped.
 *
 * A size added to the catalogue is a size the theatre stocks, and it
 * should start arriving in the pack without anybody remembering to edit a
 * second list here. Retyping these was how the old bundle came to ask for
 * "Syringe 5ml" while the catalogue called it something else.
 */
function twoOfEach(items: { category: string; name: string; size?: string }[]): BundleLine[] {
  return items.map((i) => ({
    category: i.category,
    name: i.name,
    ...(i.size === undefined ? {} : { size: i.size }),
    quantity: STANDARD_QUANTITY,
  }));
}

/**
 * The same for every size of case.
 *
 * Magnitude scales the base theatre pack — gowns, drapes, gauze — which is
 * where the difference between a minor and a major case actually shows. It
 * does NOT scale these: a minor case still needs the range of cannula
 * gauges on the trolley, because which one goes in depends on the patient's
 * veins and not on the size of the operation.
 *
 * Per-magnitude differences are still possible; they are set in Settings,
 * against the theatre's own judgement rather than mine.
 */
const STANDARD_BUNDLE: BundleLine[] = twoOfEach([
  ...SYRINGES,
  ...IV_CANNULAE,
  // The blood giving set is deliberately not here — it belongs with the
  // transfusion set below, which arrives only when blood is anticipated.
  ...GIVING_SETS.filter((g) => !/blood/i.test(g.name)),
  ...PLASTERS,
  ...GLOVES,
  ...WATER_FOR_INJECTION,
]);

const BY_MAGNITUDE: Record<Magnitude, BundleLine[]> = {
  MINOR: STANDARD_BUNDLE,
  INTERMEDIATE: STANDARD_BUNDLE,
  MAJOR: STANDARD_BUNDLE,
  SUPER_MAJOR: STANDARD_BUNDLE,
};


/** Given with blood, so they are ordered with the giving set, not after it. */
const TRANSFUSION_SET: BundleLine[] = twoOfEach([
  ...GIVING_SETS.filter((g) => /blood/i.test(g.name)),
  ...TRANSFUSION_ADJUNCTS,
]);

export interface BundleInput {
  magnitude: string | null | undefined;
  /** Blood Transfusion Required, from the Special Needs section. */
  transfusionAnticipated?: boolean;
  /** The anaesthesia type chosen on the form, e.g. "LOCAL". */
  anaesthesiaType?: string | null;
  /**
   * Which local anaesthetic, exactly as named in the catalogue. Required
   * when the anaesthesia type is local; ignored otherwise.
   */
  localAnaestheticName?: string | null;
  /** Vials. Defaults to one — a surgeon needing more says so. */
  localAnaestheticQuantity?: number;
}

/** Whether the local-anaesthetic question should be put to the surgeon. */
export function needsLocalAnaestheticChoice(anaesthesiaType: string | null | undefined): boolean {
  if (!anaesthesiaType) return false;
  // Matches LOCAL and LOCAL_ANAESTHESIA, and leaves anything containing
  // "local" as part of a longer regional technique name out of it.
  return /^local(_|\s|$)/i.test(anaesthesiaType.trim());
}

/**
 * The lines to add to a case automatically.
 *
 * Returns an empty list for an unrecognised or missing magnitude rather than
 * guessing one. A bundle invented for a case whose size nobody recorded is a
 * pack that may be wrong in either direction, and the booking form already
 * makes magnitude mandatory — so an absence here means something upstream
 * went wrong, and inventing a MINOR bundle would hide it.
 */
export function bundleFor(input: BundleInput): BundleLine[] {
  const magnitude = (input.magnitude ?? '').trim().toUpperCase();
  const base = BY_MAGNITUDE[magnitude as Magnitude];
  if (!base) return [];

  const lines: BundleLine[] = [...base];

  if (input.transfusionAnticipated) lines.push(...TRANSFUSION_SET);

  // Only on an explicit choice. Never a default: the wrong one of these is
  // an ischaemic finger.
  if (needsLocalAnaestheticChoice(input.anaesthesiaType) && input.localAnaestheticName) {
    lines.push({
      category: 'LOCAL_ANAESTHETIC',
      name: input.localAnaestheticName,
      quantity: Math.max(1, input.localAnaestheticQuantity ?? 1),
    });
  }

  return mergeLines(lines);
}

/**
 * Collapse duplicate lines, summing quantities.
 *
 * A major case with transfusion asks for an IV giving set twice over, from
 * two different rules. The store should receive one line for four, not two
 * lines for two, or somebody picks one of them and leaves the other.
 */
export function mergeLines(lines: BundleLine[]): BundleLine[] {
  const byKey = new Map<string, BundleLine>();
  for (const line of lines) {
    const key = `${line.category}\u0000${line.name}\u0000${line.size ?? ''}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      byKey.set(key, { ...line });
    }
  }
  // forEach rather than spreading the iterator: this project targets ES5,
  // where [...map.values()] does not compile (TS2802).
  const out: BundleLine[] = [];
  byKey.forEach((v) => out.push(v));
  return out;
}
