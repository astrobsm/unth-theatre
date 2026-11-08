// ============================================================
// A theatre that was not set up, or not checked, on a day it was operating
// ------------------------------------------------------------
// Asked for on 8 November:
//
//   "add chase for the anaesthetic technicians that fail to set up the theatre
//    and check equipment in the morning 8.30am and end of day before 6pm for
//    all elective days"
//
// TWO DEADLINES, AND THE SECOND IS NOT A FORMALITY. The morning check is what
// stands between an induction and a ventilator nobody tested. The end-of-day
// check is what decides whether tomorrow's morning check starts from a theatre
// that was left ready or one that was left as the last case finished — and it
// is the one that gets dropped, because by 18:00 everybody has gone.
//
// FIVE FINDINGS, NOT ONE. "Did not set up the theatre" would collapse states
// that call for completely different conversations:
//
//   NO_MORNING_SETUP        Nothing was logged at all. The theatre ran, and the
//                           ORM cannot say anybody checked it.
//   MORNING_SETUP_LATE      Logged, after 08:30. The list was waiting.
//   EQUIPMENT_NOT_CHECKED   Logged, but items on the checklist were left
//                           unticked. This is the "check equipment" half.
//   NO_END_OF_DAY           No end-of-day entry, after 18:00 has passed.
//   END_OF_DAY_LATE         Entered, after 18:00.
//
// A THEATRE HONESTLY STOOD DOWN IS NOT A FAILURE, AND THIS IS THE MOST
// IMPORTANT RULE IN THE FILE. A technician who checks the machine, finds the
// ventilator faulty and records the theatre as NOT ready has done the job
// exactly as it should be done. `isReady: false` therefore raises nothing on
// its own. Chasing that technician would teach every technician that the safe
// answer is to tick the boxes and say nothing, which is the one outcome worse
// than a theatre nobody checked.
//
// ELECTIVE DAYS ARE READ FROM THE WORK, NOT FROM THE CALENDAR. "All elective
// days" cannot be Monday-to-Friday: that chases somebody about a public
// holiday, and about the Saturday list it would miss. A day is an elective day
// for a theatre when that theatre had an elective list — an allocation or a
// booked elective case. See collect.ts.
//
// ALL TIMES ARE WAT WALL CLOCK. The deadlines are 08:30 and 18:00 as a
// technician reads them off the wall, so every comparison goes through
// watMinutesOfDay. Reading getHours() would put both deadlines an hour out on
// the servers, which run UTC.
// ============================================================

import { watInstantFrom } from '@/lib/watDay';

export type SetupGapCode =
  | 'NO_MORNING_SETUP'
  | 'MORNING_SETUP_LATE'
  | 'EQUIPMENT_NOT_CHECKED'
  | 'NO_END_OF_DAY'
  | 'END_OF_DAY_LATE';

export const SETUP_GAP_CODES: SetupGapCode[] = [
  'NO_MORNING_SETUP', 'MORNING_SETUP_LATE', 'EQUIPMENT_NOT_CHECKED',
  'NO_END_OF_DAY', 'END_OF_DAY_LATE',
];

/** 08:30 WAT, as minutes from midnight. The morning deadline, as asked. */
export const MORNING_DUE_MINUTES = 8 * 60 + 30;

/** 18:00 WAT. "End of day before 6pm", as asked. */
export const END_OF_DAY_DUE_MINUTES = 18 * 60;

/**
 * The same two deadlines as wall clock, DERIVED rather than typed again.
 *
 * Every message, column heading and @page of this board reads the label, and
 * every comparison reads the minutes. Typing "08:30" separately would let the
 * two drift, and the message would then quote a deadline the code does not
 * enforce -- which is the one kind of error nobody can argue their way out of.
 */
const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const MORNING_DUE_LABEL = clock(MORNING_DUE_MINUTES);
export const END_OF_DAY_DUE_LABEL = clock(END_OF_DAY_DUE_MINUTES);

/**
 * The readiness checklist, as the setup log stores it.
 *
 * The column names are the American spelling the schema was written in; the
 * labels are the spelling this hospital uses. Both are deliberate: renaming
 * the columns would be a migration for no clinical gain, and labelling a
 * screen "Anesthesia" in a Nigerian theatre reads as somebody else's software.
 */
