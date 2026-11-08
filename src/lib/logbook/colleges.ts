// ============================================================
// What the colleges actually require of a training log book
// ------------------------------------------------------------
// Asked for on 8 November: a surgeon or anaesthetist picks their name and the
// system produces a log book in the form their college wants.
//
// WHAT IS VERIFIED HERE, AND WHAT IS NOT. This matters more than anything
// else in the file, because a log book built on an invented requirement is
// worse than no log book: the trainee finds out at the examination.
//
//   VERIFIED, from the West African College of Surgeons Faculty of Anaesthesia
//   curriculum (December 2014), which states the requirement in terms:
//     * a log book of ONE THOUSAND cases for the Membership;
//     * "Each case in the log book must be signed and dated by the supervising
//       consultant. Block signature will not be acceptable.";
//     * the category quotas reproduced below, which sum to 1000;
//     * a log book of 500 cases in the subspecialties for the Fellowship.
//
//   VERIFIED, from the WACS Faculty of Ophthalmology fellowship curriculum,
//   which states the characteristics of a satisfactory log book and is the
//   College's general statement of what an entry must contain: the patient
//   profile (age, sex, general health including relevant comorbidities), the
//   steps taken to evaluate and investigate, the treatment with any
//   modifications and the reasons for them, any complications and what was
//   done about them, outcomes with dates, and each case signed off by the
//   clinician who supervised it.
//
//   NOT VERIFIED, and therefore NOT INVENTED. The National Postgraduate
//   Medical College of Nigeria publishes its Faculty of Surgery log book and
//   its minimum operative numbers as documents behind a bot wall that could
//   not be read here. Its curriculum is clear that a trainee keeps a daily,
//   up-to-date record of operative procedures in the College's prescribed log
//   book, signed off by supervising consultants and submitted to the Faculty
//   before the final examination — so the STRUCTURE below is right. The
//   QUOTAS are left empty and are editable on the screen, with a line saying
//   where to get them. A number this module made up would be quoted back at a
//   College, and the trainee would carry the consequence.
//
// THE PARTICIPATION LEVELS are the four every college in this tradition uses
// and the only four that can be defended from the data this hospital records:
// observed, assisted, performed under supervision, performed independently.
// ============================================================

export type ParticipationLevel = 'OBSERVED' | 'ASSISTED' | 'SUPERVISED' | 'INDEPENDENT';

export interface ParticipationLevelSpec {
  key: ParticipationLevel;
  /** The short code a log book column carries. */
  code: string;
  label: string;
  /** What it means, in the words a college uses. */
  help: string;
}

/**
 * The default four, used where a College does not publish its own.
 *
 * NOT universal. The NPMCN Faculty of Surgery publishes THREE codes whose
 * wording differs materially -- its S is "assisted by a consultant", meaning
 * the trainee operated and the consultant assisted, which is a more senior
 * claim than "performed under supervision" sounds. A profile may therefore
 * carry its own `levels`, and the export uses those.
 */
export const PARTICIPATION_LEVELS: readonly ParticipationLevelSpec[] = [
  { key: 'OBSERVED', code: 'O', label: 'Observed',
    help: 'Present and observing; did not operate.' },
  { key: 'ASSISTED', code: 'A', label: 'Assisted',
    help: 'Assisted the operating surgeon.' },
  { key: 'SUPERVISED', code: 'S', label: 'Performed under supervision',
    help: 'Performed the procedure with a supervisor scrubbed or present.' },
  { key: 'INDEPENDENT', code: 'P', label: 'Performed independently',
    help: 'Performed the procedure without a supervisor scrubbed.' },
];

export const LEVEL_CODE: Record<ParticipationLevel, string> = Object.fromEntries(
  PARTICIPATION_LEVELS.map((l) => [l.key, l.code]),
) as Record<ParticipationLevel, string>;

export const LEVEL_LABEL: Record<ParticipationLevel, string> = Object.fromEntries(
  PARTICIPATION_LEVELS.map((l) => [l.key, l.label]),
) as Record<ParticipationLevel, string>;

/** A column the log book prints, in the order the college lists it. */
export interface LogbookColumn {
  /** The research-variable key or a logbook-specific key. */
  key: string;
  header: string;
  /** Narrow columns keep an A4 landscape page readable. */
  width?: 'xs' | 'sm' | 'md' | 'lg';
}

/** A quota the college sets for a named category of case. */
export interface LogbookQuota {
  key: string;
  label: string;
  /** The number required, or null where the College has not published one. */
  required: number | null;
  /** How a case is counted into this category. */
  match:
    | { on: 'anaesthesiaType'; any: string[] }
    | { on: 'specialty'; any: string[] }
    | { on: 'all' };
}

