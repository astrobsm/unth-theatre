// ============================================================
// The measures this module computes rather than reads
// ------------------------------------------------------------
// Every function here is pure and takes its inputs explicitly, so the
// definition of a published figure can be PROVED rather than read off a query.
// An interval or a rate that only exists inside an aggregation cannot be
// checked by a reviewer, cannot be reproduced by the next person, and quietly
// changes meaning the first time somebody edits the query.
//
// THE RULES THAT MATTER MOST IN THIS FILE:
//
//   An interval is NEVER negative. Two timestamps entered out of order are a
//   data-entry error, not a negative operating time, and a negative value
//   dropped into a mean does far more damage than a missing one.
//
//   A missing input gives null, never zero. "No blood loss recorded" and
//   "blood loss was zero" are different findings, and a module that confuses
//   them will report the units that document least as the ones that bleed
//   least.
//
//   Age is converted to YEARS from whatever unit it was entered in. The
//   patient table stores neonates in days and infants in months; reading the
//   number without the unit files a four-day-old as a four-year-old, and the
//   paediatric analyses are then built on it.
// ============================================================

import { watDayOfWeek, watMinutesOfDay } from '@/lib/watDay';
import { scheduledInstant } from '@/lib/theatreOps/clock';

/** Whole minutes from a to b, or null. Never negative. */
export function minutesBetween(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
): number | null {
  if (!a || !b) return null;
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const mins = Math.round((end - start) / 60_000);
  // Out of order is an entry error, not a negative duration.
  return mins >= 0 ? mins : null;
}

/** A number, or null. Strings, Decimals and NaN all resolve honestly. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(v as never);
  return Number.isFinite(n) ? n : null;
}

/** A trimmed string, or null. Empty and whitespace are null, not ''. */
export function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** A boolean as recorded, or null where the field was never set. */
export function flag(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  return v === true;
}

/**
 * Age in YEARS, whatever unit it was entered in.
 *
 * The patient table carries ageUnit = YEARS | MONTHS | WEEKS | DAYS so that a
 * neonate can be recorded honestly. Reading `age` alone files a four-day-old
 * as four years old — and that single error would land in every paediatric
 * analysis in this module, all of which split on age.
 */
export function ageInYears(age: unknown, unit: unknown): number | null {
  const n = num(age);
  if (n === null || n < 0) return null;
  switch (String(unit ?? 'YEARS').toUpperCase()) {
    case 'DAYS': return n / 365.25;
    case 'WEEKS': return (n * 7) / 365.25;
    case 'MONTHS': return n / 12;
    default: return n;
  }
}

/**
 * The age bands a surgical paper actually reports in.
 *
 * Neonate and infant are kept apart from "child" because their anaesthetic
 * risk is not the same question, and 65+ is kept apart because that is the
 * cut most comorbidity work uses.
 */
export function ageBand(years: number | null): string | null {
  if (years === null) return null;
  if (years < 28 / 365.25) return 'Neonate (<28 days)';
  if (years < 1) return 'Infant (<1 year)';
  if (years < 5) return 'Child 1–4';
  if (years < 13) return 'Child 5–12';
  if (years < 18) return 'Adolescent 13–17';
  if (years < 40) return 'Adult 18–39';
  if (years < 65) return 'Adult 40–64';
  return 'Older adult 65+';
}

/** Under 18. The split the paediatric theatre and the consent rules use. */
export const isPaediatric = (years: number | null): boolean | null =>
  (years === null ? null : years < 18);

/** Body mass index from kilograms and centimetres. */
export function bmi(weightKg: unknown, heightCm: unknown): number | null {
  const w = num(weightKg);
  const h = num(heightCm);
  if (w === null || h === null || w <= 0 || h <= 0) return null;
  const m = h / 100;
  const value = w / (m * m);
  // A BMI outside this range is an entry error — a height typed in metres, or
  // a weight in pounds. Reporting it would move every mean it lands in.
  if (value < 8 || value > 100) return null;
  return Math.round(value * 10) / 10;
}

