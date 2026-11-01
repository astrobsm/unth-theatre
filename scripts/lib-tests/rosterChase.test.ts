import { describe, it, expect } from 'vitest';
import {
  assessRoster, monthPeriod, dueDay, daysBetween, watToday, worthChasing,
  STATE_LABELS, ROSTER_DUE_DAYS_BEFORE,
} from '../../src/lib/rosterChase/overdue';
import { buildRosterChase, rosterHeadline, longDay } from '../../src/lib/rosterChase/messages';
import { previousMonth } from '../../src/lib/rosterChase/collect';

// A roster is "submitted" when it is PUBLISHED. Draft rows are not a roster —
// nothing downstream reads them, deliberately — and the whole reason this
// module exists is that "I did it" and "it was published" feel like the same
// claim to the person who typed it in.
//
// The ways it can be wrong:
//
//   calling a department late because its roster was CORRECTED during the
//   month, which would report the departments that maintain their rosters
//   properly as the worst of all;
//
//   reporting a department as having submitted nothing when somebody spent an
//   afternoon entering three hundred rows;
//
//   and chasing a period whose deadline has not arrived, which teaches a head
//   of department that the board does not know what it is talking about.

const NOV = monthPeriod('2026-11')!;

const PUB = (day: string, version = 1) => ({
  publishedDay: day,
  version,
  publishedByName: 'Dr Head',
  rowCount: 120,
});

