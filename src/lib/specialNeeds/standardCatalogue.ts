// ============================================================
// The standard catalogue
// ------------------------------------------------------------
// WHAT IS IN HERE, AND WHAT IS DELIBERATELY NOT.
//
// Suture gauges, needle geometry, French sizes and tracheostomy sizes are
// international standards. A 3/0 is a 3/0 in Enugu and in Edinburgh, so
// seeding them is safe, and it saves somebody typing several hundred rows
// before the first case can be booked.
//
// BRANDS AND LOCAL AVAILABILITY ARE NOT SEEDED. Which meshes can actually be
// obtained in Nigeria, and which antibiotic brands this pharmacy carries,
// are facts about this hospital that I do not have. Inventing them would put
// plausible-looking products in front of a surgeon choosing what to operate
// with, and a catalogue that lies is worse than one that is short. They come
// in through the admin screen, or through the OTHER path at booking, which
// records them once and shares them with everybody afterwards.
//
// Seeding matches on (category, name, size, brand), so re-running adds what
// is missing and disturbs nothing that is already there.
// ============================================================

export type SeedItem = {
  category:
    | 'SUTURE'
    | 'URETHRAL_CATHETER'
    | 'DRAIN'
    | 'HAEMOSTATIC_AGENT'
    | 'TRACHEOSTOMY_TUBE'
    | 'MESH'
    | 'CHEST_TUBE'
    | 'CHEST_DRAIN_BOTTLE'
    | 'ANTIBIOTIC'
    | 'SYRINGE'
    | 'IV_CANNULA'
    | 'GIVING_SET'
    | 'PLASTER'
    | 'GLOVES'
    | 'WATER_FOR_INJECTION'
    | 'BANDAGE'
    | 'CASTING'
    | 'LOCAL_ANAESTHETIC'
    | 'TRANSFUSION_ADJUNCT'
    | 'OTHER';
  name: string;
  size?: string;
  material?: string;
  needleType?: string;
  needleSize?: string;
  absorbable?: boolean;
  specification?: string;
  dispensedByPharmacy?: boolean;
};

/** Gauges, finest to heaviest, as a surgeon says them. */
export const SUTURE_SIZES = ['6/0', '5/0', '4/0', '3/0', '2/0', '0', '1', '2'] as const;

/** Generic suture materials, grouped by whether the body absorbs them. */
export const SUTURE_MATERIALS: { name: string; material: string; absorbable: boolean }[] = [
  { name: 'Polyglactin (Vicryl-type)', material: 'polyglactin 910', absorbable: true },
  { name: 'Poliglecaprone (Monocryl-type)', material: 'poliglecaprone 25', absorbable: true },
  { name: 'Polydioxanone (PDS-type)', material: 'polydioxanone', absorbable: true },
  { name: 'Chromic catgut', material: 'chromic catgut', absorbable: true },
  { name: 'Plain catgut', material: 'plain catgut', absorbable: true },
  { name: 'Nylon (Ethilon-type)', material: 'polyamide', absorbable: false },
  { name: 'Polypropylene (Prolene-type)', material: 'polypropylene', absorbable: false },
  { name: 'Silk', material: 'silk', absorbable: false },
  { name: 'Polyester (Ethibond-type)', material: 'polyester', absorbable: false },
  { name: 'Stainless steel wire', material: 'stainless steel', absorbable: false },
];

/** Needle point geometry. What it has to pass through decides this. */
export const NEEDLE_TYPES = [
  'Round body',
  'Cutting',
  'Reverse cutting',
  'Taper cut',
  'Blunt point',
  'Straight',
] as const;

/** Curvature and chord length — the two numbers printed on the packet. */
export const NEEDLE_SIZES = [
  '1/4 circle 13mm',
  '3/8 circle 16mm',
  '3/8 circle 19mm',
  '3/8 circle 26mm',
  '3/8 circle 30mm',
  '1/2 circle 20mm',
  '1/2 circle 26mm',
  '1/2 circle 31mm',
  '1/2 circle 36mm',
  '1/2 circle 40mm',
  '5/8 circle 26mm',
] as const;

/** Foley gauges in French. Paediatric sizes are included deliberately. */
export const CATHETER_SIZES_FR = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24] as const;

