// ============================================================
// The procedure template engine
// ------------------------------------------------------------
// One universal core template, plus extensions that switch themselves on
// according to the procedure being written up.
//
// THE FORM IS DATA, NOT JSX. Every section and field below is a descriptor,
// and the page renders whatever this module hands it. That is the whole reason
// the engine exists: adding a template for a new operation means adding an
// object to PROCEDURE_TEMPLATES, not editing a 1,200-line React component and
// hoping nothing else moved. It is also why the templates can be unit-tested
// without a browser, which is the only practical way to check that a graft case
// really does offer donor-site fields.
//
// WHAT A TEMPLATE MAY AND MAY NOT DO
//
// It MAY decide which fields are shown, offer a shorter list of the monitoring
// and escalation options that matter for this operation, and mark a field as
// expected.
//
// It MAY NOT pre-select a clinical order. A template that silently ticks
// "enoxaparin" because the word "laparotomy" appeared in the procedure name has
// written a prescription, and no part of this system is entitled to do that.
// So there is a `suggests` block — options moved to the top of the list and
// marked as usual for this operation — and there is deliberately no mechanism
// for a template to fill an order in on the surgeon's behalf. Defaults are
// confined to things that are not clinical decisions, such as which
// observations are routinely charted.
//
// MATCHING IS BY KEYWORD, AND IT IS ADVISORY. The surgeon can change the
// template on the form. Procedure names in this hospital are free text written
// by whoever booked the case ("EUA + biopsy", "Rt. hemithyroidectomy"), so any
// scheme that insisted on recognising them would be wrong more often than the
// person sitting at the keyboard.
// ============================================================

export type FieldKind =
  | 'single'    // one value from a catalogue
  | 'multi'     // several values from a catalogue
  | 'text'      // a short line
  | 'longtext'  // narrative; the surgeon's own words
  | 'number'
  | 'datetime'
  | 'boolean';

export type Importance = 'required' | 'recommended' | 'optional';

/** The shape the form holds while it is being filled in. */
export type NoteValues = Record<string, unknown>;

export interface FieldDef {
  /**
   * Where the answer is stored.
   *
   * A core field's key is the column name on post_op_notes, exactly. A field
   * marked `extra` is stored under this key inside the note's `extras` JSONB
   * instead — see the note on PROCEDURE_TEMPLATES below for why.
   */
  key: string;
  label: string;
  kind: FieldKind;
  /** Which list in vocabulary.ts, for 'single' and 'multi'. */
  catalogue?: string;
  /** Rendered after a number, e.g. mL, degrees, cm. */
  unit?: string;
  help?: string;
  placeholder?: string;
  importance?: Importance;
  /** Shown only when this answers true. Undefined means always shown. */
  showIf?: (v: NoteValues) => boolean;
  /** Stored in the extras JSON rather than in a column of its own. */
  extra?: boolean;
  min?: number;
  max?: number;
  rows?: number;
}

export type RepeatKind = 'prepSteps' | 'drains' | 'specimens' | 'heldMedications';

export interface SectionDef {
  key: string;
  title: string;
  /** One line under the heading, where the section needs explaining. */
  blurb?: string;
  fields: FieldDef[];
  /**
   * A section whose content is a list of rows rather than a set of fields.
   * The named child table holds them; `fields` describes one row.
   */
  repeat?: RepeatKind;
  showIf?: (v: NoteValues) => boolean;
  /**
   * Who reads it. 'nursing' sections are the ones lifted into the nursing
   * summary and shown most prominently on the ward-facing view.
   */
  audience?: 'surgeon' | 'nursing';
}

export interface TemplateSuggestions {
  /** Options to float to the top of the wound-monitoring list. */
  monitoring?: string[];
  /** Options to float to the top of the escalation list. */
  escalation?: string[];
  /** Options to float to the top of the position-restriction list. */
  positionRestrictions?: string[];
  observations?: string[];
}

export interface ProcedureTemplate {
  key: string;
  label: string;
  /**
   * Bumped when the sections change in a way that alters what a note means.
   * Stored on every note, so a note written in 2026 can still be rendered by
   * the template it was written against rather than by a later one.
   */
  version: number;
  /** Shown on the form so the surgeon can see which template is in force. */
  description?: string;
  match: {
    /** Matched against Surgery.subspecialty, case-insensitively. */
    subspecialties?: string[];
    /** Matched against the procedure name, case-insensitively. */
    keywords?: string[];
  };
  /** Sections added after the core ones. */
  sections?: SectionDef[];
  /** Fields appended to a core section, keyed by that section's key. */
  extend?: Record<string, FieldDef[]>;
  suggests?: TemplateSuggestions;
  /**
   * Shown as a standing note on the form. Not a clinical instruction — a
   * reminder of what this kind of case is known to need documented.
   */
  reminders?: string[];
}

// ---------------------------------------------------------------------------
// The universal core
// ---------------------------------------------------------------------------

const yesNo = (key: string, label: string, help?: string): FieldDef => ({
  key, label, kind: 'boolean', help,
});

/**
 * Sections every operation note has, in the order a surgeon narrates a case:
 * how the patient was placed, how the skin was prepared, how they were opened,
 * what was found, what was done about it, and what should happen next.
 */
