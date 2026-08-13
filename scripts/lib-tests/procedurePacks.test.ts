import { describe, it, expect } from 'vitest';
import {
  mergePackItems, packItemKey, parseProcedures, serialiseAdditional,
  describeProcedures, suggestPacks,
} from '../../src/lib/procedurePacks';

const item = (name: string, quantity: number, over: Record<string, unknown> = {}) => ({
  name, quantity, unit: 'piece', sourcePackId: 'p1', sourcePackName: 'Pack 1', ...over,
});

describe('packItemKey', () => {
  it('matches the same item written differently', () => {
    // Pack items are typed by different people over years. Without this a merge
    // produces three rows for one thing and theatre is sent three sets.
    expect(packItemKey(item('Suture 2/0', 1))).toBe(packItemKey(item('suture 2-0', 1)));
    expect(packItemKey(item('Suture  2 / 0', 1))).toBe(packItemKey(item('SUTURE 2/0', 1)));
  });

  it('keeps different doses of the same drug apart', () => {
    // 500 mg and 1 g are not the same item, and merging them would be a
    // prescribing error.
    const a = item('Ceftriaxone', 1, { dosage: '500mg', drugType: 'ANTIBIOTIC' });
    const b = item('Ceftriaxone', 1, { dosage: '1g', drugType: 'ANTIBIOTIC' });
    expect(packItemKey(a)).not.toBe(packItemKey(b));
  });
});

