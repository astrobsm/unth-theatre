// ============================================================
// The words the post-operative note is allowed to use
// ------------------------------------------------------------
// Every structured field in the operation note draws its options from here.
//
// WHY A TYPESCRIPT MODULE AND NOT DATABASE ENUMS. The obvious thing is a
// Postgres enum per list, and it is wrong for this feature. The requirement is
// that a new procedure template can be added WITHOUT rewriting the
// application, and a hard enum makes every new option a migration applied to
// two databases that are not always in step. A theatre that has started using
// a different preparation solution should not need a deployment to record it.
//
// So the stored type is TEXT (and TEXT[] for the multi-selects), the catalogue
// lives here, and the API validates against it. That gives the same protection
// against typos — 'Cetrimide' and 'cetrimide' cannot both get in — without
// making the catalogue a schema change. The cost is that the database will not
// refuse an unknown value written by something that bypasses the API; the sync
// layer is the only such writer, and it carries values that were validated on
// the node that produced them.
//
// VALUES ARE STABLE, LABELS ARE NOT. The value is what is stored and what every
// later analysis groups by; changing one silently splits a series in two. The
// label is display only and can be reworded freely.
// ============================================================

export interface Option {
  /** Stored. Never change one of these without a data migration. */
  value: string;
  /** Displayed. Safe to reword. */
  label: string;
  /** A smaller line under the label, where a choice needs explaining. */
  hint?: string;
}

const opts = (...pairs: ([string, string] | [string, string, string])[]): Option[] =>
  pairs.map(([value, label, hint]) => (hint ? { value, label, hint } : { value, label }));

/** Appended to lists that must always admit something nobody thought of. */
export const OTHER: Option = { value: 'OTHER', label: 'Other — specify' };

// ---------------------------------------------------------------------------
// Positioning
// ---------------------------------------------------------------------------

/**
 * Operative positions. Multi-select, because a patient repositioned mid-case
 * was in both positions, and a note recording only one is wrong about the case
 * — which matters for pressure-injury review more than for anything else.
 */
export const OPERATIVE_POSITIONS: Option[] = opts(
  ['SUPINE', 'Supine'],
  ['PRONE', 'Prone'],
  ['LATERAL_RIGHT', 'Right lateral'],
  ['LATERAL_LEFT', 'Left lateral'],
  ['LATERAL', 'Lateral (side not specified)'],
  ['LITHOTOMY', 'Lithotomy'],
  ['LITHOTOMY_MODIFIED', 'Modified lithotomy'],
  ['SITTING', 'Sitting'],
  ['SEMI_SITTING', 'Semi-sitting'],
  ['FOWLER', 'Fowler'],
  ['SEMI_FOWLER', 'Semi-Fowler'],
  ['TRENDELENBURG', 'Trendelenburg'],
  ['REVERSE_TRENDELENBURG', 'Reverse Trendelenburg'],
  ['JACKKNIFE', 'Jackknife'],
  ['KNEE_CHEST', 'Knee-chest'],
  ['BEACH_CHAIR', 'Beach-chair'],
  ['HEAD_UP', 'Head-up'],
  ['HEAD_DOWN', 'Head-down'],
).concat(OTHER);

/** Where the patient is nursed afterwards. Single choice. */
export const WARD_POSITIONS: Option[] = opts(
  ['SUPINE', 'Supine'],
  ['HEAD_UP', 'Head-up'],
  ['HEAD_DOWN', 'Head-down'],
  ['SEMI_FOWLER', 'Semi-Fowler'],
  ['FOWLER', 'Fowler'],
  ['PRONE', 'Prone'],
  ['LATERAL_RIGHT', 'Right lateral'],
  ['LATERAL_LEFT', 'Left lateral'],
).concat(OTHER);

/**
 * Restrictions on how the patient may lie. These are the instructions that
 * decide whether a flap survives the night, and burying them in a paragraph is
 * how they get missed on a busy ward.
 */
