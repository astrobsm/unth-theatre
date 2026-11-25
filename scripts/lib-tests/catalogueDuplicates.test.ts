/**
 * The same item, entered more than once.
 *
 * Matching the catalogue to the NHIA price list did not only say what the
 * scheme covers; it showed how often one thing sits in the catalogue under
 * several names. Three rows reading "10% Dextrose/ water (1l)", "10%
 * Dextrous water (1000mls)" and "Dextrose 10% (1 L)" are one fluid, and a
 * surgeon choosing between them at booking is choosing between spellings.
 *
 * THE ONE RULE THESE TESTS EXIST FOR. The Authority's codes are coarse:
 * NHIA-28-02-16 is "Surgical Gloves, all sizes" and covers every glove in
 * the building. Grouping on the code alone would propose merging size 7 with
 * size 8, and merging them puts the wrong glove on a trolley. Two rows are
 * only ever candidates when the code AND the size AND the unit agree.
 */
import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  compareKey, confidenceOf, groupDuplicates, retireCount, suggestKeeper,
  type CatalogueRow,
} from '../../src/lib/catalogue/duplicates';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const row = (over: Partial<CatalogueRow> & { id: string; name: string }): CatalogueRow => ({
  size: null, unit: 'piece', defaultQuantity: 1, isActive: true,
  nhiaCode: 'NHIA-21-02-03', usage: 0, ...over,
});

