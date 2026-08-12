import { describe, it, expect } from 'vitest';
import {
  buildFromPacks, lineForCharge, codeForName, kindForPackItem, sectionForPackItem,
  type PackInput,
} from '../../src/lib/estimates/fromPacks';
import type { TariffRow } from '../../src/lib/estimates/priceLookup';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const ON = d('2026-08-15');

const tariff = (over: Partial<TariffRow> = {}): TariffRow => ({
  id: 't1', code: 'SUTURE-2-0', name: 'Suture 2/0', kind: 'CONSUMABLE',
  amount: 150_000, effectiveFrom: d('2026-01-01'), effectiveTo: null, ...over,
});

const pack = (over: Partial<PackInput> = {}): PackInput => ({
  id: 'p1', name: 'General Surgery consumables', kind: 'CONSUMABLE',
  subspecialty: 'General Surgery',
  items: [{ id: 'i1', name: 'Suture 2/0', quantity: 2, unit: 'piece' }],
  ...over,
});

describe('codeForName', () => {
  it('normalises clinician free text into a code', () => {
    // Pack items are written by clinicians; tariff codes are typed by an
    // administrator. Without this they almost never meet.
    expect(codeForName('Suture 2/0')).toBe('SUTURE-2-0');
    expect(codeForName('  gauze,  sterile ')).toBe('GAUZE-STERILE');
  });

  it('maps punctuation variants to the same code', () => {
    expect(codeForName('Suture 2-0')).toBe(codeForName('Suture 2/0'));
  });
});

describe('kindForPackItem', () => {
  it('treats an item with a drugType as a drug', () => {
    expect(kindForPackItem({ id: 'x', name: 'Ceftriaxone', quantity: 1, unit: 'vial', drugType: 'ANTIBIOTIC' })).toBe('DRUG');
  });

  it('treats everything else as a consumable', () => {
    expect(kindForPackItem({ id: 'x', name: 'Gauze', quantity: 1, unit: 'pack' })).toBe('CONSUMABLE');
  });
});

describe('sectionForPackItem', () => {
  it('sends anaesthesia packs to the anaesthetic section', () => {
    // Anaesthesia packs carry an ANAESTHESIA:: subspecialty prefix, and that —
    // not the pack kind — is what separates the two clinicians' materials.
    const p = pack({ subspecialty: 'ANAESTHESIA::General Surgery' });
    expect(sectionForPackItem(p, p.items[0])).toBe('ANAESTHESIA_MATERIAL');
  });

  it('keeps a theatre drug in surgical materials, not post-op', () => {
    // A drug in a surgical pack is used during the operation. Post-op drugs come
    // from the prescription, a different source entirely.
    const p = pack({ items: [{ id: 'i', name: 'Lidocaine', quantity: 1, unit: 'vial', drugType: 'LOCAL_ANAESTHETIC' }] });
    expect(sectionForPackItem(p, p.items[0])).toBe('SURGICAL_MATERIAL');
  });
});

