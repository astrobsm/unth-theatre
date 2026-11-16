import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

import { UNTH_TARIFF_2026, tariff2026Summary } from '../../src/lib/specialNeeds/unthTariff2026';
import { UNTH_PRICE_LIST } from '../../src/lib/specialNeeds/unthPriceList';
import {
  currentPriceList,
  currentPriceListSummary,
  mergeSummary,
  itemKey,
} from '../../src/lib/specialNeeds/priceList';
import { standardCatalogue } from '../../src/lib/specialNeeds/standardCatalogue';
import { toKobo } from '../../src/lib/specialNeeds/pricing';

// The 2026 tariff sheet, and the merge that keeps it from doubling the
// catalogue.
//
// Two things here cost money if they go wrong, and they fail in opposite
// directions. A row that does not match the catalogue becomes a SECOND row
// for something that already exists: priced, unpicked, and sitting beside
// the unpriced original that every magnitude bundle points at. A zero
// carried through as a price becomes a case quoted confidently at nothing.

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
// Absence assertions run against the code, never the comments. A comment
// explaining why something was removed contains the thing that was removed.
const codeOf = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[\t ]*\/\/.*$/gm, '');

const describeRow = (i: { name: string; size?: string }) => `${i.name}${i.size ? ` ${i.size}` : ''}`;

