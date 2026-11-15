/**
 * The mandatory base pack, as the theatre gave it on 15 November.
 *
 * Every booked case carries this, elective and emergency alike, whatever the
 * operation. It is the one list in the system nobody chooses, so it is the one
 * list where a quiet edit reaches every theatre at once — and the only guard
 * against that is writing the figures down twice, here and in the source, and
 * making them agree.
 *
 * THE MAJOR COLUMN IS THE INSTRUCTION. Those are the numbers that were given,
 * and this file asserts them item by item. MINOR and INTERMEDIATE were derived
 * by tapering down from them, so they are asserted as RELATIONS — never above
 * major, never below one — rather than as figures somebody agreed to. If the
 * theatre later gives its own minor and intermediate numbers, the relations
 * still hold and only the major assertions need revisiting.
 */
import { describe, expect, it } from 'vitest';
import { resolveBasePack, SURGERY_MAGNITUDES } from '../../src/lib/baseConsumablePack';

const at = (magnitude: string) => {
  const out = new Map<string, { quantity: number; unit: string; size: string | null }>();
  for (const i of resolveBasePack(magnitude)) {
    out.set(i.size ? `${i.name} ${i.size}` : i.name, {
      quantity: i.quantity, unit: i.unit, size: i.size,
    });
  }
  return out;
};

/** What was asked for, verbatim. Quantity, then unit. */
const AS_GIVEN: [string, number, string][] = [
  ['Examination gloves', 1, 'pack'],
  ['Povidone-Iodine Solution (10%) 100 ml', 1, 'bottle'],
  ['Chlorhexidine solution 500 ml', 1, 'bottle'],
  ['Methylated spirit / 70% Isopropyl alcohol 100 ml', 1, 'bottle'],
  ['Skin marker', 1, 'piece'],
  ['JIK (hypochlorite)', 1, 'bottle'],
  ['Zinc oxide tape', 2, 'roll'],
  ['Syringe 10ml', 10, 'piece'],
  ['Syringe 5ml', 10, 'piece'],
  ['Syringe 2ml', 10, 'piece'],
  ['IV cannula, yellow 24G', 2, 'piece'],
  ['IV cannula, blue 22G', 2, 'piece'],
  ['IV cannula, green 18G', 2, 'piece'],
  ['IV cannula, grey (ash) 16G', 2, 'piece'],
  ['Surgical gloves, sterile', 8, 'pairs'],
  ['Water for injection 10ml', 10, 'ampoule'],
  ['IV giving set', 2, 'set'],
];

describe('the pack the theatre specified', () => {
  const major = at('MAJOR');

  it('carries every line that was asked for, and no others', () => {
    expect([...major.keys()].sort()).toEqual(AS_GIVEN.map(([n]) => n).sort());
  });

  for (const [name, quantity, unit] of AS_GIVEN) {
    it(`issues ${quantity} ${unit} of ${name} for a major case`, () => {
      const line = major.get(name);
      expect(line, name).toBeDefined();
      expect(line!.quantity, name).toBe(quantity);
      expect(line!.unit, name).toBe(unit);
    });
  }
});

describe('what the previous pack carried and this one does not', () => {
  // Named rather than implied, because each of these was in every case's pack
  // until 15 November and somebody will wonder where it went. They were not
  // lost: a pack is about access and prep now, and what a given operation
  // needs by way of drapes and swabs comes from its family set instead.
  const GONE = [
    'Surgical face masks', 'Surgical caps', 'Sterile surgical gowns',
    'Non-sterile disposable gowns', 'Protective shoe covers',
    'Protective goggles/face shields', 'Sterile drapes', 'Fenestrated drapes',
    'Mayo stand cover', 'Instrument table cover', 'Gauze swabs (10 × 10 cm)',
    'Abdominal mops/laparotomy pads', 'Cotton wool', 'Combine dressing pads',
    'Sterile dressing packs', 'Micropore tape', 'Transparent dressing film',
    'Sterile water for irrigation',
  ];

  it('no longer sends them with every case', () => {
    for (const m of SURGERY_MAGNITUDES) {
      const names = resolveBasePack(m).map((i) => i.name);
      for (const g of GONE) expect(names, `${g} at ${m}`).not.toContain(g);
    }
  });

  it('has dropped the magnitude-specific gauze bundle with them', () => {
    for (const m of SURGERY_MAGNITUDES) {
      const names = resolveBasePack(m).map((i) => i.name.toLowerCase());
      expect(names.some((n) => n.includes('gauze bundle')), m).toBe(false);
    }
  });
});

describe('how the three magnitudes relate', () => {
  it('never issues more for a smaller case', () => {
    const minor = at('MINOR');
    const inter = at('INTERMEDIATE');
    const major = at('MAJOR');
    for (const name of major.keys()) {
      const a = minor.get(name)!.quantity;
      const b = inter.get(name)!.quantity;
      const c = major.get(name)!.quantity;
      expect(a, `${name} minor<=intermediate`).toBeLessThanOrEqual(b);
      expect(b, `${name} intermediate<=major`).toBeLessThanOrEqual(c);
    }
  });

  it('never lists an item and asks for none of it', () => {
    // A "0 ×" line reads as an omission somebody should correct, and somebody
    // corrects it.
    for (const m of SURGERY_MAGNITUDES) {
      for (const i of resolveBasePack(m)) {
        expect(i.quantity, `${i.name} at ${m}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the same lines at every magnitude', () => {
    // A smaller case gets fewer, never a shorter list: an item that vanishes
    // at MINOR is an item nobody notices is missing.
    const names = (m: string) => resolveBasePack(m).map((i) => i.name).sort();
    expect(names('MINOR')).toEqual(names('MAJOR'));
    expect(names('INTERMEDIATE')).toEqual(names('MAJOR'));
  });

  it('keeps the resuscitation cannulae at full count for a minor case', () => {
    // 18G and 16G deliberately do not taper. A minor case that starts bleeding
    // needs them at the moment nobody can send out for one.
    const minor = at('MINOR');
    const major = at('MAJOR');
    for (const n of ['IV cannula, green 18G', 'IV cannula, grey (ash) 16G']) {
      expect(minor.get(n)!.quantity, n).toBe(major.get(n)!.quantity);
    }
  });

  it('does not taper what is issued as one container', () => {
    const minor = at('MINOR');
    for (const n of [
      'Povidone-Iodine Solution (10%) 100 ml', 'Chlorhexidine solution 500 ml',
      'Methylated spirit / 70% Isopropyl alcohol 100 ml', 'JIK (hypochlorite)',
      'Skin marker', 'Examination gloves',
    ]) {
      expect(minor.get(n)!.quantity, n).toBe(1);
    }
  });
});

describe('an unknown magnitude', () => {
  it('is packed as major, because under-supplying a theatre is worse', () => {
    const major = at('MAJOR');
    for (const bad of [null, undefined, '', 'HUGE', 'SUPER_MAJOR']) {
      const got = at(bad as unknown as string);
      for (const [name, line] of major) {
        expect(got.get(name)!.quantity, `${name} for ${String(bad)}`).toBe(line.quantity);
      }
    }
  });
});