export const CATHETER_TYPES: { name: string; material: string }[] = [
  { name: 'Foley, all-silicone', material: '100% silicone' },
  { name: 'Foley, silicone-coated latex', material: 'silicone-coated latex' },
  { name: 'Foley, latex', material: 'latex' },
  { name: 'Foley, three-way irrigation', material: 'silicone-coated latex' },
  { name: 'Nelaton intermittent catheter', material: 'PVC' },
];

export const DRAINS: SeedItem[] = [
  { category: 'DRAIN', name: 'Redivac closed suction drain', size: '10Fr' },
  { category: 'DRAIN', name: 'Redivac closed suction drain', size: '12Fr' },
  { category: 'DRAIN', name: 'Redivac closed suction drain', size: '14Fr' },
  { category: 'DRAIN', name: 'Redivac closed suction drain', size: '16Fr' },
  { category: 'DRAIN', name: 'Penrose drain', size: '1/4 inch' },
  { category: 'DRAIN', name: 'Penrose drain', size: '1/2 inch' },
  { category: 'DRAIN', name: 'Penrose drain', size: '1 inch' },
  { category: 'DRAIN', name: 'Corrugated rubber drain' },
  { category: 'DRAIN', name: 'Sump drain' },
  { category: 'DRAIN', name: 'T-tube (biliary)', size: '12Fr' },
  { category: 'DRAIN', name: 'T-tube (biliary)', size: '14Fr' },
  { category: 'DRAIN', name: 'T-tube (biliary)', size: '16Fr' },
];

export const HAEMOSTATIC_AGENTS: SeedItem[] = [
  { category: 'HAEMOSTATIC_AGENT', name: 'Bone wax' },
  { category: 'HAEMOSTATIC_AGENT', name: 'Oxidised regenerated cellulose (Surgicel-type)' },
  { category: 'HAEMOSTATIC_AGENT', name: 'Absorbable gelatin sponge (Gelfoam-type)' },
  { category: 'HAEMOSTATIC_AGENT', name: 'Fibrin sealant', dispensedByPharmacy: true },
  { category: 'HAEMOSTATIC_AGENT', name: 'Topical thrombin', dispensedByPharmacy: true },
  { category: 'HAEMOSTATIC_AGENT', name: 'Tranexamic acid', dispensedByPharmacy: true },
];

/** Shiley-equivalent sizing. Cuffed and uncuffed are separate orders. */
export const TRACHEOSTOMY_SIZES = ['3.0', '4.0', '5.0', '6.0', '7.0', '8.0', '9.0', '10.0'] as const;

export const CHEST_TUBE_SIZES_FR = [8, 12, 16, 20, 24, 28, 32, 36] as const;

export const CHEST_DRAIN_BOTTLES: SeedItem[] = [
  { category: 'CHEST_DRAIN_BOTTLE', name: 'Underwater seal drainage bottle, single chamber' },
  { category: 'CHEST_DRAIN_BOTTLE', name: 'Underwater seal drainage bottle, two chamber' },
  { category: 'CHEST_DRAIN_BOTTLE', name: 'Underwater seal drainage bottle, three chamber' },
  { category: 'CHEST_DRAIN_BOTTLE', name: 'Disposable chest drainage system' },
];

/**
 * Mesh is seeded as TYPES ONLY — no brand, no dimensions.
 *
 * Which products are obtainable here, and in what sizes, is a procurement
 * fact about this hospital. A surgeon who picks a mesh that cannot be got is
 * worse off than one shown a short list and asked to add what they use.
 */
export const MESH_TYPES: SeedItem[] = [
  { category: 'MESH', name: 'Polypropylene mesh, heavyweight', material: 'polypropylene' },
  { category: 'MESH', name: 'Polypropylene mesh, lightweight', material: 'polypropylene' },
  { category: 'MESH', name: 'Composite mesh (intraperitoneal)', material: 'polypropylene/PTFE' },
  { category: 'MESH', name: 'Biological mesh', material: 'acellular dermal matrix' },
];

// ── Theatre staples ────────────────────────────────────────────────────────
// Bundled by operative magnitude rather than chosen case by case, but still
// countable items the store issues and bills, so they belong in the same
// catalogue as everything else.

export const SYRINGES: SeedItem[] = [
  { category: 'SYRINGE', name: 'Syringe', size: '2ml' },
  { category: 'SYRINGE', name: 'Syringe', size: '5ml' },
  { category: 'SYRINGE', name: 'Syringe', size: '10ml' },
  { category: 'SYRINGE', name: 'Syringe', size: '20ml' },
  { category: 'SYRINGE', name: 'Syringe', size: '50ml' },
  { category: 'SYRINGE', name: 'Insulin syringe', size: '1ml' },
];

