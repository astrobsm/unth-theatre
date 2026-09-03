import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  electiveShiftFromDate,
  emergencyShiftFromDate,
  shiftForPurpose,
} from '../../src/lib/rosterOnDutyShift';

/**
 * The emergency board named the wrong people.
 *
 * It asked "who is on duty at 10:00?" and got the MORNING roster, because
 * 10:00 is the morning. But MORNING is the ELECTIVE roster — the anaesthetists'
 * own shift options label that shift "ELECTIVES" — and an emergency is answered
 * by whoever is rostered on CALL, carrying "ALL EMERGENCIES (on-call)".
 *
 * On 3 September a critical neurosurgical case showed an Emergency Response
 * Team of anaesthetists rostered to elective lists, while the two consultants
 * genuinely on call that day appeared nowhere on the card. The team named could
 * not have been rung.
 */
const at = (h: number) => { const d = new Date(2026, 8, 3, h, 0, 0); return d; };

describe('who answers an emergency', () => {
  it('is NEVER the elective morning list', () => {
    // The whole bug in one assertion.
    for (let h = 0; h < 24; h += 1) {
      expect(emergencyShiftFromDate(at(h)), `${h}:00`).not.toBe('MORNING');
    }
  });

  it('is the day-call team during the day', () => {
    expect(emergencyShiftFromDate(at(8))).toBe('CALL');
    expect(emergencyShiftFromDate(at(10))).toBe('CALL'); // the case in the report
    expect(emergencyShiftFromDate(at(17))).toBe('CALL');
  });

  it('is the night team outside those hours', () => {
    expect(emergencyShiftFromDate(at(18))).toBe('NIGHT');
    expect(emergencyShiftFromDate(at(23))).toBe('NIGHT');
    expect(emergencyShiftFromDate(at(2))).toBe('NIGHT');
    expect(emergencyShiftFromDate(at(7))).toBe('NIGHT');
  });

  it('splits day from night the way technician coverage already does', () => {
    // /api/roster/technician-coverage routes an emergency by hour >= 8 && < 18.
    // Two different answers to "is this a daytime emergency" would send the
    // anaesthetist and the technician to different people for one case.
    expect(emergencyShiftFromDate(at(7))).toBe('NIGHT');
    expect(emergencyShiftFromDate(at(8))).toBe('CALL');
    expect(emergencyShiftFromDate(at(17))).toBe('CALL');
    expect(emergencyShiftFromDate(at(18))).toBe('NIGHT');
  });
});

describe('the elective windows are unchanged', () => {
  it('still answers the question every other caller is asking', () => {
    expect(electiveShiftFromDate(at(9))).toBe('MORNING');
    expect(electiveShiftFromDate(at(15))).toBe('MORNING');
    expect(electiveShiftFromDate(at(16))).toBe('CALL');
    expect(electiveShiftFromDate(at(21))).toBe('CALL');
    expect(electiveShiftFromDate(at(22))).toBe('NIGHT');
    expect(electiveShiftFromDate(at(3))).toBe('NIGHT');
  });

  it('differs from the emergency answer exactly where it matters', () => {
    // 10:00: an elective list is run by the morning team, an emergency is not.
    expect(shiftForPurpose(at(10), 'elective')).toBe('MORNING');
    expect(shiftForPurpose(at(10), 'emergency')).toBe('CALL');
  });
});

describe('the board and the endpoint agree', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

  it('the emergency board asks the emergency question', () => {
    expect(read('src/app/dashboard/emergency-booking/page.tsx')).toContain('/api/roster/on-duty?for=emergency');
  });

  it('the endpoint honours it', () => {
    const src = read('src/app/api/roster/on-duty/route.ts');
    expect(src).toContain('shiftForPurpose');
    expect(src).toContain('searchParams.get("for")');
  });

  it('one person rostered twice fills one slot', () => {
    // Both on-call consultants held two rows for 3 September, so the first and
    // second anaesthetist would otherwise be the same name: a team of two on
    // screen and a team of one in the theatre.
    const src = read('src/app/api/roster/on-duty/route.ts');
    expect(src).toContain('uniqueAnaesthetists');
  });
});