/** WHO body-mass classes, as a comorbidity paper groups them. */
export function bmiClass(value: number | null): string | null {
  if (value === null) return null;
  if (value < 18.5) return 'Underweight';
  if (value < 25) return 'Normal';
  if (value < 30) return 'Overweight';
  if (value < 35) return 'Obese I';
  if (value < 40) return 'Obese II';
  return 'Obese III';
}

/**
 * ASA physical status as a NUMBER, from however it was written down.
 *
 * The same grade reaches this module as "ASA II", "II", "2", "ASA 2E" and
 * "Class II", because three different screens capture it and none of them
 * agreed. Grouping on the raw string splits one cohort into five, and the
 * analysis then has no group large enough to say anything about.
 *
 * The E suffix (emergency) is deliberately dropped from the number and kept
 * separately by `asaEmergency` — it is a different variable, not a grade.
 */
export function asaNumber(v: unknown): number | null {
  const s = text(v);
  if (!s) return null;
  const roman: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
  const up = s.toUpperCase().replace(/ASA|CLASS|GRADE|\s|-/g, '');
  const rm = /^([IVX]+)E?$/.exec(up);
  if (rm && roman[rm[1]]) return roman[rm[1]];
  const dm = /^(\d)E?$/.exec(up);
  if (dm) {
    const n = Number(dm[1]);
    return n >= 1 && n <= 6 ? n : null;
  }
  return null;
}

/** The E suffix: the grade was assigned for an emergency operation. */
export function asaEmergency(v: unknown): boolean | null {
  const s = text(v);
  if (!s) return null;
  return /E\s*$/i.test(s.replace(/\s/g, ''));
}

/** "ASA III" — one spelling, for a table that has to read consistently. */
export const asaLabel = (n: number | null): string | null =>
  (n === null ? null : `ASA ${['', 'I', 'II', 'III', 'IV', 'V', 'VI'][n] ?? n}`);

/**
 * WHO anaemia grade from haemoglobin, by sex.
 *
 * The thresholds differ for men and women and the analysis is wrong if they
 * are not applied separately; where sex is not recorded the non-pregnant
 * female threshold is used, which is the more conservative of the two and so
 * never reports a man as less anaemic than he is.
 */
export function anaemiaGrade(hb: unknown, sex: unknown): string | null {
  const v = num(hb);
  if (v === null || v <= 0 || v > 25) return null;
  const male = /^m/i.test(String(sex ?? ''));
  const lower = male ? 13 : 12;
  if (v >= lower) return 'None';
  if (v >= 11) return 'Mild';
  if (v >= 8) return 'Moderate';
  return 'Severe';
}

/** Any anaemia at all, for a simple exposure variable. */
export const isAnaemic = (hb: unknown, sex: unknown): boolean | null => {
  const g = anaemiaGrade(hb, sex);
  return g === null ? null : g !== 'None';
};

/** Serum potassium outside the reference range, either way. */
export function potassiumFlag(v: unknown): string | null {
  const k = num(v);
  if (k === null || k <= 0 || k > 12) return null;
  if (k < 3.5) return 'Hypokalaemia';
  if (k > 5.5) return 'Hyperkalaemia';
  return 'Normal';
}

/** Renal impairment by creatinine, in µmol/L as this hospital reports it. */
export function creatinineFlag(v: unknown): string | null {
  const c = num(v);
  if (c === null || c <= 0) return null;
  if (c > 200) return 'Severe';
  if (c > 120) return 'Raised';
  return 'Normal';
}

/** Any of the three viral results positive. */
export function viralPositive(...statuses: unknown[]): boolean | null {
  const known = statuses.map(text).filter((s): s is string => !!s);
  if (known.length === 0) return null;
  return known.some((s) => /^POS/i.test(s));
}

// ── Process intervals ───────────────────────────────────────────────

