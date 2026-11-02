// ============================================================
// The cases another unit has invited you to
// ============================================================
//
// A joint case has one booking surgeon and one or more units joining it. The
// booking surgeon sees the case everywhere already — it is theirs. The INVITED
// surgeon saw it nowhere at all: the unit's participation lived in the booking
// notes as free text, so the first they heard of it was a telephone call,
// usually on the morning, and the honest version is that sometimes there was
// no call.
//
// WHY A WEEK AND NOT JUST THE DAY BEFORE. The ask was "a day before the
// surgery", and the day before is when it matters most — so Tomorrow and Today
// are called out by name. But a surgeon told on Thursday evening that they are
// operating on Friday morning has already committed Friday. Showing the whole
// week costs nothing and is the difference between a warning and a notice.
//
// Pure, so the ordering and the wording can be proved without a database.
// ============================================================

import { watToday } from '@/lib/watDay';

export { watToday };

/** YYYY-MM-DD, n days on. Noon-free arithmetic: these are plain date strings. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface JointCase {
  id: string;
  patientName: string;
  folderNumber: string | null;
  procedureName: string;
  /** The unit whose case it is — the one that booked it. */
  bookingUnit: string;
  /** Who booked it and is leading. */
  leadSurgeonName: string | null;
  /** YYYY-MM-DD. */
  scheduledDate: string;
  scheduledTime: string | null;
  theatre: string | null;
  status: string;
  surgeryType: string;
  /** The unit I am being asked to come from. */
  myUnit: string;
  /** What my unit is being asked for, where the booking said. */
  myRole: string | null;
  note: string | null;
  /** Every unit on the case, mine included, for the one-line team summary. */
  units: string[];
}

/**
 * How urgent this is to read, which is the order the card uses.
 *
 * Soonest first and nothing cleverer. A case tomorrow outranks a case next
 * week whatever else is true about either of them, because the only action
 * available to an invited surgeon is to clear their diary, and that gets
 * harder every hour.
 */
export function sortJointCases(cases: JointCase[]): JointCase[] {
  return cases.slice().sort((a, b) => (
    a.scheduledDate.localeCompare(b.scheduledDate)
    || (a.scheduledTime || '').localeCompare(b.scheduledTime || '')
    || a.patientName.localeCompare(b.patientName)
  ));
}

/** "Today", "Tomorrow", or "Fri 6 Nov". */
export function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

export interface JointSummary {
  total: number;
  today: number;
  tomorrow: number;
  /** Today and tomorrow together — the ones a day's notice still covers. */
  imminent: number;
}

export function summariseJoint(cases: JointCase[], today: string): JointSummary {
  const tomorrow = addDays(today, 1);
  const t = cases.filter((c) => c.scheduledDate === today).length;
  const m = cases.filter((c) => c.scheduledDate === tomorrow).length;
  return { total: cases.length, today: t, tomorrow: m, imminent: t + m };
}

/**
 * The line at the top of the card.
 *
 * Leads with today and tomorrow because those are the ones that change what
 * somebody does next. A count of five cases over a week, with none of them
 * imminent, is information; "one of them is tomorrow" is an instruction.
 */
export function jointHeadline(s: JointSummary): string {
  if (s.total === 0) return 'No other unit has asked you onto a case.';

  const parts: string[] = [];
  if (s.today > 0) parts.push(`${s.today} today`);
  if (s.tomorrow > 0) parts.push(`${s.tomorrow} tomorrow`);

  const cases = `${s.total} joint ${s.total === 1 ? 'case' : 'cases'}`;
  if (parts.length === 0) return `${cases} ahead, none before the day after tomorrow.`;
  return `${cases} — ${parts.join(' and ')}.`;
}

/** "You, Cardiothoracic and Plastic Surgery" — the units on the case. */
export function unitsLine(c: JointCase): string {
  const others = c.units.filter((u) => u && u !== c.myUnit);
  if (others.length === 0) return `${c.bookingUnit} and ${c.myUnit}`;
  if (others.length === 1) return `${c.bookingUnit}, ${others[0]} and ${c.myUnit}`;
  return `${c.bookingUnit}, ${others.slice(0, -1).join(', ')}, `
    + `${others[others.length - 1]} and ${c.myUnit}`;
}
