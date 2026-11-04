/**
 * The approvals screen's day, and what choosing one leaves out.
 *
 * Asked for on 4 November:
 *
 *   "this page should also display the cases booked for the next day awaiting
 *    for approval and should be grouped by subspecialty. it will have a
 *    function to select a date if the user so desires to see what has
 *    happened before"
 *
 * The ways this can be wrong, in order of how much damage they do:
 *
 *   quietly dropping an unapproved prescription for a case that has already
 *   gone — the screen then looks finished and the one row that mattered is
 *   the one nobody sees;
 *
 *   disagreeing with the server about which day is tomorrow, so a laptop set
 *   to another timezone opens on the wrong list;
 *
 *   and splitting one specialty across two headings, which is what a plain
 *   groupBy does to this hospital's data.
 *
 * No patient is named here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  dayHeading, dayOf, shiftDay, splitByApprovalDay, watDay,
} from '../../src/lib/prescriptions/approvalDay';
import { groupCasesBySubspecialty } from '../../src/lib/anaesthesia/caseGrouping';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

/** A fixed clock: 23:30 WAT on Wednesday 4 November 2026 (22:30 UTC). */
const LATE_ON_THE_4TH = Date.parse('2026-11-04T22:30:00.000Z');
/** 00:30 WAT on 5 November — the same evening's work, the next WAT day. */
const JUST_AFTER_MIDNIGHT = Date.parse('2026-11-04T23:30:00.000Z');

