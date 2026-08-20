import { describe, it, expect } from 'vitest';
import { normaliseIdentifier, sameIdentifier, checkIdentifier } from '../../src/lib/patients/identity';

// The incident these exist for: a patient registered on the theatre server and
// again on the cloud six minutes later, each minting its own UUID. Both rows
// held identifiers the other needed and neither could ever cross — the cloud's
// copy failed to insert locally 855 times, and a neurosurgical case booked
// against it sat outside theatre for thirteen hours.
//
// The risk in fixing it is the opposite error. Matching too eagerly merges two
// people, which is worse than failing to merge one. These hold that line.

describe('normaliseIdentifier — the same folder written differently', () => {
  it('ignores spaces anywhere in the number', () => {
    // 34 folder numbers in production contain an inner space.
    for (const v of ['914954', '914 954', ' 914954', '914954 ', '9 1 4 9 5 4']) {
      expect(normaliseIdentifier(v), v).toBe('914954');
    }
  });

  it('ignores case', () => {
    // pt531015 and PT531015 were the same person on two nodes.
    expect(normaliseIdentifier('pt531015')).toBe(normaliseIdentifier('PT531015'));
  });

  it('treats absent values as empty rather than throwing', () => {
    expect(normaliseIdentifier(null)).toBe('');
    expect(normaliseIdentifier(undefined)).toBe('');
    expect(normaliseIdentifier('')).toBe('');
  });
});

describe('normaliseIdentifier — what it must NOT merge', () => {
  it('keeps punctuation, because it can separate a real subdivision', () => {
    // "12/345" and "12345" may be two different people. Failing to merge one
    // patient is recoverable; merging two is not.
    expect(normaliseIdentifier('12/345')).not.toBe(normaliseIdentifier('12345'));
    expect(normaliseIdentifier('12-345')).not.toBe(normaliseIdentifier('12345'));
  });

  it('keeps a leading prefix distinct from a bare number', () => {
    expect(normaliseIdentifier('PT914954')).not.toBe(normaliseIdentifier('914954'));
  });

  it('does not conflate different numbers', () => {
    expect(normaliseIdentifier('914954')).not.toBe(normaliseIdentifier('914955'));
  });
});

describe('sameIdentifier', () => {
  it('matches the whitespace and case variants of one folder number', () => {
    expect(sameIdentifier('914 954', '914954')).toBe(true);
    expect(sameIdentifier(' pt531015 ', 'PT531015')).toBe(true);
  });

  it('does NOT match two blanks', () => {
    // The failure this prevents: every patient without a PT number sharing one
    // with every other patient without a PT number.
    expect(sameIdentifier(null, null)).toBe(false);
    expect(sameIdentifier('', '')).toBe(false);
    expect(sameIdentifier('   ', null)).toBe(false);
  });

  it('does not match a blank against a real identifier', () => {
    expect(sameIdentifier('', '914954')).toBe(false);
    expect(sameIdentifier('914954', null)).toBe(false);
  });
});

describe('checkIdentifier — warn while it still costs one keystroke', () => {
  it('flags a leading or trailing space', () => {
    const w = checkIdentifier('folderNumber', ' 914954');
    expect(w?.kind).toBe('untrimmed');
    expect(w?.message).toContain('start or end');
  });

  it('flags an inner space and shows both readings', () => {
    const w = checkIdentifier('folderNumber', '914 954');
    expect(w?.kind).toBe('inner-space');
    expect(w?.message).toContain('914 954');
    expect(w?.message).toContain('914954');
    expect(w?.message).toContain('two different patients');
  });

  it('says nothing about a clean identifier', () => {
    expect(checkIdentifier('folderNumber', '914954')).toBeNull();
    expect(checkIdentifier('ptNumber', 'PT531015')).toBeNull();
  });

  it('says nothing about an absent optional identifier', () => {
    expect(checkIdentifier('ptNumber', null)).toBeNull();
    expect(checkIdentifier('ptNumber', '')).toBeNull();
  });

  it('names the field the person is actually looking at', () => {
    expect(checkIdentifier('ptNumber', ' PT1')?.message).toContain('PT number');
    expect(checkIdentifier('folderNumber', ' 1')?.message).toContain('Folder number');
  });
});
