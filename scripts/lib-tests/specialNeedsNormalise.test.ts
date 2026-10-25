import { describe, it, expect } from 'vitest';
import {
  comparisonForm,
  comparisonSize,
  findDuplicate,
  isUsableName,
} from '../../src/lib/specialNeeds/normalise';

// The OTHER path lets anybody add an item mid-booking. That is the only way
// a catalogue stays useful and the fastest way to ruin one: "Prolene 3/0",
// "prolene 3-0" and "PROLENE  3/0 " are one suture to a surgeon, three
// lines to the store keeper, and three things to bill for.

describe('two spellings of the same thing compare equal', () => {
  it.each([
    ['Prolene 3/0', 'prolene 3-0'],
    ['Prolene 3/0', 'PROLENE  3/0 '],
    ['Vicryl 2/0', 'vicryl 2.0'],
    ['Nylon 3 / 0', 'nylon 3/0'],
    ['Bone wax', '  bone   wax  '],
    ['Redivac drain', 'Redivac drain.'],
  ])('%s === %s', (a, b) => {
    expect(comparisonForm(a)).toBe(comparisonForm(b));
  });

  it('keeps genuinely different items apart', () => {
    expect(comparisonForm('Prolene 3/0')).not.toBe(comparisonForm('Prolene 2/0'));
    expect(comparisonForm('Bone wax')).not.toBe(comparisonForm('Bone cement'));
    // 1/0 and 10 are different gauges and must not collapse together.
    expect(comparisonForm('Silk 1/0')).not.toBe(comparisonForm('Silk 10'));
  });
});

describe('sizes written the several usual ways', () => {
  it.each([
    ['16Fr', '16 Fr'],
    ['16Fr', '16 french'],
    ['18G', '18 gauge'],
    ['4 inch', '4in'],
    ['4 inch', '4 inches'],
  ])('%s === %s', (a, b) => {
    expect(comparisonSize(a)).toBe(comparisonSize(b));
  });

  it('treats a missing size as empty rather than throwing', () => {
    expect(comparisonSize(null)).toBe('');
    expect(comparisonSize(undefined)).toBe('');
    expect(comparisonSize('')).toBe('');
  });

  it('keeps different sizes apart', () => {
    expect(comparisonSize('16Fr')).not.toBe(comparisonSize('18Fr'));
  });
});

describe('finding the row an item already is', () => {
  const catalogue = [
    { id: 'a', category: 'SUTURE', name: 'Polypropylene (Prolene-type)', size: '3/0', brand: null },
    { id: 'b', category: 'SUTURE', name: 'Polypropylene (Prolene-type)', size: '2/0', brand: null },
    { id: 'c', category: 'CHEST_TUBE', name: 'Chest tube (intercostal drain)', size: '16Fr', brand: null },
    { id: 'd', category: 'URETHRAL_CATHETER', name: 'Foley, all-silicone', size: '16Fr', brand: null },
  ];

  it('matches past spelling and spacing', () => {
    const hit = findDuplicate(
      { category: 'SUTURE', name: '  polypropylene (prolene-type) ', size: '3-0' },
      catalogue,
    );
    expect(hit?.id).toBe('a');
  });

  it('does not match across categories', () => {
    // A 16Fr chest tube and a 16Fr catheter are not the same thing however
    // similarly they are written.
    const hit = findDuplicate(
      { category: 'CHEST_TUBE', name: 'Foley, all-silicone', size: '16Fr' },
      catalogue,
    );
    expect(hit).toBeNull();
  });

  it('does not match a different size', () => {
    const hit = findDuplicate(
      { category: 'SUTURE', name: 'Polypropylene (Prolene-type)', size: '4/0' },
      catalogue,
    );
    expect(hit).toBeNull();
  });

  it('treats a different brand as a different line', () => {
    // Two brands of the same mesh are two things to order and two prices.
    const hit = findDuplicate(
      { category: 'SUTURE', name: 'Polypropylene (Prolene-type)', size: '3/0', brand: 'Ethicon' },
      catalogue,
    );
    expect(hit).toBeNull();
  });

  it('returns null on an empty catalogue rather than throwing', () => {
    expect(findDuplicate({ category: 'SUTURE', name: 'Anything' }, [])).toBeNull();
  });
});

describe('what is allowed to become a permanent catalogue row', () => {
  it.each(['Bone wax', 'PDS 1', 'Mesh 15x15'])('accepts %s', (name) => {
    expect(isUsableName(name)).toBe(true);
  });

  it.each([null, undefined, '', '   ', 'x', '3', '--', '...'])('rejects %s', (name) => {
    // A stray keystroke must not end up in the catalogue for ever, where
    // everybody afterwards has to scroll past it.
    expect(isUsableName(name as never)).toBe(false);
  });
});