describe('grouping the catalogue', () => {
  it('puts one fluid under three names together', () => {
    const groups = groupDuplicates([
      row({ id: 'a', name: '10% Dextrose/ water (1l)' }),
      row({ id: 'b', name: '10% Dextrous water (1000mls)' }),
      row({ id: 'c', name: 'Dextrose 10% (1 L)' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('NEVER groups two sizes of the same thing', () => {
    // The failure that would put the wrong glove on a trolley. Both are
    // NHIA-28-02-16, "Surgical Gloves, all sizes".
    const groups = groupDuplicates([
      row({ id: 'g7', name: 'Surgical glove', size: '7', nhiaCode: 'NHIA-28-02-16' }),
      row({ id: 'g8', name: 'Surgical glove', size: '8', nhiaCode: 'NHIA-28-02-16' }),
    ]);
    expect(groups).toEqual([]);
  });

  it('never groups two units of the same thing', () => {
    // A pair and a box are not one line however they are spelled.
    const groups = groupDuplicates([
      row({ id: 'a', name: 'Surgical glove', unit: 'pair', nhiaCode: 'NHIA-28-02-16' }),
      row({ id: 'b', name: 'Surgical glove', unit: 'box', nhiaCode: 'NHIA-28-02-16' }),
    ]);
    expect(groups).toEqual([]);
  });

  it('ignores a row with no NHIA code', () => {
    // Nothing has said these are the same thing, so nothing here will.
    const groups = groupDuplicates([
      row({ id: 'a', name: 'Hera wound gel', nhiaCode: null }),
      row({ id: 'b', name: 'HERA Wound Gel', nhiaCode: null }),
    ]);
    expect(groups).toEqual([]);
  });

  it('ignores an inactive row', () => {
    const groups = groupDuplicates([
      row({ id: 'a', name: 'Dextrose 10%' }),
      row({ id: 'b', name: 'Dextrose 10% (old)', isActive: false }),
    ]);
    expect(groups).toEqual([]);
  });

  it('does not report a lone row as a duplicate of itself', () => {
    expect(groupDuplicates([row({ id: 'a', name: 'Dextrose 10%' })])).toEqual([]);
  });
});

describe('how sure it is', () => {
  it('calls matching names identical', () => {
    expect(confidenceOf([
      row({ id: 'a', name: 'Dextrose 10% (1 L)' }),
      row({ id: 'b', name: 'dextrose  10%  (1 l)' }),
    ])).toBe('IDENTICAL');
  });

  it('calls different spellings the same thing', () => {
    expect(confidenceOf([
      row({ id: 'a', name: '10% Dextrous water' }),
      row({ id: 'b', name: 'Dextrose 10%' }),
    ])).toBe('SAME_THING');
  });

  it('calls a disagreement about quantity doubtful', () => {
    // Usually somebody meant two different pack sizes by them, and that is
    // exactly the case a person should see.
    expect(confidenceOf([
      row({ id: 'a', name: 'Gauze', defaultQuantity: 1 }),
      row({ id: 'b', name: 'Gauze', defaultQuantity: 10 }),
    ])).toBe('DOUBTFUL');
  });

  it('shows the doubtful ones first', () => {
    const groups = groupDuplicates([
      row({ id: 'a', name: 'Dextrose 10%', nhiaCode: 'X' }),
      row({ id: 'b', name: 'Dextrose 10%', nhiaCode: 'X' }),
      row({ id: 'c', name: 'Gauze', nhiaCode: 'Y', defaultQuantity: 1 }),
      row({ id: 'd', name: 'Gauze', nhiaCode: 'Y', defaultQuantity: 10 }),
    ]);
    expect(groups[0].confidence).toBe('DOUBTFUL');
  });
});

describe('which one to suggest keeping', () => {
  it('keeps the one the theatre actually orders', () => {
    // Whatever anybody thinks of its spelling. It means the fewest pack
    // lines end up pointing at something retired.
    const s = suggestKeeper([
      row({ id: 'ugly', name: 'D/W 10%', usage: 240 }),
      row({ id: 'pretty', name: 'Dextrose 10% (1 litre)', usage: 0 }),
    ]);
    expect(s.id).toBe('ugly');
    expect(s.why).toContain('240');
  });

  it('falls back to the fullest name when nothing has been ordered', () => {
    // A catalogue is read by people in a hurry, and "Dextrose 10% (1 L)"
    // tells a storekeeper more than "D/W".
    const s = suggestKeeper([
      row({ id: 'short', name: 'D/W' }),
      row({ id: 'long', name: 'Dextrose 10% (1 L)' }),
    ]);
    expect(s.id).toBe('long');
    expect(s.why).toContain('has ever been ordered');
  });

  it('falls back to the fullest name on a tie', () => {
    const s = suggestKeeper([
      row({ id: 'short', name: 'D/W', usage: 5 }),
      row({ id: 'long', name: 'Dextrose 10% (1 L)', usage: 5 }),
    ]);
    expect(s.id).toBe('long');
    expect(s.why).toContain('equally often');
  });

  it('counts what taking every suggestion would retire', () => {
    const groups = groupDuplicates([
      row({ id: 'a', name: 'A', nhiaCode: 'X' }),
      row({ id: 'b', name: 'B', nhiaCode: 'X' }),
      row({ id: 'c', name: 'C', nhiaCode: 'X' }),
      row({ id: 'd', name: 'D', nhiaCode: 'Y' }),
      row({ id: 'e', name: 'E', nhiaCode: 'Y' }),
    ]);
    // Three rows become one, two become one: three retired, two kept.
    expect(retireCount(groups)).toBe(3);
  });

  it('compares names without caring about punctuation or case', () => {
    expect(compareKey("Ringer's Lactate (1 L)")).toBe(compareKey('ringers lactate 1 l'));
    expect(compareKey('10% Dextrose/ water')).toBe(compareKey('10% dextrose water'));
  });
});

describe('the screen and the route', () => {
  const api = read('src/app/api/admin/catalogue-duplicates/route.ts');
  const page = read('src/app/dashboard/admin/catalogue-duplicates/page.tsx');

  it('retires rather than deletes', () => {
    // A template id is written onto every pack line raised from it, so
    // deleting one would orphan rows on cases already booked.
    expect(api).toContain('isActive: false');
    expect(api).toContain('supersededById: keepId');
    expect(api).not.toMatch(/\.delete\(|deleteMany/);
  });

  it('will not retire anything without being told which to keep', () => {
    expect(api).toContain("input.action === 'KEEP_ONE' && (!input.keepId || !input.ids.includes(input.keepId))");
    expect(api).toContain('Choose which of these to keep.');
  });

  it('lets an administrator say they are different things', () => {
    // A review queue that keeps showing a decision already taken is a queue
    // nobody finishes.
    expect(api).toContain("'ALL_DISTINCT'");
    expect(api).toContain('dedupeConfirmedAt: now');
    expect(api).toContain('dedupeConfirmedAt: null');
  });

  it('confirms the survivor too, or the group comes back tomorrow', () => {
    const block = api.slice(api.indexOf('const keepId = input.keepId!'), api.indexOf('await prisma.auditLog'));
    expect(block).toContain('where: { id: keepId }');
  });

  it('only lets an administrator or the theatre manager retire a row', () => {
    expect(api).toContain("const MAY_RESOLVE = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER']");
    // Reading is wider: the pharmacies and the pack providers are the ones
    // who notice a duplicate in the first place.
    expect(api).toContain('MAY_VIEW');
    expect(api).toContain('canResolve');
  });

  it('writes the decision to the audit trail, both sides of it', () => {
    expect(api).toContain('catalogueDeduplication');
    expect(api).toContain('retired:');
    expect(api).toContain('kept:');
  });

  it('tells the reader on screen that nothing is deleted', () => {
    expect(page).toContain('Nothing is deleted');
    expect(page).toContain('Sizes are never merged');
  });

  it('shows how often each row has been ordered', () => {
    // It is the fact the decision should turn on.
    expect(page).toContain('Used on ');
    expect(page).toContain('Never ordered');
  });
});