export const POSITION_RESTRICTIONS: Option[] = opts(
  ['NOT_ON_OPERATIVE_SITE', 'Do not lie on the operative site'],
  ['NOT_ON_FLAP', 'Do not lie on the flap'],
  ['NO_PRESSURE_ON_GRAFT', 'Avoid pressure on the graft'],
  ['NO_PRESSURE_ON_PEDICLE', 'Avoid pressure on the pedicle'],
  ['LIMB_ELEVATED', 'Keep the limb elevated'],
  ['LIMB_DEPENDENT', 'Keep the limb dependent'],
  ['NO_HIP_FLEXION', 'Avoid hip flexion'],
  ['NO_NECK_FLEXION', 'Avoid neck flexion'],
  ['LOG_ROLL_ONLY', 'Log-roll only'],
).concat(OTHER);

// ---------------------------------------------------------------------------
// Skin preparation
// ---------------------------------------------------------------------------

/**
 * Whether hair was removed at all.
 *
 * Three states, not two. NOT_RECORDED is what a note holds before anybody has
 * answered, and it must not be confused with NOT_PERFORMED — the difference
 * between "nobody shaved this patient" and "nobody wrote it down" is the whole
 * value of asking the question.
 */
export const HAIR_REMOVAL_STATUS: Option[] = opts(
  ['NOT_RECORDED', 'Not recorded'],
  ['NOT_PERFORMED', 'Not performed'],
  ['PERFORMED', 'Performed'],
);

export const HAIR_REMOVAL_METHODS: Option[] = opts(
  ['CLIPPER', 'Clipper'],
  ['RAZOR', 'Razor'],
  ['DEPILATORY', 'Depilatory cream'],
).concat(OTHER);

/**
 * Preparation agents.
 *
 * NOTHING HERE RANKS THEM. The system records what was used and does not encode
 * a view about which is better — the whole point of capturing the sequence as
 * data is that the question can later be asked of this hospital's own cases
 * rather than answered from a textbook.
 */
export const PREP_AGENTS: Option[] = opts(
  ['CETRIMIDE', 'Cetrimide'],
  ['SAVLON', 'Savlon'],
  ['CHLORHEXIDINE_AQUEOUS', 'Chlorhexidine (aqueous)'],
  ['CHLORHEXIDINE_ALCOHOLIC', 'Chlorhexidine (alcoholic)'],
  ['POVIDONE_IODINE', 'Povidone iodine'],
  ['METHYLATED_SPIRIT', 'Methylated spirit'],
  ['ALCOHOL_70', 'Alcohol 70 per cent'],
  ['NORMAL_SALINE', 'Normal saline'],
  ['SOAP_AND_WATER', 'Soap and water'],
).concat(OTHER);

export const DRYING_METHODS: Option[] = opts(
  ['STERILE_GAUZE', 'Sterile gauze'],
  ['STERILE_TOWEL', 'Sterile towel'],
  ['AIR_DRY', 'Air drying'],
).concat(OTHER);

/**
 * What a preparation step IS, rather than which agent it used.
 *
 * Kept separate from the agent so the sequence can be analysed two ways: how
 * many cleansing steps were done, and what was used at each. A single free-text
 * field answers neither.
 */
export const PREP_STEP_KINDS: Option[] = opts(
  ['CLEANSE', 'Cleansing', 'A washing step, usually first and second'],
  ['DRY', 'Drying'],
  ['FINAL_PREP', 'Final / terminal preparation', 'The last agent applied before draping'],
  ['DRAPE', 'Draping'],
);

// ---------------------------------------------------------------------------
// The operation itself
// ---------------------------------------------------------------------------

export const INCISION_TYPES: Option[] = opts(
  ['MIDLINE', 'Midline'],
  ['PARAMEDIAN', 'Paramedian'],
  ['TRANSVERSE', 'Transverse'],
  ['OBLIQUE', 'Oblique'],
  ['PFANNENSTIEL', 'Pfannenstiel'],
  ['ELLIPTICAL', 'Elliptical'],
  ['CURVILINEAR', 'Curvilinear'],
  ['LAZY_S', 'Lazy-S'],
  ['ZIGZAG', 'Zig-zag'],
  ['LONGITUDINAL', 'Longitudinal'],
  ['CIRCUMFERENTIAL', 'Circumferential'],
  ['RADIAL', 'Radial'],
  ['SUBCOSTAL', 'Subcostal'],
  ['GRIDIRON', 'Gridiron'],
  ['EXISTING_SCAR', 'Through existing scar'],
  ['NONE', 'No incision (endoscopic / percutaneous)'],
).concat(OTHER);

