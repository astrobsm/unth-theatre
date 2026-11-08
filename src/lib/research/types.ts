// ============================================================
// What a research variable is, and where it comes from
// ------------------------------------------------------------
// Asked for on 8 November: take everything this application captures from the
// booking of a surgery to the patient's return to the ward and make it
// queryable — surgeon by surgeon, subspecialty by subspecialty, through the
// diagnosis and the indication — so that the research module is worth opening
// to a surgeon or an anaesthetist.
//
// ONE CATALOGUE, AND THE ACCESSOR LIVES IN IT. A variable is not a label in
// one file and a getter in another. The definition carries its own `read`, so
// a variable cannot exist on a screen without a value behind it, and a value
// cannot be computed that no screen can name. The previous module had the two
// halves apart and carried four numeric variables; the clinical record behind
// it carries several hundred fields.
//
// EVERY VARIABLE SAYS WHERE IT CAME FROM. `source` is the screen a clinician
// would go to in order to check a figure, and `help` is what the figure
// actually means. A research dataset whose provenance cannot be stated is a
// dataset no reviewer should accept and no journal will publish.
//
// DERIVED VARIABLES ARE MARKED AS DERIVED. An interval computed from two
// timestamps is a different kind of claim from a field somebody typed, and a
// reader comparing "operating time" across two hospitals needs to know which
// one they are looking at. See derive.ts, where every derivation is a pure
// function with the definition in its comment.
//
// NOTHING HERE IDENTIFIES A PATIENT. There is no name, no folder number and
// no date of birth in the catalogue — ages are years, dates are reduced to a
// month, and the free-text clinical fields that are exposed (diagnosis,
// indication, procedure) are the ones a case series is actually about. The
// query builder's export anonymises further still.
// ============================================================

/** What a variable holds, which decides what can be done with it. */
export type VariableKind = 'numeric' | 'categorical' | 'boolean' | 'date';

/** The stage of the patient's journey a variable is captured at. */
export type DomainKey =
  | 'patient'
  | 'booking'
  | 'diagnosis'
  | 'risk'
  | 'labs'
  | 'anaesthetic_assessment'
  | 'holding'
  | 'who'
  | 'process'
  | 'intraop'
  | 'anaesthesia'
  | 'counts'
  | 'blood'
  | 'recovery'
  | 'outcome'
  | 'cancellation'
  | 'documentation'
  | 'team'
  | 'cost';

export interface ResearchDomain {
  key: DomainKey;
  label: string;
  /** One line: what question this group of variables answers. */
  blurb: string;
}

/**
 * The journey, in order.
 *
 * The ORDER IS THE JOURNEY and not alphabetical, because that is how a
 * surgeon thinks about a case and how a methods section is written: the
 * patient arrives, is assessed, is prepared, is operated on, recovers, and
 * goes back to the ward. A picker sorted A–Z puts "anaesthesia" above
 * "booking" and reads as a database rather than as a patient.
 */