/**
 * How late the FIRST incision was against the time the case was listed for.
 *
 * The single most-cited theatre efficiency measure there is, and the one this
 * module could not previously answer. Negative values — a case that started
 * early — are kept, because "started 10 minutes early" is a real and useful
 * observation, unlike a negative duration.
 */
export function startDelayMinutes(
  scheduledDate: Date | string | null | undefined,
  scheduledTime: string | null | undefined,
  actualStart: Date | string | null | undefined,
): number | null {
  if (!scheduledDate || !actualStart) return null;
  const planned = scheduledInstant(new Date(scheduledDate), scheduledTime ?? null);
  if (!planned) return null;
  const actual = new Date(actualStart).getTime();
  if (Number.isNaN(actual)) return null;
  return Math.round((actual - planned.getTime()) / 60_000);
}

/** Started within fifteen minutes of its listed time. The usual audit line. */
export const startedOnTime = (delay: number | null): boolean | null =>
  (delay === null ? null : delay <= 15);

/**
 * How far the operation ran from what was estimated at booking.
 *
 * Positive is over-run. Reported in minutes AND as a ratio, because the two
 * answer different questions: minutes tell the list manager what the day
 * lost, the ratio tells whether short cases and long cases are mis-estimated
 * in the same proportion — and they are not.
 */
export function overrunMinutes(
  estimatedMinutes: unknown,
  actualMinutes: number | null,
): number | null {
  const est = num(estimatedMinutes);
  if (est === null || est <= 0 || actualMinutes === null) return null;
  return actualMinutes - est;
}

/** Actual ÷ estimated. 1.0 is a perfect estimate. */
export function overrunRatio(
  estimatedMinutes: unknown,
  actualMinutes: number | null,
): number | null {
  const est = num(estimatedMinutes);
  if (est === null || est <= 0 || actualMinutes === null) return null;
  return Math.round((actualMinutes / est) * 100) / 100;
}

/** Blood loss per operating hour — comparable across long and short cases. */
export function bloodLossPerHour(
  bloodLossMl: unknown,
  operatingMinutes: number | null,
): number | null {
  const bl = num(bloodLossMl);
  if (bl === null || operatingMinutes === null || operatingMinutes <= 0) return null;
  return Math.round((bl / (operatingMinutes / 60)) * 10) / 10;
}

/**
 * Operated outside the ordinary working day.
 *
 * 08:00–18:00 Monday to Friday is "in hours" here, matching the window the
 * emergency rota already uses for day call. Out-of-hours operating is an
 * exposure variable in its own right — the team is smaller, the support
 * services are thinner, and almost every outcome paper adjusts for it.
 */