describe('the period and the deadline', () => {
  it('reads a month, leap years included', () => {
    expect(monthPeriod('2026-11')).toEqual({
      start: '2026-11-01', end: '2026-11-30', label: 'November 2026',
    });
    expect(monthPeriod('2028-02')!.end).toBe('2028-02-29');
    expect(monthPeriod('2026-02')!.end).toBe('2026-02-28');
    expect(monthPeriod('2026-13')).toBeNull();
    expect(monthPeriod('nonsense')).toBeNull();
  });

  it('puts the deadline a week before the period begins', () => {
    expect(ROSTER_DUE_DAYS_BEFORE).toBe(7);
    expect(dueDay(NOV)).toBe('2026-10-25');
    // Across a month boundary and a year boundary.
    expect(dueDay(monthPeriod('2027-01')!)).toBe('2026-12-25');
  });

  it('counts days between two days', () => {
    expect(daysBetween('2026-10-25', '2026-11-05')).toBe(11);
    expect(daysBetween('2026-10-25', '2026-10-25')).toBe(0);
    expect(daysBetween('2026-10-25', '2026-10-20')).toBe(-5);
  });

  it('reads today in Enugu, not in UTC', () => {
    expect(watToday(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
  });

  it('steps back a month, across a year', () => {
    expect(previousMonth('2026-11')).toBe('2026-10');
    expect(previousMonth('2026-01')).toBe('2025-12');
  });
});

describe('whether a roster was in on time', () => {
  it('is on time when published before the deadline', () => {
    const a = assessRoster({
      period: NOV,
      publications: [PUB('2026-10-20')],
      draftRows: 0,
      publishedRows: 120,
      today: '2026-11-05',
    });
    expect(a.state).toBe('ON_TIME');
    expect(a.daysLate).toBeNull();
    expect(worthChasing(a)).toBe(false);
  });

  it('is on time when published on the deadline itself', () => {
    const a = assessRoster({
      period: NOV, publications: [PUB('2026-10-25')], draftRows: 0, publishedRows: 120,
      today: '2026-11-05',
    });
    expect(a.state).toBe('ON_TIME');
  });

  it('counts the days late from the deadline', () => {
    const a = assessRoster({
      period: NOV, publications: [PUB('2026-11-05')], draftRows: 0, publishedRows: 120,
      today: '2026-11-10',
    });
    expect(a.state).toBe('LATE');
    expect(a.daysLate).toBe(11);
    expect(worthChasing(a)).toBe(true);
  });

  // The failure that would make the board actively unfair: a department that
  // published early and then corrected it twice during the month is the one
  // doing this properly.
  it('judges the FIRST publication, not the latest', () => {
    const a = assessRoster({
      period: NOV,
      publications: [PUB('2026-11-18', 3), PUB('2026-10-20', 1), PUB('2026-11-02', 2)],
      draftRows: 0,
      publishedRows: 140,
      today: '2026-11-20',
    });
    expect(a.state).toBe('ON_TIME');
    expect(a.firstPublishedDay).toBe('2026-10-20');
    // The latest version is still reported, because that is what is live.
    expect(a.version).toBe(3);
  });

  it('distinguishes drafted-but-never-published from nothing at all', () => {
    const drafted = assessRoster({
      period: NOV, publications: [], draftRows: 310, publishedRows: 0, today: '2026-11-05',
    });
    expect(drafted.state).toBe('DRAFTED_NOT_PUBLISHED');
    expect(drafted.draftRows).toBe(310);
    expect(drafted.daysOverdue).toBe(11);

    const nothing = assessRoster({
      period: NOV, publications: [], draftRows: 0, publishedRows: 0, today: '2026-11-05',
    });
    expect(nothing.state).toBe('MISSING');
  });

  // Rows published before the publish machinery existed are a real roster and
  // must not be reported as missing.
  it('accepts published rows with no publication record', () => {
    const a = assessRoster({
      period: NOV, publications: [], draftRows: 0, publishedRows: 96, today: '2026-11-05',
    });
    expect(a.state).toBe('ON_TIME');
  });

  // A board that chases a deadline that has not arrived is a board nobody
  // trusts the next time it says something is late.
  it('does not chase a period that is not due yet', () => {
    const a = assessRoster({
      period: NOV, publications: [], draftRows: 0, publishedRows: 0, today: '2026-10-20',
    });
    expect(a.state).toBe('MISSING');
    expect(a.notYetDue).toBe(true);
    expect(worthChasing(a)).toBe(false);
  });

  it('labels every state in words a board can print', () => {
    (['ON_TIME', 'LATE', 'DRAFTED_NOT_PUBLISHED', 'MISSING'] as const).forEach((s) => {
      expect(STATE_LABELS[s].length).toBeGreaterThan(5);
    });
  });
});

describe('the letter to the head of department', () => {
  const late = assessRoster({
    period: NOV, publications: [PUB('2026-11-05')], draftRows: 0, publishedRows: 120,
    today: '2026-11-10',
  });
  const drafted = assessRoster({
    period: NOV, publications: [], draftRows: 310, publishedRows: 0, today: '2026-11-05',
  });
  const missing = assessRoster({
    period: NOV, publications: [], draftRows: 0, publishedRows: 0, today: '2026-11-05',
  });

  const letter = (assessment: typeof late, priorLateMonths = 0) => buildRosterChase({
    personName: 'Dr Okafor',
    roleLabel: 'Consultant Anaesthetist',
    deptLabel: 'Anaesthetic Technicians',
    period: NOV,
    assessment,
    priorLateMonths,
  });

  it('addresses them by role and names the department and month', () => {
    const m = letter(late);
    expect(m).toContain('Dear Dr Okafor,');
    expect(m).toContain('As a consultant anaesthetist');
    expect(m).toContain('Anaesthetic Technicians roster, November 2026');
  });

  it('thanks the department that submitted late, then asks about the next one', () => {
    const m = letter(late);
    expect(m).toMatch(/thank you for the anaesthetic technicians roster/i);
    expect(m).toContain('11 days late');
    expect(m).toMatch(/For November 2026 nothing further is needed/);
  });

  // Somebody did the work. The letter must say so before anything else.
  it('is kind to the department that drafted and never published', () => {
    const m = letter(drafted);
    expect(m).toContain('310 rows');
    expect(m).toMatch(/the work has been done, and thank you for it/i);
    expect(m).toMatch(/nothing in this hospital reads draft rows/i);
    expect(m).not.toMatch(/you have submitted nothing at all/i);
  });

  it('is direct about a month with nothing in it', () => {
    const m = letter(missing);
    expect(m).toContain('There is nothing on the ORM for November 2026');
    expect(m).toContain('11 days ago');
  });

  it('explains what a published roster actually drives', () => {
    const m = letter(missing);
    expect(m).toMatch(/on-duty board/i);
    expect(m).toMatch(/meal counts/i);
    expect(m).toMatch(/duty board/i);
    // The line that gets it published the same afternoon.
    expect(m).toContain('not on the published roster');
  });

  it('says where the button is', () => {
    expect(letter(drafted)).toContain('Roster, your department, then Publish');
  });

  it('asks them to see that whoever prepares it publishes it too', () => {
    const m = letter(missing);
    expect(m).toMatch(/publish it as well as enter it/i);
    expect(m).toMatch(/A word from you is worth more/i);
  });

  it('mentions a repeated month as a structural question, not a score', () => {
    const m = letter(missing, 1);
    expect(m).toContain('2nd month in a row');
    expect(m).toMatch(/not to keep a score/i);
    expect(m).toMatch(/something structural/i);
  });

  it('offers the way out', () => {
    const m = letter(late);
    expect(m).toMatch(/Theatre Manager or the Theatre Chairman/);
    expect(m).toMatch(/A difficulty raised is one we can solve/);
  });

  it('carries a line written by theatre management', () => {
    const m = buildRosterChase({
      personName: 'Dr Okafor',
      deptLabel: 'Pharmacy',
      period: NOV,
      assessment: missing,
      note: 'The meal count is ordered on Thursday.',
    });
    expect(m).toContain('The meal count is ordered on Thursday.');
  });

  // There is no wording of "you were late" that is acceptable to somebody who
  // was not, so the on-time branch refuses to scold at all.
  it('will not scold a department that was on time', () => {
    const onTime = assessRoster({
      period: NOV, publications: [PUB('2026-10-20')], draftRows: 0, publishedRows: 120,
      today: '2026-11-05',
    });
    const m = letter(onTime);
    expect(m).toMatch(/was published on time/);
    expect(m).toMatch(/nothing is being asked of you/);
    expect(m).not.toMatch(/late|overdue|missing/i);
  });

  it('summarises a department in one line', () => {
    expect(rosterHeadline({ deptLabel: 'Porters', period: NOV, assessment: late }))
      .toBe('Porters roster for November 2026: submitted late by 11 days');
    expect(rosterHeadline({ deptLabel: 'Porters', period: NOV, assessment: missing }))
      .toBe('Porters roster for November 2026: nothing submitted, 11 days overdue');
  });

  it('writes a date the way somebody says it', () => {
    expect(longDay('2026-10-25')).toBe('25 October 2026');
    expect(longDay(null)).toBe('');
  });

  it('fits a message somebody will read on a phone', () => {
    expect(letter(missing, 1).length).toBeLessThan(3200);
  });
});