/** Multi-select by nature: most operations use several. */
export const HAEMOSTASIS_METHODS: Option[] = opts(
  ['DIRECT_PRESSURE', 'Direct pressure'],
  ['GAUZE_PRESSURE', 'Gauze pressure'],
  ['SUTURE_LIGATION', 'Suture ligation'],
  ['TRANSFIXION_SUTURE', 'Transfixion suture'],
  ['VESSEL_LIGATION', 'Vessel ligation'],
  ['DIATHERMY_MONOPOLAR', 'Monopolar diathermy'],
  ['DIATHERMY_BIPOLAR', 'Bipolar diathermy'],
  ['DIATHERMY_UNSPECIFIED', 'Diathermy (type not specified)'],
  ['HARMONIC', 'Harmonic / ultrasonic dissector'],
  ['CLIPS', 'Vascular clips'],
  ['TOPICAL_HAEMOSTAT', 'Topical haemostatic agent'],
  ['BONE_WAX', 'Bone wax'],
  ['TOURNIQUET', 'Tourniquet'],
  ['TAMPONADE', 'Tamponade / packing'],
  ['ADRENALINE_INFILTRATION', 'Adrenaline infiltration'],
).concat(OTHER);

export const TISSUE_QUALITY: Option[] = opts(
  ['HEALTHY', 'Healthy'],
  ['OEDEMATOUS', 'Oedematous'],
  ['FRIABLE', 'Friable'],
  ['FIBROTIC', 'Fibrotic / scarred'],
  ['ISCHAEMIC', 'Ischaemic'],
  ['NECROTIC', 'Necrotic'],
);

export const PERFUSION: Option[] = opts(
  ['GOOD', 'Good'],
  ['ADEQUATE', 'Adequate'],
  ['POOR', 'Poor'],
  ['ABSENT', 'Absent'],
);

/**
 * Wound contamination class.
 *
 * These four are the CDC classes, and they are also what SsiSurveillance
 * already stores as its WoundClass enum. The values match that enum exactly, so
 * a note can seed a surveillance record without a translation table — see
 * lib/ipc/ssiRate.ts, which divides infections by the operations of each class.
 */
export const WOUND_CLASSES: Option[] = opts(
  ['CLEAN', 'Clean'],
  ['CLEAN_CONTAMINATED', 'Clean-contaminated'],
  ['CONTAMINATED', 'Contaminated'],
  // DIRTY_INFECTED, not DIRTY. The value has to match the WoundClass enum
  // exactly or the hand-off to surveillance fails on a foreign enum value, and
  // scripts/lib-tests/postOpSchema.test.ts holds the two together.
  ['DIRTY_INFECTED', 'Dirty / infected'],
);

// ---------------------------------------------------------------------------
// Closure, drains, dressing
// ---------------------------------------------------------------------------

export const CLOSURE_METHODS: Option[] = opts(
  ['PRIMARY', 'Primary closure'],
  ['DELAYED_PRIMARY', 'Delayed primary closure'],
  ['SECONDARY', 'Left open for secondary closure'],
  ['SKIN_SUTURES', 'Skin sutures'],
  ['SUBCUTICULAR', 'Subcuticular sutures'],
  ['STAPLES', 'Staples'],
  ['TISSUE_ADHESIVE', 'Tissue adhesive'],
  ['STERI_STRIPS', 'Steri-strips'],
  ['FLAP_COVER', 'Flap cover'],
  ['GRAFT_COVER', 'Graft cover'],
  ['PACKED_OPEN', 'Packed open'],
).concat(OTHER);

export const SUTURE_MATERIALS: Option[] = opts(
  ['VICRYL', 'Vicryl (polyglactin)'],
  ['MONOCRYL', 'Monocryl (poliglecaprone)'],
  ['PDS', 'PDS (polydioxanone)'],
  ['NYLON', 'Nylon'],
  ['PROLENE', 'Prolene (polypropylene)'],
  ['SILK', 'Silk'],
  ['CATGUT_PLAIN', 'Plain catgut'],
  ['CATGUT_CHROMIC', 'Chromic catgut'],
  ['STAINLESS_STEEL', 'Stainless steel wire'],
).concat(OTHER);