export const CORE_SECTIONS: SectionDef[] = [
  {
    key: 'positioning',
    title: 'Positioning',
    blurb: 'Several may apply if the patient was repositioned during the case.',
    fields: [
      { key: 'positions', label: 'Position during the procedure', kind: 'multi', catalogue: 'OPERATIVE_POSITIONS', importance: 'recommended' },
      { key: 'positionOther', label: 'Other position — specify', kind: 'text', showIf: (v) => arr(v.positions).includes('OTHER') },
      { key: 'positionAtInduction', label: 'Position at induction', kind: 'single', catalogue: 'OPERATIVE_POSITIONS' },
      { key: 'positionAtClosure', label: 'Position at closure', kind: 'single', catalogue: 'OPERATIVE_POSITIONS' },
      { key: 'positioningNotes', label: 'Positioning notes', kind: 'text', placeholder: 'Padding, supports, repositioning during the case' },
    ],
  },
  {
    key: 'skinPrep',
    title: 'Hair removal',
    blurb: 'Nothing is assumed here. "Not performed" is an answer; leaving it blank is not.',
    fields: [
      { key: 'hairRemoval', label: 'Hair removal', kind: 'single', catalogue: 'HAIR_REMOVAL_STATUS', importance: 'recommended' },
      { key: 'hairRemovalMethod', label: 'Method', kind: 'single', catalogue: 'HAIR_REMOVAL_METHODS', showIf: (v) => v.hairRemoval === 'PERFORMED' },
      { key: 'hairRemovalOther', label: 'Other method — specify', kind: 'text', showIf: (v) => v.hairRemovalMethod === 'OTHER' },
      { key: 'hairRemovalArea', label: 'Area', kind: 'text', showIf: (v) => v.hairRemoval === 'PERFORMED', placeholder: 'e.g. left thigh, anterior abdominal wall' },
      { key: 'hairRemovalAt', label: 'Date and time', kind: 'datetime', showIf: (v) => v.hairRemoval === 'PERFORMED', help: 'How long before the incision hair was removed is one of the things this record exists to let the hospital examine.' },
      { key: 'hairRemovalBy', label: 'Performed by', kind: 'text', showIf: (v) => v.hairRemoval === 'PERFORMED' },
    ],
  },
  {
    key: 'prepSteps',
    title: 'Skin preparation sequence',
    blurb: 'Each step separately, in the order it was done. Stored as rows, not as a sentence, so the sequence can be counted and compared later.',
    repeat: 'prepSteps',
    fields: [
      { key: 'kind', label: 'Step', kind: 'single', catalogue: 'PREP_STEP_KINDS', importance: 'required' },
      { key: 'agent', label: 'Solution / method', kind: 'single', catalogue: 'PREP_AGENTS', showIf: (v) => v.kind === 'CLEANSE' || v.kind === 'FINAL_PREP' },
      { key: 'dryingMethod', label: 'Drying method', kind: 'single', catalogue: 'DRYING_METHODS', showIf: (v) => v.kind === 'DRY' },
      { key: 'agentOther', label: 'Other — specify', kind: 'text', showIf: (v) => v.agent === 'OTHER' || v.dryingMethod === 'OTHER' },
      { key: 'site', label: 'Site', kind: 'text', placeholder: 'Where on the body' },
      { key: 'notes', label: 'Notes', kind: 'text' },
    ],
  },
  {
    key: 'incision',
    title: 'Incision',
    fields: [
      { key: 'incisionTypes', label: 'Incision', kind: 'multi', catalogue: 'INCISION_TYPES' },
      { key: 'incisionOther', label: 'Other incision — describe', kind: 'text', showIf: (v) => arr(v.incisionTypes).includes('OTHER') },
      { key: 'incisionSite', label: 'Site', kind: 'text' },
      { key: 'incisionLengthCm', label: 'Length', kind: 'number', unit: 'cm', min: 0, max: 200 },
    ],
  },
  {
    key: 'haemostasis',
    title: 'Haemostasis',
    blurb: 'Select every method used — most operations use more than one.',
    fields: [
      { key: 'haemostasisMethods', label: 'Method(s) of haemostasis', kind: 'multi', catalogue: 'HAEMOSTASIS_METHODS', importance: 'recommended' },
      { key: 'haemostasisOther', label: 'Other method — specify', kind: 'text', showIf: (v) => arr(v.haemostasisMethods).includes('OTHER') },
      { key: 'estimatedBloodLossMl', label: 'Estimated blood loss', kind: 'number', unit: 'mL', min: 0, max: 20000 },
      { key: 'bleedingSource', label: 'Bleeding source', kind: 'text', placeholder: 'Named vessel or site, where relevant' },
      { key: 'haemostasisSatisfactory', label: 'Haemostasis satisfactory at closure', kind: 'boolean' },
      { key: 'tourniquetMinutes', label: 'Tourniquet time', kind: 'number', unit: 'minutes', min: 0, max: 600, showIf: (v) => arr(v.haemostasisMethods).includes('TOURNIQUET') },
    ],
  },
  {
    key: 'findings',
    title: 'Intra-operative findings',
    blurb: 'Your own words. This section is deliberately not a set of dropdowns.',
    fields: [
      {
        key: 'findings',
        label: 'Findings',
        kind: 'longtext',
        rows: 10,
        importance: 'required',
        placeholder: 'Anatomy, pathology, tissue quality, unexpected findings, measurements, what was done and why...',
        help: 'The operative narrative. Nothing in this form replaces it.',
      },
      { key: 'procedurePerformed', label: 'Procedure actually performed', kind: 'text', help: 'Only if it differs from what was booked.' },
      {
        key: 'operativeDiagnosis',
        label: 'Operative diagnosis',
        kind: 'text',
        help: 'Carried over from the indication on the case. Correct it if the operation showed otherwise.',
      },
      {
        key: 'postOpDiagnosis',
        label: 'Post-operative diagnosis',
        kind: 'text',
        importance: 'recommended',
        help: 'What you now believe the patient has. This is the one the ward, the pathologist and the next clinic read.',
      },
    ],
  },
  {
    key: 'operativeDetail',
    title: 'Structured operative detail',
    blurb: 'Optional. These are the variables the hospital can count; the narrative above remains the record.',
    fields: [
      { key: 'woundClass', label: 'Wound class', kind: 'single', catalogue: 'WOUND_CLASSES', help: 'CDC classification. Feeds surgical-site-infection surveillance as the denominator for this case.' },
      { key: 'tissueQuality', label: 'Tissue quality', kind: 'single', catalogue: 'TISSUE_QUALITY' },
      { key: 'perfusion', label: 'Perfusion', kind: 'single', catalogue: 'PERFUSION' },
      yesNo('contaminationPresent', 'Contamination'),
      yesNo('pusPresent', 'Pus present'),
      yesNo('necrosisPresent', 'Necrosis'),
      yesNo('foreignBodyFound', 'Foreign body'),
      yesNo('adhesionsPresent', 'Adhesions'),
      yesNo('boneExposed', 'Bone exposed'),
      yesNo('tendonExposed', 'Tendon exposed'),
      yesNo('implantPlaced', 'Implant or prosthesis placed', 'Extends infection surveillance follow-up to 90 days.'),
      { key: 'implantDetails', label: 'Implant details', kind: 'text', showIf: (v) => v.implantPlaced === true },
      { key: 'nerveStatus', label: 'Nerve findings', kind: 'text' },
      { key: 'vascularStatus', label: 'Vascular findings', kind: 'text' },
      { key: 'fluidsGivenMl', label: 'Intra-operative fluids', kind: 'number', unit: 'mL', min: 0, max: 30000 },
      { key: 'urineOutputMl', label: 'Urine output', kind: 'number', unit: 'mL', min: 0, max: 10000 },
      yesNo('complicationOccurred', 'Intra-operative complication'),
      { key: 'complicationDetails', label: 'Complication — describe', kind: 'text', showIf: (v) => v.complicationOccurred === true, importance: 'required' },
      yesNo('procedureChanged', 'Procedure changed or converted'),
      { key: 'procedureChangeReason', label: 'Reason for the change', kind: 'text', showIf: (v) => v.procedureChanged === true, importance: 'required' },
    ],
  },
  {
    key: 'drains',
    title: 'Drains',
    blurb: 'One row per drain. A patient with two drains has two rows, each with its own removal instruction.',
    repeat: 'drains',
    fields: [
      { key: 'drainType', label: 'Type', kind: 'single', catalogue: 'DRAIN_TYPES', importance: 'required' },
      { key: 'drainTypeOther', label: 'Other type — specify', kind: 'text', showIf: (v) => v.drainType === 'OTHER' },
      { key: 'site', label: 'Site', kind: 'text', importance: 'required' },
      { key: 'sizeFr', label: 'Size', kind: 'text', placeholder: 'e.g. 14 Fr' },
      { key: 'suction', label: 'Suction', kind: 'single', catalogue: 'DRAIN_SUCTION' },
      { key: 'fixation', label: 'Fixation', kind: 'text', placeholder: 'e.g. 2/0 silk anchor suture' },
      { key: 'monitoring', label: 'Monitoring instruction', kind: 'text', placeholder: 'e.g. chart output 4-hourly' },
      { key: 'removalCriteria', label: 'Removal criteria', kind: 'text', placeholder: 'e.g. when output is under 30 mL in 24 hours' },
    ],
  },
  {
    key: 'specimens',
    title: 'Specimens',
    blurb: 'One row per specimen sent.',
    repeat: 'specimens',
    fields: [
      { key: 'label', label: 'Label on the pot', kind: 'text', importance: 'required' },
      { key: 'description', label: 'Description', kind: 'text', importance: 'required' },
      { key: 'site', label: 'Anatomical site', kind: 'text' },
      { key: 'destination', label: 'Sent to', kind: 'single', catalogue: 'SPECIMEN_DESTINATIONS', importance: 'required' },
      { key: 'destinationOther', label: 'Other destination — specify', kind: 'text', showIf: (v) => v.destination === 'OTHER' },
    ],
  },
  {
    key: 'closure',
    title: 'Closure',
    fields: [
      { key: 'closureMethods', label: 'Closure', kind: 'multi', catalogue: 'CLOSURE_METHODS', importance: 'recommended' },
      { key: 'closureOther', label: 'Other closure — specify', kind: 'text', showIf: (v) => arr(v.closureMethods).includes('OTHER') },
      { key: 'sutureMaterial', label: 'Suture material', kind: 'single', catalogue: 'SUTURE_MATERIALS' },
      { key: 'sutureMaterialOther', label: 'Other material — specify', kind: 'text', showIf: (v) => v.sutureMaterial === 'OTHER' },
      { key: 'sutureSize', label: 'Suture size', kind: 'text', placeholder: 'e.g. 3/0' },
      { key: 'closureNotes', label: 'Closure notes', kind: 'text', placeholder: 'Layers, tension, anything unusual' },
    ],
  },
  {
    key: 'dressing',
    title: 'Dressing',
    fields: [
      { key: 'dressingTypes', label: 'Dressing applied', kind: 'multi', catalogue: 'DRESSING_TYPES' },
      { key: 'dressingOther', label: 'Other dressing — specify', kind: 'text', showIf: (v) => arr(v.dressingTypes).includes('OTHER') },
      { key: 'dressingLayers', label: 'Layers', kind: 'number', min: 0, max: 20 },
      { key: 'dressingNotes', label: 'Dressing notes', kind: 'text' },
    ],
  },

  // ---- Post-operative orders. Everything below is read by a nurse. --------
  {
    key: 'wardPosition',
    title: 'Position in the ward',
    audience: 'nursing',
    fields: [
      { key: 'wardPosition', label: 'Nurse the patient', kind: 'single', catalogue: 'WARD_POSITIONS', importance: 'recommended' },
      { key: 'wardPositionOther', label: 'Other — specify', kind: 'text', showIf: (v) => v.wardPosition === 'OTHER' },
      { key: 'headElevationDegrees', label: 'Head elevation', kind: 'number', unit: 'degrees', min: 0, max: 90 },
      { key: 'positionRestrictions', label: 'Position restrictions', kind: 'multi', catalogue: 'POSITION_RESTRICTIONS' },
      { key: 'positionRestrictionOther', label: 'Other restriction — specify', kind: 'text', showIf: (v) => arr(v.positionRestrictions).includes('OTHER') },
    ],
  },
  {
    key: 'feeding',
    title: 'Oral intake',
    audience: 'nursing',
    fields: [
      { key: 'feedingTiming', label: 'Oral feeds', kind: 'single', catalogue: 'FEEDING_TIMING', importance: 'recommended' },
      { key: 'feedingAt', label: 'Start at', kind: 'datetime', showIf: (v) => v.feedingTiming === 'AT_TIME', importance: 'required' },
      { key: 'feedingOther', label: 'Other — specify', kind: 'text', showIf: (v) => v.feedingTiming === 'OTHER' },
      { key: 'dietType', label: 'Diet', kind: 'single', catalogue: 'DIET_TYPES', showIf: (v) => v.feedingTiming !== 'NIL_BY_MOUTH' },
      { key: 'dietOther', label: 'Other diet — specify', kind: 'text', showIf: (v) => v.dietType === 'OTHER' },
      { key: 'feedingNotes', label: 'Feeding notes', kind: 'text' },
    ],
  },
  {
    key: 'mobilisation',
    title: 'Mobilisation',
    audience: 'nursing',
    fields: [
      { key: 'mobilisation', label: 'Mobilisation', kind: 'single', catalogue: 'MOBILISATION', importance: 'recommended' },
      { key: 'mobilisationOther', label: 'Other — specify', kind: 'text', showIf: (v) => v.mobilisation === 'OTHER' },
      { key: 'mobilisationRestrictions', label: 'Restrictions', kind: 'multi', catalogue: 'MOBILISATION_RESTRICTIONS' },
      { key: 'mobilisationRestrictionOther', label: 'Other restriction — specify', kind: 'text', showIf: (v) => arr(v.mobilisationRestrictions).includes('OTHER') },
    ],
  },
  {
    key: 'medications',
    title: 'Oral medications',
    audience: 'nursing',
    blurb: 'The drugs themselves are prescribed in the prescription section below, which goes to pharmacy. This says when they start.',
    fields: [
      { key: 'oralMedicationTiming', label: 'Oral medications', kind: 'single', catalogue: 'MEDICATION_TIMING' },
      { key: 'oralMedicationAt', label: 'Start at', kind: 'datetime', showIf: (v) => v.oralMedicationTiming === 'AT_TIME', importance: 'required' },
      { key: 'oralMedicationOther', label: 'Other — specify', kind: 'text', showIf: (v) => v.oralMedicationTiming === 'OTHER' },
    ],
  },
  {
    key: 'heldMedications',
    title: 'Medications held before surgery',
    audience: 'nursing',
    blurb: 'Each one needs an instruction. A drug stopped for theatre and never restarted is one of the commonest avoidable harms after an operation.',
    repeat: 'heldMedications',
    fields: [
      { key: 'drugName', label: 'Medication', kind: 'text', importance: 'required' },
      { key: 'previousDose', label: 'Previous dose', kind: 'text' },
      { key: 'reasonHeld', label: 'Reason held', kind: 'text' },
      { key: 'restartInstruction', label: 'Restart', kind: 'single', catalogue: 'RESTART_INSTRUCTIONS', importance: 'required' },
      { key: 'restartAt', label: 'Restart at', kind: 'datetime', showIf: (v) => v.restartInstruction === 'AT_TIME', importance: 'required' },
      { key: 'restartOther', label: 'Other — specify', kind: 'text', showIf: (v) => v.restartInstruction === 'OTHER' },
    ],
  },
  {
    key: 'vte',
    title: 'DVT / VTE prophylaxis',
    audience: 'nursing',
    blurb: 'Not a yes/no. "Not indicated" is a decision and is recorded as one; left blank is an omission.',
    fields: [
      { key: 'vtePlan', label: 'Prophylaxis', kind: 'single', catalogue: 'VTE_PLANS', importance: 'recommended' },
      { key: 'vteMechanical', label: 'Mechanical', kind: 'multi', catalogue: 'VTE_MECHANICAL', showIf: (v) => v.vtePlan === 'MECHANICAL' || v.vtePlan === 'BOTH', importance: 'required' },
      { key: 'vteMechanicalOther', label: 'Other mechanical — specify', kind: 'text', showIf: (v) => arr(v.vteMechanical).includes('OTHER') },
      { key: 'vteDrug', label: 'Drug', kind: 'text', showIf: (v) => v.vtePlan === 'PHARMACOLOGICAL' || v.vtePlan === 'BOTH', importance: 'required' },
      { key: 'vteDose', label: 'Dose', kind: 'text', showIf: (v) => v.vtePlan === 'PHARMACOLOGICAL' || v.vtePlan === 'BOTH', importance: 'required' },
      { key: 'vteRoute', label: 'Route', kind: 'text', showIf: (v) => v.vtePlan === 'PHARMACOLOGICAL' || v.vtePlan === 'BOTH' },
      { key: 'vteFrequency', label: 'Frequency', kind: 'text', showIf: (v) => v.vtePlan === 'PHARMACOLOGICAL' || v.vtePlan === 'BOTH' },
      { key: 'vteStartAt', label: 'First dose at', kind: 'datetime', showIf: (v) => v.vtePlan === 'PHARMACOLOGICAL' || v.vtePlan === 'BOTH' },
      { key: 'vteDuration', label: 'Duration', kind: 'text', showIf: (v) => v.vtePlan === 'PHARMACOLOGICAL' || v.vtePlan === 'BOTH' },
      { key: 'vteWithheldReason', label: 'Reason not given', kind: 'text', showIf: (v) => v.vtePlan === 'NOT_INDICATED' || v.vtePlan === 'DEFERRED', importance: 'recommended' },
    ],
  },
  {
    key: 'antibiotics',
    title: 'Antibiotics',
    audience: 'nursing',
    fields: [
      { key: 'antibioticPlan', label: 'Antibiotics', kind: 'single', catalogue: 'ANTIBIOTIC_PLANS' },
      { key: 'antibioticDrug', label: 'Drug', kind: 'text', showIf: (v) => v.antibioticPlan === 'CONTINUE_PROPHYLAXIS' || v.antibioticPlan === 'THERAPEUTIC', importance: 'required' },
      { key: 'antibioticDose', label: 'Dose', kind: 'text', showIf: (v) => v.antibioticPlan === 'CONTINUE_PROPHYLAXIS' || v.antibioticPlan === 'THERAPEUTIC' },
      { key: 'antibioticRoute', label: 'Route', kind: 'text', showIf: (v) => v.antibioticPlan === 'CONTINUE_PROPHYLAXIS' || v.antibioticPlan === 'THERAPEUTIC' },
      { key: 'antibioticFrequency', label: 'Frequency', kind: 'text', showIf: (v) => v.antibioticPlan === 'CONTINUE_PROPHYLAXIS' || v.antibioticPlan === 'THERAPEUTIC' },
      { key: 'antibioticDuration', label: 'Duration', kind: 'text', showIf: (v) => v.antibioticPlan === 'CONTINUE_PROPHYLAXIS' || v.antibioticPlan === 'THERAPEUTIC' },
      { key: 'antibioticReviewOn', label: 'Stop / review on', kind: 'datetime', showIf: (v) => v.antibioticPlan === 'CONTINUE_PROPHYLAXIS' || v.antibioticPlan === 'THERAPEUTIC' },
    ],
  },
  {
    key: 'analgesia',
    title: 'Pain management',
    audience: 'nursing',
    fields: [
      { key: 'analgesiaPlan', label: 'Analgesia', kind: 'single', catalogue: 'ANALGESIA_PLANS' },
      { key: 'analgesiaOther', label: 'Other — specify', kind: 'text', showIf: (v) => v.analgesiaPlan === 'OTHER' },
      yesNo('painAssessmentRequired', 'Pain score to be charted with observations'),
      { key: 'analgesiaNotes', label: 'Notes', kind: 'text', placeholder: 'Block in situ, expected duration, escalation' },
    ],
  },
  {
    key: 'fluids',
    title: 'Intravenous fluids',
    audience: 'nursing',
    fields: [
      { key: 'fluidPlan', label: 'IV fluids', kind: 'single', catalogue: 'FLUID_PLANS' },
      { key: 'fluidType', label: 'Fluid', kind: 'text', showIf: (v) => v.fluidPlan === 'MAINTENANCE' || v.fluidPlan === 'REPLACEMENT' },
      { key: 'fluidRate', label: 'Rate', kind: 'text', showIf: (v) => v.fluidPlan === 'MAINTENANCE' || v.fluidPlan === 'REPLACEMENT', placeholder: 'e.g. 1 L over 8 hours' },
      { key: 'fluidNotes', label: 'Notes', kind: 'text' },
    ],
  },
  {
    key: 'catheter',
    title: 'Urinary catheter',
    audience: 'nursing',
    fields: [
      yesNo('catheterPresent', 'Urinary catheter in situ'),
      { key: 'catheterType', label: 'Type', kind: 'text', showIf: (v) => v.catheterPresent === true },
      { key: 'catheterIndication', label: 'Indication', kind: 'text', showIf: (v) => v.catheterPresent === true },
      { key: 'catheterMonitoring', label: 'Monitoring', kind: 'text', showIf: (v) => v.catheterPresent === true, placeholder: 'e.g. hourly urine output' },
      { key: 'catheterAction', label: 'Removal', kind: 'single', catalogue: 'CATHETER_ACTIONS', showIf: (v) => v.catheterPresent === true },
      { key: 'catheterRemovalAt', label: 'Remove at', kind: 'datetime', showIf: (v) => v.catheterAction === 'REMOVE_AT_TIME', importance: 'required' },
    ],
  },
  {
    key: 'woundMonitoring',
    title: 'Wound / operative site monitoring',
    audience: 'nursing',
    fields: [
      { key: 'woundMonitoring', label: 'Monitor', kind: 'multi', catalogue: 'WOUND_MONITORING', importance: 'recommended' },
      { key: 'woundMonitoringOther', label: 'Other — specify', kind: 'text', showIf: (v) => arr(v.woundMonitoring).includes('OTHER') },
      { key: 'firstDressingChangeAt', label: 'First dressing review', kind: 'datetime' },
      { key: 'woundMonitoringNotes', label: 'Notes', kind: 'text' },
    ],
  },
  {
    key: 'observations',
    title: 'Observations',
    audience: 'nursing',
    fields: [
      { key: 'observations', label: 'Chart', kind: 'multi', catalogue: 'OBSERVATIONS', importance: 'recommended' },
      { key: 'observationsOther', label: 'Other — specify', kind: 'text', showIf: (v) => arr(v.observations).includes('OTHER') },
      {
        key: 'observationFrequency',
        label: 'Frequency',
        kind: 'text',
        placeholder: 'e.g. 15-minutely for 1 hour, then hourly',
        help: 'Write the frequency you want. Nothing is filled in for you, because no single frequency is safe for every operation.',
        importance: 'recommended',
      },
    ],
  },
  {
    key: 'escalation',
    title: 'Notify the surgical team if',
    audience: 'nursing',
    blurb: 'These appear at the top of the nursing summary. A checklist is read; a paragraph is skimmed.',
    fields: [
      { key: 'escalationTriggers', label: 'Call the team for', kind: 'multi', catalogue: 'ESCALATION_TRIGGERS', importance: 'recommended' },
      { key: 'escalationOther', label: 'Other — specify', kind: 'text', showIf: (v) => arr(v.escalationTriggers).includes('OTHER') },
      { key: 'escalationNotes', label: 'Additional instructions', kind: 'text', rows: 2 },
      { key: 'escalationContact', label: 'Who to call', kind: 'text', placeholder: 'Name and number of the person on call for this patient' },
    ],
  },
  {
    key: 'review',
    title: 'Next surgical review',
    audience: 'nursing',
    fields: [
      { key: 'reviewTiming', label: 'Review', kind: 'single', catalogue: 'REVIEW_TIMING', importance: 'recommended' },
      { key: 'reviewAt', label: 'Review at', kind: 'datetime', showIf: (v) => v.reviewTiming === 'AT_TIME', importance: 'required' },
      { key: 'reviewOther', label: 'Other — specify', kind: 'text', showIf: (v) => v.reviewTiming === 'OTHER' },
      { key: 'reviewNotes', label: 'Plan', kind: 'longtext', rows: 4, placeholder: 'Further management, investigations, follow-up, discharge planning' },
    ],
  },
];

