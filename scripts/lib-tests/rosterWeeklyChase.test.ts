/**
 * "Pharmacy have no roster for this week, very bad."
 *
 * Three things that sentence needs and the chase did not have: a WEEK to ask
 * about (the board asked about calendar months, so a department that published
 * something for the 3rd read as on time all month), a COUNT of how often this
 * has happened, and a LETTER for when asking has stopped working.
 *
 * The tally is the part worth testing hardest, because it is the part a letter
 * quotes. A number in a letter that turns out to be wrong loses the argument
 * and the next five arguments with it.
 */
import { describe, expect, it } from 'vitest';

import {
  weekPeriod, weekStartOf, previousWeek, trailingWeeks, prettyDay,
  assessPeriods, offenceTally, tallySummary, dueDay, assessRoster,
  type PublicationSpan, type RosterPeriod,
} from '../../src/lib/rosterChase/overdue';
import { buildRosterChaseLetter, letterReference } from '../../src/lib/rosterChase/letter';

// Thursday 12 November 2026.
const TODAY = '2026-11-12';
const THIS_WEEK = weekPeriod('2026-11-09')!; // Mon 9 – Sun 15 Nov

describe('the week a roster covers', () => {
  it('runs Monday to Sunday', () => {
    expect(THIS_WEEK.start).toBe('2026-11-09');
    expect(THIS_WEEK.end).toBe('2026-11-15');
  });

  it('puts Sunday in the week that began six days earlier', () => {
    // Sunday is the END of the duty week, not the start of a new one. Getting
    // this wrong shifts every deadline by a day for one seventh of all lookups.
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09');
    expect(weekStartOf('2026-11-16')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-12')).toBe('2026-11-09');
  });

  it('names the week the way it would be said out loud', () => {
    // "2026-W46" has two readings at a year boundary and none at all to the
    // person being chased.
    expect(THIS_WEEK.label).toBe('week of Monday 9 November 2026');
    expect(prettyDay('2026-01-01')).toBe('Thursday 1 January 2026');
  });

  it('steps back across a month and a year', () => {
    expect(previousWeek('2026-11-02')).toBe('2026-10-26');
    expect(previousWeek('2027-01-04')).toBe('2026-12-28');
  });

  it('is due seven days before it starts', () => {
    expect(dueDay(THIS_WEEK)).toBe('2026-11-02');
  });

  it('builds a trailing window, oldest first', () => {
    const w = trailingWeeks(TODAY, 4);
    expect(w).toHaveLength(4);
    expect(w[0].start).toBe('2026-10-19');
    expect(w[3].start).toBe('2026-11-09');
  });
});

const pub = (publishedDay: string, periodStart: string, periodEnd: string): PublicationSpan =>
  ({ publishedDay, periodStart, periodEnd });

describe('how each week went', () => {
  const weeks = trailingWeeks(TODAY, 4); // 19 Oct, 26 Oct, 2 Nov, 9 Nov

  it('calls a week with no publication missing, once its deadline has passed', () => {
    const out = assessPeriods(weeks, [], TODAY);
    expect(out.map((o) => o.state)).toEqual(['MISSING', 'MISSING', 'MISSING', 'MISSING']);
  });

  it('does not count a week whose deadline has not arrived', () => {
    // THE off-by-one that would make every tally wrong by one, every week.
    // The week of 16 Nov is due on 9 Nov; asked on 2 Nov it is not yet late.
    const future = trailingWeeks('2026-11-20', 1); // week of 16 Nov
    const out = assessPeriods(future, [], '2026-11-02');
    expect(out[0].state).toBe('ON_TIME');
  });

  it('judges on the first publication covering the week, not the latest', () => {
    // A department that published early and then corrected twice has submitted
    // on time; measuring the newest version reports the most diligent
    // departments as the latest of all, which is exactly backwards.
    const out = assessPeriods([THIS_WEEK], [
      pub('2026-11-10', '2026-11-09', '2026-11-15'),
      pub('2026-10-30', '2026-11-09', '2026-11-15'),
    ], TODAY);
    expect(out[0].state).toBe('ON_TIME');
  });

  it('counts a publication whose span overlaps the week', () => {
    // A fortnightly roster published once covers both of its weeks.
    const out = assessPeriods(weeks.slice(2), [
      pub('2026-10-25', '2026-11-02', '2026-11-15'),
    ], TODAY);
    expect(out.map((o) => o.state)).toEqual(['ON_TIME', 'ON_TIME']);
  });

  it('measures lateness from the deadline', () => {
    const out = assessPeriods([THIS_WEEK], [
      pub('2026-11-05', '2026-11-09', '2026-11-15'),
    ], TODAY);
    expect(out[0].state).toBe('LATE');
    expect(out[0].daysLate).toBe(3); // due 2 Nov, arrived 5 Nov
  });
});

describe('the tally a letter quotes', () => {
  const weeks = trailingWeeks(TODAY, 6);

  it('counts nothing for a department that has never missed', () => {
    const pubs = weeks.map((w) => pub(dueDay(w), w.start, w.end));
    const t = offenceTally(assessPeriods(weeks, pubs, TODAY));
    expect(t.failures).toBe(0);
    // And says nothing on a board, or the badge stops meaning anything on the
    // departments that have.
    expect(tallySummary(t)).toBeNull();
  });

  it('separates missing from late', () => {
    const pubs = [
      pub(dueDay(weeks[0]), weeks[0].start, weeks[0].end),            // on time
      pub('2026-11-01', weeks[2].start, weeks[2].end),                // late
    ];
    const t = offenceTally(assessPeriods(weeks, pubs, TODAY));
    expect(t.onTime).toBe(1);
    expect(t.late).toBe(1);
    expect(t.missing).toBe(4);
    expect(t.failures).toBe(5);
  });

  it('reports the streak that is still running, not the worst one ever', () => {
    // A letter says "the last three weeks running". If that counted a bad
    // patch from two months ago while this week was fine, it would be false.
    const pubs = [
      // weeks 0 and 1 missing, week 2 on time, weeks 3-5 missing
      pub(dueDay(weeks[2]), weeks[2].start, weeks[2].end),
    ];
    const t = offenceTally(assessPeriods(weeks, pubs, TODAY));
    expect(t.runningStreak).toBe(3);
    expect(t.worstStreak).toBe(3);

    // Now make the most recent week fine: the running streak must drop to 0
    // even though the bad run is still in the window.
    const pubs2 = pubs.concat([pub(dueDay(weeks[5]), weeks[5].start, weeks[5].end)]);
    const t2 = offenceTally(assessPeriods(weeks, pubs2, TODAY));
    expect(t2.runningStreak).toBe(0);
    expect(t2.worstStreak).toBe(2);
  });

  it('adds up the days of lateness', () => {
    const pubs = [
      pub('2026-10-15', weeks[0].start, weeks[0].end),
      pub('2026-10-22', weeks[1].start, weeks[1].end),
    ];
    const out = assessPeriods(weeks, pubs, TODAY);
    const t = offenceTally(out);
    expect(t.totalDaysLate).toBe(
      out.reduce((n, o) => n + (o.daysLate ?? 0), 0),
    );
    expect(t.totalDaysLate).toBeGreaterThan(0);
  });

  it('summarises in a line that counts rather than characterises', () => {
    const t = offenceTally(assessPeriods(weeks, [], TODAY));
    const line = tallySummary(t)!;
    expect(line).toContain('6 of the last 6 weeks');
    expect(line).toContain('6 weeks running');
    expect(line).not.toMatch(/repeatedly|persistent|unacceptable/i);
  });
});

const assessment = (over: Partial<ReturnType<typeof assessRoster>> = {}) => ({
  state: 'MISSING' as const,
  dueDay: '2026-11-02',
  firstPublishedDay: null,
  daysLate: null,
  daysOverdue: 10,
  version: null,
  publishedByName: null,
  draftRows: 0,
  publishedRows: 0,
  notYetDue: false,
  ...over,
});

describe('the chase letter', () => {
  const weeks = trailingWeeks(TODAY, 6);
  const badTally = offenceTally(assessPeriods(weeks, [], TODAY));

  const letter = (over = {}, a = assessment()) => buildRosterChaseLetter({
    personName: 'Dr A. Pharmacist',
    roleLabel: 'Head of Pharmacy',
    deptLabel: 'Pharmacists',
    deptSlug: 'pharmacists',
    period: THIS_WEEK,
    assessment: a,
    tally: badTally,
    today: TODAY,
    ...over,
  });

  it('refuses to be written about a department that is up to date', () => {
    // A caller asking for one here has made a mistake, and the right answer is
    // to not produce the document.
    expect(letter({}, assessment({ state: 'ON_TIME' }))).toBeNull();
    expect(letter({}, assessment({ notYetDue: true }))).toBeNull();
  });

  it('carries a reference, a date and an addressee', () => {
    const t = letter()!;
    expect(t).toContain(letterReference('pharmacists', THIS_WEEK));
    expect(t).toContain('ORM/ROSTER/PHARMACISTS/2026-11-09');
    expect(t).toContain('Date: 12 November 2026');
    expect(t).toContain('Dr A. Pharmacist, Head of Pharmacy');
  });

  it('states the count instead of calling it repeated', () => {
    // "Repeatedly" is arguable. "6 times, 6 of them consecutive" is not.
    const t = letter()!;
    expect(t).toContain('failed to submit on time 6 times');
    expect(t).toContain('6 with no roster at all');
    expect(t).toMatch(/last 6 of those weeks were consecutive/);
  });

  it('says it is a first offence when it is one', () => {
    const clean = offenceTally(assessPeriods(
      weeks, weeks.slice(0, 5).map((w) => pub(dueDay(w), w.start, w.end)), TODAY,
    ));
    const t = letter({ tally: clean })!;
    expect(t).toContain('first failure recorded');
    expect(t).not.toContain('consecutive');
  });

  it('treats a drafted roster as nearly done, not as nothing', () => {
    // Somebody typed in a week of shifts and reasonably assumed that was that.
    const t = letter({}, assessment({ state: 'DRAFTED_NOT_PUBLISHED', draftRows: 42 }))!;
    expect(t).toContain('DRAFTED BUT NOT PUBLISHED');
    expect(t).toContain('42 rows');
    expect(t).toContain('press Publish');
    expect(t).toContain('one action remains');
  });

  it('threatens nothing, because theatre management cannot', () => {
    // A letter implying a sanction gets withdrawn the first time somebody
    // tests it, and takes the credibility of every other chase with it.
    const t = letter()!;
    expect(t).not.toMatch(/disciplinary|sanction|query|misconduct|report you|consequence/i);
  });

  it('names what a missing roster actually costs', () => {
    const t = letter()!;
    expect(t).toContain('on-duty board cannot name anyone');
    expect(t).toContain('attributed to them');
  });

  it('offers the way out, so a blocked department can say so', () => {
    const t = letter()!;
    expect(t).toContain('please reply saying so');
  });

  it('carries a note from theatre management when one is added', () => {
    const t = letter({ note: 'Discussed at the morning meeting on 11 November.' })!;
    expect(t).toContain('Discussed at the morning meeting');
  });
});