describe('buildFromPacks', () => {
  it('prices a pack item by normalised code', () => {
    const r = buildFromPacks([pack()], [tariff()], ON);
    expect(r.unpriced).toEqual([]);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].unitPriceKobo).toBe(150_000);
    expect(r.lines[0].quantity).toBe(2);
    expect(r.lines[0].surgicalPackId).toBe('p1');
  });

  it('falls back to a case-insensitive name match', () => {
    const t = tariff({ code: 'SOMETHING-ELSE', name: 'suture 2/0' });
    const r = buildFromPacks([pack()], [t], ON);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].tariffCode).toBe('SOMETHING-ELSE');
  });

  it('will not let a name match cross kinds', () => {
    // Otherwise a consumable silently takes a drug's price.
    const t = tariff({ code: 'X', name: 'Suture 2/0', kind: 'DRUG' });
    const r = buildFromPacks([pack()], [t], ON);
    expect(r.lines).toEqual([]);
    expect(r.unpriced).toHaveLength(1);
  });

  it('reports unpriced items instead of pricing them at zero', () => {
    // Either dropping or zero-pricing puts a quietly wrong figure in front of a
    // patient. The caller shows this list and somebody fills the gap.
    const r = buildFromPacks([pack()], [], ON);
    expect(r.lines).toEqual([]);
    expect(r.unpriced).toHaveLength(1);
    expect(r.unpriced[0].description).toBe('Suture 2/0');
    expect(r.unpriced[0].code).toBe('SUTURE-2-0');
  });

  it('respects the tariff window — no price yet means unpriced', () => {
    const future = tariff({ effectiveFrom: d('2026-12-01') });
    const r = buildFromPacks([pack()], [future], ON);
    expect(r.unpriced).toHaveLength(1);
  });

  it('uses the price in force on the given date, not the newest', () => {
    const old = tariff({ id: 'old', amount: 100_000, effectiveFrom: d('2026-01-01'), effectiveTo: d('2026-08-01') });
    const now = tariff({ id: 'new', amount: 150_000, effectiveFrom: d('2026-08-01') });
    const july = buildFromPacks([pack()], [old, now], d('2026-07-15'));
    expect(july.lines[0].unitPriceKobo).toBe(100_000);
    expect(july.lines[0].tariffId).toBe('old');
  });

  it('orders items by sortOrder', () => {
    const p = pack({
      items: [
        { id: 'b', name: 'Gauze', quantity: 1, unit: 'pack', sortOrder: 2 },
        { id: 'a', name: 'Suture 2/0', quantity: 1, unit: 'piece', sortOrder: 1 },
      ],
    });
    const ts = [tariff(), tariff({ id: 't2', code: 'GAUZE', name: 'Gauze' })];
    const r = buildFromPacks([p], ts, ON);
    expect(r.lines.map((l) => l.description)).toEqual(['Suture 2/0', 'Gauze']);
  });

  it('appends a dosage to the description for a drug', () => {
    const p = pack({
      items: [{ id: 'i', name: 'Ceftriaxone', quantity: 2, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '1g' }],
    });
    const t = tariff({ code: 'CEFTRIAXONE', name: 'Ceftriaxone', kind: 'DRUG', amount: 120_000 });
    const r = buildFromPacks([p], [t], ON);
    expect(r.lines[0].description).toBe('Ceftriaxone (1g)');
    expect(r.lines[0].medicationName).toBe('Ceftriaxone');
  });

  it('corrects a zero or negative pack quantity to one', () => {
    const p = pack({ items: [{ id: 'i', name: 'Suture 2/0', quantity: 0, unit: 'piece' }] });
    const r = buildFromPacks([p], [tariff()], ON);
    expect(r.lines[0].quantity).toBe(1);
  });

  it('combines a surgical and an anaesthetic pack into separate sections', () => {
    const surgical = pack();
    const anaes = pack({
      id: 'p2', subspecialty: 'ANAESTHESIA::General Surgery',
      items: [{ id: 'i2', name: 'Propofol', quantity: 1, unit: 'vial', drugType: 'INDUCTION' }],
    });
    const ts = [tariff(), tariff({ id: 't2', code: 'PROPOFOL', name: 'Propofol', kind: 'DRUG', amount: 200_000 })];
    const r = buildFromPacks([surgical, anaes], ts, ON);
    expect(r.lines.map((l) => l.section)).toEqual(['SURGICAL_MATERIAL', 'ANAESTHESIA_MATERIAL']);
  });

  it('handles an empty pack without complaint', () => {
    const r = buildFromPacks([pack({ items: [] })], [tariff()], ON);
    expect(r.lines).toEqual([]);
    expect(r.unpriced).toEqual([]);
  });
});

describe('lineForCharge', () => {
  it('prices a fee by code', () => {
    const t = tariff({ code: 'SURGEON-MAJOR', name: "Surgeon's fee, major", kind: 'PROCEDURE', amount: 15_000_000 });
    const l = lineForCharge([t], {
      section: 'SURGICAL_FEE', kind: 'PROCEDURE', code: 'SURGEON-MAJOR',
      description: "Surgeon's fee",
    }, ON);
    expect(l!.unitPriceKobo).toBe(15_000_000);
    expect(l!.tariffId).toBe(t.id);
  });

  it('returns null when unpriced so the caller decides if it is fatal', () => {
    // A missing surgeon's fee should block issuing; a missing optional test
    // should not. That judgement is not this function's to make.
    expect(lineForCharge([], {
      section: 'SURGICAL_FEE', kind: 'PROCEDURE', code: 'NOPE', description: 'x',
    }, ON)).toBeNull();
  });

  it('prices a stock item by id rather than code', () => {
    const t = tariff({ id: 'ti', itemId: 'item-9', amount: 90_000 });
    const l = lineForCharge([t], {
      section: 'SURGICAL_MATERIAL', kind: 'CONSUMABLE', code: 'ignored',
      description: 'Cannula', itemId: 'item-9',
    }, ON);
    expect(l!.unitPriceKobo).toBe(90_000);
    expect(l!.inventoryItemId).toBe('item-9');
  });

  it('carries frequency and duration through for a prescribed drug', () => {
    const t = tariff({ code: 'CEFTRIAXONE', name: 'Ceftriaxone', kind: 'DRUG', amount: 120_000 });
    const l = lineForCharge([t], {
      section: 'POSTOP_MEDICATION', kind: 'DRUG', code: 'CEFTRIAXONE',
      description: 'Ceftriaxone', frequencyPerDay: 2, durationDays: 5,
    }, ON);
    expect(l!.frequencyPerDay).toBe(2);
    expect(l!.durationDays).toBe(5);
  });
});
