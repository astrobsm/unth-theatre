// ============================================================
// Who a duty actually belongs to, and what they are asked to do
// ------------------------------------------------------------
// The board chases and commends by NAME, which works for a duty handed to one
// person before it falls due. Most of these duties are not that.
//
// A pack that nobody made has no packer on it; an emergency nobody answered
// has no responder; a case with no times recorded has nobody's name on the
// timing. So for four of the five duties the board could attribute the
// failures to nobody at all — and a chase with no legitimate recipient is
// worse than silence, because the first person it reaches by accident learns
// that the board does not know who does what and stops believing any of it.
//
// WHO OWES THE WORK IS A ROLE QUESTION FIRST AND A ROSTER QUESTION SECOND.
// Every duty names the roles that perform it (DutyDefinition.roles) and, where
// the department publishes one a week ahead, the roster category that says who
// was on (DutyDefinition.rosterCategory). This file turns those two into the
// list of people the board may write to, and composes what they are sent.
//
// IT DOES NOT PUT A SINGLE NAME AGAINST SHARED WORK. Where three people were
// on, the brief goes to all three; it does not pick one and report them for
// the work nobody did. The message is addressed to a person but describes the
// team's duty, reports the DEPARTMENT's figure, and adds that person's own
// record only where there is one.
// ============================================================

import { DUTIES, type DutyKey, type DutyPerformance } from './types';

/** One published roster row, as the brief needs it. */
export interface DutyShiftRow {
  userId: string;
  name: string;
  /** The WAT calendar day the row is for, as yyyy-mm-dd. */
  date: string;
  /** MORNING | CALL | NIGHT */
  shift: string;
}

/** Somebody who may be written to about a duty. */
export interface DutyTeamMember {
  userId: string;
  name: string;
  role: string | null;
  phone: string | null;
  /** Distinct WAT days rostered in the window, earliest first. */
  days: string[];
  /** Distinct shifts worked, in roster order. */
  shifts: string[];
  /** Days that were the eve of a day with work due. */
  eves: number;
  /** Where the name came from. A roster row is a stronger claim than a role. */
  source: 'roster' | 'role';
  /** Their own record for the window, where anything is recorded against them. */
  performance: DutyPerformance | null;
}

const SHIFT_ORDER = ['MORNING', 'CALL', 'NIGHT'];

/** The WAT calendar day before `iso`, as yyyy-mm-dd. */
export function dayBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

/**
 * Is this duty discharged the day BEFORE the work it serves?
 *
 * Packing and the pre-op review are: they are done the evening before a list,
 * which is the whole reason they are measurable. Acknowledging an alert and
 * recording an operation's times happen on the day, so their roster window is
 * the window itself.
 */
export function isEveDuty(duty: DutyKey): boolean {
  return duty === 'PHARMACY_PACKING'
    || duty === 'CONSUMABLE_PACKING'
    || duty === 'PREOP_REVIEW';
}

/**
 * The roster window to query for a report window.
 *
 * One day wider at the start for an eve duty, because the first day in the
 * window was prepared for the evening BEFORE the window opened. Forgetting
 * this is how the first day of every month ends up with nobody responsible
 * for it.
 */
export function rosterWindowFor(
  duty: DutyKey,
  from: string,
  to: string,
): { from: string; to: string } {
  return isEveDuty(duty) ? { from: dayBefore(from), to: dayBefore(to) } : { from, to };
}

/**
 * Fold roster rows into one entry per person.
 *
 * @param eves the WAT days that were an eve of a day with work due, so a
 *             message can say how many shifts the person was actually
 *             responsible for rather than how many rows exist.
 */