export const RESEARCH_DOMAINS: readonly ResearchDomain[] = [
  { key: 'patient', label: 'Patient & demography', blurb: 'Who the patient is: age, sex, ward, and the age bands a paper reports in.' },
  { key: 'booking', label: 'Booking & scheduling', blurb: 'When and how the case reached the list, and how far ahead it was booked.' },
  { key: 'diagnosis', label: 'Diagnosis, indication & procedure', blurb: 'What was wrong, why the patient was operated on, and what was done.' },
  { key: 'risk', label: 'Preoperative risk & comorbidity', blurb: 'ASA, WHO risk class, DVT and bleeding risk, comorbidity and the drugs that change a plan.' },
  { key: 'labs', label: 'Preoperative investigations', blurb: 'Haemoglobin, electrolytes, renal function and viral status as recorded at booking.' },
  { key: 'anaesthetic_assessment', label: 'Anaesthetic assessment', blurb: 'The pre-operative anaesthetic review: airway, fasting, fitness and the plan.' },
  { key: 'holding', label: 'Holding area & readiness', blurb: 'What the holding area found: identity, consent, fasting, site marking, vitals and red alerts.' },
  { key: 'who', label: 'WHO surgical safety checklist', blurb: 'Sign in, time out and sign out — the compliance denominators a safety paper needs.' },
  { key: 'process', label: 'Theatre process & intervals', blurb: 'Every interval from room entry to room exit, and the delays between them.' },
  { key: 'intraop', label: 'Intraoperative events', blurb: 'Findings, blood loss, wound class, implants, specimens, drains and complications.' },
  { key: 'anaesthesia', label: 'Anaesthesia conduct & events', blurb: 'Technique, airway grade, attempts, and the physiological events of the anaesthetic.' },
  { key: 'counts', label: 'Surgical counts', blurb: 'Swab, instrument and sharps counts, discrepancies and how they were resolved.' },
  { key: 'blood', label: 'Blood & transfusion', blurb: 'What was requested, what was cross-matched, and what was actually given.' },
  { key: 'recovery', label: 'Recovery (PACU)', blurb: 'Aldrete, pain, nausea, temperature, complications and length of stay in recovery.' },
  { key: 'outcome', label: 'Outcomes & disposition', blurb: 'Where the patient went, whether anything went wrong, and whether they died.' },
  { key: 'cancellation', label: 'Cancellation & delay', blurb: 'Cases that did not happen, and cases that happened late — with the reason.' },
  { key: 'documentation', label: 'Documentation completeness', blurb: 'Which records exist for a case at all. The denominator of every other variable here.' },
  { key: 'team', label: 'Team & workforce', blurb: 'Who operated, who anaesthetised, grade, supervision and whether the case crossed units.' },
  { key: 'cost', label: 'Cost & finance', blurb: 'What the case was costed at, what the patient was charged, and whether a deposit was confirmed.' },
];

export const DOMAIN_LABEL: Record<DomainKey, string> = Object.fromEntries(
  RESEARCH_DOMAINS.map((d) => [d.key, d.label]),
) as Record<DomainKey, string>;

/** A single value in a research dataset. */
export type VariableValue = number | string | boolean | Date | null;

/**
 * The shape a case is read from.
 *
 * Deliberately loose. These are Prisma rows with a dozen optional relations,
 * and typing them strictly here would mean reproducing a third of the schema
 * in this file and changing it every time a column moves. What matters for
 * correctness is that every accessor tolerates a missing relation — which is
 * the normal case, not the exception: most cases have no operation note, and
 * a cancelled case has nothing after the booking at all.
 */
export interface RawCase {
  [key: string]: unknown;
}

export interface ResearchVariable {
  /** Stable id used in queries, exports and saved study definitions. */
  key: string;
  /** What a clinician calls it. */
  label: string;
  domain: DomainKey;
  kind: VariableKind;
  /** mL, minutes, g/dL … Shown next to the figure, never inside it. */
  unit?: string;
  /** What the figure means, in one sentence. */
  help: string;
  /** The screen a clinician would open to check it. */
  source: string;
  /** True when this is computed here rather than stored. See derive.ts. */
  derived?: boolean;
  /**
   * For a categorical variable whose values are a known set — lets a picker
   * offer them instead of making somebody type a code they have to guess.
   */
  values?: readonly string[];
  /** Pulls the value out of a case. Tolerates every relation being absent. */
  read: (c: RawCase) => VariableValue;
}

/** A variable's value, coerced for a numeric analysis. Null when not usable. */
export function numericValue(v: VariableValue): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * A variable's value as a category label. Null when there is nothing to group
 * by — which is NOT the same as a category called "Unknown".
 *
 * The difference matters in a denominator. A case with no ASA recorded has not
 * been assessed as ASA Unknown; it has not been assessed. Folding the two
 * together inflates every "complete" count in the module, which is exactly
 * the kind of error that makes an audit indefensible.
 */
export function categoryValue(v: VariableValue): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s === '' ? null : s;
}
