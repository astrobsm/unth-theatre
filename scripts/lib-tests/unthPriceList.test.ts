import { describe, it, expect } from 'vitest';
import { UNTH_PRICE_LIST, priceListSummary } from '../../src/lib/specialNeeds/unthPriceList';
import { toKobo, quoteFor } from '../../src/lib/specialNeeds/pricing';

// This file is generated from the hospital's price list CSV, and the CSV has
// real defects. These tests exist because of the specific ways a defect in
// it turns into money: a price that silently disappears is a deposit that is
// too low, and the family is asked for the difference at the theatre door.

const key = (i: { category: string; name: string; size?: string }) =>
  `${i.category}\u0000${i.name}\u0000${i.size ?? ''}`;

describe('nothing on the list can lose its price to a duplicate key', () => {
  // The catalogue is unique on (category, name, size, brand). Brand is null
  // for everything here, so two rows sharing category+name+size are one row
  // in the database and the second price is simply lost.
  it('has no two items sharing the unique key', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    UNTH_PRICE_LIST.forEach((i) => {
      const k = key(i);
      const already = seen.get(k);
      if (already) clashes.push(`${i.name} ${i.size ?? ''} (${already} vs ${i.code})`);
      else seen.set(k, i.code);
    });
    expect(clashes).toEqual([]);
  });

  it('gives every item a code of its own', () => {
    const codes = UNTH_PRICE_LIST.map((i) => i.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('the four syringe sizes keep their four different prices', () => {
  // The CSV names all four "Assorted syringes (2/5/10/20 ml)". Keyed on that
  // name they collapse into one row, and a 20 ml syringe gets charged at the
  // price of a 2 ml one — out by a factor of four and a half.
  const syringes = UNTH_PRICE_LIST.filter((i) => i.category === 'SYRINGE' && i.name === 'Syringe');

  it('lists them separately by size', () => {
    expect(syringes.map((s) => s.size).sort()).toEqual(['10ml', '20ml', '2ml', '5ml']);
  });

  // "5ml", not "5 ml". The standard catalogue seeds Syringe 2ml..50ml and
  // the magnitude bundles ask for that exact spelling, so a space here
  // creates a second unpriced row, leaves the bundle pointing at it, and
  // every deposit quotes a syringe at nothing.
  it('spells the size the way the catalogue and the bundles do', () => {
    syringes.forEach((s) => expect(s.size).toMatch(/^\d+ml$/));
  });

  it('prices the 20 ml well above the 2 ml', () => {
    const at = (size: string) => toKobo(syringes.find((s) => s.size === size)?.unitPrice ?? null);
    expect(at('2ml')).toBe(7000);
    expect(at('20ml')).toBe(32500);
    expect(at('20ml')!).toBeGreaterThan(at('2ml')!);
  });
});

describe('needle geometry is part of the identity, because it is part of the price', () => {
  // A cutting needle costs more than a round body at the same gauge. If the
  // geometry lived only in needleType, which is not in the unique key, the
  // two would collide and the dearer one would vanish.
  const surgicryl = UNTH_PRICE_LIST.filter((i) => i.name === 'Surgicryl suture');

  it('separates round body from cutting needle at the same gauge', () => {
    const round = surgicryl.find((s) => s.size === '2/0 round body');
    const cutting = surgicryl.find((s) => s.size === '2/0 cutting needle');
    expect(round).toBeDefined();
    expect(cutting).toBeDefined();
    expect(toKobo(cutting!.unitPrice!)).toBeGreaterThan(toKobo(round!.unitPrice!)!);
  });

  it('expanded the gauges listed together in one code', () => {
    // "SURGICRYL 5/0, 6/0 (ROUND BODY)" is one CSV row covering two gauges.
    expect(surgicryl.some((s) => s.size === '5/0 round body')).toBe(true);
    expect(surgicryl.some((s) => s.size === '6/0 round body')).toBe(true);
  });

  it('carries the needle type and absorbability through for the store', () => {
    surgicryl.forEach((s) => {
      expect(s.needleType).toMatch(/round body|cutting needle/);
      expect(s.absorbable).toBe(true);
      expect(s.material).toBe('polyglactin 910');
    });
  });
});

describe('prices are usable money', () => {
  it('parses every stated price to a positive whole number of kobo', () => {
    const bad = UNTH_PRICE_LIST.filter((i) => i.unitPrice !== undefined).filter((i) => {
      const k = toKobo(i.unitPrice!);
      return k === null || k <= 0 || !Number.isInteger(k);
    });
    expect(bad.map((b) => `${b.code}=${b.unitPrice}`)).toEqual([]);
  });

  it('leaves unpriced items unpriced rather than zero', () => {
    // Zero means genuinely free. The hospital not having set a price is a
    // different fact, and a case using such an item must be reported as
    // incomplete rather than quoted low.
    UNTH_PRICE_LIST.forEach((i) => {
      expect(i.unitPrice === undefined || i.unitPrice.length > 0).toBe(true);
      expect(i.unitPrice).not.toBe('0.00');
    });
  });

  it('summarises itself consistently', () => {
    const s = priceListSummary();
    expect(s.total).toBe(UNTH_PRICE_LIST.length);
    expect(s.priced + s.unpriced).toBe(s.total);
    expect(s.drugs + s.consumables).toBe(s.total);
    expect(s.priced).toBeGreaterThan(0);
  });
});

describe('the mislabelled row was corrected, not imported as it stood', () => {
  // SOLUBLE-INSULIN-SLIDING-SCALE arrived with "yankauer suction" in its
  // name column, against kind DRUG and unit vial. Imported as it stood, a
  // suction handle would appear in the pharmacy's drug list.
  it('does not file a suction handle as a drug', () => {
    const drugs = UNTH_PRICE_LIST.filter((i) => i.dispensedByPharmacy);
    expect(drugs.filter((d) => /yankauer/i.test(d.name))).toEqual([]);
  });

  it('names the insulin row for what its code says it is', () => {
    const row = UNTH_PRICE_LIST.find((i) => i.code === 'SOLUBLE-INSULIN-SLIDING-SCALE');
    expect(row).toBeDefined();
    expect(row!.name).toMatch(/insulin/i);
    expect(row!.dispensedByPharmacy).toBe(true);
  });
});

describe('the split between the store and the pharmacy', () => {
  it('sends drugs to pharmacy and consumables to the store', () => {
    const ceftriaxone = UNTH_PRICE_LIST.find((i) => i.code === 'CEFTRIAXONE-1-G');
    expect(ceftriaxone?.dispensedByPharmacy).toBe(true);
    // Omitted rather than written as false in the generated list; the
    // importer reads it as `?? false`, so falsiness is what matters.
    const gloves = UNTH_PRICE_LIST.find((i) => i.code === 'STERILE-GLOVES');
    expect(!!gloves?.dispensedByPharmacy).toBe(false);
  });

  it('keeps the unit the store issues in, not a guess', () => {
    expect(UNTH_PRICE_LIST.find((i) => i.code === 'STERILE-GLOVES')?.unit).toBe('pair');
    expect(UNTH_PRICE_LIST.find((i) => i.code === 'CEFTRIAXONE-1-G')?.unit).toBe('vial');
  });
});

describe('a real case prices the way the ward would expect', () => {
  it('adds a chest drain, its bottle and gloves with contingency on the consumables only', () => {
    const pick = (code: string) => {
      const i = UNTH_PRICE_LIST.find((x) => x.code === code);
      if (!i) throw new Error(`missing ${code}`);
      return { unitPrice: i.unitPrice ?? null, quantity: 1, dispensedByPharmacy: !!i.dispensedByPharmacy, name: i.name };
    };

    const q = quoteFor([
      pick('CHEST-DRAINS'), // 3,500
      pick('UNDERWATER-SEAL-DRAINAGE-SYSTEM'), // 50,000
      pick('STERILE-GLOVES'), // 450
    ]);

    expect(q.consumableSubtotalKobo).toBe(5_395_000);
    expect(q.consumableContingencyKobo).toBe(539_500);
    expect(q.pharmacySubtotalKobo).toBe(0);
    expect(q.totalKobo).toBe(5_934_500);
    expect(q.complete).toBe(true);
  });

  it('reports the unpriced lines of a case instead of quoting it low', () => {
    const mesh = UNTH_PRICE_LIST.find((i) => i.code === 'LIGHTWEIGHT-POLYPROPYLENE-MESH');
    expect(mesh?.unitPrice).toBeUndefined(); // the hospital has not priced it
    const q = quoteFor([
      { unitPrice: mesh?.unitPrice ?? null, quantity: 1, dispensedByPharmacy: false, name: mesh!.name },
    ]);
    expect(q.complete).toBe(false);
    expect(q.unpricedLines).toEqual(['Lightweight polypropylene mesh']);
    expect(q.totalKobo).toBe(0);
  });
});
