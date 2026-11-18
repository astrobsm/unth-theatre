import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dayKey, nextDay, theatreDay } from '../../src/lib/theatre/day';

// "Am I coming?" was asked about today and only today, so the first chance
// somebody had to say they could not make a Tuesday list was Tuesday — by
// which time the theatre is laid up and the patient has been starved. Asked
// the evening before, the same answer is a change of plan rather than an
// incident.

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('nextDay', () => {
  it('is the day after the theatre day', () => {
    const d = new Date(Date.UTC(2026, 10, 18));
    expect(dayKey(nextDay(d))).toBe('2026-11-19');
  });

  it('crosses a month end', () => {
    expect(dayKey(nextDay(new Date(Date.UTC(2026, 10, 30))))).toBe('2026-12-01');
  });

  it('crosses a year end', () => {
    expect(dayKey(nextDay(new Date(Date.UTC(2026, 11, 31))))).toBe('2027-01-01');
  });

  it('crosses a leap day', () => {
    expect(dayKey(nextDay(new Date(Date.UTC(2028, 1, 28))))).toBe('2028-02-29');
  });

  it('defaults to tomorrow from the theatre day, not the server day', () => {
    // The theatre works to WAT. Half past midnight here is still yesterday in
    // UTC, and a board that disagreed about which day it is would ask the
    // wrong people on the wrong evening.
    expect(nextDay().getTime()).toBe(theatreDay().getTime() + 24 * 60 * 60_000);
  });

  it('always lands on a midnight, like the day it came from', () => {
    const d = nextDay(new Date(Date.UTC(2026, 10, 18)));
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });
});

describe('the dashboard asks about tomorrow as well as today', () => {
  const card = read('src/components/theatre/TeamAvailabilityCard.tsx');

  it('fetches both days', () => {
    expect(card).toContain("fetchDay('today', '')");
    expect(card).toContain('?date=${dayKey(nextDay())}');
  });

  it('marks which day each case is on', () => {
    expect(card).toContain("when: 'today' | 'tomorrow'");
  });

  it('says which days it is talking about', () => {
    // "You are on 3 cases today" would be wrong about two of them.
    expect(card).toContain("' today and tomorrow'");
  });

  it('still shows nothing when there is nothing', () => {
    // A permanent empty panel is a thing people learn to scroll past, and
    // then they scroll past it on the morning it is not empty.
    expect(card).toContain('if (!loaded || cases.length === 0) return null;');
  });

  it('leaves the endpoint answering for one day', () => {
    // Two requests rather than a range: every other caller of
    // /api/case-availability expects one theatre day, and widening it would
    // change the CMD board as a side effect of changing this panel.
    const route = read('src/app/api/case-availability/route.ts');
    expect(route).toContain("parseTheatreDay(request.nextUrl.searchParams.get('date'))");
    expect(route).not.toContain('searchParams.get(\'days\')');
  });
});