export const EQUIPMENT_CHECKS = [
  { field: 'anesthesiaMachineChecked', label: 'Anaesthesia machine' },
  { field: 'ventilatorChecked', label: 'Ventilator' },
  { field: 'gasSupplyChecked', label: 'Gas supply' },
  { field: 'suctionChecked', label: 'Suction' },
  { field: 'monitorsChecked', label: 'Monitors' },
  { field: 'airwayEquipmentChecked', label: 'Airway equipment' },
  { field: 'emergencyDrugsChecked', label: 'Emergency drugs' },
  { field: 'ivEquipmentChecked', label: 'IV equipment' },
] as const;

export type EquipmentField = typeof EQUIPMENT_CHECKS[number]['field'];

export interface SetupGapDefinition {
  code: SetupGapCode;
  label: string;
  /** Inside a sentence: "this theatre …". */
  short: string;
  /** Who is put at risk, and how. The persuasive half. */
  consequence: string;
  /** What to do about it. */
  fix: string;
}

export const SETUP_GAPS: Record<SetupGapCode, SetupGapDefinition> = {
  NO_MORNING_SETUP: {
    code: 'NO_MORNING_SETUP',
    label: `No morning setup logged by ${MORNING_DUE_LABEL}`,
    short: 'has no morning setup logged',
    consequence:
      'The theatre operated and the ORM cannot say that anybody checked the anaesthesia '
      + 'machine, the ventilator, the gas supply, the suction or the emergency drugs that '
      + 'morning. Where a check is not recorded, the first person to discover a fault is '
      + 'the anaesthetist at induction, with the patient already asleep — and at that '
      + 'moment it stops being an equipment problem and becomes an airway one.',
    fix:
      `Log the setup under Anaesthesia Setup before ${MORNING_DUE_LABEL} on every day your `
      + 'theatre has a list, and certify it ready — or stand it down and say why.',
  },
  MORNING_SETUP_LATE: {
    code: 'MORNING_SETUP_LATE',
    label: `Morning setup logged after ${MORNING_DUE_LABEL}`,
    short: `was certified after ${MORNING_DUE_LABEL}`,
    consequence:
      'The first case cannot be induced in a theatre nobody has certified, so the list '
      + 'either started late or started unchecked. Both are expensive and only one of them '
      + 'is visible to the surgeon waiting outside — and the whole day runs behind a start '
      + 'that slipped before it began.',
    fix:
      `Be in the theatre and logged by ${MORNING_DUE_LABEL}. Where something genuinely held `
      + 'you up — no gas, a machine under repair, two theatres on one technician — record '
      + 'it in the notes, because the reason is what changes the pattern.',
  },
  EQUIPMENT_NOT_CHECKED: {
    code: 'EQUIPMENT_NOT_CHECKED',
    label: 'Equipment checklist incomplete',
    short: 'was certified with items on the checklist left unticked',
    consequence:
      'The theatre was certified ready with part of the checklist blank. That is worse than '
      + 'no record, because the anaesthetist reads "ready" and proceeds on it. An item left '
      + 'unticked is an item nobody can say was tested, and the list below names which ones.',
    fix:
      'Tick each item only once you have actually tested it, and leave it unticked where you '
      + 'have not. An honest blank is useful; a tick that was not earned is the one thing on '
      + 'this board that can hurt a patient directly.',
  },
  NO_END_OF_DAY: {
    code: 'NO_END_OF_DAY',
    label: `No end-of-day check by ${END_OF_DAY_DUE_LABEL}`,
    short: 'has no end-of-day check recorded',
    consequence:
      'Tomorrow morning’s check starts from a theatre nobody closed down. A cylinder run '
      + 'near empty, a vaporiser left unfilled, a suction trap unemptied and a fault nobody '
      + 'logged all arrive as somebody else’s surprise at 08:00 — usually the next '
      + 'technician’s, sometimes the next patient’s.',
    fix:
      `Record the end-of-day check before ${END_OF_DAY_DUE_LABEL} on every elective day: `
      + 'what was left ready, what was consumed, and anything faulty that must not be found '
      + 'by the morning list.',
  },
  END_OF_DAY_LATE: {
    code: 'END_OF_DAY_LATE',
    label: `End-of-day check after ${END_OF_DAY_DUE_LABEL}`,
    short: `was closed down after ${END_OF_DAY_DUE_LABEL}`,
    consequence:
      'Recorded, but after the hour it was due. This is the smallest finding on the board '
      + 'and it is listed because a check entered from memory at nine in the evening is not '
      + 'the same document as one entered in the theatre at six.',
    fix: `Enter the end-of-day check before ${END_OF_DAY_DUE_LABEL}, in the theatre.`,
  },
};