/** Colour is how theatre asks for these, so it is part of the name. */
export const IV_CANNULAE: SeedItem[] = [
  { category: 'IV_CANNULA', name: 'IV cannula, orange', size: '14G' },
  { category: 'IV_CANNULA', name: 'IV cannula, grey', size: '16G' },
  { category: 'IV_CANNULA', name: 'IV cannula, green', size: '18G' },
  { category: 'IV_CANNULA', name: 'IV cannula, pink', size: '20G' },
  { category: 'IV_CANNULA', name: 'IV cannula, blue', size: '22G' },
  { category: 'IV_CANNULA', name: 'IV cannula, yellow', size: '24G' },
];

export const GIVING_SETS: SeedItem[] = [
  { category: 'GIVING_SET', name: 'IV giving set' },
  { category: 'GIVING_SET', name: 'Blood giving set (with filter)' },
  { category: 'GIVING_SET', name: 'Burette / paediatric giving set' },
];

export const PLASTERS: SeedItem[] = [
  { category: 'PLASTER', name: 'Adhesive plaster, small' },
  { category: 'PLASTER', name: 'Adhesive plaster, medium' },
  { category: 'PLASTER', name: 'Adhesive plaster, large' },
  { category: 'PLASTER', name: 'Micropore tape' },
  { category: 'PLASTER', name: 'Zinc oxide strapping' },
];

export const GLOVES: SeedItem[] = [
  { category: 'GLOVES', name: 'Surgical glove, sterile', size: '6.0' },
  { category: 'GLOVES', name: 'Surgical glove, sterile', size: '6.5' },
  { category: 'GLOVES', name: 'Surgical glove, sterile', size: '7.0' },
  { category: 'GLOVES', name: 'Surgical glove, sterile', size: '7.5' },
  { category: 'GLOVES', name: 'Surgical glove, sterile', size: '8.0' },
  { category: 'GLOVES', name: 'Surgical glove, sterile', size: '8.5' },
  { category: 'GLOVES', name: 'Procedure glove, latex', size: 'Small' },
  { category: 'GLOVES', name: 'Procedure glove, latex', size: 'Medium' },
  { category: 'GLOVES', name: 'Procedure glove, latex', size: 'Large' },
  { category: 'GLOVES', name: 'Elbow-length glove, sterile', size: '7.0' },
  { category: 'GLOVES', name: 'Elbow-length glove, sterile', size: '7.5' },
  { category: 'GLOVES', name: 'Elbow-length glove, sterile', size: '8.0' },
];

export const WATER_FOR_INJECTION: SeedItem[] = [
  { category: 'WATER_FOR_INJECTION', name: 'Water for injection', size: '10ml', dispensedByPharmacy: true },
  { category: 'WATER_FOR_INJECTION', name: 'Water for injection', size: '20ml', dispensedByPharmacy: true },
];

// ── Chosen per case, not bundled ───────────────────────────────────────────

export const BANDAGES: SeedItem[] = [
  { category: 'BANDAGE', name: 'Crepe bandage', size: '4 inch' },
  { category: 'BANDAGE', name: 'Crepe bandage', size: '6 inch' },
  { category: 'BANDAGE', name: 'Crepe bandage', size: '8 inch' },
  { category: 'BANDAGE', name: 'Velband / soft band undercast padding', size: '4 inch' },
  { category: 'BANDAGE', name: 'Velband / soft band undercast padding', size: '6 inch' },
  { category: 'BANDAGE', name: 'Gauze roller bandage', size: '4 inch' },
  { category: 'BANDAGE', name: 'Elastic adhesive bandage', size: '6 inch' },
];

export const CASTING: SeedItem[] = [
  { category: 'CASTING', name: 'Plaster of Paris bandage', size: '4 inch' },
  { category: 'CASTING', name: 'Plaster of Paris bandage', size: '6 inch' },
  { category: 'CASTING', name: 'Plaster of Paris bandage', size: '8 inch' },
  { category: 'CASTING', name: 'Scotchcast synthetic casting tape', size: '3 inch' },
  { category: 'CASTING', name: 'Scotchcast synthetic casting tape', size: '4 inch' },
  { category: 'CASTING', name: 'Scotchcast synthetic casting tape', size: '5 inch' },
  { category: 'CASTING', name: 'Stockinette', size: '4 inch' },
];