export function foldRoster(
  rows: readonly DutyShiftRow[],
  eves: readonly string[] = [],
): Map<string, { name: string; days: string[]; shifts: string[]; eves: number }> {
  const eveSet = new Set(eves);
  const byUser = new Map<string, { name: string; days: string[]; shifts: string[]; eves: number }>();

  rows.forEach((r) => {
    const name = (r.name || '').trim();
    // A roster row with no user attached cannot be written to. It is a gap in
    // the roster, not a person, and inventing a recipient for it would put
    // this file back where it started.
    if (!r.userId || !name) return;

    let p = byUser.get(r.userId);
    if (!p) {
      p = { name, days: [], shifts: [], eves: 0 };
      byUser.set(r.userId, p);
    }
    if (p.days.indexOf(r.date) === -1) {
      p.days.push(r.date);
      if (eveSet.has(r.date)) p.eves += 1;
    }
    const shift = (r.shift || '').trim().toUpperCase();
    if (shift && p.shifts.indexOf(shift) === -1) p.shifts.push(shift);
  });

  byUser.forEach((p) => {
    p.days.sort();
    p.shifts.sort((a, b) => {
      const ia = SHIFT_ORDER.indexOf(a);
      const ib = SHIFT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  });
  return byUser;
}

/**
 * The order the team is shown and written to in.
 *
 * People with work recorded against them first, worst record at the top,
 * because those are the conversations worth having. Then the rostered without
 * a record — they were on duty and nothing reached the ORM, which is its own
 * finding. Then everybody else holding the role.
 */
export function sortTeam(members: DutyTeamMember[]): DutyTeamMember[] {
  const share = (m: DutyTeamMember) => {
    const p = m.performance;
    if (!p || p.total === 0) return null;
    return (p.done - p.late) / p.total;
  };
  return members.slice().sort((a, b) => {
    const sa = share(a);
    const sb = share(b);
    if (sa !== null && sb !== null) {
      if (sa !== sb) return sa - sb;
      return (b.performance?.total ?? 0) - (a.performance?.total ?? 0);
    }
    if (sa !== null) return -1;
    if (sb !== null) return 1;
    if (a.source !== b.source) return a.source === 'roster' ? -1 : 1;
    if (b.eves !== a.eves) return b.eves - a.eves;
    if (b.days.length !== a.days.length) return b.days.length - a.days.length;
    return a.name.localeCompare(b.name);
  });
}

export interface DutyBriefInput {
  duty: DutyKey;
  /** Who it is addressed to. */
  personName: string;
  periodLabel: string;
  /** What the department as a whole did, from the same report the board shows. */
  departmentTotal: number;
  departmentDone: number;
  departmentOnTime: number;
  /** Their shifts, where the roster knows them. */
  daysOnDuty: number;
  eves: number;
  /** Their own record, where anything is recorded against them. */
  own?: DutyPerformance | null;
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

/**
 * The appeal sent to somebody who performs a duty.
 *
 * ONE MESSAGE, FIVE DUTIES, and deliberately so: a hospital that writes to
 * pharmacy in one tone and to the nurses in another gets an argument about
 * tone instead of a packed trolley. It is an appeal, not an accusation, for
 * the same reason the late-booking chase is — the outcome wanted is the duty
 * done tomorrow, and a message that reads as an attack produces a defensive
 * colleague and nothing else.
 *
 * IT ENDS WITH THE STEPS, INCLUDING WHERE THE SCREEN IS. The commonest cause
 * of a bad figure on this board is not refusal, it is somebody who did the
 * work and could not find where to record it. Telling them their percentage
 * without telling them that would be asking for the same month again.
 */
export function buildDutyBrief(input: DutyBriefInput): string {
  const d = DUTIES[input.duty];
  const p = input.own;

  const lines: string[] = [
    `UNTH Theatre — ${d.label.toLowerCase()}`,
    '',
    `Dear ${input.personName},`,
    '',
    `We are writing to everybody who carries ${d.label.toLowerCase()} about how it `
    + 'is going, and to ask for your help with it. This is an appeal, not an '
    + 'accusation: we need your cooperation far more than we need a record of '
    + 'the shortfall.',
  ];

  if (input.daysOnDuty > 0) {
    lines.push(
      '',
      `Your duty for ${input.periodLabel}: ${input.daysOnDuty} day`
      + `${input.daysOnDuty === 1 ? '' : 's'} on the published roster`
      + (input.eves > 0
        ? `, of which ${input.eves} ${input.eves === 1 ? 'was' : 'were'} the day before `
          + 'work was due.'
        : '.'),
    );
  }

  lines.push(
    '',
    `Where the department stands for ${input.periodLabel}:`,
    `• ${input.departmentTotal} were due`,
    `• ${input.departmentDone} were ${d.verb} and recorded `
    + `(${pct(input.departmentDone, input.departmentTotal)})`,
    `• ${input.departmentOnTime} of those were ${d.verb} ${d.deadline}`,
  );

  if (p && p.total > 0) {
    const onTime = p.done - p.late;
    lines.push(
      '',
      'Your own record:',
      `• ${p.done} of ${p.total} ${d.verb}`
      + (p.outstanding > 0 ? `, ${p.outstanding} not done at all` : '')
      + (p.late > 0 ? `, ${p.late} done late` : ''),
      `• Done on time: ${onTime} of ${p.total} (${pct(onTime, p.total)})`,
    );
  } else if (input.daysOnDuty > 0) {
    lines.push(
      '',
      'Nothing at all is recorded in your name for this period. We are not '
      + 'assuming the work was not done — far more often it was done and never '
      + 'entered. But the ORM is what theatre reads, and what it cannot see it '
      + 'treats as not done.',
    );
  }

  if (input.departmentDone === 0 && input.departmentTotal > 0) {
    lines.push(
      '',
      'Nothing at all was recorded across the whole department in this period. '
      + 'That is almost certainly a recording problem rather than a working one '
      + '— which matters more than it sounds, because the theatre plans the '
      + 'day from these entries.',
    );
  }

  lines.push('', `Why it matters. ${d.why}`);

  lines.push('', `How it is done — ${d.where}:`);
  d.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));

  lines.push(
    '',
    'If you cannot find the screen, or your login will not reach it, say so and '
    + 'somebody will walk you through it on the ward — that is a five-minute '
    + 'problem and we would far rather solve it than keep reporting it.',
    '',
    'And if something else is genuinely in the way — work you are never told '
    + 'about, a form that will not save, cover you do not have — please tell '
    + 'the Theatre Manager or the Theatre Chairman. A difficulty raised is one we '
    + 'can solve; one we never hear about simply repeats.',
    '',
    'Thank you for the work, and for taking the time to record it.',
    'Theatre Management, UNTH Ituku-Ozalla',
  );

  return lines.join('\n');
}
