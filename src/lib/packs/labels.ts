/**
 * A pack list, in the order a theatre reads it.
 *
 * WHY GROUPING IS NOT COSMETIC. A composed pack runs to forty or more lines,
 * and as one flat column it is read by scrolling: to answer "did anyone order
 * sutures?" somebody reads every line. Asked for directly — "organised in
 * categories eg sutures, infusions, so it is easy to open and edit after
 * booking". The sections are what make a missing one visible, because an
 * absent heading is noticed where an absent line in a list of forty is not.
 *
 * THE ONE RULE THAT MATTERS: GROUPING MUST NEVER LOSE A LINE. The category is
 * a column on the row, filled by a booking form, a standards library with a
 * wider vocabulary than the enum, and a backfill script. A value none of them
 * agreed on — or a null — must still be shown, under Other. A list that
 * silently drops a line it cannot classify is worse than an ungrouped one: the
 * item was ordered, somebody is counting on it, and nobody can see it is gone.
 * groupPackLines() therefore has no path that discards an input.
 *
 * The enum values themselves are the schema's and are not renamed here. These
 * are only the words shown to a person: GOWNS_DRAPES is a database value,
 * "Gowns & drapes" is what a scrub nurse reads.
 */

import {
  CONSUMABLE_CATEGORIES,
  DRUG_TYPES,
  type ConsumableCategory,
  type DrugType,
} from './enums';

/** What a scrub nurse calls each consumable category. */
export const CONSUMABLE_CATEGORY_LABEL: Record<ConsumableCategory, string> = {
  GOWNS_DRAPES: 'Gowns & drapes',
  GLOVES: 'Gloves',
  PPE: 'PPE',
  SKIN_PREP: 'Skin prep & antiseptics',
  SUTURES: 'Sutures',
  STERILE_DRESSINGS: 'Swabs & dressings',
  DRESSING_PACKS: 'Dressing packs',
  SYRINGES_NEEDLES: 'Syringes & needles',
  CATHETERS_TUBING: 'Catheters, drains & tubing',
  IRRIGATION: 'Irrigation',
  DIATHERMY: 'Diathermy',
  SUCTION: 'Suction',
  ANAESTHESIA_AIRWAY: 'Airway & anaesthesia',
  CLEANING_SOLUTION: 'Cleaning solutions',
  OTHER: 'Other',
};

/** What a pharmacist calls each pharmacy line. */
export const DRUG_TYPE_LABEL: Record<DrugType, string> = {
  ANTIBIOTIC: 'Antibiotics',
  ANALGESIC: 'Analgesics',
  ANAESTHETIC_ADJUNCT: 'Anaesthetic adjuncts',
  // Named for what the theatre asks for. "IV fluid" is the column; "infusions"
  // is the word used at the bedside, and it was the word in the request.
  IV_FLUID: 'Infusions & IV fluids',
  HAEMOSTATIC: 'Haemostatics',
  ANTISEPTIC: 'Antiseptics',
  WOUND_DRESSING_AGENT: 'Wound dressing agents',
  OTHER: 'Other',
};

/**
 * Reading order, which is the order a trolley is laid out — not alphabetical.
 *
 * What you gown and glove in first, then what prepares the skin, then what
 * closes, then the apparatus. OTHER is last everywhere: it is the bucket, and
 * a bucket at the top makes a list look like it has no structure.
 */
export const CONSUMABLE_CATEGORY_ORDER: ConsumableCategory[] = [
  'GOWNS_DRAPES',
  'GLOVES',
  'PPE',
  'SKIN_PREP',
  'SUTURES',
  'STERILE_DRESSINGS',
  'DRESSING_PACKS',
  'SYRINGES_NEEDLES',
  'CATHETERS_TUBING',
  'IRRIGATION',
  'DIATHERMY',
  'SUCTION',
  'ANAESTHESIA_AIRWAY',
  'CLEANING_SOLUTION',
  'OTHER',
];

export const DRUG_TYPE_ORDER: DrugType[] = [
  'ANTIBIOTIC',
  'ANALGESIC',
  'ANAESTHETIC_ADJUNCT',
  'IV_FLUID',
  'HAEMOSTATIC',
  'ANTISEPTIC',
  'WOUND_DRESSING_AGENT',
  'OTHER',
];

/** The dropdown offered when somebody adds a line, in the same order. */
export const CONSUMABLE_CATEGORY_OPTIONS = CONSUMABLE_CATEGORY_ORDER.map((value) => ({
  value,
  label: CONSUMABLE_CATEGORY_LABEL[value],
}));

export const DRUG_TYPE_OPTIONS = DRUG_TYPE_ORDER.map((value) => ({
  value,
  label: DRUG_TYPE_LABEL[value],
}));

export interface PackSection<T> {
  key: string;
  label: string;
  lines: T[];
}

/**
 * Split a list into its sections, in `order`, dropping the empty ones.
 *
 * Anything whose key is not in `order` — a null, a blank, a value from an
 * older deployment, a category the standards library knows and the enum does
 * not — lands in the last bucket rather than disappearing. `order` must
 * therefore end with the bucket, which both exported orders do.
 */
export function groupPackLines<T>(
  lines: T[],
  keyOf: (line: T) => string | null | undefined,
  order: readonly string[],
  labelOf: (key: string) => string,
): PackSection<T>[] {
  const bucket = order[order.length - 1];
  const byKey = new Map<string, T[]>();
  for (const line of lines) {
    const raw = String(keyOf(line) ?? '').trim().toUpperCase();
    const k = order.includes(raw) ? raw : bucket;
    const got = byKey.get(k);
    if (got) got.push(line);
    else byKey.set(k, [line]);
  }
  return order
    .filter((k) => byKey.has(k))
    .map((k) => ({ key: k, label: labelOf(k), lines: byKey.get(k) as T[] }));
}

/** The sections of a consumable list. */
export function groupConsumables<T extends { category?: string | null }>(lines: T[]) {
  return groupPackLines(
    lines,
    (l) => l.category,
    CONSUMABLE_CATEGORY_ORDER,
    (k) => CONSUMABLE_CATEGORY_LABEL[k as ConsumableCategory] ?? 'Other',
  );
}

/** The sections of a pharmacy list. */
export function groupPharmacy<T extends { type?: string | null }>(lines: T[]) {
  return groupPackLines(
    lines,
    (l) => l.type,
    DRUG_TYPE_ORDER,
    (k) => DRUG_TYPE_LABEL[k as DrugType] ?? 'Other',
  );
}

/** Guardrail: every schema value must have a label and a place in the order. */
export const ALL_CONSUMABLE_CATEGORIES = CONSUMABLE_CATEGORIES;
export const ALL_DRUG_TYPES = DRUG_TYPES;