describe('mergePackItems — the maximum, not the sum', () => {
  it('takes the higher quantity when two packs want the same item', () => {
    // THE rule. A combined case does not need two full sets: the scrub nurse opens
    // one trolley and the same suture pack serves both parts of the operation.
    const merged = mergePackItems([
      item('Suture 2/0', 2, { sourcePackId: 'a', sourcePackName: 'Tumour resection' }),
      item('Suture 2/0', 5, { sourcePackId: 'b', sourcePackName: 'Skin graft' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(5);
  });

  it('does NOT sum', () => {
    const merged = mergePackItems([
      item('Gauze', 3, { sourcePackId: 'a' }),
      item('Gauze', 4, { sourcePackId: 'b' }),
    ]);
    expect(merged[0].quantity).not.toBe(7);
    expect(merged[0].quantity).toBe(4);
  });

  it('records every pack that asked, so the figure can be explained', () => {
    const merged = mergePackItems([
      item('Mesh', 1, { sourcePackId: 'a', sourcePackName: 'Hernia' }),
      item('Mesh', 2, { sourcePackId: 'b', sourcePackName: 'Second site' }),
    ]);
    expect(merged[0].contributions).toHaveLength(2);
    expect(merged[0].contributions.map((c) => c.quantity)).toEqual([1, 2]);
    expect(merged[0].shared).toBe(true);
  });

  it('does not call an item shared when one pack lists it twice', () => {
    // That is a fault in the pack, not two procedures needing it.
    const merged = mergePackItems([
      item('Gauze', 2, { sourcePackId: 'a' }),
      item('Gauze', 3, { sourcePackId: 'a' }),
    ]);
    expect(merged[0].shared).toBe(false);
    expect(merged[0].quantity).toBe(3);
  });

  it('keeps genuinely different items apart', () => {
    const merged = mergePackItems([item('Suture 2/0', 1), item('Gauze', 1)]);
    expect(merged).toHaveLength(2);
  });

  it('corrects a zero or negative quantity to one', () => {
    expect(mergePackItems([item('Gauze', 0)])[0].quantity).toBe(1);
    expect(mergePackItems([item('Gauze', -3)])[0].quantity).toBe(1);
  });

  it('handles an empty list', () => {
    expect(mergePackItems([])).toEqual([]);
  });

  it('merges a realistic two-procedure case', () => {
    const merged = mergePackItems([
      item('Suture 2/0', 4, { sourcePackId: 'a', sourcePackName: 'Tumour resection' }),
      item('Gauze', 10, { sourcePackId: 'a', sourcePackName: 'Tumour resection' }),
      item('Diathermy pad', 1, { sourcePackId: 'a', sourcePackName: 'Tumour resection' }),
      item('Suture 3/0', 6, { sourcePackId: 'b', sourcePackName: 'Skin graft' }),
      item('Gauze', 6, { sourcePackId: 'b', sourcePackName: 'Skin graft' }),
      item('Diathermy pad', 1, { sourcePackId: 'b', sourcePackName: 'Skin graft' }),
    ]);
    // 4 distinct items, not 6.
    expect(merged).toHaveLength(4);
    expect(merged.find((m) => m.name === 'Gauze')!.quantity).toBe(10);
    // One diathermy pad, not two — the patient has one.
    expect(merged.find((m) => m.name === 'Diathermy pad')!.quantity).toBe(1);
  });
});

describe('parseProcedures', () => {
  it('treats the principal procedure as the first', () => {
    const list = parseProcedures('Tumour resection', 'Skin grafting');
    expect(list.map((p) => p.name)).toEqual(['Tumour resection', 'Skin grafting']);
  });

  it('accepts newline or semicolon separated extras', () => {
    expect(parseProcedures('A', 'B\nC;D').map((p) => p.name)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('drops a repeated procedure', () => {
    // The same procedure twice is a slip, not two procedures.
    expect(parseProcedures('Laparotomy', 'laparotomy').map((p) => p.name)).toEqual(['Laparotomy']);
  });

  it('ignores blank lines and stray whitespace', () => {
    expect(parseProcedures('A', '\n\n  B  \n').map((p) => p.name)).toEqual(['A', 'B']);
  });

  it('copes with no procedure at all', () => {
    expect(parseProcedures(null)).toEqual([]);
  });
});

describe('serialiseAdditional', () => {
  it('stores everything after the principal procedure', () => {
    expect(serialiseAdditional(['A', 'B', 'C'])).toBe('B\nC');
  });

  it('returns null for a single procedure', () => {
    expect(serialiseAdditional(['A'])).toBeNull();
  });

  it('round-trips', () => {
    const parsed = parseProcedures('A', serialiseAdditional(['A', 'B', 'C']));
    expect(parsed.map((p) => p.name)).toEqual(['A', 'B', 'C']);
  });
});

describe('describeProcedures', () => {
  it('names one procedure plainly', () => {
    expect(describeProcedures('Herniorrhaphy')).toBe('Herniorrhaphy');
  });

  it('summarises several for a table row', () => {
    expect(describeProcedures('Tumour resection', 'Skin grafting')).toBe('Tumour resection + 1 more');
    expect(describeProcedures('A', 'B\nC')).toBe('A + 2 more');
  });

  it('says so when nothing is recorded', () => {
    expect(describeProcedures(null)).toBe('Not specified');
  });
});

describe('suggestPacks — suggest, never apply', () => {
  const packs = [
    { id: 'p1', name: 'Herniorrhaphy', subspecialty: 'General Surgery' },
    { id: 'p2', name: 'General Surgery basic set', subspecialty: 'General Surgery' },
    { id: 'p3', name: 'Craniotomy', subspecialty: 'Neurosurgery' },
  ];

  it('matches an exact name with high confidence', () => {
    const s = suggestPacks('Herniorrhaphy', packs);
    expect(s[0].packId).toBe('p1');
    expect(s[0].basis).toBe('EXACT_NAME');
    expect(s[0].confidence).toBe('HIGH');
  });

  it('falls back to the subspecialty with LOW confidence', () => {
    // Deliberately low: "some pack from the same specialty" is a starting point
    // for a human, not an answer.
    const s = suggestPacks('Something unheard of', packs, 'General Surgery');
    expect(s.every((x) => x.confidence === 'LOW')).toBe(true);
    expect(s.map((x) => x.packId)).toContain('p2');
  });

  it('ignores short and meaningless words', () => {
    // Matching on "of", "and" or "left" would suggest every pack in the hospital.
    const s = suggestPacks('Repair of left total hernia', packs);
    expect(s.map((x) => x.packId)).not.toContain('p3');
  });

  it('never suggests the same pack twice', () => {
    const s = suggestPacks('Herniorrhaphy', packs, 'General Surgery');
    expect(new Set(s.map((x) => x.packId)).size).toBe(s.length);
  });

  it('returns nothing for an empty procedure name', () => {
    expect(suggestPacks('   ', packs)).toEqual([]);
  });

  it('returns nothing rather than guessing when no pack resembles it', () => {
    expect(suggestPacks('Zzzz', packs)).toEqual([]);
  });
});
