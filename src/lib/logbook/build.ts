// ============================================================
// Turning a person's cases into the book their college asks for
// ------------------------------------------------------------
// THIS IS THE ONE EXPORT IN THE APPLICATION THAT IS NOT ANONYMISED, and that
// is deliberate rather than an oversight. A training log book is a record of
// identified patients that a named trainee submits to a named examiner: the
// College asks for the hospital number so that an entry can be verified
// against the folder, and an entry that cannot be verified is worthless to
// everybody. The research module next door goes the other way and strips even
// the age to a band.
//
// SO TWO THINGS GUARD IT. The patient's NAME is off by default and has to be
// asked for, because the hospital number satisfies the College on its own and
// a spreadsheet of names in a download folder is a different kind of object
// from one of numbers. And every generation is audited with who asked, about
// whom, and over what dates.
//
// THE BOOK IS BUILT FROM WHAT IS RECORDED AND NOTHING ELSE. Where the
// diagnosis is absent it prints as blank rather than as the booking
// indication dressed up as a diagnosis, because a trainee who hands in a book
// of invented diagnoses has a bigger problem than an incomplete one.
// ============================================================

import type { RawCase } from '@/lib/research/types';
import { rec, operationNote } from '@/lib/research/access';
import { num, text, clinicalLabel, ageInYears, asaNumber, asaLabel } from '@/lib/research/derive';
import { participationIn, type Participation } from './participation';
import {
  LEVEL_CODE, LEVEL_LABEL, PARTICIPATION_LEVELS, type CollegeProfile,
  type LogbookQuota, type ParticipationLevel, type ParticipationLevelSpec,
} from './colleges';
import {
  classifyNpmcn, flattenCategories, NPMCN_PART_1_SECTION,
  type NpmcnSection,
} from './npmcn';

export interface LogbookRow {
  serial: number;
  caseId: string;
  date: string | null;
  hospitalNumber: string | null;
  /** Off unless explicitly asked for. See the header. */
  patientName: string | null;
  age: string | null;
  sex: string | null;
  specialty: string | null;
  diagnosis: string | null;
  procedure: string | null;
  anaesthesia: string | null;
  asa: string | null;
  comorbidities: string | null;
  urgency: string | null;
  role: string;
  roleCode: string;
  level: ParticipationLevel;
  levelBasis: string;
  complications: string | null;
  outcome: string | null;
  supervisor: string | null;
}

const ROLE_WORD: Record<string, string> = {
  SURGEON: 'Surgeon', ASSISTANT: 'Assistant', ANAESTHETIST: 'Anaesthetist',
  TEAM_MEMBER: 'Team member',
};

/** The diagnosis a college wants: what was found, then what was suspected. */
function diagnosisOf(c: RawCase): string | null {
  const n = operationNote(c);
  return clinicalLabel(n?.postOpDiagnosis)
    ?? clinicalLabel(n?.operativeDiagnosis)
    ?? clinicalLabel(c.indication);
}

/** The operation a college wants: what was done, then what was planned. */
function procedureOf(c: RawCase): string | null {
  const n = operationNote(c);
  return clinicalLabel(n?.procedurePerformed)
    ?? clinicalLabel(n?.procedureName)
    ?? clinicalLabel(c.procedureName);
}

/**
 * The outcome column, in the College's terms: outcomes detailed with dates.
 *
 * Death first, because a log book that does not say so about a case that died
 * is the single thing an examiner will find.
 */
function outcomeOf(c: RawCase): string | null {
  const m = rec(c, 'mortality');
  if (m) {
    const when = m.timeOfDeath ? new Date(m.timeOfDeath as never).toISOString().slice(0, 10) : null;
    return `Died${when ? ` ${when}` : ''}${m.causeOfDeath ? ` — ${text(m.causeOfDeath)}` : ''}`;
  }
  if (String(c.status ?? '') === 'CANCELLED') return 'Cancelled';
  const p = rec(c, 'pacuAssessment');
  const dest = clinicalLabel(c.postOpDestination ?? p?.dischargedTo);
  if (dest) return `Recovered, transferred to ${dest}`;
  if (String(c.status ?? '') === 'COMPLETED') return 'Completed';
  return text(c.status);
}

/** Complications, named, across the three places they are recorded. */
function complicationsOf(c: RawCase): string | null {
  const parts: string[] = [];
  const n = operationNote(c);
  if (n?.complicationOccurred === true) {
    parts.push(text(n.complicationDetails) ?? 'Intraoperative complication');
  }
  const a = rec(c, 'anesthesiaRecord');
  if (a) {
    const events: Array<[string, string]> = [
      ['hypotensionOccurred', 'hypotension'], ['hypertensionOccurred', 'hypertension'],
      ['bradycardiaOccurred', 'bradycardia'], ['tachycardiaOccurred', 'tachycardia'],
      ['desaturationOccurred', 'desaturation'], ['difficultAirway', 'difficult airway'],
      ['anaphylaxis', 'anaphylaxis'],
    ];
    const seen = events.filter(([k]) => a[k] === true).map(([, w]) => w);
    if (seen.length > 0) parts.push(`Anaesthetic: ${seen.join(', ')}`);
  }
  const p = rec(c, 'pacuAssessment');
  if (p?.complicationsDetected === true) {
    parts.push(text(p.complicationDetails) ?? 'Complication in recovery');
  }
  if (rec(c, 'surgicalCount')?.discrepancyOccurred === true) parts.push('Count discrepancy');
  return parts.length > 0 ? parts.join('; ') : null;
}

