import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildAnaesPackPayload,
  type PayloadPack,
  type PayloadItem,
} from '../../src/lib/anaesthesiaPackPayload';

/**
 * Applying an anaesthesia pack made the whole pre-operative review disappear.
 *
 * The derivation below used to end by calling the PARENT's setState, and was
 * invoked from inside setSelected/setEdits updater functions — which React runs
 * during the render phase. Updating another component mid-render makes React
 * re-invoke the updater, which calls it again; the escalation ends in "Too many
 * re-renders", an error thrown from render, and the review unmounting. The
 * anaesthetist reached the packs, pressed one, and the review vanished.
 *
 * It is pure now, so what actually reaches Pharmacy can be checked.
 */

const drugPack: PayloadPack = {
  id: 'p-drugs', name: 'General Anaesthesia — Drugs', kind: 'PHARMACY',
  items: [
    { name: 'Propofol', quantity: 2, unit: 'vial', dosage: '200mg', route: 'IV' },
    { name: 'Suxamethonium', quantity: 1, unit: 'vial', dosage: '100mg', route: 'IV' },
  ],
};
const consumablePack: PayloadPack = {
  id: 'p-cons', name: 'General Anaesthesia — Consumables', kind: 'CONSUMABLE',
  items: [
    { name: 'ETT 7.5', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY', size: '7.5' },
    { name: 'HME filter', quantity: 1, unit: 'piece' },
  ],
};
const packs = [drugPack, consumablePack];
const build = (selected: string[], edits: Record<string, PayloadItem[]> = {}) =>
  buildAnaesPackPayload({
    packs, selected: new Set(selected), edits: new Map(Object.entries(edits)),
  });

describe('what an applied anaesthesia pack sends onward', () => {
  it('sends nothing until a pack is applied', () => {
    expect(build([])).toEqual({ medications: [], consumableRequests: [] });
  });

  it('routes drugs to Pharmacy and consumables to the provider', () => {
    const out = build(['p-drugs', 'p-cons']);
    expect(out.medications.map((m) => m.name)).toEqual(['Propofol', 'Suxamethonium']);
    expect(out.consumableRequests.map((c) => c.name)).toEqual(['ETT 7.5', 'HME filter']);
    // A drug must never be filed as a consumable: the store cannot dispense it.
    expect(out.consumableRequests.some((c) => c.name === 'Propofol')).toBe(false);
  });

  it('only includes the packs actually applied', () => {
    const out = build(['p-cons']);
    expect(out.medications).toEqual([]);
    expect(out.consumableRequests).toHaveLength(2);
  });

  it('names the pack each line came from, so it can be traced', () => {
    const out = build(['p-drugs']);
    expect(out.medications[0].category).toBe('Anaesthesia: General Anaesthesia — Drugs');
  });

  it('carries dose and route through, and says so when there is no route', () => {
    const out = buildAnaesPackPayload({
      packs: [{ ...drugPack, items: [{ name: 'Fentanyl', quantity: 1, dosage: '100mcg' }] }],
      selected: new Set(['p-drugs']), edits: new Map(),
    });
    expect(out.medications[0].dose).toBe('100mcg');
    expect(out.medications[0].route).toBe('—'); // not stated, not invented
    expect(out.medications[0].unit).toBe('vial'); // sensible default for a drug
  });
});

describe('the rows that must not reach Pharmacy', () => {
  it('skips a blank row somebody added and never filled in', () => {
    // THE CRASH. An unguarded .trim() on a nameless row threw during render.
    const out = build(['p-drugs'], { 'p-drugs': [{ name: '', quantity: 1 }] });
    expect(out.medications).toEqual([]);
  });

  it('survives an item with no name at all', () => {
    const out = build(['p-drugs'], { 'p-drugs': [{ quantity: 1 } as PayloadItem] });
    expect(out.medications).toEqual([]);
  });

  it('skips withdrawn rows and zero/blank quantities', () => {
    const out = build(['p-drugs'], {
      'p-drugs': [
        { name: 'Propofol', quantity: 2, removed: true },
        { name: 'Atropine', quantity: 0 },
        { name: 'Neostigmine', quantity: '' },
        { name: 'Morphine', quantity: 1 },
      ],
    });
    expect(out.medications.map((m) => m.name)).toEqual(['Morphine']);
  });

  it('uses this case’s edits in place of the seeded items', () => {
    const out = build(['p-cons'], {
      'p-cons': [{ name: 'ETT 6.0', quantity: 3, unit: 'piece', size: '6.0' }],
    });
    expect(out.consumableRequests).toHaveLength(1);
    expect(out.consumableRequests[0]).toMatchObject({ name: 'ETT 6.0', quantity: 3, size: '6.0' });
  });

  it('gives every medication a distinct id', () => {
    const out = build(['p-drugs']);
    expect(new Set(out.medications.map((m) => m.id)).size).toBe(out.medications.length);
  });
});

describe('the picker never updates its parent during render', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'components', 'AnaesthesiaPackPicker.tsx'),
    'utf8',
  );

  it('calls onChange from an effect, not from a state updater', () => {
    // The specific defect: onChange (the parent's setState) invoked inside a
    // setSelected/setEdits updater, i.e. during React's render phase.
    const updaterWithOnChange =
      /set(?:Selected|Edits)\(\([^)]*\)\s*=>\s*\{[^}]*onChange[^}]*\}/s;
    expect(src).not.toMatch(updaterWithOnChange);
    // And the publishing effect is present.
    expect(src).toContain('onChangeRef.current(payload)');
  });

  it('does not reintroduce the recompute-with-side-effect helper', () => {
    expect(src).not.toContain('recompute(');
  });

  it('derives the payload rather than assembling it in a handler', () => {
    expect(src).toContain('buildAnaesPackPayload');
  });
});