describe('the theatre day, not the browser day', () => {
  it('counts today in WAT', () => {
    expect(watDay(0, LATE_ON_THE_4TH)).toBe('2026-11-04');
    // 22:30 UTC is already the 5th in Enugu. A screen that said "tomorrow is
    // the 5th" at half past eleven at night would be showing today's list.
    expect(watDay(0, JUST_AFTER_MIDNIGHT)).toBe('2026-11-05');
  });

  it('opens on the next operating day', () => {
    expect(watDay(1, LATE_ON_THE_4TH)).toBe('2026-11-05');
  });

  it('walks a day at a time without drifting', () => {
    expect(shiftDay('2026-11-04', 1)).toBe('2026-11-05');
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31');
    // Across a month end and a leap day, where naive arithmetic goes wrong.
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('reads the day off a stored timestamp', () => {
    expect(dayOf('2026-11-05T00:00:00.000Z')).toBe('2026-11-05');
    expect(dayOf(new Date('2026-11-05T09:15:00.000Z'))).toBe('2026-11-05');
    expect(dayOf(null)).toBe('');
    expect(dayOf('not a date')).toBe('');
  });
});

describe('what the chosen day is called', () => {
  const today = '2026-11-04';

  it('says today and tomorrow in words, with the date beside them', () => {
    // A screen left open overnight must not quietly lie about which day it
    // is showing, so the date is always there as well as the word.
    expect(dayHeading('2026-11-04', today)).toBe('Today — Wed 4 Nov');
    expect(dayHeading('2026-11-05', today)).toBe('Tomorrow — Thu 5 Nov');
    expect(dayHeading('2026-11-03', today)).toBe('Yesterday — Tue 3 Nov');
  });

  it('names any other day plainly', () => {
    expect(dayHeading('2026-11-09', today)).toBe('Mon 9 Nov');
  });

  it('says so when no day is chosen', () => {
    expect(dayHeading(null, today)).toBe('Every date');
  });
});

interface Row { id: string; day: string; status: string }

const ROWS: Row[] = [
  // Tomorrow's list: the one the screen opens on.
  { id: 'a', day: '2026-11-05', status: 'PENDING_APPROVAL' },
  { id: 'b', day: '2026-11-05', status: 'PENDING_APPROVAL' },
  { id: 'c', day: '2026-11-05', status: 'APPROVED' },
  // Today, still unapproved: the packs are already being drawn.
  { id: 'd', day: '2026-11-04', status: 'PENDING_APPROVAL' },
  // Cases that have already gone with nothing approved.
  { id: 'e', day: '2026-11-02', status: 'PENDING_APPROVAL' },
  { id: 'f', day: '2026-11-03', status: 'PENDING_APPROVAL' },
  // Gone, and dealt with. Not anybody's problem.
  { id: 'g', day: '2026-11-02', status: 'APPROVED' },
];

const split = (day: string | null) => splitByApprovalDay(ROWS, day, {
  dayOfRow: (r) => r.day,
  isPending: (r) => r.status === 'PENDING_APPROVAL',
  today: '2026-11-04',
});

describe('choosing a day', () => {
  it('shows that day, approved rows included', () => {
    expect(split('2026-11-05').onDay.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('counts what is still awaiting approval elsewhere, rather than dropping it', () => {
    // THE WHOLE POINT. A date filter that hides three unapproved
    // prescriptions makes a finished-looking screen out of an unfinished day.
    expect(split('2026-11-05').pendingElsewhere.map((r) => r.id)).toEqual(['d', 'e', 'f']);
  });

  it('separates the cases that have already gone', () => {
    // The most serious rows on the screen: the packs were drawn without them.
    expect(split('2026-11-05').overdue.map((r) => r.id)).toEqual(['e', 'f']);
    // Today is not overdue. The list has not run yet.
    expect(split('2026-11-05').overdue.map((r) => r.id)).not.toContain('d');
  });

  it('still names the overdue ones when they are the day being looked at', () => {
    const s = split('2026-11-02');
    expect(s.onDay.map((r) => r.id)).toEqual(['e', 'g']);
    expect(s.overdue.map((r) => r.id)).toEqual(['e', 'f']);
  });

  it('sets nothing aside when every date is chosen', () => {
    const s = split(null);
    expect(s.onDay).toHaveLength(ROWS.length);
    expect(s.pendingElsewhere).toEqual([]);
    // Overdue is still counted: it is a fact about the data, not about the
    // filter, and it is worth saying even while the reader can see the rows.
    expect(s.overdue.map((r) => r.id)).toEqual(['e', 'f']);
  });

  it('shows an empty day as empty, not as everything', () => {
    expect(split('2026-11-20').onDay).toEqual([]);
    expect(split('2026-11-20').pendingElsewhere).toHaveLength(5);
  });
});

describe('grouping the day by subspecialty', () => {
  // The shapes this hospital's booking table actually holds: half the rows
  // carry a unit name in the subspecialty column.
  const day = [
    { id: 'a', subspecialty: 'General Surgery', unit: 'GS Unit II', status: 'PENDING_APPROVAL' },
    { id: 'b', subspecialty: 'GS Unit III', unit: 'GS Unit III', status: 'PENDING_APPROVAL' },
    { id: 'c', subspecialty: 'ENT (Otorhinolaryngology)', unit: 'ENT Unit I', status: 'APPROVED' },
    { id: 'd', subspecialty: null, unit: null, status: 'PENDING_APPROVAL' },
  ];
  const groups = groupCasesBySubspecialty(day, (r) => r.status !== 'PENDING_APPROVAL');

  it('files the two general surgery cases under one heading, not two', () => {
    const names = groups.map((g) => g.name);
    expect(names.filter((n) => n === 'General Surgery')).toHaveLength(1);
    expect(names).not.toContain('GS Unit III');
  });

  it('counts what is still awaiting approval in each specialty', () => {
    expect(groups.find((g) => g.name === 'General Surgery')?.outstanding).toBe(2);
    expect(groups.find((g) => g.name === 'ENT (Otorhinolaryngology)')?.outstanding).toBe(0);
  });

  it('loses nothing, including the case with no specialty recorded', () => {
    const total = groups.reduce((n, g) => n + g.cases.length, 0);
    expect(total).toBe(day.length);
    expect(groups.map((g) => g.name)).toContain('Unassigned');
  });
});

describe('the approvals screen', () => {
  const page = read('src/app/dashboard/prescription-approvals/page.tsx');

  it('opens on the next operating day', () => {
    // Pharmacy packs the following day's list; an approval given on the
    // morning of surgery is given after the packs were drawn.
    expect(page).toContain('useState<string | null>(() => watDay(1))');
  });

  it('offers a date, a day either side, and every date', () => {
    expect(page).toContain("type=\"date\"");
    expect(page).toContain('setDay(shiftDay(day ?? today, -1))');
    expect(page).toContain('setDay(shiftDay(day ?? today, 1))');
    expect(page).toContain('setDay(null)');
    expect(page).toContain('setDay(tomorrow)');
  });

  it('groups what it shows, using the shared rule', () => {
    expect(page).toContain("from '@/lib/anaesthesia/caseGrouping'");
    expect(page).toContain('groupCasesBySubspecialty(');
    expect(page).toContain('groups.map((group) => (');
  });

  it('asks the grouping for both fields, since neither can be trusted alone', () => {
    expect(page).toContain('subspecialty: rx.surgery?.subspecialty ?? null');
    expect(page).toContain('unit: rx.surgery?.unit ?? null');
  });

  it('declares the fields it groups on, so they survive the fetch', () => {
    // The API already returns them; the page's own type did not name them,
    // which is how a field gets thrown away on the way in.
    expect(page).toMatch(/subspecialty\?: string \| null;/);
    expect(page).toMatch(/unit\?: string \| null;/);
  });

  it('says what the chosen day leaves out', () => {
    expect(page).toContain('split.pendingElsewhere.length > 0');
    expect(page).toContain('awaiting approval on other dates');
    expect(page).toContain('already gone');
    expect(page).toContain('Show every date');
  });

  it('keeps the honest total on the pending tab', () => {
    // The tab counts every pending prescription, not the chosen day's, so
    // narrowing the date can never make the backlog look smaller than it is.
    expect(page).toContain("const pendingCount = prescriptions.filter((p) => p.status === 'PENDING_APPROVAL').length;");
    expect(page).toContain('Pending (${pendingCount})');
  });
});
