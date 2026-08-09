/**
 * Validating pre-operative clinical values on their way into the record.
 *
 * This is the boundary between a form and a patient's chart, so it errs
 * towards refusing rather than storing something wrong:
 *
 *   Ranges catch a slipped decimal point, not a clinician. A potassium of 7.9
 *   is real and dangerous and must be recordable; 79 is a typo.
 *
 *   An empty field CLEARS the value. A result entered against the wrong
 *   patient has to be removable, and silently ignoring blanks would make that
 *   impossible.
 *
 *   Unknown keys are dropped, so the route cannot be used to write arbitrary
 *   columns on a surgery.
 */
import { describe, expect, it } from 'vitest';

import {
  PREOP_FIELDS,
  bloodPressureIncomplete,
  parsePreopData,
} from './preopData';

describe('numbers', () => {
  it('accepts ordinary results', () => {
    const { data, errors } = parsePreopData({ recentHb: '11.4', potassium: 4.2, sodium: '138' });
    expect(errors).toEqual([]);
    expect(data).toEqual({ recentHb: 11.4, potassium: 4.2, sodium: 138 });
  });

  it('accepts values that are alarming but real', () => {
    // The check exists to flag these, so refusing to record them would defeat
    // the entire point.
    const { data, errors } = parsePreopData({ recentHb: '4.1', potassium: '7.9', sodium: '118' });
    expect(errors).toEqual([]);
    expect(data.recentHb).toBe(4.1);
    expect(data.potassium).toBe(7.9);
  });

  it('rejects a slipped decimal point', () => {
    expect(parsePreopData({ potassium: '42' }).errors[0]).toContain('above');
    expect(parsePreopData({ recentHb: '114' }).errors[0]).toContain('above');
    expect(parsePreopData({ sodium: '13' }).errors[0]).toContain('below');
  });

  it('rejects text', () => {
    const { errors, data } = parsePreopData({ recentHb: 'eleven' });
    expect(errors[0]).toContain('not a number');
    expect('recentHb' in data).toBe(false);
  });

  it('requires whole numbers for blood pressure', () => {
    expect(parsePreopData({ bloodPressureSystolic: '120.5' }).errors[0]).toContain('whole number');
    expect(parsePreopData({ bloodPressureSystolic: '120' }).errors).toEqual([]);
  });
});

describe('choices', () => {
  it('accepts a documented value, in any case', () => {
    expect(parsePreopData({ hivStatus: 'negative' }).data.hivStatus).toBe('NEGATIVE');
    expect(parsePreopData({ bleedingRiskLevel: 'High' }).data.bleedingRiskLevel).toBe('HIGH');
  });

  it('rejects anything else and says what is allowed', () => {
    const { errors } = parsePreopData({ hivStatus: 'maybe' });
    expect(errors[0]).toContain('NEGATIVE');
  });
});

describe('clearing a value', () => {
  it('treats an empty field as a deliberate clear, not as absent', () => {
    for (const blank of ['', '   ', null]) {
      const { data, errors } = parsePreopData({ recentHb: blank });
      expect(errors).toEqual([]);
      expect(data.recentHb).toBeNull();
    }
  });

  it('leaves fields that were not submitted alone', () => {
    const { data } = parsePreopData({ recentHb: '12' });
    expect(Object.keys(data)).toEqual(['recentHb']);
  });
});

describe('what may be written', () => {
  it('drops keys that are not pre-op clinical fields', () => {
    const { data } = parsePreopData({
      recentHb: '12', status: 'COMPLETED', patientId: 'other', surgeonId: 'someone',
    });
    expect(Object.keys(data)).toEqual(['recentHb']);
  });

  it('every field has a label and a group so the form can render it', () => {
    for (const f of PREOP_FIELDS) {
      expect(f.label.length, f.name).toBeGreaterThan(0);
      expect(f.group.length, f.name).toBeGreaterThan(0);
      if (f.kind === 'choice') expect(f.choices?.length, f.name).toBeGreaterThan(1);
    }
  });
});

describe('blood pressure is one reading', () => {
  it('rejects half of it', () => {
    // Half a blood pressure is a value the safety check cannot interpret, so it
    // would keep flagging and the user would think the save failed.
    expect(bloodPressureIncomplete(parsePreopData(
      { bloodPressureSystolic: '120', bloodPressureDiastolic: '' }).data)).toBe(true);
    expect(bloodPressureIncomplete(parsePreopData(
      { bloodPressureSystolic: '', bloodPressureDiastolic: '80' }).data)).toBe(true);
  });

  it('accepts both, or neither', () => {
    expect(bloodPressureIncomplete(parsePreopData(
      { bloodPressureSystolic: '120', bloodPressureDiastolic: '80' }).data)).toBe(false);
    expect(bloodPressureIncomplete(parsePreopData(
      { bloodPressureSystolic: '', bloodPressureDiastolic: '' }).data)).toBe(false);
    expect(bloodPressureIncomplete(parsePreopData({ recentHb: '12' }).data)).toBe(false);
  });
});

describe('the haemoglobin sample time', () => {
  it('parses a datetime-local value', () => {
    const { data, errors } = parsePreopData({ hbSampleAt: '2026-08-10T07:30' });
    expect(errors).toEqual([]);
    expect(data.hbSampleAt).toBeInstanceOf(Date);
  });

  it('rejects a date it cannot read', () => {
    expect(parsePreopData({ hbSampleAt: 'yesterday' }).errors[0]).toContain('valid date');
  });
});
