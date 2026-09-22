// ============================================================
// The standards' vocabulary, onto the schema's enums
// ------------------------------------------------------------
// The standard pack library describes items the way a theatre does — blades,
// swabs, drains, haemostatics — and the database stores a narrower enum that
// predates it. Handing an unknown value to Prisma is not a soft failure: the
// whole insert is rejected and the pack request returns a 500, which is exactly
// what happened when the standards first went live.
//
// So the translation lives here, in one place, with a guardrail test that reads
// both enums straight out of schema.prisma. The alternative — flattening the
// library's vocabulary to match the enum — would lose the distinction between a
// drain and a catheter on the pack a provider actually reads.
//
// Anything unrecognised becomes OTHER. A pack line filed under OTHER is still
// picked; a pack that fails to save is not.
// ============================================================

/** Values of SurgicalConsumableCategory in the schema. */
export const CONSUMABLE_CATEGORIES = [
  'GLOVES', 'GOWNS_DRAPES', 'SUTURES', 'SYRINGES_NEEDLES', 'CATHETERS_TUBING',
  'DRESSING_PACKS', 'SKIN_PREP', 'CLEANING_SOLUTION', 'STERILE_DRESSINGS',
  'IRRIGATION', 'DIATHERMY', 'SUCTION', 'ANAESTHESIA_AIRWAY', 'PPE', 'OTHER',
] as const;

export type ConsumableCategory = (typeof CONSUMABLE_CATEGORIES)[number];

/** Values of SurgicalDrugDressingType in the schema. */
export const DRUG_TYPES = [
  'ANTIBIOTIC', 'ANALGESIC', 'ANAESTHETIC_ADJUNCT', 'IV_FLUID',
  'WOUND_DRESSING_AGENT', 'ANTISEPTIC', 'HAEMOSTATIC', 'OTHER',
] as const;

export type DrugType = (typeof DRUG_TYPES)[number];

/**
 * What the library calls a thing, onto what the column accepts.
 *
 * Only the words that differ are listed; anything already valid passes through.
 */
const CONSUMABLE_ALIASES: Record<string, ConsumableCategory> = {
  // A drain is tubing, and the enum has no separate drain category.
  DRAINS: 'CATHETERS_TUBING',
  TUBES_CATHETERS: 'CATHETERS_TUBING',
  // Swabs and abdominal packs are what DRESSING_PACKS covers.
  GAUZE_SWABS: 'DRESSING_PACKS',
  DRESSINGS: 'STERILE_DRESSINGS',
  // No blade or haemostatic category exists for consumables. Bone wax and
  // oxidised cellulose are consumables, not drugs, so they land in OTHER
  // rather than being misfiled as a pharmacy item.
  SURGICAL_BLADES: 'OTHER',
  HAEMOSTATICS: 'OTHER',
};

const DRUG_ALIASES: Record<string, DrugType> = {
  LOCAL_ANAESTHETIC: 'ANAESTHETIC_ADJUNCT',
  ANAESTHETIC: 'ANAESTHETIC_ADJUNCT',
  HAEMOSTATICS: 'HAEMOSTATIC',
};

const isConsumableCategory = (v: string): v is ConsumableCategory =>
  (CONSUMABLE_CATEGORIES as readonly string[]).includes(v);

const isDrugType = (v: string): v is DrugType =>
  (DRUG_TYPES as readonly string[]).includes(v);

export function toConsumableCategory(value: string | null | undefined): ConsumableCategory {
  const v = (value ?? '').trim().toUpperCase();
  if (isConsumableCategory(v)) return v;
  return CONSUMABLE_ALIASES[v] ?? 'OTHER';
}

export function toDrugType(value: string | null | undefined): DrugType {
  const v = (value ?? '').trim().toUpperCase();
  if (isDrugType(v)) return v;
  return DRUG_ALIASES[v] ?? 'OTHER';
}