/** One setup log, as this module needs to see it. */
export interface SetupLogFacts {
  id: string;
  technicianId: string | null;
  technicianName: string | null;
  /** When the theatre was certified ready. */
  readyTime: Date | null;
  setupStartTime: Date | null;
  setupEndTime: Date | null;
  isReady: boolean;
  endOfDayLogged: boolean;
  endOfDayTime: Date | null;
  /** Somebody stood the theatre down and recorded why. NOT a failure. */
  deficiencyReportedAt: Date | null;
  checks: Partial<Record<EquipmentField, boolean>>;
}

/** One theatre on one day, which is the unit this board judges. */
export interface TheatreDayForGaps {
  /** WAT calendar day, YYYY-MM-DD. */
  day: string;
  theatreId: string;
  theatreName: string;
  /** The day's log, earliest where a theatre has more than one. */
  log: SetupLogFacts | null;
}

/** The instant 08:30 WAT falls at on this day. */
export function morningDueAt(day: string): Date | null {
  return watInstantFrom(day, MORNING_DUE_LABEL);
}

/** The instant 18:00 WAT falls at on this day. */
export function endOfDayDueAt(day: string): Date | null {
  return watInstantFrom(day, END_OF_DAY_DUE_LABEL);
}

/**
 * When the theatre was certified, or null.
 *
 * readyTime first — that is the moment somebody said "this theatre is ready".
 * setupEndTime stands in for older rows written before readyTime was kept.
 * setupStartTime is deliberately NOT used: starting a setup is not certifying
 * one, and treating it as such would report a theatre as ready at the moment
 * the technician walked in.
 */
export const certifiedAt = (log: SetupLogFacts): Date | null =>
  log.readyTime ?? log.setupEndTime ?? null;

/** The checklist items left unticked, by label. */
export function uncheckedItems(log: SetupLogFacts): string[] {
  return EQUIPMENT_CHECKS
    .filter((c) => log.checks[c.field] !== true)
    .map((c) => c.label);
}

/**
 * What is outstanding for this theatre on this day, now.
 *
 * COMPARED AS INSTANTS, NOT AS CLOCK READINGS. An end-of-day check entered at
 * 00:30 the following morning reads as "00:30", which is before 18:00 on any
 * clock — so comparing wall-clock minutes would record the latest entries of
 * all as the punctual ones.
 */
export function setupGaps(
  td: TheatreDayForGaps,
  now: Date = new Date(),
): SetupGapCode[] {
  const out: SetupGapCode[] = [];
  const morningDue = morningDueAt(td.day);
  const eodDue = endOfDayDueAt(td.day);
  const past = (due: Date | null) => !!due && now.getTime() >= due.getTime();

  if (!td.log) {
    // One finding, not two. A day with no log has no end-of-day entry either,
    // and saying so separately would double every count while adding nothing.
    if (past(morningDue)) out.push('NO_MORNING_SETUP');
    return out;
  }

  const log = td.log;
  const certified = certifiedAt(log);

  // A theatre checked, found wanting and stood down is the job done properly.
  // See the header: this is the rule that keeps technicians honest.
  const stoodDown = Boolean(log.deficiencyReportedAt);

  if (!stoodDown) {
    if (certified && morningDue) {
      if (certified.getTime() > morningDue.getTime()) out.push('MORNING_SETUP_LATE');
    } else if (!log.isReady && past(morningDue)) {
      // Opened, never certified, never stood down. To anybody relying on the
      // board that is a theatre nobody checked, so it is reported as one.
      out.push('NO_MORNING_SETUP');
    }

    // Only against a theatre certified READY. Unticked items on a theatre that
    // was stood down are what being stood down looks like.
    if (log.isReady && uncheckedItems(log).length > 0) out.push('EQUIPMENT_NOT_CHECKED');
  }

  if (past(eodDue)) {
    if (!log.endOfDayLogged) out.push('NO_END_OF_DAY');
    else if (log.endOfDayTime && eodDue
      && log.endOfDayTime.getTime() > eodDue.getTime()) out.push('END_OF_DAY_LATE');
  }

  return out;
}

/** A gap's label inside a sentence, with ORM left as ORM. */
export const setupGapWords = (code: SetupGapCode): string =>
  SETUP_GAPS[code].label.toLowerCase().replace(/\borm\b/g, 'ORM');

/** The gaps present across a set of theatre-days, in canonical order. */
export function setupGapsPresent(
  gaps: readonly SetupGapCode[],
): SetupGapCode[] {
  return SETUP_GAP_CODES.filter((c) => gaps.indexOf(c) !== -1);
}
