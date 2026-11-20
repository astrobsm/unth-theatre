/**
 * When the oxygen room is expected to post a status, and whether it has.
 *
 * THE RULE, as given: an update every morning, then every two hours until
 * 2 pm, on each working day. That is four postings — 08:00, 10:00, 12:00,
 * 14:00, Monday to Friday — and the whole value of this module is that
 * everybody downstream reads the SAME four from one place.
 *
 * Why this matters more than it looks. A readiness report has always been
 * writable at any hour, which means a board showing "Central supply: GOOD"
 * cannot be told apart from one showing "Central supply: GOOD, as of Tuesday".
 * An anaesthetic technician setting up at 11:40 needs the second reading, and
 * until now the screen gave them the first. A status with no stated age is not
 * a status; it is a rumour with a colour.
 *
 * All arithmetic is in LOCAL time deliberately. This machine, the theatre
 * server and the oxygen room are all on WAT, and "the 10 o'clock update" means
 * ten o'clock in the oxygen room — never 10:00 UTC. For the same reason no
 * clock or date here is formatted with toLocaleString: that prints one way on
 * this laptop and another on the server, and a time that reads differently in
 * two places is worse than one nobody can read at all.
 */

export interface OxygenSlot {
  /** Stable id. Stored and compared; never shown. */
  key: string;
  hour: number;
  minute: number;
  /** What the oxygen room and the theatre call it. */
  label: string;
}

/**
 * The four postings of a working day.
 *
 * ONE PLACE. If the committee moves the morning update to 07:00 or extends the
 * run to 4 pm, this array is the only edit — the page, the chase, the "late"
 * badge and the tests all read it. The booking wizard's two hand-maintained
 * step orders, which transposed and sent people back to the wrong screen, are
 * what this is avoiding.
 */
export const OXYGEN_UPDATE_SLOTS: OxygenSlot[] = [
  { key: 'MORNING', hour: 8, minute: 0, label: 'Morning' },
  { key: 'T1000', hour: 10, minute: 0, label: '10:00' },
  { key: 'T1200', hour: 12, minute: 0, label: '12:00' },
  { key: 'T1400', hour: 14, minute: 0, label: '14:00' },
];

/**
 * How long after a slot opens before the posting is called late rather than
 * merely due.
 *
 * Half an hour, because the oxygen room is a room with a job in it. A man
 * walking the manifold at 10:00 is doing exactly what the rule asks and should
 * not be red on four screens for taking twenty minutes over it. Past thirty
 * the silence is the information.
 */
export const OXYGEN_UPDATE_GRACE_MINUTES = 30;

/**
 * Past this, a status is old enough that its colour should not be trusted on
 * its own, whatever the day of the week.
 */
export const OXYGEN_STALE_HOURS = 24;

/**
 * When the posting day closes.
 *
 * Found by a test of this module, which is the only reason it is here. With
 * no closing boundary, a 14:00 slot that nobody posted stays "the 14:00
 * update is LATE" in red at eight in the evening, through the night and all
 * through Saturday, until the twenty-four hour mark finally reclassifies it.
 * Nobody is going to post the 2 o'clock update at 20:15, so the red is not
 * asking anybody for anything -- it is just a red badge that is always on,
 * and a red badge that is always on teaches people to stop reading red badges.
 *
 * Past this hour the schedule owes nothing and the screen says what it
 * actually knows: how old the last posting is, and when the next one is due.
 * The day strip is unaffected -- a missed 14:00 stays missed on it, which is
 * the record of the day and should not be tidied away.
 */
export const OXYGEN_DAY_CLOSES_HOUR = 18;