export const DRAIN_TYPES: Option[] = opts(
  ['REDIVAC', 'Redivac (closed suction)'],
  ['PENROSE', 'Penrose'],
  ['CORRUGATED', 'Corrugated'],
  ['TUBE', 'Tube drain'],
  ['CHEST', 'Chest drain'],
  ['SUMP', 'Sump drain'],
  ['NASOGASTRIC', 'Nasogastric tube'],
).concat(OTHER);

export const DRAIN_SUCTION: Option[] = opts(
  ['CLOSED_SUCTION', 'Closed suction'],
  ['GRAVITY', 'Gravity'],
  ['UNDERWATER_SEAL', 'Underwater seal'],
  ['LOW_WALL_SUCTION', 'Low wall suction'],
);

export const DRESSING_TYPES: Option[] = opts(
  ['DRY_GAUZE', 'Dry gauze'],
  ['PARAFFIN_GAUZE', 'Paraffin gauze (non-adherent)'],
  ['FOAM', 'Foam'],
  ['HYDROCOLLOID', 'Hydrocolloid'],
  ['ALGINATE', 'Alginate'],
  ['TRANSPARENT_FILM', 'Transparent film'],
  ['COMPRESSION', 'Compression dressing'],
  ['CREPE_BANDAGE', 'Crepe bandage'],
  ['PLASTER_OF_PARIS', 'Plaster of Paris / backslab'],
  ['TIE_OVER', 'Tie-over dressing'],
  ['NPWT', 'Negative-pressure wound therapy'],
  ['NONE', 'No dressing / left exposed'],
).concat(OTHER);

export const SPECIMEN_DESTINATIONS: Option[] = opts(
  ['HISTOPATHOLOGY', 'Histopathology'],
  ['MICROBIOLOGY', 'Microbiology (culture)'],
  ['CYTOLOGY', 'Cytology'],
  ['FROZEN_SECTION', 'Frozen section'],
  ['BIOCHEMISTRY', 'Biochemistry'],
  ['DISCARDED', 'Discarded'],
).concat(OTHER);

// ---------------------------------------------------------------------------
// Post-operative orders
// ---------------------------------------------------------------------------

export const FEEDING_TIMING: Option[] = opts(
  ['IMMEDIATELY', 'Start immediately'],
  ['WHEN_AWAKE', 'Start when fully awake'],
  ['AFTER_RECOVERY', 'Start after anaesthetic recovery'],
  ['AFTER_REVIEW', 'Start after review'],
  ['AT_TIME', 'Start at a specified time'],
  ['NIL_BY_MOUTH', 'Nil by mouth until further review'],
).concat(OTHER);

export const DIET_TYPES: Option[] = opts(
  ['CLEAR_FLUIDS', 'Clear fluids'],
  ['FULL_FLUIDS', 'Full fluids'],
  ['SOFT_DIET', 'Soft diet'],
  ['REGULAR_DIET', 'Regular diet'],
  ['GRADED', 'Graded, as tolerated'],
  ['ENTERAL_TUBE', 'Enteral feeds via tube'],
).concat(OTHER);

export const MOBILISATION: Option[] = opts(
  ['BED_REST', 'Bed rest'],
  ['BED_REST_UNTIL_REVIEW', 'Bed rest until reviewed'],
  ['IMMEDIATE', 'Mobilise immediately'],
  ['WHEN_AWAKE', 'Mobilise when fully awake'],
  ['WITH_ASSISTANCE', 'Mobilise with assistance'],
  ['WITH_PHYSIOTHERAPY', 'Mobilise with physiotherapy'],
  ['PARTIAL', 'Partial mobilisation'],
  ['FULL', 'Full mobilisation'],
  ['NON_WEIGHT_BEARING', 'Non-weight-bearing'],
  ['PARTIAL_WEIGHT_BEARING', 'Partial weight-bearing'],
  ['WEIGHT_BEARING_AS_TOLERATED', 'Weight-bearing as tolerated'],
).concat(OTHER);

