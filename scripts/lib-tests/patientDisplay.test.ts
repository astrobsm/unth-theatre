import { describe, it, expect } from 'vitest';
import { patientLabel, patientAgeSex } from '../../src/lib/patientDisplay';

/**
 * A booked case on the theatre list showed "Unknown Patient — N/A".
 *
 * That wording is false, and falsely alarming: on a theatre list an unknown
 * patient means an UNIDENTIFIED patient, which is a real clinical category with
 * its own response. This was never that. Surgery.patientId is NOT NULL and
 * every patient row in both databases has a name and an identifier — checked —
 * so an absent patient object can only mean the row was rendered from the
 * offline cache without it.
 *
 * The two states need opposite responses: one sends somebody to the ward to
 * identify a patient, the other sends them to the refresh button.
 */
describe('when the patient record is there', () => {
  it('shows the name and the folder number', () => {
    const l = patientLabel({ id: 'p1', name: 'Aneke Chikamso', folderNumber: 'PT86264' });
    expect(l).toEqual({ name: 'Aneke Chikamso', identifier: 'PT86264', notLoaded: false });
  });

  it('falls back to the PT number rather than saying N/A', () => {
    // The PT number is on the wristband. Showing "N/A" while one exists hides
    // the identifier the theatre would actually use.
    const l = patientLabel({ id: 'p1', name: 'Ona Ibeh', folderNumber: null, ptNumber: 'PT506822' });
    expect(l.identifier).toBe('PT506822');
  });

  it('says so plainly when neither number was recorded', () => {
    const l = patientLabel({ id: 'p1', name: 'Ona Ibeh' });
    expect(l.identifier).toBe('No folder number recorded');
    expect(l.notLoaded).toBe(false);
  });

  it('trims a name padded in the source data', () => {
    // Several live records carry a trailing space.
    expect(patientLabel({ id: 'p1', name: 'Chidiebere Salvation ' }).name).toBe('Chidiebere Salvation');
  });
});

describe('when it is not there', () => {
  it('never claims the patient is unknown', () => {
    // THE BUG. "Unknown Patient" is a clinical statement, and it was untrue.
    for (const p of [null, undefined, {}, { id: 'p1', name: '' }, { id: 'p1', name: '   ' }]) {
      const l = patientLabel(p as never);
      expect(l.notLoaded).toBe(true);
      expect(l.name).not.toMatch(/unknown/i);
      expect(l.name).toBe('Patient details not loaded');
    }
  });

  it('tells the reader what to do instead', () => {
    expect(patientLabel(null).identifier).toMatch(/refresh/i);
  });
});

describe('age and sex', () => {
  it('reads as it does on a list', () => {
    expect(patientAgeSex({ age: 10, gender: 'Female' })).toBe('10y Female');
  });

  it('shows only what is known, never a question mark', () => {
    // The old markup printed "?y" when the age was missing, which looks like a
    // recorded value nobody can read rather than one nobody entered.
    expect(patientAgeSex({ gender: 'Female' })).toBe('Female');
    expect(patientAgeSex({ age: 10 })).toBe('10y');
    expect(patientAgeSex({})).toBe('');
    expect(patientAgeSex(null)).toBe('');
  });
});
