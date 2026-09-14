// ============================================================
// The page the ward actually reads
// ------------------------------------------------------------
// One sheet, generated from what the surgeon signed, saying what to do with
// this patient tonight.
//
// IT IS NOT A SECOND RECORD. Nothing here is stored. It is rendered from the
// signed note every time it is asked for, so it cannot drift from what was
// signed and there is never a question of which version is true. The signed
// note remains the medical record; this is a reading of it.
//
// WHAT GOES FIRST IS THE POINT. Escalation comes before everything else —
// before position, before feeding — because the one thing a nurse must not have
// to hunt for at two in the morning is when to call. Everything else on this
// sheet can wait until the reader has time; that line cannot.
//
// Sections with nothing in them are omitted rather than printed empty. A sheet
// that says "FLUIDS: —" trains people to skim, and a skimmed sheet is the same
// as no sheet.
// ============================================================

import type { NoteValues } from './templates';
import type { ChildRows } from './validate';
import { labelOf, labelsOf } from './vocabulary';

export interface SummaryEntry {
  /** The heading, as it appears on the sheet. */
  heading: string;
  /** One or more lines under it. Never empty — an empty section is dropped. */
  lines: string[];
  /**
   * Drawn in red and placed first. Used only for escalation and for
   * restrictions that exist to stop a specific harm.
   */
  urgent?: boolean;
}

export interface NursingSummary {
  entries: SummaryEntry[];
  /** Rendered as the standing caption on the sheet. */
  attribution: string;
}

const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

const text = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  return String(v).trim();
};