describe('the 2026 tariff, as transcribed', () => {
  it('carries every line of the sheet', () => {
    expect(UNTH_TARIFF_2026).toHaveLength(271);
  });

  it('never writes a price of zero', () => {
    // "0.00" on the sheet is an unfilled cell, not a free item. toKobo
    // accepts 0 as a perfectly good price, so a zero that reached the
    // catalogue would quote a chest drain at nothing and the deposit would
    // report itself COMPLETE while being short by the whole item.
    UNTH_TARIFF_2026.forEach((i) => {
      if (i.unitPrice === undefined) return;
      expect(toKobo(i.unitPrice)).toBeGreaterThan(0);
    });
  });

  it('leaves the sheet\'s blank and zero rows unpriced, and counts them', () => {
    const summary = tariff2026Summary();
    expect(summary.total).toBe(271);
    expect(summary.priced).toBe(238);
    expect(summary.unpriced).toBe(33);
  });

  it('has one row per real thing', () => {
    const seen = new Set<string>();
    const clashes: string[] = [];
    UNTH_TARIFF_2026.forEach((i) => {
      const k = itemKey(i.category, i.name, i.size);
      if (seen.has(k)) clashes.push(describeRow(i));
      seen.add(k);
    });
    expect(clashes).toEqual([]);
  });

  it('gives every row a code of its own', () => {
    const codes = UNTH_TARIFF_2026.map((i) => i.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('every tariff row names something the catalogue already knows', () => {
  // THIS IS THE DUPLICATION TEST. The sheet writes "Lightweight
  // polypropylene mesh"; the catalogue writes "Polypropylene mesh,
  // lightweight". Loaded verbatim that is a second mesh — priced, while the
  // one the picker offers stays blank. Every row is therefore mapped onto a
  // catalogue name before it is written, and a row that maps onto nothing
  // has to be a deliberate addition rather than an accident of spelling.

  const known = new Set<string>();
  [...standardCatalogue(), ...UNTH_PRICE_LIST].forEach((i) =>
    known.add(itemKey(i.category, i.name, i.size)),
  );

  /**
   * The things the hospital priced that the catalogue did not carry at all.
   *
   * Listed here rather than counted, so that adding a row to the sheet
   * cannot quietly add a row to the catalogue: a genuinely new item has to
   * be put in this list by a person who has looked at it.
   */
  const DELIBERATELY_NEW = [
    'MESH\u0000biological mesh\u000015x15cm',
    'MESH\u0000polypropylene mesh, lightweight\u00006x11cm',
    'MESH\u0000polypropylene mesh, lightweight\u000010x15cm',
    'MESH\u0000polypropylene mesh, lightweight\u000015x15cm',
    'MESH\u0000polypropylene mesh, lightweight\u000030x30cm',
    'OTHER\u0000skin stapler\u0000',
  ];

  it('leaves only six rows that are genuinely new', () => {
    const strays = UNTH_TARIFF_2026.filter((i) => {
      const k = itemKey(i.category, i.name, i.size);
      return !known.has(k) && !DELIBERATELY_NEW.includes(k);
    }).map(describeRow);
    expect(strays).toEqual([]);
  });

  it('keeps the sheet\'s own wording wherever a name was mapped', () => {
    // So the mapping can be checked against the printed sheet by somebody
    // who does not read TypeScript.
    const mapped = UNTH_TARIFF_2026.filter((i) => i.listedAs);
    expect(mapped.map((i) => i.listedAs)).toContain('Lightweight polypropylene mesh 15 x 15cm');
    expect(mapped.find((i) => i.listedAs?.startsWith('Lightweight'))?.name).toBe(
      'Polypropylene mesh, lightweight',
    );
  });

  it('prices the Micropore roll the bundles already point at', () => {
    // The sheet writes "Micropore tape size 1". The magnitude bundle asks
    // for "Micropore tape" with no size, so a sized row would be priced
    // while every pack kept carrying the blank one.
    const row = UNTH_TARIFF_2026.find((i) => i.name === 'Micropore tape');
    expect(row?.size).toBeUndefined();
    expect(toKobo(row?.unitPrice ?? null)).toBe(316667);
  });
});

describe('merging the two sheets leaves one row per item', () => {
  const merged = currentPriceList();

  it('has no duplicate keys', () => {
    const seen = new Set<string>();
    const clashes: string[] = [];
    merged.forEach((i) => {
      const k = itemKey(i.category, i.name, i.size);
      if (seen.has(k)) clashes.push(describeRow(i));
      seen.add(k);
    });
    expect(clashes).toEqual([]);
  });

  it('is smaller than the two sheets laid end to end', () => {
    // The whole point. Concatenating them would be 657 rows and 68 of those
    // would be a second copy of something.
    expect(merged.length).toBeLessThan(UNTH_PRICE_LIST.length + UNTH_TARIFF_2026.length);
    expect(merged.length).toBe(UNTH_PRICE_LIST.length + mergeSummary().newIn2026);
  });

  it('keeps every item the 2025 list carried', () => {
    const after = new Set(merged.map((i) => itemKey(i.category, i.name, i.size)));
    const lost = UNTH_PRICE_LIST.filter(
      (i) => !after.has(itemKey(i.category, i.name, i.size)),
    ).map(describeRow);
    expect(lost).toEqual([]);
  });

  it('lets the newer sheet reprice, and says which', () => {
    const summary = mergeSummary();
    expect(summary.repriced.map((r) => r.name)).toEqual(['Syringe 10ml', 'Syringe 20ml']);
    const syringe = merged.find((i) => i.name === 'Syringe' && i.size === '10ml');
    expect(toKobo(syringe?.unitPrice ?? null)).toBe(10000);
  });

  it('never lets a blank on the newer sheet un-price an item', () => {
    // A cell the 2026 committee has not filled in must not wipe a figure
    // that has been in use for a year.
    const blank = UNTH_TARIFF_2026.filter((t) => !t.unitPrice);
    const priced2025 = new Map(
      UNTH_PRICE_LIST.filter((i) => i.unitPrice).map((i) => [
        itemKey(i.category, i.name, i.size),
        i.unitPrice!,
      ]),
    );
    blank.forEach((t) => {
      const was = priced2025.get(itemKey(t.category, t.name, t.size));
      if (!was) return;
      const now = merged.find(
        (m) => itemKey(m.category, m.name, m.size) === itemKey(t.category, t.name, t.size),
      );
      expect(now?.unitPrice).toBe(was);
    });
  });

  it('prices more of the catalogue than either sheet alone', () => {
    const summary = currentPriceListSummary();
    const only2025 = UNTH_PRICE_LIST.filter((i) => i.unitPrice).length;
    expect(summary.priced).toBeGreaterThan(only2025);
    expect(summary.priced).toBeGreaterThan(tariff2026Summary().priced);
  });

  it('builds a fresh list each call, so a caller cannot corrupt the next', () => {
    const a = currentPriceList();
    a[0].unitPrice = '999999.00';
    expect(currentPriceList()[0].unitPrice).not.toBe('999999.00');
  });
});

describe('a missing price no longer stops an item reaching a case', () => {
  // The reversal this change exists for. The catalogue used to withhold
  // anything unpriced and the magnitude bundle used to skip it, so a theatre
  // list went down with a pack short of whatever nobody had priced — which
  // was most of the catalogue. The deposit declaring itself incomplete is
  // the cheaper failure.

  it('the catalogue no longer filters the picker on the price', () => {
    const route = codeOf('src/app/api/special-needs/catalogue/route.ts');
    expect(route).not.toContain('unitPrice: { not: null }');
  });

  it('the catalogue still reports how many of them there are', () => {
    const route = read('src/app/api/special-needs/catalogue/route.ts');
    expect(route).toContain('unpricedOnOffer');
  });

  it('the magnitude bundle attaches every configured line', () => {
    const route = codeOf('src/app/api/surgeries/route.ts');
    expect(route).toContain('where: { magnitude: surgery.magnitude },');
    expect(route).not.toContain('item: { unitPrice: { not: null } }');
  });

  it('the picker marks what has no price rather than hiding it', () => {
    const picker = read('src/components/SpecialNeedsPicker.tsx');
    expect(picker).toContain('price to be added');
    expect(picker).not.toContain('withheldUnpriced');
  });

  it('the deposit still counts and declares the unpriced lines', () => {
    // The declaration is the thing that makes the reversal safe, so it is
    // asserted here rather than only where it is written.
    const deposit = read('src/components/SavedCaseDeposit.tsx');
    expect(deposit).toContain('This is not the full amount.');
    const route = codeOf('src/app/api/surgeries/route.ts');
    expect(route).toContain('unpricedLineCount: quote.unpricedLines.length');
  });
});

describe('the importer will not create a row the catalogue already holds', () => {
  it('falls back to the spelling-tolerant key before adding', () => {
    const lib = codeOf('src/lib/specialNeeds/importPriceList.ts');
    expect(lib).toContain('bySpelling.get(spellingKey(');
    expect(lib).toContain('comparisonForm');
    // And only after both exact routes have failed: a code or an exact name
    // is a fact and must not be overruled by a judgement about spelling.
    expect(lib.indexOf('const exact =')).toBeLessThan(lib.indexOf('bySpelling.get(spellingKey('));
  });

  it('reads the merged list rather than one of the two sheets', () => {
    const lib = codeOf('src/lib/specialNeeds/importPriceList.ts');
    expect(lib).toContain('const list = currentPriceList();');
    expect(lib).not.toContain('UNTH_PRICE_LIST.forEach');
  });

  it('counts the duplicates it did not create', () => {
    const lib = read('src/lib/specialNeeds/importPriceList.ts');
    expect(lib).toContain('matchedBySpelling');
  });
});