export interface CollegeProfile {
  key: string;
  college: string;
  /** Faculty and level, e.g. "Faculty of Anaesthesia — Membership". */
  programme: string;
  discipline: 'SURGERY' | 'ANAESTHESIA';
  /** What the College says, in its own words, with the document it came from. */
  requirement: string;
  /** Where that statement was read. Printed on the log book. */
  sourceNote: string;
  /** True when the quotas below are from the published document. */
  quotasVerified: boolean;
  /** The total the College requires, or null where none is published. */
  totalRequired: number | null;
  columns: readonly LogbookColumn[];
  quotas: readonly LogbookQuota[];
  /** Printed under the signature block. */
  attestation: string;
  /**
   * The participation codes THIS College uses. Omitted means the default
   * four. See PARTICIPATION_LEVELS for why this cannot be one global list.
   */
  levels?: readonly ParticipationLevelSpec[];
  /**
   * True where the College's own form has a patient-name column.
   *
   * The export still lets it be turned off -- a trainee may prefer to write
   * the names in by hand rather than carry them in a spreadsheet -- but the
   * default follows the College.
   */
  patientNameColumn?: boolean;
  /** The College's instructions, quoted, for the screen to show. */
  guidance?: readonly string[];
  /** True where the book is organised into named procedure tables. */
  categorised?: boolean;
}

/** The columns every one of these log books carries, in college order. */
const CORE_COLUMNS: readonly LogbookColumn[] = [
  { key: 'serial', header: 'S/N', width: 'xs' },
  { key: 'date', header: 'Date', width: 'sm' },
  { key: 'hospitalNumber', header: 'Hospital No.', width: 'sm' },
  { key: 'ageSex', header: 'Age / Sex', width: 'xs' },
  { key: 'diagnosis', header: 'Diagnosis', width: 'lg' },
  { key: 'procedure', header: 'Operation / Procedure', width: 'lg' },
];

const OUTCOME_COLUMNS: readonly LogbookColumn[] = [
  { key: 'complications', header: 'Complications', width: 'md' },
  { key: 'outcome', header: 'Outcome', width: 'md' },
  { key: 'supervisor', header: 'Supervising consultant', width: 'md' },
  { key: 'signature', header: 'Signature & date', width: 'md' },
];

export const SURGERY_COLUMNS: readonly LogbookColumn[] = [
  ...CORE_COLUMNS,
  { key: 'comorbidities', header: 'Comorbidity / ASA', width: 'sm' },
  { key: 'anaesthesia', header: 'Anaesthesia', width: 'sm' },
  { key: 'role', header: 'Role (O/A/S/P)', width: 'xs' },
  ...OUTCOME_COLUMNS,
];

/**
 * The NPMCN Faculty of Surgery columns, in the portfolio's own order.
 *
 * Every table in the document is headed:
 *   S/No. | Patient's Names | Hospital No. | Age | Sex | Diagnosis |
 *   Operation | A.S.P | Complications | Names/Signature of Consultant | Date
 *
 * Age and Sex are SEPARATE columns here, not the combined "Age / Sex" the
 * other profiles use, and the date is LAST rather than second. Both are
 * reproduced rather than tidied: a trainee transcribing into the College's
 * printed book works column by column, and a reordered export makes that
 * harder, not easier.
 */
export const NPMCN_SURGERY_COLUMNS: readonly LogbookColumn[] = [
  { key: 'serial', header: 'S/No.', width: 'xs' },
  { key: 'patientName', header: "Patient's Names", width: 'md' },
  { key: 'hospitalNumber', header: 'Hospital No.', width: 'sm' },
  { key: 'age', header: 'Age', width: 'xs' },
  { key: 'sex', header: 'Sex', width: 'xs' },
  { key: 'diagnosis', header: 'Diagnosis', width: 'lg' },
  { key: 'procedure', header: 'Operation', width: 'lg' },
  { key: 'role', header: 'A.S.P', width: 'xs' },
  { key: 'complications', header: 'Complications', width: 'md' },
  { key: 'supervisor', header: 'Names/Signature of Consultant', width: 'md' },
  { key: 'date', header: 'Date', width: 'sm' },
];

/**
 * The three codes the NPMCN portfolio defines, in its own words.
 *
 * Quoted verbatim: "Assisting a senior - A; Assisted by a consultant (or
 * senior) - S; As surgeon in charge - P."
 *
 * There is NO observed code. A trainee who only watched has nothing to enter
 * in this book, which is the College's position and not this module's.
 */