const MS_PER_MINUTE = 60_000;

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Monday to Friday. Public holidays are not modelled; nothing here knows them. */
export function isWorkingDay(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

/** "08:00". Fixed width, same on every machine. */
export function clockText(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** "20 Nov, 14:05". */
export function stampText(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${clockText(d)}`;
}

/** The slot as a clock time on a given day. */
export function slotTimeOn(day: Date, slot: OxygenSlot): Date {
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), slot.hour, slot.minute, 0, 0);
  return at;
}

export function slotTimesOn(day: Date): { slot: OxygenSlot; at: Date }[] {
  return OXYGEN_UPDATE_SLOTS.map((slot) => ({ slot, at: slotTimeOn(day, slot) }));
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_MINUTE);
}

/**
 * The slot a posting counts against: the latest one whose time had passed when
 * it was filed, that same day.
 *
 * A report at 10:05 covers the 10 o'clock posting. One at 09:50 covers the
 * morning posting and does NOT pay for 10 o'clock in advance — the point of the
 * cadence is a fresh look at the manifold, not a form filled early.
 */
export function slotCovered(reportAt: Date): OxygenSlot | null {
  let found: OxygenSlot | null = null;
  for (const slot of OXYGEN_UPDATE_SLOTS) {
    const at = slotTimeOn(reportAt, slot);
    if (reportAt.getTime() >= at.getTime()) found = slot;
  }
  return found;
}

export type SlotStatus = 'COVERED' | 'DUE' | 'LATE' | 'UPCOMING';

export interface SlotCoverage {
  slot: OxygenSlot;
  at: Date;
  status: SlotStatus;
  coveredAt: Date | null;
  /** Minutes past the slot time, for DUE and LATE. Zero otherwise. */
  minutesLate: number;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/**
 * The day's four postings and what happened to each.
 *
 * This is the strip the oxygen room sees on their own screen and the one the
 * theatre sees on the status page — deliberately the same object, so the
 * supervisor is never looking at a gentler account of their own day than the
 * anaesthetist is.
 */
export function slotCoverageFor(
  day: Date,
  reportTimes: Date[],
  now: Date,
): SlotCoverage[] {
  const onDay = reportTimes
    .filter((t) => sameDay(t, day))
    .sort((a, b) => a.getTime() - b.getTime());

  return slotTimesOn(day).map(({ slot, at }) => {
    const coveredAt = onDay.find((t) => slotCovered(t)?.key === slot.key) ?? null;
    if (coveredAt) {
      return { slot, at, status: 'COVERED' as SlotStatus, coveredAt, minutesLate: 0 };
    }
    if (now.getTime() < at.getTime()) {
      return { slot, at, status: 'UPCOMING' as SlotStatus, coveredAt: null, minutesLate: 0 };
    }
    const late = minutesBetween(at, now);
    return {
      slot,
      at,
      status: (late <= OXYGEN_UPDATE_GRACE_MINUTES ? 'DUE' : 'LATE') as SlotStatus,
      coveredAt: null,
      minutesLate: late,
    };
  });
}

/** The posting that should be on the board right now, if any. */
export function expectedSlot(now: Date): { slot: OxygenSlot; at: Date } | null {
  if (!isWorkingDay(now)) return null;
  if (now.getHours() >= OXYGEN_DAY_CLOSES_HOUR) return null;
  let found: { slot: OxygenSlot; at: Date } | null = null;
  for (const { slot, at } of slotTimesOn(now)) {
    if (now.getTime() >= at.getTime()) found = { slot, at };
  }
  return found;
}

/** The next posting due, today or on the next working day. */
export function nextSlot(now: Date): { slot: OxygenSlot; at: Date } | null {
  for (let dayOffset = 0; dayOffset <= 10; dayOffset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    if (!isWorkingDay(day)) continue;
    for (const { slot, at } of slotTimesOn(day)) {
      if (at.getTime() > now.getTime()) return { slot, at };
    }
  }
  return null;
}

export type FreshnessLevel =
  /** Nothing has ever been posted. */
  | 'NONE'
  /** The posting due now has been made. */
  | 'CURRENT'
  /** Due, within the grace period. */
  | 'DUE'
  /** Past grace, with nothing posted. */
  | 'LATE'
  /** Outside the posting hours — evening, or a weekend — and recent enough to stand. */
  | 'OFF_SCHEDULE'
  /** Older than a day, whatever the schedule says. */
  | 'STALE';

export interface OxygenScheduleState {
  level: FreshnessLevel;
  workingDay: boolean;
  expected: { slot: OxygenSlot; at: Date } | null;
  next: { slot: OxygenSlot; at: Date } | null;
  lastReportAt: Date | null;
  /** Age of the last posting, in minutes. Null when there is none. */
  ageMinutes: number | null;
  /** Minutes past the expected slot while nothing has been posted. */
  minutesLate: number;
  /** One line, written for the person reading the board. */
  message: string;
}

/** "2 h 15 min", "40 min", "3 days". */
export function ageText(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rem = minutes % 60;
    return rem ? `${hours} h ${rem} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

export function scheduleState(now: Date, lastReportAt: Date | null): OxygenScheduleState {
  const workingDay = isWorkingDay(now);
  const expected = expectedSlot(now);
  const next = nextSlot(now);
  const ageMinutes = lastReportAt ? Math.max(0, minutesBetween(lastReportAt, now)) : null;
  const nextText = next ? `${clockText(next.at)}${sameDay(next.at, now) ? '' : ` on ${stampText(next.at).split(',')[0]}`}` : '';

  if (!lastReportAt || ageMinutes === null) {
    return {
      level: 'NONE',
      workingDay,
      expected,
      next,
      lastReportAt: null,
      ageMinutes: null,
      minutesLate: expected ? minutesBetween(expected.at, now) : 0,
      message: next
        ? `No oxygen status has been posted. The next one is due at ${nextText}.`
        : 'No oxygen status has been posted.',
    };
  }

  const stale = ageMinutes >= OXYGEN_STALE_HOURS * 60;

  if (!expected) {
    // Evening, early morning, or a weekend: nothing is owed right now.
    return {
      level: stale ? 'STALE' : 'OFF_SCHEDULE',
      workingDay,
      expected: null,
      next,
      lastReportAt,
      ageMinutes,
      minutesLate: 0,
      message: stale
        ? `Last posted ${ageText(ageMinutes)} ago. Treat the readings as out of date until the ${nextText} update.`
        : `Last posted ${ageText(ageMinutes)} ago. No update is due until ${nextText}.`,
    };
  }

  const covered = lastReportAt.getTime() >= expected.at.getTime();
  if (covered) {
    return {
      level: 'CURRENT',
      workingDay,
      expected,
      next,
      lastReportAt,
      ageMinutes,
      minutesLate: 0,
      message: `Up to date — the ${expected.slot.label} update was posted at ${clockText(lastReportAt)}.${next ? ` Next due ${nextText}.` : ''}`,
    };
  }

  const minutesLate = minutesBetween(expected.at, now);
  if (stale) {
    return {
      level: 'STALE',
      workingDay,
      expected,
      next,
      lastReportAt,
      ageMinutes,
      minutesLate,
      message: `No update today. The last one was ${ageText(ageMinutes)} ago, at ${stampText(lastReportAt)}.`,
    };
  }

  const level: FreshnessLevel = minutesLate <= OXYGEN_UPDATE_GRACE_MINUTES ? 'DUE' : 'LATE';
  return {
    level,
    workingDay,
    expected,
    next,
    lastReportAt,
    ageMinutes,
    minutesLate,
    message: level === 'DUE'
      ? `The ${expected.slot.label} update is due. Last posted ${ageText(ageMinutes)} ago.`
      : `The ${expected.slot.label} update is ${ageText(minutesLate)} late. Last posted ${ageText(ageMinutes)} ago.`,
  };
}

/** Colour band for the freshness badge. Kept out of the pages so they agree. */
export function freshnessTone(level: FreshnessLevel): 'green' | 'amber' | 'red' | 'grey' {
  switch (level) {
    case 'CURRENT': return 'green';
    case 'OFF_SCHEDULE': return 'grey';
    case 'DUE': return 'amber';
    case 'LATE': return 'red';
    case 'STALE': return 'red';
    case 'NONE': return 'red';
    default: return 'grey';
  }
}

export function freshnessLabel(level: FreshnessLevel): string {
  switch (level) {
    case 'CURRENT': return 'Up to date';
    case 'DUE': return 'Update due';
    case 'LATE': return 'Update late';
    case 'STALE': return 'Out of date';
    case 'OFF_SCHEDULE': return 'Outside posting hours';
    case 'NONE': return 'Never posted';
    default: return 'Unknown';
  }
}

/** The posting times written out, for a screen that has to explain the rule. */
export function scheduleSentence(): string {
  const times = OXYGEN_UPDATE_SLOTS
    .map((s) => `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`)
    .join(', ');
  return `The oxygen room posts a status every working day at ${times}.`;
}
