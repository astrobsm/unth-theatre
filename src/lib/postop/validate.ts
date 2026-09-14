// ============================================================
// Catching the orders a nurse cannot carry out
// ------------------------------------------------------------
// An ambiguous instruction is worse than a missing one. A blank feeding field
// makes somebody ask; "start feeds at the specified time" with no time looks
// complete, gets signed, and is discovered at two in the morning by a nurse who
// then has to decide for herself and carry it.
//
// So this module looks for orders that LOOK finished and are not. It runs on
// the form as the surgeon types, and again on the server before a note is
// signed — the same function, so the two can never disagree about what counts
// as complete.
//
// TWO SEVERITIES, AND THE DIFFERENCE MATTERS.
//
//   'blocking' — the note cannot be signed. Reserved for an instruction that is
//   positively unsafe to leave as it stands: a timing with no time, a drug
//   order with no drug. Somebody chose the option, so the intent exists; only
//   the detail that makes it actionable is missing.
//
//   'advisory' — shown, never enforced. A surgeon who genuinely wants to leave
//   the escalation list empty is allowed to. The moment this module starts
//   refusing notes over matters of judgement, the honest response is to write
//   the shortest note that gets past it, and then the record is worse than
//   before.
//
// NOTHING HERE IS A CLINICAL RULE. It does not know that a laparotomy patient
// should have prophylaxis, and it must not learn: that is a prescribing
// decision. It knows only that a half-written order is not an order.
// ============================================================

import type { NoteValues, ResolvedTemplate, FieldDef, SectionDef } from './templates';

export type Severity = 'blocking' | 'advisory';

export interface Problem {
  /** The field to scroll to and outline. */
  field: string;
  /** The section it lives in, for grouping in the UI. */
  section?: string;
  severity: Severity;
  /** Addressed to the surgeon, saying what to do rather than what is wrong. */
  message: string;
}

/** Rows of a repeating section, as the form holds them. */
export interface ChildRows {
  prepSteps?: NoteValues[];
  drains?: NoteValues[];
  specimens?: NoteValues[];
  heldMedications?: NoteValues[];
}

const isBlank = (v: unknown): boolean => {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
};

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

/** Whether a field is on screen at all — an invisible field is never required. */
const visible = (f: FieldDef, values: NoteValues): boolean => (f.showIf ? f.showIf(values) : true);

/**
 * Every problem with a note, in the order they appear on the form.
 *
 * `values` is the flat field map; `children` holds the repeating sections. Both
 * are plain data, so this runs identically in the browser and on the server.
 */