/** Comorbidity, which the College asks for as part of the patient profile. */
function comorbiditiesOf(c: RawCase): string | null {
  const p = rec(c, 'patient');
  const rows = Array.isArray(p?.fitnessAssessments) ? p?.fitnessAssessments as RawCase[] : [];
  const a = rows[0];
  if (!a) return null;
  const named: Array<[string, string]> = [
    ['diabetes', 'diabetes'], ['hypertension', 'hypertension'],
    ['heartDisease', 'heart disease'], ['asthma', 'asthma'],
    ['kidneyDisease', 'kidney disease'], ['liverDisease', 'liver disease'],
  ];
  const seen = named.filter(([k]) => a[k] === true).map(([, w]) => w);
  return seen.length > 0 ? seen.join(', ') : 'None recorded';
}

export interface LogbookOptions {
  personId: string;
  personRole: string | null;
  /** Off by default, unless the College's own form has the column. */
  includePatientName?: boolean;
  /**
   * The College's own participation codes, where it publishes them.
   *
   * NPMCN prints three, not four, and its S means the trainee operated with
   * the consultant assisting. Using the generic codes on an NPMCN book would
   * put a letter in front of an examiner that means something else.
   */
  levels?: readonly ParticipationLevelSpec[];
}

/** The code a given College uses for a level, falling back to the default. */
export function codeFor(
  level: ParticipationLevel,
  levels?: readonly ParticipationLevelSpec[],
): string {
  const own = (levels ?? PARTICIPATION_LEVELS).find((l) => l.key === level);
  return own?.code ?? LEVEL_CODE[level];
}

/** The same, as the College words it. */
export function labelFor(
  level: ParticipationLevel,
  levels?: readonly ParticipationLevelSpec[],
): string {
  const own = (levels ?? PARTICIPATION_LEVELS).find((l) => l.key === level);
  return own?.label ?? LEVEL_LABEL[level];
}

/** One row per case the person took part in, newest last, serially numbered. */
export function buildLogbookRows(
  cases: readonly RawCase[],
  opts: LogbookOptions,
): LogbookRow[] {
  const rows: Array<{ c: RawCase; p: Participation }> = [];
  cases.forEach((c) => {
    const p = participationIn(c, opts.personId, opts.personRole);
    if (p) rows.push({ c, p });
  });

  // Oldest first and numbered from one: a log book is read as a chronology,
  // and a serial number that moves when the date range changes is a serial
  // number nobody can refer to in a viva.
  rows.sort((a, b) => {
    const ta = a.c.scheduledDate ? new Date(a.c.scheduledDate as never).getTime() : 0;
    const tb = b.c.scheduledDate ? new Date(b.c.scheduledDate as never).getTime() : 0;
    return ta - tb;
  });

  return rows.map(({ c, p }, i) => {
    const patient = rec(c, 'patient');
    const years = ageInYears(patient?.age, patient?.ageUnit);
    const asa = asaNumber(rec(c, 'anesthesiaRecord')?.asaClassification)
      ?? asaNumber(patient?.asaScore);
    return {
      serial: i + 1,
      caseId: String(c.id ?? ''),
      date: c.scheduledDate
        ? new Date(c.scheduledDate as never).toISOString().slice(0, 10) : null,
      hospitalNumber: text(patient?.folderNumber),
      patientName: opts.includePatientName ? text(patient?.name) : null,
      age: years === null ? null : (years < 1 ? `${Math.round(years * 12)} mo` : `${Math.round(years)}`),
      sex: text(patient?.gender),
      specialty: text(c.subspecialty),
      diagnosis: diagnosisOf(c),
      procedure: procedureOf(c),
      anaesthesia: text(rec(c, 'anesthesiaRecord')?.anesthesiaType) ?? text(c.anesthesiaType),
      asa: asaLabel(asa),
      comorbidities: comorbiditiesOf(c),
      urgency: text(c.surgeryType),
      role: ROLE_WORD[p.role] ?? p.role,
      roleCode: codeFor(p.level, opts.levels),
      level: p.level,
      levelBasis: p.basis,
      complications: complicationsOf(c),
      outcome: outcomeOf(c),
      supervisor: p.supervisorName,
    };
  });
}

export interface QuotaProgress {
  key: string;
  label: string;
  required: number | null;
  achieved: number;
  shortfall: number | null;
  /** Null where the College publishes no figure to measure against. */
  percent: number | null;
}