export const NPMCN_LEVELS: readonly ParticipationLevelSpec[] = [
  { key: 'ASSISTED', code: 'A', label: 'Assisting a senior',
    help: 'You assisted; a senior operated.' },
  { key: 'SUPERVISED', code: 'S', label: 'Assisted by a consultant (or senior)',
    help: 'YOU operated and a consultant or senior assisted you. A more senior claim than it sounds.' },
  { key: 'INDEPENDENT', code: 'P', label: 'As surgeon in charge',
    help: 'You were the surgeon in charge of the case.' },
];

export const ANAESTHESIA_COLUMNS: readonly LogbookColumn[] = [
  ...CORE_COLUMNS,
  { key: 'asa', header: 'ASA', width: 'xs' },
  { key: 'anaesthesia', header: 'Anaesthetic technique', width: 'md' },
  { key: 'urgency', header: 'Elective / Emergency', width: 'sm' },
  { key: 'role', header: 'Role (O/A/S/P)', width: 'xs' },
  ...OUTCOME_COLUMNS,
];

/**
 * The WACS Faculty of Anaesthesia Membership quotas, exactly as published.
 *
 * These fourteen rows are reproduced from the Faculty's curriculum and they
 * sum to the thousand the College requires. The sum is asserted in the tests:
 * a quota table that does not add up to its own total is a table somebody has
 * edited without reading, and a trainee planning a rotation against it would
 * be planning against nothing.
 *
 * The two technique rows (general and regional) and the twelve specialty rows
 * are two different cuts of the SAME thousand cases, not twenty-four hundred
 * cases. They are kept in one list because that is how the College prints
 * them, and the screen shows which cut each row belongs to.
 */
export const WACS_ANAESTHESIA_MEMBERSHIP_QUOTAS: readonly LogbookQuota[] = [
  { key: 'general', label: 'General anaesthesia', required: 650,
    match: { on: 'anaesthesiaType', any: ['GENERAL', 'GENERAL_ANAESTHESIA', 'GA'] } },
  { key: 'regional', label: 'Regional anaesthesia', required: 350,
    match: { on: 'anaesthesiaType', any: ['REGIONAL', 'SPINAL', 'EPIDURAL', 'BLOCK', 'LOCAL'] } },
  { key: 'generalSurgery', label: 'General surgery', required: 300,
    match: { on: 'specialty', any: ['GENERAL SURGERY'] } },
  { key: 'orthopaedics', label: 'Orthopaedics & trauma', required: 100,
    match: { on: 'specialty', any: ['ORTHOPAEDIC', 'TRAUMA'] } },
  { key: 'urology', label: 'Urology', required: 50,
    match: { on: 'specialty', any: ['UROLOGY'] } },
  { key: 'gynaecology', label: 'Gynaecology', required: 50,
    match: { on: 'specialty', any: ['GYNAEC'] } },
  { key: 'ent', label: 'Otorhinolaryngology', required: 50,
    match: { on: 'specialty', any: ['ENT', 'OTORHINO', 'EAR'] } },
  { key: 'ophthalmology', label: 'Ophthalmology', required: 50,
    match: { on: 'specialty', any: ['OPHTHALM', 'EYE'] } },
  { key: 'plastics', label: 'Plastics & dental', required: 50,
    match: { on: 'specialty', any: ['PLASTIC', 'DENTAL', 'MAXILLOFACIAL', 'BURN'] } },
  { key: 'paediatric', label: 'Paediatric surgery', required: 60,
    match: { on: 'specialty', any: ['PAEDIATRIC', 'PEDIATRIC'] } },
  { key: 'obstetrics', label: 'Obstetrics', required: 230,
    match: { on: 'specialty', any: ['OBSTETRIC'] } },
  { key: 'neuro', label: 'Neuroanaesthesia', required: 20,
    match: { on: 'specialty', any: ['NEURO'] } },
  { key: 'cardiothoracic', label: 'Cardiothoracic anaesthesia', required: 20,
    match: { on: 'specialty', any: ['CARDIO', 'THORACIC'] } },
  { key: 'icu', label: 'Intensive care', required: 20,
    match: { on: 'specialty', any: ['ICU', 'INTENSIVE'] } },
];