export const MOBILISATION_RESTRICTIONS: Option[] = opts(
  ['NO_PRESSURE_OPERATIVE_SITE', 'Avoid pressure on the operative site'],
  ['NO_AMBULATION', 'No ambulation'],
  ['LIMB_ELEVATION_MAINTAINED', 'Maintain limb elevation'],
  ['AVOID_LIMB_MOVEMENT', 'Avoid movement of the operated limb'],
  ['NO_LIFTING', 'No lifting'],
  ['NO_STAIRS', 'No stairs'],
).concat(OTHER);

export const MEDICATION_TIMING: Option[] = opts(
  ['IMMEDIATELY', 'Start immediately'],
  ['WHEN_TOLERATING_ORAL', 'Start when tolerating oral intake'],
  ['AFTER_REVIEW', 'Start after review'],
  ['AT_TIME', 'Start at a specified time'],
  ['CONTINUE_EXISTING', 'Continue existing medications'],
  ['HOLD_EXISTING', 'Hold existing medications'],
).concat(OTHER);

export const RESTART_INSTRUCTIONS: Option[] = opts(
  ['IMMEDIATELY', 'Restart immediately'],
  ['WHEN_ORAL_ESTABLISHED', 'Restart when oral intake is established'],
  ['AFTER_REVIEW', 'Restart after review'],
  ['AT_TIME', 'Restart at a specified time'],
  ['CONTINUE_WITHHOLDING', 'Continue withholding'],
).concat(OTHER);

/**
 * VTE prophylaxis, as a class of decision rather than a yes/no.
 *
 * "Not indicated" is a POSITIVE answer and is kept distinct from the field
 * being left blank, because those two mean opposite things to whoever reads the
 * chart afterwards — one is a decision, the other is an omission.
 */
export const VTE_PLANS: Option[] = opts(
  ['NOT_INDICATED', 'Not indicated'],
  ['MECHANICAL', 'Mechanical prophylaxis'],
  ['PHARMACOLOGICAL', 'Pharmacological prophylaxis'],
  ['BOTH', 'Both mechanical and pharmacological'],
  ['DEFERRED', 'Defer pending review'],
).concat(OTHER);

export const VTE_MECHANICAL: Option[] = opts(
  ['GRADUATED_STOCKINGS', 'Graduated compression stockings'],
  ['INTERMITTENT_PNEUMATIC', 'Intermittent pneumatic compression'],
  ['EARLY_MOBILISATION', 'Early mobilisation'],
  ['FOOT_PUMP', 'Foot pump'],
).concat(OTHER);

export const ANTIBIOTIC_PLANS: Option[] = opts(
  ['NONE', 'No antibiotics'],
  ['CONTINUE_PROPHYLAXIS', 'Continue surgical prophylaxis'],
  ['THERAPEUTIC', 'Therapeutic antibiotics'],
  ['REVIEW_REQUIRED', 'Review required before deciding'],
).concat(OTHER);

export const ANALGESIA_PLANS: Option[] = opts(
  ['SCHEDULED', 'Scheduled analgesia'],
  ['PRN', 'As-required (PRN) analgesia'],
  ['SCHEDULED_PLUS_PRN', 'Scheduled with PRN cover'],
  ['REGIONAL_BLOCK', 'Regional block in situ'],
  ['PCA', 'Patient-controlled analgesia'],
  ['EPIDURAL', 'Epidural'],
).concat(OTHER);

export const FLUID_PLANS: Option[] = opts(
  ['NONE', 'No intravenous fluids'],
  ['MAINTENANCE', 'Maintenance fluids'],
  ['REPLACEMENT', 'Replacement fluids'],
  ['RESTRICTED', 'Restricted fluids'],
  ['REVIEW_REQUIRED', 'Review required'],
).concat(OTHER);

export const CATHETER_ACTIONS: Option[] = opts(
  ['REMOVE_IN_RECOVERY', 'Remove in recovery'],
  ['REMOVE_AT_TIME', 'Remove at a specified time'],
  ['REMOVE_AFTER_REVIEW', 'Remove after review'],
  ['KEEP_UNTIL_REVIEW', 'Keep until reviewed'],
  ['LONG_TERM', 'Long-term catheter'],
).concat(OTHER);