/** Reading a possibly-absent multi-select as an array. */
function arr(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

// ---------------------------------------------------------------------------
// Procedure-specific extensions
// ---------------------------------------------------------------------------

/**
 * Extensions, in the order they are tried. The FIRST match wins.
 *
 * Fields added by a template are marked `extra`, which stores them in the
 * note's `extras` JSONB rather than in a column. That is what makes a new
 * template a code change and not a migration — the requirement that adding one
 * must not mean rewriting the application is met only if it also does not mean
 * altering two databases. JSONB is still queryable (`extras->>'flapType'`) and
 * the column carries a GIN index, so these fields remain research data rather
 * than a dumping ground.
 *
 * A field that turns out to be asked of EVERY operation has earned a column,
 * and should be promoted into CORE_SECTIONS with a migration to match.
 */
export const PROCEDURE_TEMPLATES: ProcedureTemplate[] = [
  {
    key: 'FLAP',
    label: 'Flap surgery',
    version: 1,
    description: 'Adds flap details and the monitoring a flap needs overnight.',
    match: { keywords: ['flap', 'pedicle', 'rotation advancement', 'z-plasty', 'zplasty'] },
    sections: [
      {
        key: 'flap',
        title: 'Flap',
        audience: 'nursing',
        blurb: 'A flap that is failing is salvageable for a few hours. Everything here exists so the ward knows what to look at and when to call.',
        fields: [
          { key: 'flapType', label: 'Flap type', kind: 'single', catalogue: 'FLAP_TYPES', extra: true, importance: 'required' },
          { key: 'flapTypeOther', label: 'Other type — specify', kind: 'text', extra: true, showIf: (v) => v.flapType === 'OTHER' },
          { key: 'flapDonorSite', label: 'Donor site', kind: 'text', extra: true, importance: 'required' },
          { key: 'flapRecipientSite', label: 'Recipient site', kind: 'text', extra: true, importance: 'required' },
          { key: 'flapDimensions', label: 'Dimensions', kind: 'text', extra: true, placeholder: 'e.g. 12 x 6 cm' },
          { key: 'flapPedicle', label: 'Pedicle / blood supply', kind: 'text', extra: true },
          { key: 'flapAnastomosis', label: 'Anastomosis', kind: 'text', extra: true, placeholder: 'Vessels used, for a free flap' },
          { key: 'flapMonitoringParams', label: 'Monitor', kind: 'multi', catalogue: 'FLAP_MONITORING_PARAMS', extra: true, importance: 'required' },
          {
            key: 'flapMonitoringFrequency',
            label: 'Monitoring frequency',
            kind: 'text',
            extra: true,
            importance: 'required',
            placeholder: 'e.g. hourly for 24 hours, then 2-hourly',
          },
          { key: 'flapDopplerMarked', label: 'Doppler signal marked on the skin', kind: 'boolean', extra: true },
          { key: 'flapNotes', label: 'Flap notes', kind: 'text', extra: true },
        ],
      },
    ],
    suggests: {
      monitoring: ['MONITOR_FLAP', 'MONITOR_PERFUSION', 'MONITOR_SWELLING', 'MONITOR_HAEMATOMA'],
      escalation: ['FLAP_COLOUR_CHANGE', 'FLAP_TEMPERATURE_CHANGE', 'DOPPLER_LOST', 'INCREASING_SWELLING', 'EXCESSIVE_BLEEDING'],
      positionRestrictions: ['NOT_ON_FLAP', 'NO_PRESSURE_ON_PEDICLE'],
    },
    reminders: [
      'State the monitoring frequency explicitly. "Regular observation" is not an instruction anybody can follow.',
      'Say who is to be called, by name, and on what number.',
    ],
  },
  {
    key: 'SKIN_GRAFT',
    label: 'Skin grafting',
    version: 1,
    description: 'Adds graft and donor-site detail, and the first inspection date.',
    match: { keywords: ['graft', 'sstg', 'stsg', 'ftsg', 'split thickness', 'full thickness'] },
    sections: [
      {
        key: 'graft',
        title: 'Graft',
        audience: 'nursing',
        fields: [
          { key: 'graftType', label: 'Graft type', kind: 'single', catalogue: 'GRAFT_TYPES', extra: true, importance: 'required' },
          { key: 'graftTypeOther', label: 'Other type — specify', kind: 'text', extra: true, showIf: (v) => v.graftType === 'OTHER' },
          { key: 'graftRecipientSite', label: 'Recipient site', kind: 'text', extra: true, importance: 'required' },
          { key: 'graftDonorSite', label: 'Donor site', kind: 'text', extra: true, importance: 'required' },
          { key: 'graftAreaCm2', label: 'Area grafted', kind: 'number', unit: 'cm2', extra: true, min: 0, max: 20000 },
          { key: 'graftMeshRatio', label: 'Mesh ratio', kind: 'text', extra: true, placeholder: 'e.g. 1:1.5' },
          { key: 'graftFixation', label: 'Fixation', kind: 'text', extra: true, placeholder: 'Quilting, staples, tie-over' },
          { key: 'graftDressingProtocol', label: 'Graft dressing protocol', kind: 'text', extra: true, importance: 'required' },
          { key: 'graftFirstInspectionAt', label: 'First graft inspection', kind: 'datetime', extra: true, importance: 'required' },
          { key: 'graftImmobilisation', label: 'Immobilisation', kind: 'text', extra: true },
          { key: 'donorSiteDressing', label: 'Donor-site dressing', kind: 'text', extra: true, importance: 'required' },
          { key: 'donorSiteInstructions', label: 'Donor-site care', kind: 'text', extra: true, help: 'The donor site is the part most often left without an instruction, and the part the patient complains about most.' },
        ],
      },
    ],
    suggests: {
      monitoring: ['MONITOR_GRAFT', 'KEEP_DRESSING_INTACT', 'MONITOR_BLEEDING', 'MONITOR_INFECTION'],
      escalation: ['GRAFT_CONCERN', 'EXCESSIVE_BLEEDING', 'FEVER', 'WOUND_DISCHARGE'],
      positionRestrictions: ['NO_PRESSURE_ON_GRAFT', 'LIMB_ELEVATED'],
    },
    reminders: ['Give the donor site its own dressing instruction — it is the commonest omission on a graft note.'],
  },
  {
    key: 'DEBRIDEMENT',
    label: 'Wound debridement',
    version: 1,
    match: { keywords: ['debridement', 'debride', 'wound exploration', 'washout', 'fasciotomy', 'necrosectomy'] },
    sections: [
      {
        key: 'debridement',
        title: 'Debridement',
        fields: [
          { key: 'debridementTissues', label: 'Tissue removed', kind: 'text', extra: true, importance: 'required', placeholder: 'Skin, fat, fascia, muscle, bone' },
          { key: 'debridementAdequate', label: 'Debridement judged adequate', kind: 'boolean', extra: true },
          { key: 'furtherDebridementPlanned', label: 'Further debridement planned', kind: 'boolean', extra: true },
          { key: 'furtherDebridementAt', label: 'Planned for', kind: 'datetime', extra: true, showIf: (v) => v.furtherDebridementPlanned === true, importance: 'required' },
          { key: 'woundSizeAfter', label: 'Wound size after debridement', kind: 'text', extra: true },
          { key: 'cultureTaken', label: 'Tissue culture taken', kind: 'boolean', extra: true },
        ],
      },
    ],
    suggests: {
      monitoring: ['MONITOR_INFECTION', 'MONITOR_DISCHARGE', 'MONITOR_BLEEDING', 'DRESSING_CHANGE_DUE'],
      escalation: ['FEVER', 'EXCESSIVE_BLEEDING', 'WOUND_DISCHARGE', 'SEVERE_PAIN'],
    },
  },
  {
    key: 'KELOID_SCAR',
    label: 'Keloid excision / scar revision',
    version: 1,
    match: { keywords: ['keloid', 'scar revision', 'scar excision', 'contracture release'] },
    sections: [
      {
        key: 'keloid',
        title: 'Keloid / scar',
        fields: [
          { key: 'lesionSite', label: 'Site', kind: 'text', extra: true, importance: 'required' },
          { key: 'lesionSizeCm', label: 'Size', kind: 'text', extra: true, placeholder: 'e.g. 4 x 2 cm' },
          { key: 'recurrentLesion', label: 'Recurrent lesion', kind: 'boolean', extra: true },
          { key: 'previousTreatments', label: 'Previous treatment', kind: 'text', extra: true, showIf: (v) => v.recurrentLesion === true },
          { key: 'intralesionalSteroid', label: 'Intralesional steroid given', kind: 'boolean', extra: true },
          { key: 'steroidAgentDose', label: 'Agent and dose', kind: 'text', extra: true, showIf: (v) => v.intralesionalSteroid === true, importance: 'required' },
          { key: 'adjuvantPlanned', label: 'Adjuvant planned', kind: 'text', extra: true, placeholder: 'Pressure therapy, silicone, radiotherapy, further steroid' },
          { key: 'adjuvantFirstDueAt', label: 'First adjuvant due', kind: 'datetime', extra: true },
        ],
      },
    ],
    suggests: { monitoring: ['MONITOR_INFECTION', 'INSPECT_DRESSING'], escalation: ['WOUND_DISCHARGE', 'EXCESSIVE_BLEEDING'] },
  },
  {
    key: 'BURN',
    label: 'Burn surgery',
    version: 1,
    match: { keywords: ['burn', 'escharotomy', 'eschar'] },
    sections: [
      {
        key: 'burn',
        title: 'Burn',
        fields: [
          { key: 'burnTbsaPercent', label: 'Total body surface area involved', kind: 'number', unit: 'per cent', extra: true, min: 0, max: 100, importance: 'required' },
          { key: 'burnDepth', label: 'Depth', kind: 'text', extra: true, placeholder: 'Superficial, partial or full thickness' },
          { key: 'burnAreaTreated', label: 'Area treated today', kind: 'text', extra: true, importance: 'required' },
          { key: 'escharotomyPerformed', label: 'Escharotomy performed', kind: 'boolean', extra: true },
          { key: 'escharotomySites', label: 'Escharotomy sites', kind: 'text', extra: true, showIf: (v) => v.escharotomyPerformed === true, importance: 'required' },
          { key: 'burnFurtherSurgeryPlanned', label: 'Further surgery planned', kind: 'text', extra: true },
        ],
      },
    ],
    suggests: {
      monitoring: ['MONITOR_PERFUSION', 'MONITOR_DISTAL_CIRCULATION', 'MONITOR_INFECTION', 'MONITOR_BLEEDING'],
      escalation: ['DISTAL_ISCHAEMIA', 'FEVER', 'LOW_URINE_OUTPUT', 'LOW_SATURATION'],
      observations: ['URINE_OUTPUT', 'TEMPERATURE', 'BLOOD_PRESSURE', 'PULSE'],
    },
    reminders: ['Fluid resuscitation and urine output are usually the most important orders on a burn note.'],
  },
  {
    key: 'BREAST',
    label: 'Breast surgery',
    version: 1,
    match: { keywords: ['mastectomy', 'lumpectomy', 'breast', 'axillary clearance', 'wide local excision'] },
    sections: [
      {
        key: 'breast',
        title: 'Breast',
        fields: [
          { key: 'breastSide', label: 'Side', kind: 'text', extra: true, importance: 'required', placeholder: 'Right, left or bilateral' },
          { key: 'axillaryProcedure', label: 'Axillary procedure', kind: 'text', extra: true, placeholder: 'Sentinel node biopsy, clearance, none' },
          { key: 'nodesRetrieved', label: 'Nodes retrieved', kind: 'number', extra: true, min: 0, max: 100 },
          { key: 'specimenOrientated', label: 'Specimen orientated and marked', kind: 'boolean', extra: true },
          { key: 'reconstructionPerformed', label: 'Reconstruction performed', kind: 'boolean', extra: true },
          { key: 'reconstructionDetails', label: 'Reconstruction', kind: 'text', extra: true, showIf: (v) => v.reconstructionPerformed === true },
        ],
      },
    ],
    suggests: {
      monitoring: ['MONITOR_HAEMATOMA', 'MONITOR_BLEEDING', 'MONITOR_INFECTION'],
      escalation: ['EXCESSIVE_BLEEDING', 'INCREASING_SWELLING', 'HIGH_DRAIN_OUTPUT'],
    },
  },
  {
    key: 'ABDOMINAL',
    label: 'Abdominal surgery',
    version: 1,
    match: {
      keywords: ['laparotomy', 'laparoscop', 'hernia', 'appendic', 'cholecystectomy', 'colectomy', 'bowel', 'gastrectomy', 'splenectomy', 'hysterectomy', 'caesarean', 'anastomosis', 'stoma'],
    },
    sections: [
      {
        key: 'abdominal',
        title: 'Abdominal detail',
        fields: [
          { key: 'peritonealContamination', label: 'Peritoneal contamination', kind: 'text', extra: true },
          { key: 'bowelAnastomosis', label: 'Bowel anastomosis performed', kind: 'boolean', extra: true },
          { key: 'anastomosisDetails', label: 'Anastomosis', kind: 'text', extra: true, showIf: (v) => v.bowelAnastomosis === true, importance: 'required' },
          { key: 'stomaFormed', label: 'Stoma formed', kind: 'boolean', extra: true },
          { key: 'stomaDetails', label: 'Stoma type and site', kind: 'text', extra: true, showIf: (v) => v.stomaFormed === true, importance: 'required' },
          { key: 'meshUsed', label: 'Mesh used', kind: 'boolean', extra: true },
          { key: 'meshDetails', label: 'Mesh type and fixation', kind: 'text', extra: true, showIf: (v) => v.meshUsed === true },
          { key: 'nasogastricTube', label: 'Nasogastric tube in situ', kind: 'boolean', extra: true },
          { key: 'bowelSoundsInstruction', label: 'Feeding conditional on', kind: 'text', extra: true, placeholder: 'e.g. bowel sounds, flatus passed' },
        ],
      },
    ],
    suggests: {
      monitoring: ['MONITOR_BLEEDING', 'MONITOR_INFECTION', 'MONITOR_DISCHARGE'],
      escalation: ['SEVERE_PAIN', 'FEVER', 'VOMITING', 'LOW_URINE_OUTPUT', 'HIGH_DRAIN_OUTPUT', 'HYPOTENSION'],
      observations: ['BLOOD_PRESSURE', 'PULSE', 'TEMPERATURE', 'URINE_OUTPUT', 'DRAIN_OUTPUT', 'PAIN_SCORE'],
    },
  },
  {
    key: 'HAND',
    label: 'Hand surgery',
    version: 1,
    match: { keywords: ['hand', 'finger', 'thumb', 'tendon repair', 'carpal tunnel', 'trigger finger', 'digit', 'replant'] },
    sections: [
      {
        key: 'hand',
        title: 'Hand detail',
        fields: [
          { key: 'handSideDigits', label: 'Side and digits', kind: 'text', extra: true, importance: 'required' },
          { key: 'structuresRepaired', label: 'Structures repaired', kind: 'text', extra: true, placeholder: 'Tendons, nerves, vessels, bone' },
          { key: 'splintApplied', label: 'Splint applied', kind: 'boolean', extra: true },
          { key: 'splintDetails', label: 'Splint position', kind: 'text', extra: true, showIf: (v) => v.splintApplied === true, importance: 'required' },
          { key: 'handTherapyPlan', label: 'Hand therapy plan', kind: 'text', extra: true, placeholder: 'When mobilisation starts, and under whose protocol' },
          { key: 'handElevationRequired', label: 'Elevation required', kind: 'boolean', extra: true },
        ],
      },
    ],
    suggests: {
      monitoring: ['MONITOR_DISTAL_CIRCULATION', 'MONITOR_SENSATION', 'MONITOR_MOTOR', 'MONITOR_SWELLING', 'MONITOR_COMPARTMENT'],
      escalation: ['DISTAL_ISCHAEMIA', 'SEVERE_PAIN', 'INCREASING_SWELLING'],
      positionRestrictions: ['LIMB_ELEVATED'],
    },
  },
  {
    key: 'TRAUMA_ORTHO',
    label: 'Trauma and orthopaedic surgery',
    version: 1,
    match: {
      subspecialties: ['orthopaedics', 'orthopedics', 'trauma'],
      keywords: ['fracture', 'orif', 'k-wire', 'kwire', 'nailing', 'plating', 'external fixator', 'amputation', 'arthroplasty', 'arthroscopy', 'reduction'],
    },
    sections: [
      {
        key: 'ortho',
        title: 'Orthopaedic detail',
        fields: [
          { key: 'boneAndSide', label: 'Bone and side', kind: 'text', extra: true, importance: 'required' },
          { key: 'fixationType', label: 'Fixation', kind: 'text', extra: true, placeholder: 'Plate, nail, wires, external fixator' },
          { key: 'reductionQuality', label: 'Reduction', kind: 'text', extra: true },
          { key: 'imageIntensifierUsed', label: 'Image intensifier used', kind: 'boolean', extra: true },
          { key: 'weightBearingStatus', label: 'Weight-bearing status', kind: 'text', extra: true, importance: 'required' },
          { key: 'castOrSplint', label: 'Cast or splint applied', kind: 'text', extra: true },
          { key: 'postOpXrayRequired', label: 'Post-operative X-ray required', kind: 'boolean', extra: true },
        ],
      },
    ],
    suggests: {
      monitoring: ['MONITOR_DISTAL_CIRCULATION', 'MONITOR_SENSATION', 'MONITOR_MOTOR', 'MONITOR_COMPARTMENT', 'MONITOR_SWELLING'],
      escalation: ['DISTAL_ISCHAEMIA', 'SEVERE_PAIN', 'INCREASING_SWELLING'],
      positionRestrictions: ['LIMB_ELEVATED'],
    },
    reminders: ['Compartment syndrome after a limb injury is a pain that keeps rising despite analgesia. Say so on the escalation list.'],
  },
  {
    key: 'MINOR',
    label: 'Minor procedure',
    version: 1,
    description: 'A shorter form for a day case under local anaesthetic.',
    match: { keywords: ['excision biopsy', 'incision and drainage', 'i&d', 'lipoma', 'sebaceous cyst', 'circumcision', 'suturing', 'toilet and suturing', 'eua', 'examination under anaesthesia'] },
    suggests: {
      monitoring: ['INSPECT_DRESSING', 'MONITOR_BLEEDING'],
      escalation: ['EXCESSIVE_BLEEDING', 'SEVERE_PAIN', 'FEVER'],
    },
  },
];

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase();

/**
 * The template for an operation, chosen from its name and subspecialty.
 *
 * Keyword before subspecialty: "skin grafting" done by an orthopaedic surgeon
 * is still a graft, and the graft fields are the ones that matter. Returns null
 * when nothing matches, which is the common case and not a failure — the core
 * sections alone are a complete operation note.
 */
export function matchTemplate(
  procedureName: string | null | undefined,
  subspecialty?: string | null,
): ProcedureTemplate | null {
  const name = norm(procedureName);
  const spec = norm(subspecialty);

  if (name) {
    for (const t of PROCEDURE_TEMPLATES) {
      if ((t.match.keywords ?? []).some((k) => name.includes(k.toLowerCase()))) return t;
    }
  }
  if (spec) {
    for (const t of PROCEDURE_TEMPLATES) {
      if ((t.match.subspecialties ?? []).some((s) => spec.includes(s.toLowerCase()))) return t;
    }
  }
  return null;
}

/** A template by its stored key, for re-rendering a note written earlier. */
export function templateByKey(key: string | null | undefined): ProcedureTemplate | null {
  if (!key || key === 'CORE') return null;
  return PROCEDURE_TEMPLATES.find((t) => t.key === key) ?? null;
}

export interface ResolvedTemplate {
  key: string;
  label: string;
  version: number;
  description?: string;
  sections: SectionDef[];
  suggests: TemplateSuggestions;
  reminders: string[];
}

/**
 * The core sections with a template's additions folded in.
 *
 * Extension sections are placed before the post-operative orders rather than at
 * the end, because a flap section that appears after "next review" is a flap
 * section nobody scrolls to. Their position is found by the first nursing
 * section; if the core is ever reordered so there is none, they go at the end
 * rather than throwing.
 */
export function resolveTemplate(template: ProcedureTemplate | null): ResolvedTemplate {
  const sections = CORE_SECTIONS.map((s) => {
    const added = template?.extend?.[s.key];
    return added ? { ...s, fields: [...s.fields, ...added] } : s;
  });

  if (template?.sections?.length) {
    const at = sections.findIndex((s) => s.audience === 'nursing');
    const insertAt = at === -1 ? sections.length : at;
    sections.splice(insertAt, 0, ...template.sections);
  }

  return {
    key: template?.key ?? 'CORE',
    label: template?.label ?? 'General operation note',
    version: template?.version ?? 1,
    description: template?.description,
    sections,
    suggests: template?.suggests ?? {},
    reminders: template?.reminders ?? [],
  };
}

/**
 * A catalogue reordered so the options this operation usually needs come first.
 *
 * SUGGESTED, NOT SELECTED. Nothing here ticks a box. Moving four options to the
 * top of a list of sixteen is help; ticking them is prescribing, and a template
 * does not get to do that.
 */
export function suggestedFirst(
  options: { value: string; label: string; hint?: string }[],
  suggested: string[] | undefined,
): { value: string; label: string; hint?: string; suggested?: boolean }[] {
  if (!suggested?.length) return options;
  const set = new Set(suggested);
  const head = options.filter((o) => set.has(o.value)).map((o) => ({ ...o, suggested: true }));
  const tail = options.filter((o) => !set.has(o.value));
  return [...head, ...tail];
}

/** Every field in a resolved template, flattened — used by the API to validate. */
export function allFields(resolved: ResolvedTemplate): FieldDef[] {
  return resolved.sections.flatMap((s) => s.fields);
}

/** The keys a template stores in `extras` rather than in columns. */
export function extraKeys(resolved: ResolvedTemplate): string[] {
  return allFields(resolved).filter((f) => f.extra).map((f) => f.key);
}