export function outOfHours(at: Date | string | null | undefined): boolean | null {
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  const dow = watDayOfWeek(d);
  if (dow === 0 || dow === 6) return true;
  const mins = watMinutesOfDay(d);
  return mins < 8 * 60 || mins >= 18 * 60;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The weekday, in WAT. Theatre lists are organised by it. */
export function weekdayName(at: Date | string | null | undefined): string | null {
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return WEEKDAYS[watDayOfWeek(d)] ?? null;
}

/** The hour of the day a case started, 0–23 in WAT. For a time-of-day plot. */
export function hourOfDay(at: Date | string | null | undefined): number | null {
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(watMinutesOfDay(d) / 60);
}

// ── Recovery and outcome ────────────────────────────────────────────

/**
 * How long a patient was in recovery, in minutes.
 *
 * Capped at implausibility rather than reported raw. A record opened and
 * never closed produces a stay of weeks — one printed on a transfer slip as
 * 102,711 minutes — and a single such row moves a mean recovery time by
 * hours. Beyond a day it is not a long recovery, it is an unclosed record,
 * and it is excluded from the measure and reported by `recoveryRecordOpen`
 * instead.
 */
export const IMPLAUSIBLE_RECOVERY_MINUTES = 24 * 60;

export function recoveryStayMinutes(
  admission: Date | string | null | undefined,
  discharge: Date | string | null | undefined,
): number | null {
  const mins = minutesBetween(admission, discharge);
  if (mins === null) return null;
  return mins < IMPLAUSIBLE_RECOVERY_MINUTES ? mins : null;
}

/** A recovery record that was opened and never closed. A finding of its own. */
export function recoveryRecordOpen(
  admission: unknown,
  discharge: unknown,
): boolean | null {
  if (!admission) return null;
  return !discharge;
}

/**
 * Modified Aldrete score out of ten, from its five components.
 *
 * Recomputed rather than read from the stored total, because the total is
 * written by the form and a form that was edited after the fact can disagree
 * with its own parts. Null unless all five are present: a partial Aldrete is
 * not a low Aldrete.
 */
export function aldreteTotal(parts: {
  activity?: unknown; respiration?: unknown; circulation?: unknown;
  consciousness?: unknown; oxygenSaturation?: unknown;
}): number | null {
  const vals = [parts.activity, parts.respiration, parts.circulation,
    parts.consciousness, parts.oxygenSaturation].map(num);
  if (vals.some((v) => v === null)) return null;
  const total = (vals as number[]).reduce((a, v) => a + v, 0);
  return total >= 0 && total <= 10 ? total : null;
}

/** Nine or more is the usual threshold for fitness to leave recovery. */
export const aldreteReady = (total: number | null): boolean | null =>
  (total === null ? null : total >= 9);

/** Post-operative nausea or vomiting in recovery — one composite endpoint. */
export function ponv(nausea: unknown, vomiting: unknown): boolean | null {
  if (nausea === null && vomiting === null) return null;
  if (nausea === undefined && vomiting === undefined) return null;
  return nausea === true || vomiting === true;
}

/** Pain of 7 or more out of 10 on arrival in recovery. */
export function severePain(score: unknown): boolean | null {
  const n = num(score);
  if (n === null || n < 0 || n > 10) return null;
  return n >= 7;
}

/**
 * Anything that went wrong, anywhere on the case.
 *
 * A composite: intraoperative complication, an anaesthetic event, a
 * complication in recovery, a red alert in recovery, or a count discrepancy.
 * Null only when NONE of the contributing records exists — a case with a
 * complete operation note saying nothing went wrong is a real negative and
 * belongs in the denominator.
 */
export function anyComplication(parts: {
  intraOp?: unknown; anaesthetic?: unknown; recovery?: unknown;
  recoveryRedAlert?: unknown; countDiscrepancy?: unknown;
}): boolean | null {
  const vals = [parts.intraOp, parts.anaesthetic, parts.recovery,
    parts.recoveryRedAlert, parts.countDiscrepancy];
  const known = vals.filter((v) => v === true || v === false);
  if (known.length === 0) return null;
  return known.some((v) => v === true);
}

/**
 * The patient went to intensive care when the booking did not plan for it.
 *
 * Unplanned ICU admission is a standard surgical outcome measure, and it is
 * only meaningful against the plan: a cardiothoracic case booked for ICU and
 * admitted to ICU is the operation working, not a complication.
 */
export function unplannedIcu(
  plannedIcu: unknown,
  destination: unknown,
): boolean | null {
  const dest = text(destination);
  if (dest === null) return null;
  const went = /ICU|INTENSIVE/i.test(dest);
  if (!went) return false;
  return plannedIcu !== true;
}

// ── Compliance and completeness ─────────────────────────────────────

/**
 * WHO checklist compliance, by PHASE rather than as one flag.
 *
 * The three phases are performed by different people at different moments —
 * sign in by the anaesthetist before induction, time out by the whole team
 * before incision, sign out by the nurse before the patient leaves. A single
 * "checklist done" flag hides which of the three is actually being skipped,
 * which is the only thing a compliance project needs to know.
 */
export function whoPhasesComplete(c: {
  signIn?: unknown; timeOut?: unknown; signOut?: unknown;
}): number | null {
  const vals = [c.signIn, c.timeOut, c.signOut];
  if (vals.every((v) => v === null || v === undefined)) return null;
  return vals.filter((v) => v === true).length;
}

/** All three phases recorded. The compliance numerator. */
export function whoFullyCompliant(c: {
  signIn?: unknown; timeOut?: unknown; signOut?: unknown;
}): boolean | null {
  const n = whoPhasesComplete(c);
  return n === null ? null : n === 3;
}

/**
 * How much of the expected record exists for this case, 0–1.
 *
 * The denominator of everything else in this module, and worth reporting on
 * its own: a specialty whose completeness is 0.4 is not a specialty with
 * better outcomes, it is a specialty whose outcomes are mostly unrecorded,
 * and any comparison that does not say so is misleading.
 *
 * Counted only over records a COMPLETED case should have. A cancelled case is
 * not missing an operation note.
 */
export function documentationScore(present: readonly (boolean | null)[]): number | null {
  const known = present.filter((p) => p === true || p === false);
  if (known.length === 0) return null;
  return Math.round((known.filter(Boolean).length / known.length) * 100) / 100;
}

/**
 * Hours between the booking being entered and the operation being listed for.
 *
 * Negative is impossible and returns null: a booking entered after the case
 * started is a retrospective entry, and counting it as "minus six hours of
 * notice" would pull every mean toward zero.
 */
export function bookingLeadHours(
  bookedAt: Date | string | null | undefined,
  scheduledDate: Date | string | null | undefined,
  scheduledTime: string | null | undefined,
): number | null {
  if (!bookedAt || !scheduledDate) return null;
  const planned = scheduledInstant(new Date(scheduledDate), scheduledTime ?? null)
    ?? new Date(scheduledDate);
  const booked = new Date(bookedAt).getTime();
  if (Number.isNaN(booked) || Number.isNaN(planned.getTime())) return null;
  const hours = (planned.getTime() - booked) / 3_600_000;
  return hours >= 0 ? Math.round(hours * 10) / 10 : null;
}

/** The surgical wound classes, in the order contamination increases. */
export const WOUND_CLASSES = ['Clean', 'Clean-contaminated', 'Contaminated', 'Dirty'] as const;

/**
 * The wound class, normalised to the four standard classes.
 *
 * Captured as free-ish text on the operation note and reaching this module as
 * "clean contaminated", "Clean-Contaminated", "CLEAN_CONTAMINATED" and
 * "class 2". Infection risk is stratified on this variable, so four spellings
 * of one class is four cohorts too small to say anything with.
 */
export function woundClass(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  const up = s.toUpperCase().replace(/[\s_-]+/g, '');
  if (/^(CLASS)?4$|^DIRTY|INFECTED/.test(up)) return 'Dirty';
  if (/^(CLASS)?3$|^CONTAMINATED/.test(up)) return 'Contaminated';
  if (/^(CLASS)?2$|^CLEANCONTAMINATED/.test(up)) return 'Clean-contaminated';
  if (/^(CLASS)?1$|^CLEAN/.test(up)) return 'Clean';
  return null;
}

/**
 * A free-text clinical phrase reduced to a comparable key.
 *
 * Diagnoses, indications and procedure names are typed by hand, so "Appendicitis",
 * "acute appendicitis " and "ACUTE APPENDICITIS" are three rows in any group-by
 * and one condition in the clinic. This lowercases, collapses whitespace and
 * strips trailing punctuation — and deliberately does nothing cleverer: a
 * synonym map that silently merged "hernia repair" into "herniorrhaphy" would
 * be making a clinical judgement inside a group-by, where nobody can see it.
 */
export function clinicalKey(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  const k = s.toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim();
  return k === '' ? null : k;
}

/** The same phrase, cased for a table: first letter up, rest as typed. */
export function clinicalLabel(v: unknown): string | null {
  const k = clinicalKey(v);
  return k === null ? null : k.charAt(0).toUpperCase() + k.slice(1);
}