const matches = (row: LogbookRow, q: LogbookQuota): boolean => {
  if (q.match.on === 'all') return true;
  const haystack = (q.match.on === 'anaesthesiaType' ? row.anaesthesia : row.specialty) ?? '';
  const up = haystack.toUpperCase();
  return q.match.any.some((needle) => up.includes(needle.toUpperCase()));
};

/**
 * How far the book has got against the College's quotas.
 *
 * A quota with no published figure reports what was achieved and NOTHING
 * else: no percentage, no shortfall, no green tick. A progress bar against an
 * invented denominator is the most misleading thing this screen could show.
 */
export function quotaProgress(
  rows: readonly LogbookRow[],
  profile: CollegeProfile,
): QuotaProgress[] {
  return profile.quotas.map((q) => {
    const achieved = rows.filter((r) => matches(r, q)).length;
    return {
      key: q.key,
      label: q.label,
      required: q.required,
      achieved,
      shortfall: q.required === null ? null : Math.max(0, q.required - achieved),
      percent: q.required === null || q.required === 0
        ? null
        : Math.round((achieved / q.required) * 1000) / 10,
    };
  });
}

/** The counts an examiner looks at first. */
export function logbookSummary(rows: readonly LogbookRow[]) {
  const byLevel: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  const bySpecialty: Record<string, number> = {};
  const byYear: Record<string, number> = {};
  rows.forEach((r) => {
    byLevel[LEVEL_LABEL[r.level]] = (byLevel[LEVEL_LABEL[r.level]] ?? 0) + 1;
    byRole[r.role] = (byRole[r.role] ?? 0) + 1;
    const s = r.specialty ?? 'Not recorded';
    bySpecialty[s] = (bySpecialty[s] ?? 0) + 1;
    const y = r.date ? r.date.slice(0, 4) : 'Not recorded';
    byYear[y] = (byYear[y] ?? 0) + 1;
  });

  const withComplication = rows.filter((r) => r.complications !== null).length;
  const deaths = rows.filter((r) => (r.outcome ?? '').startsWith('Died')).length;

  return {
    total: rows.length,
    byLevel,
    byRole,
    bySpecialty,
    byYear,
    withComplication,
    deaths,
    // Stated plainly, because the College asks for outcomes and an examiner
    // will ask why a column is empty before they ask anything else.
    missingDiagnosis: rows.filter((r) => r.diagnosis === null).length,
    missingOutcome: rows.filter((r) => r.outcome === null).length,
    firstDate: rows.find((r) => r.date)?.date ?? null,
    lastDate: [...rows].reverse().find((r) => r.date)?.date ?? null,
  };
}

// ── The NPMCN portfolio's tables ────────────────────────────────────

export interface CategorisedTable {
  sectionKey: string;
  sectionLabel: string;
  part: 1 | 2;
  group: string | null;
  categoryKey: string;
  categoryLabel: string;
  rows: LogbookRow[];
  /** Null always, until the College publishes a number. See npmcn.ts. */
  required: number | null;
}

export interface CategorisedBook {
  tables: CategorisedTable[];
  /**
   * Cases no table matched.
   *
   * SHOWN, never hidden. A keyword list is a sorting aid, not a coding
   * system; a case silently filed in the wrong table is worse than one left
   * visibly unfiled, because the trainee cannot correct what they cannot see.
   */
  unclassified: LogbookRow[];
}

/**
 * Sort a trainee's cases into the portfolio's own tables.
 *
 * Part 1 first, then the chosen subspecialty's Part 2 tables, in the order
 * the College prints them. A case is placed in ONE table — the first that
 * matches — because that is what a trainee filling the book by hand does,
 * and because counting one operation in two tables inflates every total.
 */
export function categoriseForNpmcn(
  rows: readonly LogbookRow[],
  part2: readonly NpmcnSection[],
): CategorisedBook {
  const sections = [NPMCN_PART_1_SECTION, ...part2];
  const tables: CategorisedTable[] = sections.flatMap((section) =>
    section.categories.map((c) => ({
      sectionKey: section.key,
      sectionLabel: section.label,
      part: section.part,
      group: section.group ?? null,
      categoryKey: `${section.key}:${c.key}`,
      categoryLabel: c.label,
      rows: [] as LogbookRow[],
      required: null,
    })));

  const byKey = new Map(tables.map((t) => [t.categoryKey, t]));
  const unclassified: LogbookRow[] = [];

  rows.forEach((row) => {
    let placed = false;
    for (const section of sections) {
      const hit = classifyNpmcn(section.categories, row.procedure, row.diagnosis);
      if (hit) {
        byKey.get(`${section.key}:${hit.key}`)?.rows.push(row);
        placed = true;
        break;
      }
    }
    if (!placed) unclassified.push(row);
  });

  return { tables, unclassified };
}

/** How many of the portfolio's tables have at least one case in them. */
export const tablesWithCases = (book: CategorisedBook): number =>
  book.tables.filter((t) => t.rows.length > 0).length;

/** Every category available for a subspecialty, for a picker. */
export const npmcnCategoryCount = (part2: readonly NpmcnSection[]): number =>
  NPMCN_PART_1_SECTION.categories.length + flattenCategories(part2).length;
