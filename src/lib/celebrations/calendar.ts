// ============================================================
// The days the theatre says something kind on
// ------------------------------------------------------------
// Two sources, kept firmly apart:
//
//   THE CALENDAR — this file. The first of the month, the national holidays,
//   and the professional days that belong to a particular cadre. Fixed, known
//   in advance, the same for everybody or for everybody in a role, and
//   therefore computable without touching the database.
//
//   THE PERSON — their birthday and the anniversaries they chose to tell us
//   about, which live in staff_celebrations because only they know them.
//
// WHAT IS DELIBERATELY NOT HERE: Eid al-Fitr and Eid al-Adha. Both follow the
// lunar calendar and are declared by sighting, a few days' notice, and the
// Federal Government's announcement — a hard-coded guess would send Muslim
// colleagues an Eid greeting on the wrong day, which is worse than sending
// none. They go out through the "other occasion" send on the celebrations
// screen, on the day the hospital is actually told.
// ============================================================

/** Who a greeting is for. */
export type OccasionAudience =
  /** Everybody on the staff list. */
  | 'ALL'
  /** The roles named on the occasion. */
  | 'ROLES';

export type OccasionKind =
  /** The first of a month. */
  | 'NEW_MONTH'
  /** A national holiday or season. */
  | 'PUBLIC'
  /** A professional day belonging to one cadre. */
  | 'PROFESSIONAL'
  /** A birthday or anniversary one person told us about. */
  | 'PERSONAL';

export interface Occasion {
  /**
   * Stable, and it matters: it is half of the idempotency scope that stops a
   * colleague being wished a happy new month three times because three
   * administrators opened the screen. Never renumber or rename these.
   */
  key: string;
  kind: OccasionKind;
  /** What it is called, in the heading and in the message. */
  title: string;
  /** The WAT calendar day it falls on, YYYY-MM-DD. */
  date: string;
  audience: OccasionAudience;
  /** Meaningful when audience is ROLES. */
  roles?: readonly string[];
  /** What the role is called in plain words, for the heading: "the nurses". */
  audienceLabel?: string;
}

// ── Role groups ───────────────────────────────────────────────────────────
// A professional day sent to the wrong cadre is not a kindness, it is proof
// nobody checked. These are the only groupings the calendar needs; the duty
// modules have their own and the two are not interchangeable.

export const NURSING_ROLES = [
  'SCRUB_NURSE',
  'RECOVERY_ROOM_NURSE',
  'INFECTION_CONTROL_NURSE',
] as const;

export const PHARMACY_ROLES = ['PHARMACIST', 'HEAD_OF_PHARMACY'] as const;

export const ANAESTHESIA_ROLES = [
  'ANAESTHETIST',
  'CONSULTANT_ANAESTHETIST',
  'HEAD_OF_ANAESTHESIA',
  'ANAESTHETIC_TECHNICIAN',
] as const;

export const LABORATORY_ROLES = [
  'EMERGENCY_LAB_SCIENTIST',
  'LABORATORY_STAFF',
  'HAEMATOLOGY_SCIENTIST',
  'CHEMICAL_PATHOLOGY_SCIENTIST',
  'MICROBIOLOGY_SCIENTIST',
  'LABORATORY_TECHNICIAN',
] as const;

export const RADIOLOGY_ROLES = ['RADIOLOGIST', 'RADIOGRAPHER'] as const;

interface FixedDay {
  key: string;
  kind: OccasionKind;
  title: string;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
  roles?: readonly string[];
  audienceLabel?: string;
}

/**
 * The fixed days, in calendar order.
 *
 * Nigerian public holidays first, then the professional days. Movable feasts
 * are computed below rather than listed, and nothing here depends on the year.
 */
export const FIXED_DAYS: readonly FixedDay[] = [
  { key: 'new-year', kind: 'PUBLIC', title: 'New Year', month: 1, day: 1 },
  { key: 'lab-science-day', kind: 'PROFESSIONAL', title: 'International Medical Laboratory Science Day', month: 4, day: 15, roles: LABORATORY_ROLES, audienceLabel: 'the laboratory' },
  { key: 'world-health-day', kind: 'PROFESSIONAL', title: 'World Health Day', month: 4, day: 7 },
  { key: 'workers-day', kind: 'PUBLIC', title: 'Workers’ Day', month: 5, day: 1 },
  { key: 'nurses-day', kind: 'PROFESSIONAL', title: 'International Nurses Day', month: 5, day: 12, roles: NURSING_ROLES, audienceLabel: 'the nurses' },
  { key: 'democracy-day', kind: 'PUBLIC', title: 'Democracy Day', month: 6, day: 12 },
  { key: 'patient-safety-day', kind: 'PROFESSIONAL', title: 'World Patient Safety Day', month: 9, day: 17 },
  { key: 'pharmacists-day', kind: 'PROFESSIONAL', title: 'World Pharmacists Day', month: 9, day: 25, roles: PHARMACY_ROLES, audienceLabel: 'the pharmacists' },
  { key: 'independence-day', kind: 'PUBLIC', title: 'Nigeria’s Independence Day', month: 10, day: 1 },
  { key: 'anaesthesia-day', kind: 'PROFESSIONAL', title: 'World Anaesthesia Day', month: 10, day: 16, roles: ANAESTHESIA_ROLES, audienceLabel: 'the anaesthesia team' },
  { key: 'radiology-day', kind: 'PROFESSIONAL', title: 'International Day of Radiology', month: 11, day: 8, roles: RADIOLOGY_ROLES, audienceLabel: 'radiology' },
  { key: 'christmas', kind: 'PUBLIC', title: 'Christmas', month: 12, day: 25 },
  { key: 'boxing-day', kind: 'PUBLIC', title: 'Boxing Day', month: 12, day: 26 },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The month's name, from 1–12. */
export function monthName(month: number): string {
  return MONTHS[month - 1] ?? '';
}

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

/** YYYY-MM-DD from its parts, with no timezone anywhere near it. */
export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Today in Enugu.
 *
 * WAT is UTC+1 with no daylight saving, so one offset is the whole of it. This
 * matters at the turn of the month more than anywhere else: between midnight
 * and 01:00 WAT on the 1st, a server reading UTC still believes it is the last
 * day of the old month, and the new-month greeting would not appear.
 */
export function watToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 60 * 60_000).toISOString().slice(0, 10);
}