export const COLLEGE_PROFILES: readonly CollegeProfile[] = [
  {
    key: 'wacs-anaesthesia-membership',
    college: 'West African College of Surgeons',
    programme: 'Faculty of Anaesthesia — Membership',
    discipline: 'ANAESTHESIA',
    quotasVerified: true,
    totalRequired: 1000,
    requirement:
      'One thousand cases and procedures are expected to be completed and detailed in the '
      + 'logbook. Each case in the log book must be signed and dated by the supervising '
      + 'consultant. Block signature will not be acceptable.',
    sourceNote:
      'Quoted from the WACS Faculty of Anaesthesia curriculum (December 2014). '
      + 'Confirm against the current curriculum before submission.',
    columns: ANAESTHESIA_COLUMNS,
    quotas: WACS_ANAESTHESIA_MEMBERSHIP_QUOTAS,
    attestation:
      'I certify that the cases recorded above were conducted by the candidate under my '
      + 'supervision. Each entry is signed and dated individually.',
  },
  {
    key: 'wacs-anaesthesia-fellowship',
    college: 'West African College of Surgeons',
    programme: 'Faculty of Anaesthesia — Fellowship',
    discipline: 'ANAESTHESIA',
    quotasVerified: true,
    totalRequired: 500,
    requirement: 'Presentation of a log book of 500 cases in the subspecialties.',
    sourceNote:
      'Quoted from the WACS Faculty of Anaesthesia curriculum (December 2014). '
      + 'The subspecialty mix is set by the candidate’s area of interest.',
    columns: ANAESTHESIA_COLUMNS,
    quotas: [{ key: 'all', label: 'Subspecialty cases', required: 500, match: { on: 'all' } }],
    attestation:
      'I certify that the cases recorded above were conducted by the candidate under my '
      + 'supervision.',
  },
  {
    key: 'wacs-surgery',
    college: 'West African College of Surgeons',
    programme: 'Faculty of Surgery — Membership / Fellowship',
    discipline: 'SURGERY',
    // The structure is the College's; the numbers are not published in a form
    // that could be read here, so none is asserted. See the header.
    quotasVerified: false,
    totalRequired: null,
    requirement:
      'The log book must give a clear, accurate record of the candidate’s clinical '
      + 'practice: the patient profile including age, sex and relevant comorbidities; the '
      + 'steps taken to evaluate and investigate; clear details of the treatment including '
      + 'any modifications and the reasons for them; any complications and the actions taken '
      + 'to mitigate them; and outcomes with dates. Each case is signed off by the clinician '
      + 'who supervised it.',
    sourceNote:
      'The characteristics above are quoted from a WACS fellowship curriculum, where the '
      + 'College states them as the marks of a satisfactory log book. The Faculty of '
      + 'Surgery’s minimum operative numbers are not reproduced here because they could '
      + 'not be read from the College’s published documents — enter your faculty’s '
      + 'figures below rather than relying on a number this system invented.',
    columns: SURGERY_COLUMNS,
    quotas: [],
    attestation:
      'I certify that the operations recorded above were performed by the candidate at the '
      + 'level of participation stated, under my supervision.',
  },
  {
    key: 'npmcn-surgery',
    college: 'National Postgraduate Medical College of Nigeria',
    programme: "Faculty of Surgery — Resident's Portfolio",
    discipline: 'SURGERY',
    // The STRUCTURE is now verified from the College's own document. The
    // NUMBERS are still not, because the document does not contain any --
    // see the note below and the header of npmcn.ts.
    quotasVerified: false,
    totalRequired: null,
    categorised: true,
    patientNameColumn: true,
    columns: NPMCN_SURGERY_COLUMNS,
    levels: NPMCN_LEVELS,
    requirement:
      'It is the Resident’s responsibility to enter each case he manages and/or operates '
      + 'on in this port folio. The Consultant will then assess the resident and complete the '
      + 'appropriate column in respect of his own judgement as to the level of knowledge and '
      + 'competence demonstrated by the resident and sign his name in the fourth column.',
    sourceNote:
      'Transcribed from the College’s published Resident’s Portfolio (Faculty Board of '
      + 'Surgery). The tables, their order and the A/S/P codes are the College’s own. The '
      + 'portfolio sets out NO minimum numbers — it heads the neurosurgery section '
      + '“Minimum Operative Requirement” and then prints blank tables — so no '
      + 'target is shown against any category here. The one figure it does publish is the '
      + 'hands-on course requirement for neurosurgery.',
    guidance: [
      'Enter each case you manage and/or operate on. The portfolio is yours to keep safe and '
      + 'intact for the whole of your training.',
      'The assessment must be done AT THE TIME the procedure is performed. The College writes: '
      + '“Both Resident and Consultant must avoid a situation where this port-folio is '
      + 'completed in a rush in the last days of the posting.” This export exists to save '
      + 'you transcription, not to let you leave it to the last week.',
      'Where your centre teaches and assesses a competency not printed in the portfolio, the '
      + 'programme coordinator may add it as an attachment.',
    ],
    quotas: [],
    attestation:
      'I certify that the operations recorded above were performed by the resident at the level '
      + 'stated, and that each entry was assessed and signed at the time the procedure was '
      + 'performed.',
  },
];

export const collegeProfile = (key: string): CollegeProfile | null =>
  COLLEGE_PROFILES.find((p) => p.key === key) ?? null;
