// Which day's list the pharmacy is handed when it opens the screen.
//
// Pharmacy packs ahead: Tuesday afternoon is spent on Wednesday's list. A
// screen that opens on today shows cases that are already packed or already
// on the table — work nobody can still do — and hides the only list that is
// actionable. Nothing about that is visible as an error; it just looks like a
// quiet day.
//
// The second thing held here is WAT. The theatre server runs UTC and the
// pharmacy's laptop runs whatever it was set to; neither may be allowed to
// decide which day a drug trolley is made up for. A device an hour behind
// would otherwise hand somebody the wrong list every evening after 11 p.m.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  watTomorrow, defaultPharmacyDay, shiftDay, dayRelation, describeDay, dayCaution,
} from '../../src/lib/pharmacy/day';

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'lib', 'pharmacy', 'day.ts'),
  'utf8',
);

// 10 Nov 2026, 15:45 WAT (14:45 UTC) — the moment in the screenshot.
const AFTERNOON = new Date('2026-11-10T14:45:00Z');

describe('the day the screen opens on', () => {
  it('is tomorrow, not today', () => {
    // THE POINT OF THE CHANGE.
    expect(defaultPharmacyDay(AFTERNOON)).toBe('2026-11-11');
    expect(watTomorrow(AFTERNOON)).toBe('2026-11-11');
  });

  it('is read in WAT, not off the device', () => {
    // 23:30 WAT on the 10th is 22:30 UTC the same day, and tomorrow is the
    // 11th. A UTC-only reading is fine here; the one that bites is below.
    expect(watTomorrow(new Date('2026-11-10T22:30:00Z'))).toBe('2026-11-11');
    // 00:30 WAT on the 11th is 23:30 UTC on the 10th. Reading UTC would call
    // today the 10th and tomorrow the 11th — but in WAT it is already the
    // 11th, so tomorrow is the 12th. A night pharmacist would otherwise be
    // handed the list for the day that had just started.
    expect(watTomorrow(new Date('2026-11-10T23:30:00Z'))).toBe('2026-11-12');
  });

  it('never asks the device what day it is', () => {
    // CHECKED ON THE SOURCE, not on behaviour, and deliberately.
    //
    // The developer machine here is Africa/Lagos, which IS WAT — so an
    // implementation built on getTimezoneOffset() produces identical answers
    // and every assertion above passes. It would then be wrong on the theatre
    // server, which runs UTC, and wrong on any laptop brought back from a
    // conference. Verified by planting exactly that: the behavioural tests
    // did not notice.
    expect(SOURCE).not.toContain('getTimezoneOffset');
    expect(SOURCE).not.toContain('getFullYear');
    expect(SOURCE).not.toContain('getMonth');
    expect(SOURCE).toContain("from '@/lib/watDay'");
  });

  it('crosses a month and a year without help', () => {
    expect(watTomorrow(new Date('2026-11-30T12:00:00Z'))).toBe('2026-12-01');
    expect(watTomorrow(new Date('2026-12-31T12:00:00Z'))).toBe('2027-01-01');
    // And a leap day, which is the one everybody's hand-rolled version gets
    // wrong.
    expect(watTomorrow(new Date('2028-02-28T12:00:00Z'))).toBe('2028-02-29');
  });
});

describe('stepping between days', () => {
  it('moves forward and back', () => {
    expect(shiftDay('2026-11-10', 1)).toBe('2026-11-11');
    expect(shiftDay('2026-11-10', -1)).toBe('2026-11-09');
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('is a no-op on a day it cannot read', () => {
    // Better than returning today: a date field that silently jumps to a
    // different day while somebody is typing is worse than one that waits.
    expect(shiftDay('', 1)).toBe('');
    expect(shiftDay('not-a-day', 1)).toBe('not-a-day');
  });
});

describe('naming the day on screen', () => {
  it('places it relative to now', () => {
    expect(dayRelation('2026-11-10', AFTERNOON)).toBe('TODAY');
    expect(dayRelation('2026-11-11', AFTERNOON)).toBe('TOMORROW');
    expect(dayRelation('2026-11-09', AFTERNOON)).toBe('YESTERDAY');
    expect(dayRelation('2026-11-02', AFTERNOON)).toBe('PAST');
    expect(dayRelation('2026-11-20', AFTERNOON)).toBe('FUTURE');
  });

  it('always shows the real date, never only the word', () => {
    // A screen left open overnight would otherwise still say "tomorrow" and
    // be a day out, and the pharmacist would pack to it.
    const t = describeDay('2026-11-11', AFTERNOON);
    expect(t).toMatch(/tomorrow/i);
    expect(t).toContain('11 Nov 2026');

    const far = describeDay('2026-11-20', AFTERNOON);
    expect(far).toContain('20 Nov 2026');
    expect(far).not.toMatch(/tomorrow|today|yesterday/i);
  });

  it('names the weekday, which is how a list is actually talked about', () => {
    expect(describeDay('2026-11-11', AFTERNOON)).toMatch(/Wed/);
  });

  it('does not crash on a day it cannot read', () => {
    expect(describeDay('', AFTERNOON)).toBe('');
    expect(describeDay('rubbish', AFTERNOON)).toBe('rubbish');
  });
});

describe('warning about a day that cannot be packed for', () => {
  it('says nothing about tomorrow, or any later day', () => {
    // The normal case must be silent, or the warning is wallpaper.
    expect(dayCaution('2026-11-11', AFTERNOON)).toBeNull();
    expect(dayCaution('2026-11-20', AFTERNOON)).toBeNull();
  });

  it('flags a day that has passed', () => {
    for (const day of ['2026-11-09', '2026-11-02']) {
      expect(dayCaution(day, AFTERNOON), day).toMatch(/already been operated on|has passed/i);
    }
  });

  it('notes that today is mostly packed already', () => {
    expect(dayCaution('2026-11-10', AFTERNOON)).toMatch(/already be packed|day ahead/i);
  });
});