/** A timestamp as a ward reads one: "15 Sep, 09:00". */
function when(v: unknown): string | null {
  if (isBlank(v)) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Resolve a catalogue choice, following its "Other" field when that was chosen.
 *
 * A sheet that says "Other" has told the reader nothing. If the surgeon wrote
 * what the other thing was, that is what belongs on the sheet.
 */
function choice(values: NoteValues, key: string, catalogue: string, otherKey?: string): string | null {
  const v = values[key];
  if (isBlank(v)) return null;
  if (v === 'OTHER' && otherKey && !isBlank(values[otherKey])) return String(values[otherKey]).trim();
  return labelOf(catalogue, String(v));
}

function choices(values: NoteValues, key: string, catalogue: string, otherKey?: string): string[] {
  const list = arr(values[key]);
  if (!list.length) return [];
  const out = labelsOf(catalogue, list.filter((v) => v !== 'OTHER'));
  if (list.includes('OTHER')) {
    const spelled = otherKey ? text(values[otherKey]) : null;
    out.push(spelled ?? labelOf(catalogue, 'OTHER'));
  }
  return out;
}

/**
 * The nursing sheet for a signed note.
 *
 * `values` is the note's own fields; `children` its repeating rows. Both are
 * plain data — this renders identically on the server, in the browser and in
 * the PDF.
 */
export function buildNursingSummary(
  values: NoteValues,
  children: ChildRows = {},
  meta: { surgeonName?: string | null; signedAt?: Date | string | null } = {},
): NursingSummary {
  const entries: SummaryEntry[] = [];
  const push = (heading: string, lines: (string | null)[], urgent = false) => {
    const kept = lines.filter((l): l is string => !!l && l.trim() !== '');
    if (kept.length) entries.push({ heading, lines: kept, urgent });
  };

  // ---- 1. When to call. Always first. -------------------------------------
  const triggers = choices(values, 'escalationTriggers', 'ESCALATION_TRIGGERS', 'escalationOther');
  const contact = text(values.escalationContact);
  push('CALL THE SURGICAL TEAM IF', [
    ...triggers,
    text(values.escalationNotes),
    contact ? `Call: ${contact}` : null,
  ], true);

  // ---- 2. Position --------------------------------------------------------
  const position = choice(values, 'wardPosition', 'WARD_POSITIONS', 'wardPositionOther');
  const elevation = isBlank(values.headElevationDegrees) ? null
    : `Head elevated ${Number(values.headElevationDegrees)} degrees`;
  const restrictions = choices(values, 'positionRestrictions', 'POSITION_RESTRICTIONS', 'positionRestrictionOther');
  push('POSITION', [position, elevation, ...restrictions]);

  // ---- 3. Feeding ---------------------------------------------------------
  const feeding = choice(values, 'feedingTiming', 'FEEDING_TIMING', 'feedingOther');
  const feedAt = values.feedingTiming === 'AT_TIME' ? when(values.feedingAt) : null;
  const diet = choice(values, 'dietType', 'DIET_TYPES', 'dietOther');
  push('FEEDING', [
    feedAt ? `${feeding} — ${feedAt}` : feeding,
    diet,
    text(values.feedingNotes),
  ]);

  // ---- 4. Mobilisation ----------------------------------------------------
  push('MOBILISATION', [
    choice(values, 'mobilisation', 'MOBILISATION', 'mobilisationOther'),
    ...choices(values, 'mobilisationRestrictions', 'MOBILISATION_RESTRICTIONS', 'mobilisationRestrictionOther'),
  ]);

  // ---- 5. Medications -----------------------------------------------------
  const oral = choice(values, 'oralMedicationTiming', 'MEDICATION_TIMING', 'oralMedicationOther');
  const oralAt = values.oralMedicationTiming === 'AT_TIME' ? when(values.oralMedicationAt) : null;
  const held = (children.heldMedications ?? []).map((m) => {
    const name = text(m.drugName);
    if (!name) return null;
    const instruction = m.restartInstruction === 'AT_TIME'
      ? `restart ${when(m.restartAt) ?? 'at the stated time'}`
      : m.restartInstruction === 'OTHER'
        ? (text(m.restartOther) ?? 'see the note')
        : (isBlank(m.restartInstruction) ? 'no restart instruction given' : labelOf('RESTART_INSTRUCTIONS', String(m.restartInstruction)).toLowerCase());
    return `${name} — ${instruction}`;
  });
  // The standing line goes in only if there is a medication instruction to
  // stand beside. On its own it would keep the section alive on every sheet,
  // including one with no medication orders at all — and a heading that is
  // always there with nothing under it is what teaches people to skim.
  const medicationLines = [oralAt ? `${oral} — ${oralAt}` : oral, ...held]
    .filter((l): l is string => !!l);
  push('MEDICATIONS', medicationLines.length
    ? [...medicationLines, 'Give according to the signed prescription.']
    : []);

  // ---- 6. VTE -------------------------------------------------------------
  const vte = choice(values, 'vtePlan', 'VTE_PLANS');
  const mechanical = choices(values, 'vteMechanical', 'VTE_MECHANICAL', 'vteMechanicalOther');
  const drug = text(values.vteDrug);
  const pharm = drug
    ? [drug, text(values.vteDose), text(values.vteRoute), text(values.vteFrequency)]
        .filter(Boolean).join(' ')
    : null;
  push('DVT / VTE PROPHYLAXIS', [
    vte,
    ...mechanical,
    pharm,
    values.vteStartAt ? `First dose ${when(values.vteStartAt)}` : null,
    text(values.vteDuration) ? `For ${String(values.vteDuration).trim()}` : null,
    text(values.vteWithheldReason),
  ]);

  // ---- 7. Analgesia, fluids, catheter -------------------------------------
  push('PAIN', [
    choice(values, 'analgesiaPlan', 'ANALGESIA_PLANS', 'analgesiaOther'),
    values.painAssessmentRequired === true ? 'Chart a pain score with each set of observations.' : null,
    text(values.analgesiaNotes),
  ]);

  push('FLUIDS', [
    choice(values, 'fluidPlan', 'FLUID_PLANS'),
    text(values.fluidType),
    text(values.fluidRate),
    text(values.fluidNotes),
  ]);

  if (values.catheterPresent === true) {
    push('URINARY CATHETER', [
      text(values.catheterType) ? `${String(values.catheterType).trim()} in situ` : 'Catheter in situ',
      text(values.catheterMonitoring),
      values.catheterAction === 'REMOVE_AT_TIME'
        ? `Remove ${when(values.catheterRemovalAt) ?? 'at the stated time'}`
        : choice(values, 'catheterAction', 'CATHETER_ACTIONS'),
    ]);
  }

  // ---- 8. Wound and drains ------------------------------------------------
  const drains = (children.drains ?? []).map((d, i) => {
    const type = d.drainType === 'OTHER'
      ? (text(d.drainTypeOther) ?? 'drain')
      : (isBlank(d.drainType) ? 'Drain' : labelOf('DRAIN_TYPES', String(d.drainType)));
    const site = text(d.site);
    const head = `${type}${site ? ` at ${site}` : ''}`;
    const detail = [text(d.monitoring), text(d.removalCriteria)].filter(Boolean).join('; ');
    return detail ? `${head} — ${detail}` : `${head}${drainsNeedInstruction(d) ? ' — no instruction given' : ''}`;
  });
  push('WOUND', [
    ...choices(values, 'woundMonitoring', 'WOUND_MONITORING', 'woundMonitoringOther'),
    values.firstDressingChangeAt ? `First dressing review ${when(values.firstDressingChangeAt)}` : null,
    text(values.woundMonitoringNotes),
    ...drains,
  ]);

  // ---- 9. Observations ----------------------------------------------------
  const obs = choices(values, 'observations', 'OBSERVATIONS', 'observationsOther');
  const freq = text(values.observationFrequency);
  push('OBSERVATIONS', [
    obs.length ? obs.join(', ') : null,
    freq ? `Frequency: ${freq}` : null,
  ]);

  // ---- 10. Flap and graft, when the template captured them ----------------
  // These live in `extras`, and the summary reads them directly rather than
  // through the template — a ward sheet must not depend on the template module
  // still holding a matching definition years later.
  const extras = (values.extras ?? {}) as Record<string, unknown>;
  const flapParams = arr(extras.flapMonitoringParams);
  push('FLAP', [
    text(extras.flapType) ? `${labelOf('FLAP_TYPES', String(extras.flapType))} at ${text(extras.flapRecipientSite) ?? 'the operative site'}` : null,
    flapParams.length ? `Check: ${labelsOf('FLAP_MONITORING_PARAMS', flapParams).join(', ')}` : null,
    text(extras.flapMonitoringFrequency) ? `Frequency: ${String(extras.flapMonitoringFrequency).trim()}` : null,
    extras.flapDopplerMarked === true ? 'The Doppler signal is marked on the skin.' : null,
    text(extras.flapNotes),
  ], true);

  push('GRAFT', [
    text(extras.graftType) ? `${labelOf('GRAFT_TYPES', String(extras.graftType))} to ${text(extras.graftRecipientSite) ?? 'the recipient site'}` : null,
    text(extras.graftDressingProtocol),
    extras.graftFirstInspectionAt ? `First inspection ${when(extras.graftFirstInspectionAt)}` : null,
    text(extras.graftImmobilisation),
    text(extras.donorSiteDressing) ? `Donor site (${text(extras.graftDonorSite) ?? 'see note'}): ${text(extras.donorSiteDressing)}` : null,
    text(extras.donorSiteInstructions),
  ]);

  // ---- 11. Next review ----------------------------------------------------
  const reviewAt = values.reviewTiming === 'AT_TIME' ? when(values.reviewAt) : null;
  push('NEXT REVIEW', [
    reviewAt ?? choice(values, 'reviewTiming', 'REVIEW_TIMING', 'reviewOther'),
    text(values.reviewNotes),
  ]);

  // Urgent sections lead, in the order they were built.
  entries.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));

  const signed = when(meta.signedAt);
  const by = meta.surgeonName?.trim();
  const attribution =
    `These are the instructions signed by ${by || 'the operating surgeon'}` +
    `${signed ? ` at ${signed}` : ''}. ` +
    'This sheet is generated from that signed note and is not itself the medical record.';

  return { entries, attribution };
}

/** A drain row carrying neither a monitoring nor a removal instruction. */
function drainsNeedInstruction(d: NoteValues): boolean {
  return isBlank(d.monitoring) && isBlank(d.removalCriteria);
}

/** The sheet as plain text, for a thermal printer or a WhatsApp message. */
export function summaryToText(summary: NursingSummary): string {
  const body = summary.entries
    .map((e) => `${e.heading}\n${e.lines.map((l) => `  - ${l}`).join('\n')}`)
    .join('\n\n');
  return `${body}\n\n${summary.attribution}`;
}