// ---------------------------------------------------------------------------
// Monitoring and escalation
// ---------------------------------------------------------------------------

export const WOUND_MONITORING: Option[] = opts(
  ['INSPECT_DRESSING', 'Inspect the dressing'],
  ['KEEP_DRESSING_INTACT', 'Keep the dressing intact'],
  ['DRESSING_CHANGE_DUE', 'Dressing change required'],
  ['MONITOR_BLEEDING', 'Monitor for bleeding'],
  ['MONITOR_SWELLING', 'Monitor for swelling'],
  ['MONITOR_HAEMATOMA', 'Monitor for haematoma'],
  ['MONITOR_DISCHARGE', 'Monitor discharge'],
  ['MONITOR_INFECTION', 'Monitor for signs of infection'],
  ['MONITOR_FLAP', 'Monitor flap viability'],
  ['MONITOR_GRAFT', 'Monitor the graft'],
  ['MONITOR_PERFUSION', 'Monitor perfusion'],
  ['MONITOR_DISTAL_CIRCULATION', 'Monitor distal circulation'],
  ['MONITOR_SENSATION', 'Monitor sensation'],
  ['MONITOR_MOTOR', 'Monitor motor function'],
  ['MONITOR_COMPARTMENT', 'Monitor for compartment syndrome'],
).concat(OTHER);

export const OBSERVATIONS: Option[] = opts(
  ['BLOOD_PRESSURE', 'Blood pressure'],
  ['PULSE', 'Pulse'],
  ['RESPIRATORY_RATE', 'Respiratory rate'],
  ['OXYGEN_SATURATION', 'Oxygen saturation'],
  ['TEMPERATURE', 'Temperature'],
  ['CONSCIOUS_LEVEL', 'Level of consciousness'],
  ['PAIN_SCORE', 'Pain score'],
  ['URINE_OUTPUT', 'Urine output'],
  ['DRAIN_OUTPUT', 'Drain output'],
  ['OPERATIVE_SITE', 'Operative site'],
  ['BLOOD_GLUCOSE', 'Blood glucose'],
).concat(OTHER);

/**
 * When to call the surgeon.
 *
 * The most important list in the file. These appear at the top of the nurse's
 * summary, and the reason they are a checklist rather than prose is that prose
 * is skimmed and a checklist is read.
 */
export const ESCALATION_TRIGGERS: Option[] = opts(
  ['EXCESSIVE_BLEEDING', 'Excessive bleeding'],
  ['INCREASING_SWELLING', 'Increasing swelling'],
  ['SEVERE_PAIN', 'Severe or escalating pain'],
  ['FEVER', 'Fever'],
  ['HYPOTENSION', 'Hypotension'],
  ['TACHYCARDIA', 'Tachycardia'],
  ['LOW_SATURATION', 'Falling oxygen saturation'],
  ['ALTERED_CONSCIOUSNESS', 'Altered consciousness'],
  ['LOW_URINE_OUTPUT', 'Reduced urine output'],
  ['HIGH_DRAIN_OUTPUT', 'High or bloody drain output'],
  ['FLAP_COLOUR_CHANGE', 'Change in flap colour'],
  ['FLAP_TEMPERATURE_CHANGE', 'Change in flap temperature'],
  ['DOPPLER_LOST', 'Absent or reduced Doppler signal'],
  ['GRAFT_CONCERN', 'Concern about the graft'],
  ['WOUND_DISCHARGE', 'New wound discharge'],
  ['DISTAL_ISCHAEMIA', 'Cold or pulseless limb'],
  ['VOMITING', 'Persistent vomiting'],
  ['NO_URINE_PASSED', 'Patient has not passed urine'],
).concat(OTHER);

export const REVIEW_TIMING: Option[] = opts(
  ['ROUTINE_WARD_ROUND', 'Routine ward round'],
  ['LATER_TODAY', 'Review later today'],
  ['TOMORROW', 'Review tomorrow'],
  ['AT_TIME', 'Review at a specified date and time'],
  ['BEFORE_FEEDING', 'Review before feeding'],
  ['BEFORE_MOBILISATION', 'Review before mobilisation'],
  ['BEFORE_MEDICATION_RESTART', 'Review before restarting medication'],
  ['URGENT_IF_REQUIRED', 'Urgent review if any concern'],
).concat(OTHER);