/** The parts of a YYYY-MM-DD, or null if it is not one. */
export function parseDay(day: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const date = Number(m[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  return { year, month, day: date };
}

/**
 * Easter Sunday, by the anonymous Gregorian algorithm.
 *
 * Computed rather than tabulated because a table runs out, and the year it
 * runs out in is the year Good Friday silently stops appearing.
 */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Shift a YYYY-MM-DD by whole days, at noon so no offset can cross a date. */
function shiftDay(year: number, month: number, day: number, by: number): string {
  const t = new Date(Date.UTC(year, month - 1, day, 12));
  t.setUTCDate(t.getUTCDate() + by);
  return t.toISOString().slice(0, 10);
}

/** Good Friday and Easter Monday, as YYYY-MM-DD, for one year. */
export function easterDays(year: number): { goodFriday: string; easterMonday: string } {
  const e = easterSunday(year);
  return {
    goodFriday: shiftDay(year, e.month, e.day, -2),
    easterMonday: shiftDay(year, e.month, e.day, 1),
  };
}

/**
 * Every calendar occasion that falls on one day.
 *
 * Can return more than one — the 1st of May is both Workers' Day and the first
 * of a month — and does so on purpose. Which one is actually sent is decided
 * on the screen, by a person, and the send route then allows exactly one
 * calendar greeting per colleague per day so that a decision made twice does
 * not arrive twice.
 *
 * Ordered most significant first, so the obvious choice is the one at the top:
 * a colleague who receives "happy new month" on Christmas Day has been written
 * to by a machine and can tell.
 */
export function occasionsOn(day: string): Occasion[] {
  const parts = parseDay(day);
  if (!parts) return [];
  const out: Occasion[] = [];

  FIXED_DAYS.forEach((f) => {
    if (f.month !== parts.month || f.day !== parts.day) return;
    out.push({
      key: f.key,
      kind: f.kind,
      title: f.title,
      date: day,
      audience: f.roles ? 'ROLES' : 'ALL',
      roles: f.roles,
      audienceLabel: f.audienceLabel,
    });
  });

  const easter = easterDays(parts.year);
  if (day === easter.goodFriday) {
    out.push({ key: 'good-friday', kind: 'PUBLIC', title: 'Good Friday', date: day, audience: 'ALL' });
  }
  if (day === easter.easterMonday) {
    out.push({ key: 'easter', kind: 'PUBLIC', title: 'Easter', date: day, audience: 'ALL' });
  }

  if (parts.day === 1) {
    out.push({
      key: 'new-month',
      kind: 'NEW_MONTH',
      title: `Happy New Month — ${monthName(parts.month)}`,
      date: day,
      audience: 'ALL',
    });
  }

  // Public and professional days ahead of the monthly greeting, which is the
  // one that should yield when something larger shares its date.
  const rank: Record<OccasionKind, number> = {
    PUBLIC: 0, PROFESSIONAL: 1, PERSONAL: 2, NEW_MONTH: 3,
  };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/**
 * The calendar occasions in a window, for the "coming up" list.
 *
 * Inclusive of both ends, and capped — a window of a year would otherwise
 * build four hundred objects to show five.
 */
export function occasionsBetween(from: string, to: string, limit = 60): Occasion[] {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b) return [];
  const out: Occasion[] = [];
  let cursor = new Date(Date.UTC(a.year, a.month - 1, a.day, 12));
  const end = new Date(Date.UTC(b.year, b.month - 1, b.day, 12));
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && out.length < limit && guard < 800) {
    guard += 1;
    occasionsOn(cursor.toISOString().slice(0, 10)).forEach((o) => {
      if (out.length < limit) out.push(o);
    });
    cursor = new Date(cursor.getTime() + 24 * 60 * 60_000);
  }
  return out;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Which stored month/day pairs fall on a given date.
 *
 * Usually one. The exception is 29 February: in a year that has no 29th, the
 * people born on it are shown on the 28th rather than skipped, because being
 * forgotten in three years out of four is exactly the complaint this feature
 * exists to answer.
 */
export function pairsFor(date: string): { month: number; day: number }[] {
  const p = parseDay(date);
  if (!p) return [];
  const out = [{ month: p.month, day: p.day }];
  if (p.month === 2 && p.day === 28 && !isLeap(p.year)) out.push({ month: 2, day: 29 });
  return out;
}

/** Does this occasion reach somebody in this role? */
export function occasionReachesRole(o: Occasion, role: string | null | undefined): boolean {
  if (o.audience === 'ALL') return true;
  if (!role) return false;
  return (o.roles ?? []).indexOf(role) !== -1;
}
