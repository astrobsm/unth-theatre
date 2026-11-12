// ============================================================
// The chase letter
// ------------------------------------------------------------
// Distinct from buildRosterChase in messages.ts, and deliberately so. That one
// is a message: it goes to a phone, it asks, and it is the right instrument
// the first two times. This is a document — dated, addressed, with a reference
// and a record — meant to be printed, signed and filed, and it is what a
// department gets when asking has stopped working.
//
// THE RECORD IS THE REASON IT EXISTS. "There is no pharmacy roster this week"
// is an oversight. "There is no pharmacy roster this week, and there was none
// in four of the last six" is a different fact about the department, and only
// the second justifies a letter. So the letter STATES THE COUNT rather than
// characterising it: a letter that says "repeatedly" is arguable, and one that
// says "four of the last six weeks, the last three running" is not.
//
// IT DOES NOT THREATEN. Nothing here mentions a sanction, because theatre
// management is not the disciplinary authority, and a letter that implies
// otherwise gets withdrawn the first time somebody tests it — taking the
// credibility of every other chase in this system with it. The disciplinary
// route exists separately and is somebody else's to start.
//
// IT REFUSES TO BE WRITTEN about a department that is up to date. A caller
// asking for a letter there has made a mistake, and the right answer is not to
// produce the document.
// ============================================================

import {
  ROSTER_DUE_DAYS_BEFORE, prettyDay,
  type OffenceTally, type RosterAssessment, type RosterPeriod,
} from './overdue';

const SIGN_OFF = 'Theatre Management, UNTH Ituku-Ozalla';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "7 November 2026", from YYYY-MM-DD. */
function longDay(day: string | null | undefined): string {
  if (!day) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export interface RosterChaseLetterInput {
  personName: string;
  roleLabel?: string | null;
  deptLabel: string;
  deptSlug: string;
  period: RosterPeriod;
  assessment: RosterAssessment;
  tally: OffenceTally;
  /** Today, for the letter's own date. */
  today: string;
  /** Words from theatre management, added on the screen. */
  note?: string | null;
}

/** A reference somebody can quote back: ORM/ROSTER/<DEPT>/<week start>. */
export function letterReference(deptSlug: string, period: RosterPeriod): string {
  return `ORM/ROSTER/${deptSlug.toUpperCase()}/${period.start}`;
}

/** Null when there is nothing to write about. */
export function buildRosterChaseLetter(input: RosterChaseLetterInput): string | null {
  const a = input.assessment;
  if (a.state === 'ON_TIME' || a.notYetDue) return null;

  const dept = input.deptLabel;
  const lower = dept.toLowerCase();
  const overdueDays = a.daysOverdue ?? 0;
  const L: string[] = [];

  L.push(
    'UNIVERSITY OF NIGERIA TEACHING HOSPITAL, ITUKU-OZALLA',
    'THEATRE MANAGEMENT',
    '',
    `Ref:  ${letterReference(input.deptSlug, input.period)}`,
    `Date: ${longDay(input.today)}`,
    '',
    `To:   ${input.personName}${input.roleLabel ? `, ${input.roleLabel}` : ''}`,
    `      ${dept}`,
    '',
  );

  // ── Subject: the specific failure, never a category ──────────────────
  if (a.state === 'MISSING') {
    L.push(`SUBJECT: NO DUTY ROSTER SUBMITTED — ${dept.toUpperCase()}, ${input.period.label.toUpperCase()}`);
  } else if (a.state === 'DRAFTED_NOT_PUBLISHED') {
    L.push(`SUBJECT: DUTY ROSTER DRAFTED BUT NOT PUBLISHED — ${dept.toUpperCase()}, ${input.period.label.toUpperCase()}`);
  } else {
    L.push(`SUBJECT: LATE SUBMISSION OF DUTY ROSTER — ${dept.toUpperCase()}, ${input.period.label.toUpperCase()}`);
  }
  L.push('');

  // ── The fact ─────────────────────────────────────────────────────────
  if (a.state === 'MISSING') {
    L.push(
      `No duty roster has been published for ${lower} for the ${input.period.label} `
      + `(${prettyDay(input.period.start)} to ${prettyDay(input.period.end)}).`,
      '',
      `It was due on ${longDay(a.dueDay)}, ${ROSTER_DUE_DAYS_BEFORE} days before the week `
      + `begins. It is now ${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue.`,
    );
  } else if (a.state === 'DRAFTED_NOT_PUBLISHED') {
    L.push(
      `A duty roster for ${lower} exists on the ORM for the ${input.period.label} as a draft `
      + `of ${a.draftRows} row${a.draftRows === 1 ? '' : 's'}. It has not been published.`,
      '',
      'Until it is published, no other part of the hospital can read it. The work appears to '
      + 'have been done; one action remains.',
    );
  } else {
    L.push(
      `The duty roster for ${lower} for the ${input.period.label} was published on `
      + `${longDay(a.firstPublishedDay)}, ${a.daysLate} day${a.daysLate === 1 ? '' : 's'} after `
      + `the deadline of ${longDay(a.dueDay)}.`,
    );
  }

  // ── The record, in numbers rather than adjectives ────────────────────
  //
  // Keyed on "more than one", not on "any". A letter is only written about a
  // week that has already failed, so the tally covering that week can never be
  // zero — a `failures === 0` branch here would be unreachable, and the first
  // offence would be described as though it were a pattern.
  L.push('', 'RECORD');
  if (input.tally.failures > 1) {
    L.push(
      `Over the last ${input.tally.periods} weeks this department failed to submit on time `
      + `${input.tally.failures} time${input.tally.failures === 1 ? '' : 's'}: `
      + `${input.tally.missing} with no roster at all, ${input.tally.late} submitted late.`,
    );
    if (input.tally.runningStreak > 1) {
      L.push(`The last ${input.tally.runningStreak} of those weeks were consecutive.`);
    }
    if (input.tally.totalDaysLate > 0) {
      L.push(`Total lateness across the weeks that did arrive: ${input.tally.totalDaysLate} days.`);
    }
  } else {
    L.push(
      `This is the first failure recorded for this department in the last `
      + `${input.tally.periods} weeks.`,
    );
  }

  // ── What it costs, concretely, so the deadline is not an end in itself
  L.push(
    '',
    'WHY THIS MATTERS',
    'The published roster is the only one any other part of the hospital can read. Without '
    + `it the on-duty board cannot name anyone from ${lower} for the week, theatre cannot be `
    + 'told who to call, no duty performed by your staff can be attributed to them, and the '
    + 'meal counts and pack planning for the week are made against an incomplete list.',
  );

  // ── What is being asked, and the way out ─────────────────────────────
  L.push(
    '',
    'ACTION REQUIRED',
    a.state === 'DRAFTED_NOT_PUBLISHED'
      ? `Open the ${dept} roster on the ORM and press Publish. The draft already in place will `
        + 'then be live.'
      : `Submit and publish the ${lower} duty roster for the ${input.period.label} on the ORM.`,
    '',
    'If something is preventing it — an account that cannot reach the screen, a list you are '
    + 'waiting on, somebody on leave — please reply saying so. That is a problem theatre '
    + 'management can act on; a roster that is simply absent is not.',
  );

  if (input.note && input.note.trim()) L.push('', input.note.trim());

  L.push('', SIGN_OFF);
  return L.join('\n');
}
