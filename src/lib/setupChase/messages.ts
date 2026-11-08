// ============================================================
// Writing to an anaesthetic technician about a theatre that was not logged
// ------------------------------------------------------------
// THE DEADLINES ARE QUOTED FROM THE CODE, never typed into the prose. Both
// come from SETUP_GAPS and MORNING_DUE_LABEL, so a message cannot quote 08:30
// while the board enforces 08:00. A chase that states a deadline the system
// does not apply is the one kind of chase that cannot be defended at all.
//
// IT SAYS WHAT IS NOT ON THE BOARD, AND THAT IS DELIBERATE. The message states
// plainly that a theatre checked, found wanting and stood down is not a
// finding and never will be. Without that sentence the rational response to
// this board is to tick every box and keep quiet, and a technician who learns
// to do that is a worse outcome than every late setup on the list.
//
// IT COUNTS THEATRE-DAYS, NOT FAULTS. A technician covering three rooms on a
// Tuesday has three theatre-days, and saying "three findings" about one
// morning would be arithmetic nobody recognises.
// ============================================================

import { withNetworkNotice } from '@/lib/comms/networkNotice';
import {
  SETUP_GAPS, SETUP_GAP_CODES, MORNING_DUE_LABEL, END_OF_DAY_DUE_LABEL,
  type SetupGapCode,
} from './gaps';
import type { SetupTheatreDay, SetupTechnicianGroup } from './collect';

const SIGN_OFF = 'Theatre Management, UNTH Ituku-Ozalla';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Tue 3 Nov" — how a theatre day is said. */
export function shortDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${WEEKDAYS[d.getUTCDay()]} ${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

/** What one theatre-day is missing, in the fewest words that are still exact. */
export function theatreDayBits(td: SetupTheatreDay): string[] {
  const bits: string[] = [];
  td.gaps.forEach((code) => {
    switch (code) {
      case 'NO_MORNING_SETUP':
        bits.push('no morning setup logged');
        break;
      case 'MORNING_SETUP_LATE':
        bits.push(`certified ${td.certifiedClock ?? 'late'} (due ${MORNING_DUE_LABEL})`);
        break;
      case 'EQUIPMENT_NOT_CHECKED':
        bits.push(td.unchecked.length
          ? `certified ready with ${td.unchecked.join(', ')} unticked`
          : 'equipment checklist incomplete');
        break;
      case 'NO_END_OF_DAY':
        bits.push('no end-of-day check recorded');
        break;
      case 'END_OF_DAY_LATE':
        bits.push(`end-of-day entered ${td.endOfDayClock ?? 'late'} (due ${END_OF_DAY_DUE_LABEL})`);
        break;
      default:
        break;
    }
  });
  return bits;
}

/** One line about one theatre on one day. */
export function theatreDayLine(td: SetupTheatreDay): string {
  const swapped = td.assignedTheatreName && td.assignedTheatreName !== td.theatreName
    ? ` [you were assigned ${td.assignedTheatreName}]`
    : '';
  return `• ${shortDay(td.day)} — ${td.theatreName} — ${theatreDayBits(td).join('; ')}${swapped}`;
}

/** The gaps present across a technician's theatre-days, in canonical order. */
export function gapsPresent(
  theatreDays: readonly SetupTheatreDay[],
): SetupGapCode[] {
  return SETUP_GAP_CODES.filter(
    (code) => theatreDays.some((td) => td.gaps.indexOf(code) !== -1),
  );
}

/** How many theatre-days are named before the message quotes a count. */
export const MAX_DAYS_LISTED = 12;

/**
 * The message to the technician.
 *
 * The two deadlines are stated once, near the top, because a technician
 * reading this on a phone needs to know what is being asked before they read
 * what was missed.
 */
export function buildTechnicianSetupChase(input: {
  personName: string;
  periodLabel: string;
  group: SetupTechnicianGroup;
}): string {
  const g = input.group;
  const present = gapsPresent(g.theatreDays);
  const n = g.theatreDays.length;
  const rooms = g.theatres.length;

  const lines: string[] = [
    'UNTH Theatre — theatre setup and equipment checks',
    input.periodLabel,
    '',
    `Dear ${input.personName},`,
    '',
    `On every day a theatre has an elective list, two things are due from the anaesthetic `
    + `technician on it: the setup logged and the theatre certified by *${MORNING_DUE_LABEL}*, `
    + `and the end-of-day check recorded before *${END_OF_DAY_DUE_LABEL}*.`,
    '',
    `The ORM has ${n} theatre-${n === 1 ? 'day' : 'days'}`
    + `${rooms > 1 ? ` across ${rooms} theatres` : ''} with one or both of those outstanding.`,
    '',
    '*The theatres and days*',
  ];

  g.theatreDays.slice(0, MAX_DAYS_LISTED).forEach((td) => lines.push(theatreDayLine(td)));
  if (n > MAX_DAYS_LISTED) {
    lines.push(`• …and ${n - MAX_DAYS_LISTED} more in the same period.`);
  }

  lines.push('', '*Why each of these matters*');
  present.forEach((code) => lines.push(`*${SETUP_GAPS[code].label}.* ${SETUP_GAPS[code].consequence}`));

  lines.push('', '*What is needed*');
  present.forEach((code) => lines.push(`• ${SETUP_GAPS[code].fix}`));

  // The sentence that keeps this board honest. See the header.
  lines.push(
    '',
    '*A theatre you stand down is not on this list and never will be.* If you check a '
    + 'machine, find it faulty and record the theatre as NOT ready, that is the job done '
    + 'exactly as it should be done, and this board treats it as such. What it reports is a '
    + 'theatre nobody certified and a theatre certified with the checks left blank — never a '
    + 'fault you found and reported.',
  );

  lines.push(
    '',
    'If you were moved between theatres, covering two rooms at once, or held up by '
    + 'something outside your control, please say so — put it in the setup notes where you '
    + 'can, and tell the Theatre Manager or the Head of Anaesthesia where you cannot. Two '
    + 'theatres on one technician is an allocation problem and it is not solved by chasing '
    + 'you about it.',
    '',
    'If anything here is wrong, say so and it will be corrected.',
    '',
    'With thanks for your work,',
    SIGN_OFF,
  );

  return withNetworkNotice(lines.join('\n'));
}

/** The short line for a notification title or a board column. */
export function setupHeadline(group: SetupTechnicianGroup): string {
  const parts: string[] = [];
  const c = group.counts;
  if (c.NO_MORNING_SETUP > 0) parts.push(`${c.NO_MORNING_SETUP} with no morning setup`);
  if (c.MORNING_SETUP_LATE > 0) parts.push(`${c.MORNING_SETUP_LATE} certified late`);
  if (c.EQUIPMENT_NOT_CHECKED > 0) parts.push(`${c.EQUIPMENT_NOT_CHECKED} with checks unticked`);
  if (c.NO_END_OF_DAY > 0) parts.push(`${c.NO_END_OF_DAY} with no end-of-day check`);
  if (c.END_OF_DAY_LATE > 0) parts.push(`${c.END_OF_DAY_LATE} closed down late`);
  const n = group.theatreDays.length;
  return `${n} theatre-${n === 1 ? 'day' : 'days'}: ${parts.join(', ')}`;
}