// ---------------------------------------------------------------------------
// Flap and graft
// ---------------------------------------------------------------------------

export const FLAP_TYPES: Option[] = opts(
  ['LOCAL', 'Local flap'],
  ['REGIONAL', 'Regional flap'],
  ['FREE', 'Free flap'],
  ['PEDICLED', 'Pedicled flap'],
  ['FASCIOCUTANEOUS', 'Fasciocutaneous flap'],
  ['MYOCUTANEOUS', 'Myocutaneous flap'],
  ['MUSCLE', 'Muscle flap'],
  ['PERFORATOR', 'Perforator flap'],
).concat(OTHER);

export const FLAP_MONITORING_PARAMS: Option[] = opts(
  ['COLOUR', 'Colour'],
  ['TEMPERATURE', 'Temperature'],
  ['CAPILLARY_REFILL', 'Capillary refill'],
  ['DOPPLER', 'Doppler signal'],
  ['TURGOR', 'Turgor'],
  ['BLEEDING_ON_PINPRICK', 'Bleeding on pinprick'],
  ['CONGESTION', 'Venous congestion'],
  ['PALLOR', 'Pallor'],
  ['SWELLING', 'Swelling'],
);

export const GRAFT_TYPES: Option[] = opts(
  ['SPLIT_THICKNESS', 'Split-thickness skin graft'],
  ['FULL_THICKNESS', 'Full-thickness skin graft'],
  ['MESHED', 'Meshed graft'],
  ['SHEET', 'Sheet graft'],
  ['COMPOSITE', 'Composite graft'],
  ['BONE', 'Bone graft'],
  ['NERVE', 'Nerve graft'],
  ['TENDON', 'Tendon graft'],
).concat(OTHER);

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/** Every catalogue, by the name a template or the API refers to it by. */
export const CATALOGUES: Record<string, Option[]> = {
  OPERATIVE_POSITIONS,
  WARD_POSITIONS,
  POSITION_RESTRICTIONS,
  HAIR_REMOVAL_STATUS,
  HAIR_REMOVAL_METHODS,
  PREP_AGENTS,
  DRYING_METHODS,
  PREP_STEP_KINDS,
  INCISION_TYPES,
  HAEMOSTASIS_METHODS,
  TISSUE_QUALITY,
  PERFUSION,
  WOUND_CLASSES,
  CLOSURE_METHODS,
  SUTURE_MATERIALS,
  DRAIN_TYPES,
  DRAIN_SUCTION,
  DRESSING_TYPES,
  SPECIMEN_DESTINATIONS,
  FEEDING_TIMING,
  DIET_TYPES,
  MOBILISATION,
  MOBILISATION_RESTRICTIONS,
  MEDICATION_TIMING,
  RESTART_INSTRUCTIONS,
  VTE_PLANS,
  VTE_MECHANICAL,
  ANTIBIOTIC_PLANS,
  ANALGESIA_PLANS,
  FLUID_PLANS,
  CATHETER_ACTIONS,
  WOUND_MONITORING,
  OBSERVATIONS,
  ESCALATION_TRIGGERS,
  REVIEW_TIMING,
  FLAP_TYPES,
  FLAP_MONITORING_PARAMS,
  GRAFT_TYPES,
};

/** The display label for a stored value, falling back to the value itself. */
export function labelOf(catalogue: string, value: string): string {
  const found = CATALOGUES[catalogue]?.find((o) => o.value === value);
  return found?.label ?? value;
}

/** Labels for a stored multi-select, in the order given. */
export function labelsOf(catalogue: string, values: string[] | null | undefined): string[] {
  return (values ?? []).map((v) => labelOf(catalogue, v));
}

/**
 * Whether a value belongs to a catalogue.
 *
 * The API uses this to reject typos. An unknown catalogue name answers false
 * rather than true: a field pointing at a catalogue that does not exist is a
 * programming error, and the safe reading is "nothing is valid", so it shows up
 * immediately instead of letting everything through.
 */
export function isKnown(catalogue: string, value: string): boolean {
  return (CATALOGUES[catalogue] ?? []).some((o) => o.value === value);
}