/**
 * Local anaesthetic agents.
 *
 * PLAIN AND WITH-ADRENALINE ARE NOT INTERCHANGEABLE. Adrenaline must not go
 * near a digit, the nose, an ear or the penis. So this is a choice the
 * surgeon makes deliberately and the pharmacy dispenses exactly — never a
 * default, never substituted, and never inferred from the procedure.
 */
export const LOCAL_ANAESTHETICS: SeedItem[] = [
  { category: 'LOCAL_ANAESTHETIC', name: 'Lignocaine (xylocaine) plain 1%', size: '20ml vial', dispensedByPharmacy: true },
  { category: 'LOCAL_ANAESTHETIC', name: 'Lignocaine (xylocaine) plain 2%', size: '20ml vial', dispensedByPharmacy: true },
  { category: 'LOCAL_ANAESTHETIC', name: 'Lignocaine (xylocaine) with adrenaline 1:200,000, 1%', size: '20ml vial', dispensedByPharmacy: true },
  { category: 'LOCAL_ANAESTHETIC', name: 'Lignocaine (xylocaine) with adrenaline 1:200,000, 2%', size: '20ml vial', dispensedByPharmacy: true },
  { category: 'LOCAL_ANAESTHETIC', name: 'Bupivacaine plain 0.5%', size: '20ml vial', dispensedByPharmacy: true },
  { category: 'LOCAL_ANAESTHETIC', name: 'Bupivacaine with adrenaline 0.5%', size: '20ml vial', dispensedByPharmacy: true },
];

/**
 * What must be on the trolley before blood is given.
 *
 * Added as a set when transfusion is anticipated, because the moment they
 * are needed is the moment nobody has time to send to pharmacy.
 */
export const TRANSFUSION_ADJUNCTS: SeedItem[] = [
  { category: 'TRANSFUSION_ADJUNCT', name: 'Hydrocortisone injection 100mg', dispensedByPharmacy: true },
  { category: 'TRANSFUSION_ADJUNCT', name: 'Calcium gluconate 10% injection', size: '10ml', dispensedByPharmacy: true },
  { category: 'TRANSFUSION_ADJUNCT', name: 'Promethazine injection 25mg', dispensedByPharmacy: true },
  { category: 'TRANSFUSION_ADJUNCT', name: 'Frusemide injection 40mg', dispensedByPharmacy: true },
];

/** Everything above, flattened into the rows to seed. */
export function standardCatalogue(): SeedItem[] {
  const items: SeedItem[] = [];

  // Sutures: material by gauge. Needle geometry is chosen per case at
  // booking rather than multiplied in here — 10 materials x 8 gauges x 6
  // needle types x 11 needle sizes is over five thousand rows, and a list
  // that long is one nobody can scroll.
  for (const m of SUTURE_MATERIALS) {
    for (const size of SUTURE_SIZES) {
      items.push({
        category: 'SUTURE',
        name: m.name,
        size,
        material: m.material,
        absorbable: m.absorbable,
      });
    }
  }

  for (const t of CATHETER_TYPES) {
    for (const fr of CATHETER_SIZES_FR) {
      items.push({
        category: 'URETHRAL_CATHETER',
        name: t.name,
        size: `${fr}Fr`,
        material: t.material,
      });
    }
  }

  items.push(
    ...DRAINS,
    ...HAEMOSTATIC_AGENTS,
    ...CHEST_DRAIN_BOTTLES,
    ...MESH_TYPES,
    ...SYRINGES,
    ...IV_CANNULAE,
    ...GIVING_SETS,
    ...PLASTERS,
    ...GLOVES,
    ...WATER_FOR_INJECTION,
    ...BANDAGES,
    ...CASTING,
    ...LOCAL_ANAESTHETICS,
    ...TRANSFUSION_ADJUNCTS,
  );

  for (const size of TRACHEOSTOMY_SIZES) {
    items.push({ category: 'TRACHEOSTOMY_TUBE', name: 'Tracheostomy tube, cuffed', size });
    items.push({ category: 'TRACHEOSTOMY_TUBE', name: 'Tracheostomy tube, uncuffed', size });
  }

  for (const fr of CHEST_TUBE_SIZES_FR) {
    items.push({ category: 'CHEST_TUBE', name: 'Chest tube (intercostal drain)', size: `${fr}Fr` });
  }

  return items;
}
