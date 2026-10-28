// ============================================================
// Which categories the booking form offers
// ------------------------------------------------------------
// In its own module, away from the component, so the rule that a
// bundled category is never also pickable can be tested. Importing a
// .tsx component into a lib test does not parse.
// ============================================================

/**
 * The categories a surgeon chooses from, case by case.
 *
 * SYRINGES, IV CANNULAE, GIVING SETS, PLASTER, GLOVES AND WATER FOR
 * INJECTION ARE NOT HERE. Every case carries two of every size of those
 * automatically, so offering them here as well is a way of ordering them
 * twice — once in the pack and once on top, charged to the patient both
 * times. Transfusion adjuncts are not here either: they arrive as a set
 * when "Blood Transfusion Required" is ticked in Special Needs, which is
 * the moment they are actually decided.
 *
 * What is left is what genuinely varies with the operation: which suture,
 * which catheter, which drain, which mesh.
 */
export const CATEGORY_LABELS: { key: string; label: string }[] = [
  { key: 'SUTURE', label: 'Sutures' },
  { key: 'URETHRAL_CATHETER', label: 'Urethral catheters' },
  { key: 'DRAIN', label: 'Drains' },
  { key: 'CHEST_TUBE', label: 'Chest tubes' },
  { key: 'CHEST_DRAIN_BOTTLE', label: 'Chest drain bottles' },
  { key: 'MESH', label: 'Mesh' },
  { key: 'TRACHEOSTOMY_TUBE', label: 'Tracheostomy tubes' },
  { key: 'HAEMOSTATIC_AGENT', label: 'Haemostatic agents' },
  { key: 'BANDAGE', label: 'Bandages' },
  { key: 'CASTING', label: 'Casting (POP, Scotchcast)' },
  { key: 'ANTIBIOTIC', label: 'Antibiotics' },
  { key: 'LOCAL_ANAESTHETIC', label: 'Local anaesthetic' },
  { key: 'OTHER', label: 'Other' },
];
