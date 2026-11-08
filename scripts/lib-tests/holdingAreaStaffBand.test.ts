// Who is on the holding area, shown on the holding area.
//
// The allocation already existed — a theatre manager names somebody to the
// room for a shift and it goes into the roster — but the page the nurse
// actually works from said nothing about it, so the name was looked up on a
// different screen or, in practice, remembered.
//
// Two things here could go wrong quietly, and both are what these tests are
// for: showing "nobody named" when the lookup merely failed (which sends
// somebody hunting for a nurse who is standing in the room), and labelling the
// wrong shift "on now" because the code read the clock of whatever machine it
// happened to run on instead of the hospital's.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  electiveShiftFromMinutes, electiveShiftFromDate,
} from '../../src/lib/rosterOnDutyShift';

const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

const band = read('src/components/HoldingAreaStaffBand.tsx');
const page = read('src/app/dashboard/holding-area/page.tsx');
const api = read('src/app/api/holding-area/staffing/route.ts');

describe('which shift is running', () => {
  it('splits the day where the roster screen says it does', () => {
    // 08:00-16:00 morning, 16:00-22:00 call, 22:00-08:00 night. The boundary
    // minutes are the ones that matter: a handover at exactly 16:00 belongs to
    // the shift coming on, not the one going off.
    expect(electiveShiftFromMinutes(8 * 60)).toBe('MORNING');
    expect(electiveShiftFromMinutes(15 * 60 + 59)).toBe('MORNING');
    expect(electiveShiftFromMinutes(16 * 60)).toBe('CALL');
    expect(electiveShiftFromMinutes(21 * 60 + 59)).toBe('CALL');
    expect(electiveShiftFromMinutes(22 * 60)).toBe('NIGHT');
    expect(electiveShiftFromMinutes(7 * 60 + 59)).toBe('NIGHT');
  });

  it('covers midnight and the small hours as night', () => {
    expect(electiveShiftFromMinutes(0)).toBe('NIGHT');
    expect(electiveShiftFromMinutes(3 * 60)).toBe('NIGHT');
  });

  it('wraps rather than falling off either end', () => {
    // A minute count that has run past midnight, or come back negative from a
    // timezone adjustment, must still land on a real shift.
    expect(electiveShiftFromMinutes(1440 + 10 * 60)).toBe('MORNING');
    expect(electiveShiftFromMinutes(-60)).toBe('NIGHT');      // 23:00
    expect(electiveShiftFromMinutes(-9 * 60)).toBe('MORNING'); // 15:00
    expect(electiveShiftFromMinutes(-5 * 60)).toBe('CALL');    // 19:00
  });

  it('still agrees with the date version it was factored out of', () => {
    // The refactor must not have moved any boundary for existing callers.
    for (let h = 0; h < 24; h += 1) {
      const d = new Date(2026, 10, 8, h, 30, 0);
      expect(electiveShiftFromDate(d)).toBe(electiveShiftFromMinutes(h * 60 + 30));
    }
  });
});

describe('the band on the holding area page', () => {
  it('is on the page, for the day the page is showing', () => {
    expect(page).toContain('HoldingAreaStaffBand');
    // The page has a date picker and can be looking at a past day. The band
    // must follow it, or it would show today's nurse against yesterday's
    // patients.
    expect(page).toContain('date={selectedDate}');
    expect(page).toContain('isToday={selectedDate === watToday()}');
  });

  it('asks the endpoint that already answers this', () => {
    // There is one source of truth: the roster rows the staffing screen writes.
    // A second query, or a second table, would give a second answer.
    expect(band).toContain('/api/holding-area/staffing?date=');
    expect(api).toContain("subRole: 'HOLDING_AREA'");
  });

  it('names every shift, not only the one running now', () => {
    // A patient wheeled in at the end of one shift is handed over in the next,
    // so the name on either side of the boundary is the useful one.
    expect(band).toContain("value: 'MORNING'");
    expect(band).toContain("value: 'CALL'");
    expect(band).toContain("value: 'NIGHT'");
    // In the same words the staffing screen uses, so the two cannot disagree.
    const staffing = read('src/app/dashboard/holding-area/staffing/page.tsx');
    for (const label of ['Morning', 'Call', 'Night']) {
      expect(staffing).toContain(`label: '${label}'`);
      expect(band).toContain(`label: '${label}'`);
    }
  });

  it('never reports a failed lookup as an empty holding area', () => {
    // THE TEST THAT MATTERS MOST. "Nobody named" is a statement about the
    // roster; a fetch that threw is a statement about the network. Showing the
    // second as the first sends somebody looking for a nurse who is there.
    expect(band).toContain('setStaff(null)');
    expect(band).toContain('setFailed(true)');
    expect(band).toContain('could not be loaded');
    // And the empty-state wording is reachable only once rows have arrived.
    expect(band).toContain('if (staff === null)');
  });

  it('reads the hospital clock, not the machine it happens to run on', () => {
    // A laptop still set to another timezone would otherwise mark the wrong
    // shift "on now" — and the name beside "on now" is the one somebody rings.
    expect(band).toContain('watMinutesOfDay');
    expect(band).toContain('electiveShiftFromMinutes');
    expect(band).not.toMatch(/new Date\(\)\.getHours\(\)/);
  });

  it('calls no shift "on now" on a day that is not today', () => {
    expect(band).toContain('isToday\n    ? electiveShiftFromMinutes');
    expect(band).toContain(': null');
  });

  it('says plainly when the shift running now has nobody on it', () => {
    // Only for a shift where that is a live problem — an empty shift last
    // Tuesday is history, not an alarm.
    expect(band).toContain('emptyNow');
    expect(band).toContain('currentShift !== null');
    expect(band).toContain('nobody on it right now');
    // And the whole-floor warning only where EVERY holding area is empty, so
    // one quiet complex does not raise an alarm about all of them.
    expect(band).toContain('nobodyAnywhereNow');
    expect(band).toContain('shown.every((c) => emptyNow(c.key))');
    expect(band).toContain('No holding area has anybody named to it');
  });

  it('shows one block per complex, since each has its own holding area', () => {
    // A single combined list is how a nurse in the Eye Theatre came to be
    // shown as cover for a room in Professor Ojukwu.
    expect(band).toContain('HOLDING_AREA_COMPLEXES');
    expect(band).toContain('a.complex === complex');
    // A complex nobody is on and which is not running now is left out
    // rather than printed as an empty row at 03:00.
    expect(band).toContain('staff.some((a) => a.complex === c.key) || emptyNow(c.key)');
  });

  it('points at the screen that sets it, without promising an action', () => {
    expect(band).toContain('/dashboard/holding-area/staffing');
    // Most people reading this page may not allocate. A link labelled with a
    // verb they cannot perform is a dead end, and deciding the verb here would
    // mean a third copy of the permission list.
    expect(band).toContain('Holding area staffing');
    expect(band).not.toContain('Name somebody to it');
  });
});
