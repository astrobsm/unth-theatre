// One number, six ways of writing it.
//
// The number crosses a counter out loud and comes back as PT-12345,
// PT 12345, pt12345, or just the digits off the card. Stored, it is one of
// those and only one — so an exact match failed for a patient who was on file
// and standing there, and the screen said "no surgery found". That reads as
// "never booked", and sends somebody to the booking office over a hyphen.
//
// The second thing guarded here is the opposite risk. Expanding one number
// into many forms makes it possible for a single input to land on TWO
// patients, and at a pharmacy window quietly picking one of them dispenses
// the wrong person's drugs. Folder numbers here are bare digits (565979) and
// PT numbers are prefixed, so the overlap is real rather than theoretical.
import { describe, it, expect } from 'vitest';
import {
  patientNumberForms, ambiguousNumberMessage,
} from '../../src/lib/patients/numberForms';

const has = (input: string, wanted: string) =>
  patientNumberForms(input).candidates.some((c) => c.toUpperCase() === wanted.toUpperCase());

describe('the forms a PT number is written in', () => {
  it('matches the other spellings, whichever one was typed', () => {
    // The three the counter actually sees, each expanding to the others.
    for (const typed of ['PT-12345', 'PT 12345', 'PT12345']) {
      expect(has(typed, 'PT-12345'), `${typed} -> hyphen`).toBe(true);
      expect(has(typed, 'PT 12345'), `${typed} -> space`).toBe(true);
      expect(has(typed, 'PT12345'), `${typed} -> joined`).toBe(true);
    }
  });

  it('copes with how it is really typed', () => {
    for (const typed of ['pt12345', '  PT-12345  ', 'Pt 12345', 'PT  12345', 'pt_12345', 'PT.12345']) {
      expect(has(typed, 'PT-12345'), typed).toBe(true);
    }
  });

  it('also tries the number without its prefix', () => {
    // Registration sometimes stored the body alone.
    expect(has('PT-12345', '12345')).toBe(true);
  });

  it('keeps exactly what was typed as a candidate', () => {
    // If the stored value is a shape this function never imagined, the typed
    // string is still the best single guess and must not be dropped.
    expect(has('UNTH/2026/0041', 'UNTH/2026/0041')).toBe(true);
    expect(has('565979', '565979')).toBe(true);
  });

  it('reads a bare number as possibly either kind', () => {
    // Somebody reading digits off a PT card leaves the letters out.
    const f = patientNumberForms('12345');
    expect(f.bare).toBe(true);
    expect(has('12345', '12345')).toBe(true);
    expect(has('12345', 'PT-12345')).toBe(true);
  });

  it('does not invent a PT number out of a folder number with letters', () => {
    // "UNTH/2026/0041" is not somebody's PT card read aloud.
    expect(has('UNTH/2026/0041', 'PT-UNTH20260041')).toBe(false);
    const f = patientNumberForms('UNTH/2026/0041');
    expect(f.candidates.some((c) => c.startsWith('PT'))).toBe(false);
  });

  it('marks a prefixed number as not bare', () => {
    expect(patientNumberForms('PT 12345').bare).toBe(false);
    expect(patientNumberForms('12345').bare).toBe(true);
  });

  it('returns nothing for nothing', () => {
    for (const empty of ['', '   ', null as unknown as string, undefined as unknown as string]) {
      expect(patientNumberForms(empty).candidates).toEqual([]);
    }
  });

  it('never repeats a candidate', () => {
    // The query ORs over these; duplicates are wasted work on every lookup.
    for (const typed of ['PT-12345', 'PT12345', '12345', 'PT 12345']) {
      const c = patientNumberForms(typed).candidates.map((x) => x.toUpperCase());
      expect(new Set(c).size, typed).toBe(c.length);
    }
  });

  it('does not expand one patient\'s number into another\'s', () => {
    // THE LINE THAT MATTERS. PT-12345 must never produce a candidate that is
    // a DIFFERENT number — only other spellings of the same one.
    const digits = patientNumberForms('PT-12345').candidates
      .map((c) => c.replace(/[^0-9]/g, ''))
      .filter(Boolean);
    expect(new Set(digits)).toEqual(new Set(['12345']));
  });
});

describe('when one number means two patients', () => {
  it('names them, so the counter can pick', () => {
    const msg = ambiguousNumberMessage('12345', [
      { name: 'Adaeze Okafor', folderNumber: '12345', ptNumber: null },
      { name: 'Chidi Eze', folderNumber: '998811', ptNumber: 'PT-12345' },
    ]);
    expect(msg).toContain('Adaeze Okafor');
    expect(msg).toContain('Chidi Eze');
    expect(msg).toContain('12345');
    // And says what to do about it, rather than only that it happened.
    expect(msg).toMatch(/exactly as it appears/i);
  });

  it('copes with a patient who has no name or number recorded', () => {
    const msg = ambiguousNumberMessage('12345', [
      { name: null, folderNumber: null, ptNumber: null },
      { name: 'Chidi Eze', folderNumber: '12345', ptNumber: null },
    ]);
    expect(msg).toContain('unnamed');
    expect(msg).toContain('no number');
  });
});
