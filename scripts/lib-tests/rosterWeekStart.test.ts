import { describe, it, expect } from 'vitest';

// Mirrors src/app/dashboard/roster/dept/[dept]/page.tsx. Kept here because the
// rule is a date calculation, and a date calculation that nobody can run is a
// date calculation nobody trusts.
function mondayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}
function defaultWeekStart(now: Date): string {
  const dow = now.getDay();
  if (dow === 0 || dow === 6) {
    const next = new Date(now);
    next.setDate(next.getDate() + (dow === 6 ? 2 : 1));
    return mondayOf(next);
  }
  return mondayOf(now);
}

const at = (iso: string) => new Date(`${iso}T12:00:00`);

describe('which week the roster page opens on', () => {
  // The incident: a roster published on Sunday 30 August went into the week
  // starting the 24th, and the week from the 31st reported nothing published.
  it('opens on the COMING week on a Sunday', () => {
    expect(defaultWeekStart(at('2026-08-30'))).toBe('2026-08-31');
  });

  it('opens on the COMING week on a Saturday', () => {
    expect(defaultWeekStart(at('2026-08-29'))).toBe('2026-08-31');
  });

  it('opens on the CURRENT week on a weekday', () => {
    expect(defaultWeekStart(at('2026-08-31'))).toBe('2026-08-31'); // Monday
    expect(defaultWeekStart(at('2026-09-02'))).toBe('2026-08-31'); // Wednesday
    expect(defaultWeekStart(at('2026-09-04'))).toBe('2026-08-31'); // Friday
  });

  it('crosses a month boundary correctly', () => {
    expect(defaultWeekStart(at('2026-10-31'))).toBe('2026-11-02'); // Saturday
  });

  it('crosses a year boundary correctly', () => {
    expect(defaultWeekStart(at('2026-12-27'))).toBe('2026-12-28'); // Sunday
  });

  it('always returns a Monday', () => {
    for (let i = 0; i < 60; i += 1) {
      const d = new Date(2026, 7, 1 + i, 12);
      const iso = defaultWeekStart(d);
      expect(new Date(`${iso}T00:00:00Z`).getUTCDay(), `${iso} is not a Monday`).toBe(1);
    }
  });

  it('never opens on a week that has already ended', () => {
    for (let i = 0; i < 60; i += 1) {
      const d = new Date(2026, 7, 1 + i, 12);
      const openedOn = new Date(`${defaultWeekStart(d)}T00:00:00Z`);
      const weekEnd = new Date(openedOn);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      const todayUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      expect(weekEnd.getTime(), `week ending ${weekEnd.toISOString()} is in the past`).toBeGreaterThanOrEqual(todayUtc.getTime());
    }
  });
});