export function validateNote(
  template: ResolvedTemplate,
  values: NoteValues,
  children: ChildRows = {},
): Problem[] {
  const problems: Problem[] = [];
  const add = (field: string, severity: Severity, message: string, section?: string) =>
    problems.push({ field, severity, message, section });

  // ---- Fields the template marks as required, where they are visible ------
  for (const section of template.sections) {
    if (section.repeat) continue; // handled row by row below
    if (section.showIf && !section.showIf(values)) continue;

    for (const f of section.fields) {
      if (!visible(f, values)) continue;
      if (f.importance === 'required' && isBlank(values[f.key])) {
        add(f.key, 'blocking', `${f.label} is needed before this note can be signed.`, section.key);
      }
      if (f.importance === 'recommended' && isBlank(values[f.key])) {
        add(f.key, 'advisory', `${f.label} has been left blank.`, section.key);
      }
      // A number outside its range is a typo, and 50,000 mL of blood loss will
      // otherwise sit in the record and in every average computed from it.
      if (f.kind === 'number' && !isBlank(values[f.key])) {
        const n = Number(values[f.key]);
        if (!Number.isFinite(n)) {
          add(f.key, 'blocking', `${f.label} must be a number.`, section.key);
        } else if (f.min !== undefined && n < f.min) {
          add(f.key, 'blocking', `${f.label} cannot be less than ${f.min}.`, section.key);
        } else if (f.max !== undefined && n > f.max) {
          add(f.key, 'blocking', `${f.label} looks wrong — the highest this field accepts is ${f.max}.`, section.key);
        }
      }
    }
  }

  // ---- Rows of the repeating sections ------------------------------------
  for (const section of template.sections) {
    if (!section.repeat) continue;
    const rows = children[section.repeat] ?? [];
    rows.forEach((row, i) => {
      for (const f of section.fields) {
        if (!visible(f, row)) continue;
        if (f.importance === 'required' && isBlank(row[f.key])) {
          add(`${section.repeat}.${i}.${f.key}`, 'blocking',
            `${section.title}, entry ${i + 1}: ${f.label.toLowerCase()} is needed.`, section.key);
        }
      }
    });
  }

  // ---- "Other" chosen, nothing specified ---------------------------------
  // The template pairs each "Other" with a field to describe it, and those are
  // marked required, so the loop above catches most. This covers the multi-
  // selects, whose specify-field cannot be marked required without demanding it
  // when OTHER is not chosen.
  const otherPairs: [string, string, string][] = [
    ['positions', 'positionOther', 'the other position'],
    ['incisionTypes', 'incisionOther', 'the other incision'],
    ['haemostasisMethods', 'haemostasisOther', 'the other method of haemostasis'],
    ['closureMethods', 'closureOther', 'the other closure'],
    ['dressingTypes', 'dressingOther', 'the other dressing'],
    ['positionRestrictions', 'positionRestrictionOther', 'the other position restriction'],
    ['mobilisationRestrictions', 'mobilisationRestrictionOther', 'the other restriction'],
    ['woundMonitoring', 'woundMonitoringOther', 'what else to monitor'],
    ['observations', 'observationsOther', 'the other observation'],
    ['escalationTriggers', 'escalationOther', 'the other reason to call'],
    ['vteMechanical', 'vteMechanicalOther', 'the other mechanical method'],
  ];
  for (const [list, specify, what] of otherPairs) {
    if (arr(values[list]).includes('OTHER') && isBlank(values[specify])) {
      add(specify, 'blocking', `You chose "Other" — please say what ${what} was.`);
    }
  }

  // ---- Orders that name a time but do not give one -----------------------
  // Each of these is an instruction a nurse cannot act on. The pattern is
  // always the same: an option ending AT_TIME, and an empty timestamp beside it.
  const timings: [string, string, string, string][] = [
    ['feedingTiming', 'AT_TIME', 'feedingAt', 'Feeds are to start at a specified time, but no time is given.'],
    ['oralMedicationTiming', 'AT_TIME', 'oralMedicationAt', 'Oral medications are to start at a specified time, but no time is given.'],
    ['catheterAction', 'REMOVE_AT_TIME', 'catheterRemovalAt', 'The catheter is to be removed at a specified time, but no time is given.'],
    ['reviewTiming', 'AT_TIME', 'reviewAt', 'A review is set for a specified time, but no time is given.'],
  ];
  for (const [field, trigger, timeField, message] of timings) {
    if (values[field] === trigger && isBlank(values[timeField])) {
      add(timeField, 'blocking', message);
    }
  }

  // ---- VTE prophylaxis ---------------------------------------------------
  // The requirement is emphatic that this is not a yes/no, and the failure it
  // guards against is a plan chosen and then not specified.
  const vte = values.vtePlan;
  if (vte === 'MECHANICAL' || vte === 'BOTH') {
    if (isBlank(values.vteMechanical)) {
      add('vteMechanical', 'blocking', 'Mechanical prophylaxis is ordered but no method is named.');
    }
  }
  if (vte === 'PHARMACOLOGICAL' || vte === 'BOTH') {
    if (isBlank(values.vteDrug)) {
      add('vteDrug', 'blocking', 'Pharmacological prophylaxis is ordered but no drug is named.');
    }
    if (isBlank(values.vteDose)) {
      add('vteDose', 'blocking', 'Pharmacological prophylaxis is ordered but no dose is given.');
    }
  }
  if (isBlank(vte)) {
    add('vtePlan', 'advisory',
      'VTE prophylaxis has not been addressed. "Not indicated" is a valid answer and is worth recording as one.');
  }

  // ---- Antibiotics -------------------------------------------------------
  if ((values.antibioticPlan === 'THERAPEUTIC' || values.antibioticPlan === 'CONTINUE_PROPHYLAXIS')
      && isBlank(values.antibioticDrug)) {
    add('antibioticDrug', 'blocking', 'Antibiotics are ordered but no drug is named.');
  }

  // ---- Held medications --------------------------------------------------
  (children.heldMedications ?? []).forEach((row, i) => {
    if (!isBlank(row.restartInstruction) && isBlank(row.drugName)) {
      add(`heldMedications.${i}.drugName`, 'blocking',
        'A restart instruction has been given without naming the medication.');
    }
  });

  // ---- Observations ------------------------------------------------------
  if (!isBlank(values.observations) && isBlank(values.observationFrequency)) {
    add('observationFrequency', 'blocking',
      'Observations are ordered but no frequency is given. Nothing is filled in here automatically, because no one frequency is safe for every operation.');
  }

  // ---- Contradictions ----------------------------------------------------
  // Two orders that cannot both be followed. Advisory rather than blocking: a
  // surgeon may have a reason, and being overruled by a form is how people stop
  // reading what the form says.
  if (values.feedingTiming === 'NIL_BY_MOUTH' && values.oralMedicationTiming === 'IMMEDIATELY') {
    add('oralMedicationTiming', 'advisory',
      'The patient is nil by mouth, but oral medications are to start immediately. One of these needs changing.');
  }
  if (values.feedingTiming === 'NIL_BY_MOUTH' && !isBlank(values.dietType)) {
    add('dietType', 'advisory', 'A diet is specified for a patient who is nil by mouth.');
  }
  const mob = values.mobilisation;
  if ((mob === 'BED_REST' || mob === 'BED_REST_UNTIL_REVIEW')
      && arr(values.mobilisationRestrictions).includes('LIMB_ELEVATION_MAINTAINED') === false
      && arr(values.positionRestrictions).includes('LIMB_DEPENDENT')) {
    add('positionRestrictions', 'advisory',
      'The limb is to be kept dependent while the patient is on bed rest. Confirm that is what you mean.');
  }
  if (arr(values.positionRestrictions).includes('LIMB_ELEVATED')
      && arr(values.positionRestrictions).includes('LIMB_DEPENDENT')) {
    add('positionRestrictions', 'blocking',
      'The limb cannot be both elevated and dependent. Choose one.');
  }

  // ---- Escalation --------------------------------------------------------
  if (isBlank(values.escalationTriggers) && isBlank(values.escalationNotes)) {
    add('escalationTriggers', 'advisory',
      'Nothing tells the ward when to call you. This is the section nurses read first.');
  }

  // ---- Drains ------------------------------------------------------------
  // A drain with no removal instruction is the drain still in at day nine.
  (children.drains ?? []).forEach((row, i) => {
    if (isBlank(row.removalCriteria) && isBlank(row.monitoring)) {
      add(`drains.${i}.removalCriteria`, 'advisory',
        `Drain ${i + 1} has neither a monitoring nor a removal instruction.`);
    }
  });

  return problems;
}

/** Whether the note can be signed. */
export function canSign(problems: Problem[]): boolean {
  return !problems.some((p) => p.severity === 'blocking');
}

/** Problems grouped by section, for rendering beside each heading. */
export function bySection(problems: Problem[]): Record<string, Problem[]> {
  const out: Record<string, Problem[]> = {};
  for (const p of problems) {
    const key = p.section ?? 'other';
    (out[key] ??= []).push(p);
  }
  return out;
}

/**
 * A count for the banner at the top of the form.
 *
 * Separate counts rather than one total, because "3 things to fix" and
 * "3 things to consider" are different messages and collapsing them makes the
 * blocking ones look optional.
 */
export function countProblems(problems: Problem[]): { blocking: number; advisory: number } {
  return {
    blocking: problems.filter((p) => p.severity === 'blocking').length,
    advisory: problems.filter((p) => p.severity === 'advisory').length,
  };
}

/** Used by the form to decide whether a section needs a warning dot. */
export function sectionHasBlocking(problems: Problem[], section: SectionDef): boolean {
  return problems.some((p) => p.section === section.key && p.severity === 'blocking');
}
