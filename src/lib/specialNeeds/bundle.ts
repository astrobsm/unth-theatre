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
const MINOR: BundleLine[] = [
  { category: 'GLOVES', name: 'Surgical glove, sterile', size: '7.5', quantity: 2 },
  { category: 'GLOVES', name: 'Procedure glove, latex', size: 'Medium', quantity: 4 },
  { category: 'SYRINGE', name: 'Syringe', size: '5ml', quantity: 2 },
  { category: 'SYRINGE', name: 'Syringe', size: '10ml', quantity: 1 },
  { category: 'IV_CANNULA', name: 'IV cannula, pink', size: '20G', quantity: 1 },
  { category: 'GIVING_SET', name: 'IV giving set', quantity: 1 },
  { category: 'PLASTER', name: 'Adhesive plaster, small', quantity: 1 },
  { category: 'WATER_FOR_INJECTION', name: 'Water for injection', size: '10ml', quantity: 2 },
];

const INTERMEDIATE: BundleLine[] = [
  { category: 'GLOVES', name: 'Surgical glove, sterile', size: '7.5', quantity: 4 },
  { category: 'GLOVES', name: 'Procedure glove, latex', size: 'Medium', quantity: 6 },
  { category: 'SYRINGE', name: 'Syringe', size: '5ml', quantity: 4 },
  { category: 'SYRINGE', name: 'Syringe', size: '10ml', quantity: 2 },
  { category: 'SYRINGE', name: 'Syringe', size: '20ml', quantity: 1 },
  { category: 'IV_CANNULA', name: 'IV cannula, green', size: '18G', quantity: 2 },
  { category: 'GIVING_SET', name: 'IV giving set', quantity: 2 },
  { category: 'PLASTER', name: 'Adhesive plaster, medium', quantity: 1 },
  { category: 'PLASTER', name: 'Micropore tape', quantity: 1 },
  { category: 'WATER_FOR_INJECTION', name: 'Water for injection', size: '10ml', quantity: 4 },
];

const MAJOR: BundleLine[] = [
  { category: 'GLOVES', name: 'Surgical glove, sterile', size: '7.5', quantity: 6 },
  { category: 'GLOVES', name: 'Procedure glove, latex', size: 'Medium', quantity: 10 },
  { category: 'SYRINGE', name: 'Syringe', size: '5ml', quantity: 6 },
  { category: 'SYRINGE', name: 'Syringe', size: '10ml', quantity: 4 },
  { category: 'SYRINGE', name: 'Syringe', size: '20ml', quantity: 2 },
  { category: 'SYRINGE', name: 'Syringe', size: '50ml', quantity: 1 },
  // Two large-bore cannulae as standard for a major case: one is access,
  // two is access that survives losing one.
  { category: 'IV_CANNULA', name: 'IV cannula, grey', size: '16G', quantity: 2 },
  { category: 'IV_CANNULA', name: 'IV cannula, green', size: '18G', quantity: 2 },
  { category: 'GIVING_SET', name: 'IV giving set', quantity: 2 },
  { category: 'PLASTER', name: 'Adhesive plaster, large', quantity: 1 },
  { category: 'PLASTER', name: 'Micropore tape', quantity: 2 },
  { category: 'WATER_FOR_INJECTION', name: 'Water for injection', size: '20ml', quantity: 4 },
];

/**
 * Super major: quantities scaled up from MAJOR, and nothing else.
 *
 * DELIBERATELY NOT A LONGER CLINICAL LIST. A case over four hours with
 * heavy blood loss plausibly wants a urinary catheter and central access
 * as standard, but that is this hospital's judgement to record, not mine
 * to invent — the same reason the standard catalogue seeds no brands. The
 * editor in Settings exists so the theatre can add them and have it stick.
 *
 * What IS justified without asking anyone is more of what a major case
 * already carries: a longer operation uses more gloves, more syringes and
 * more fluid, and a third large-bore cannula is access that survives
 * losing two.
 */
const SUPER_MAJOR: BundleLine[] = [
  { category: 'GLOVES', name: 'Surgical glove, sterile', size: '7.5', quantity: 10 },
  { category: 'GLOVES', name: 'Procedure glove, latex', size: 'Medium', quantity: 16 },
  { category: 'SYRINGE', name: 'Syringe', size: '5ml', quantity: 10 },
  { category: 'SYRINGE', name: 'Syringe', size: '10ml', quantity: 6 },
  { category: 'SYRINGE', name: 'Syringe', size: '20ml', quantity: 4 },
  { category: 'SYRINGE', name: 'Syringe', size: '50ml', quantity: 2 },
  { category: 'IV_CANNULA', name: 'IV cannula, grey', size: '16G', quantity: 3 },
  { category: 'IV_CANNULA', name: 'IV cannula, green', size: '18G', quantity: 2 },
  { category: 'GIVING_SET', name: 'IV giving set', quantity: 3 },
  { category: 'PLASTER', name: 'Adhesive plaster, large', quantity: 2 },
  { category: 'PLASTER', name: 'Micropore tape', quantity: 3 },
  { category: 'WATER_FOR_INJECTION', name: 'Water for injection', size: '20ml', quantity: 6 },
];

const BY_MAGNITUDE: Record<Magnitude, BundleLine[]> = {
  MINOR,
  INTERMEDIATE,
  MAJOR,
  SUPER_MAJOR,
};

/** Given with blood, so they are ordered with the giving set, not after it. */
const TRANSFUSION_SET: BundleLine[] = [
  { category: 'GIVING_SET', name: 'Blood giving set (with filter)', quantity: 2 },
  { category: 'TRANSFUSION_ADJUNCT', name: 'Hydrocortisone injection 100mg', quantity: 1 },
  { category: 'TRANSFUSION_ADJUNCT', name: 'Calcium gluconate 10% injection', size: '10ml', quantity: 1 },
  { category: 'TRANSFUSION_ADJUNCT', name: 'Promethazine injection 25mg', quantity: 1 },
  { category: 'TRANSFUSION_ADJUNCT', name: 'Frusemide injection 40mg', quantity: 1 },
];

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
