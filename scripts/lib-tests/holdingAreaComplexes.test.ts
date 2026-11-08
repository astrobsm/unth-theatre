// Every theatre complex has its own holding area.
//
// The holding area was built as though there were one. A nurse named to "the
// holding area" was named to all of them at once, and a chase addressed to
// "the holding area nurse" reached whoever was on that single list — which,
// for a patient waiting outside the Eye Theatre, is somebody standing in
// another building who cannot see them.
//
// The tests that matter here are about REFUSING TO GUESS. Placing a case in
// the wrong complex sends the chase to the wrong building, and the sender is
// told it was delivered, so they stop looking. An unplaceable theatre has to
// come back null and be asked about.
import { describe, it, expect } from 'vitest';
import {
  HOLDING_AREA_COMPLEXES, DEFAULT_COMPLEX, normaliseComplex, complexOfRow,
  complexForTheatre, shortComplex, isComplex,
} from '../../src/lib/holdingArea/complexes';
import { LOCATIONS, CANONICAL_THEATRES } from '../../src/lib/constants';

describe('the complexes', () => {
  it('is every canonical location, and nothing invented', () => {
    const keys = HOLDING_AREA_COMPLEXES.map((c) => c.key).sort();
    expect(keys).toEqual([...LOCATIONS].sort());
  });

  it('names the main complex first, where most of the floor is', () => {
    expect(HOLDING_AREA_COMPLEXES[0].key).toBe('Professor Ojukwu Theatre Complex');
    expect(DEFAULT_COMPLEX).toBe('Professor Ojukwu Theatre Complex');
  });

  it('gives each one a short label a column heading can hold', () => {
    for (const c of HOLDING_AREA_COMPLEXES) {
      expect(c.short.length).toBeGreaterThan(0);
      expect(c.short.length).toBeLessThanOrEqual(22);
    }
  });
});

describe('reading a complex off a value', () => {
  it('takes a canonical label as it stands', () => {
    expect(normaliseComplex('Eye Theatre')).toBe('Eye Theatre');
    expect(normaliseComplex('Cardiothoracic Centre')).toBe('Cardiothoracic Centre');
  });

  it('is forgiving about case and surrounding space, and nothing else', () => {
    expect(normaliseComplex('  eye theatre ')).toBe('Eye Theatre');
    expect(normaliseComplex('PROFESSOR OJUKWU THEATRE COMPLEX'))
      .toBe('Professor Ojukwu Theatre Complex');
  });

  it('reads the codes the allocate route used to write', () => {
    // Every holding-area row on file before this change says MAIN_THEATRE.
    expect(normaliseComplex('MAIN_THEATRE')).toBe('Professor Ojukwu Theatre Complex');
    expect(normaliseComplex('A_AND_E')).toBe('A&E');
    expect(normaliseComplex('CTU')).toBe('Cardiothoracic Centre');
  });

  it('refuses to guess at anything else', () => {
    // THE TEST THAT MATTERS. A near-miss resolved by fuzzy matching is a
    // chase delivered to the wrong building, reported as delivered.
    expect(normaliseComplex('Theatre')).toBe(null);
    expect(normaliseComplex('Eye')).toBe('Eye Theatre');       // an explicit alias
    expect(normaliseComplex('Eye Ward')).toBe(null);           // not an alias
    expect(normaliseComplex('Ojukwu Theatre')).toBe(null);     // partial, not aliased
    expect(normaliseComplex('')).toBe(null);
    expect(normaliseComplex(null)).toBe(null);
    expect(normaliseComplex(undefined)).toBe(null);
    expect(normaliseComplex(42)).toBe(null);
  });

  it('knows a canonical label when it sees one', () => {
    expect(isComplex('A&E')).toBe(true);
    expect(isComplex('A_AND_E')).toBe(false);
    expect(isComplex(null)).toBe(false);
  });
});

describe('a row already on file', () => {
  it('still places a pre-change allocation in the main complex', () => {
    // Those are real people who really stood in the main holding area.
    // Dropping them from the list would be a worse answer than placing them
    // where the route that wrote the row meant to put them.
    expect(complexOfRow('MAIN_THEATRE')).toBe('Professor Ojukwu Theatre Complex');
    expect(complexOfRow(null)).toBe('Professor Ojukwu Theatre Complex');
    expect(complexOfRow('something nobody recognises')).toBe(DEFAULT_COMPLEX);
  });

  it('does not override a row that says which complex it is', () => {
    expect(complexOfRow('Eye Theatre')).toBe('Eye Theatre');
    expect(complexOfRow('A&E')).toBe('A&E');
  });
});

describe('which holding area serves a theatre', () => {
  it('places every canonical theatre', () => {
    for (const t of CANONICAL_THEATRES) {
      expect(complexForTheatre(t.name), `${t.name} could not be placed`).toBe(t.location);
    }
  });

  it('places the theatres the user named', () => {
    expect(complexForTheatre('Theatre 3')).toBe('Professor Ojukwu Theatre Complex');
    expect(complexForTheatre('Suite 2')).toBe('Professor Ojukwu Theatre Complex');
    expect(complexForTheatre('Eye Theatre')).toBe('Eye Theatre');
    expect(complexForTheatre('CTU TH1')).toBe('Cardiothoracic Centre');
    expect(complexForTheatre('A&E North Wing Suite')).toBe('A&E');
  });

  it('prefers what the database says over the hardcoded list', () => {
    // A theatre can be added without anybody editing constants.ts, and the
    // suite row is then the only thing that knows where it is.
    expect(complexForTheatre('Theatre 1', 'Eye Theatre')).toBe('Eye Theatre');
    expect(complexForTheatre('A brand new room', 'Cardiothoracic Centre'))
      .toBe('Cardiothoracic Centre');
  });

  it('returns null for a theatre it cannot place, rather than the main complex', () => {
    // The caller must ask. This is the whole point: a chase sent to the main
    // holding area for a case in the Eye Theatre reaches somebody who cannot
    // see the patient, and the sender is told it was delivered.
    expect(complexForTheatre('Theatre 9')).toBe(null);
    expect(complexForTheatre('Day Case Room')).toBe(null);
    expect(complexForTheatre(null)).toBe(null);
    expect(complexForTheatre('', '')).toBe(null);
    expect(complexForTheatre('Theatre 9', 'nowhere in particular')).toBe(null);
  });
});

describe('labels', () => {
  it('shortens a complex for a chip', () => {
    expect(shortComplex('Cardiothoracic Centre')).toBe('Cardiothoracic (CTU)');
    expect(shortComplex('Professor Ojukwu Theatre Complex')).toBe('Professor Ojukwu');
  });

  it('says so when it has nothing to place', () => {
    expect(shortComplex(null)).toBe('Unplaced');
    expect(shortComplex('Theatre 9')).toBe('Unplaced');
  });
});
