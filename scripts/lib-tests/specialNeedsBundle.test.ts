import { describe, it, expect } from 'vitest';
import {
  bundleFor,
  mergeLines,
  needsLocalAnaestheticChoice,
  NOT_IN_PICKER,
} from '../../src/lib/specialNeeds/bundle';
import { CATEGORY_LABELS } from '../../src/lib/specialNeeds/categories';
import { standardCatalogue } from '../../src/lib/specialNeeds/standardCatalogue';

// What this guards: a pack that is wrong in theatre. Every line the bundle
// omits is something a scrub nurse discovers is missing at eight in the
// morning, and every line it invents is stock off the shelf and money off
// the patient. Both failures are silent at booking.

const catalogue = standardCatalogue();

/** A bundle line can only be ordered if the catalogue actually has it. */
const inCatalogue = (category: string, name: string, size?: string) =>
  catalogue.some(
    (c) => c.category === category && c.name === name && (size === undefined || c.size === size),
  );

describe('every bundled line can actually be ordered', () => {
  it.each(['MINOR', 'INTERMEDIATE', 'MAJOR'])('%s', (magnitude) => {
    const lines = bundleFor({ magnitude });
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(
        inCatalogue(line.category, line.name, line.size),
        `${line.category} / ${line.name} / ${line.size ?? '-'} is not in the catalogue`,
      ).toBe(true);
    }
  });

  it('covers the transfusion set too', () => {
    const lines = bundleFor({ magnitude: 'MAJOR', transfusionAnticipated: true });
    for (const line of lines) {
      expect(inCatalogue(line.category, line.name, line.size), `${line.name} missing`).toBe(true);
    }
  });
});

describe('the staples a case cannot run without', () => {
  it.each(['MINOR', 'INTERMEDIATE', 'MAJOR'])('%s includes gloves, a syringe and a cannula', (magnitude) => {
    const lines = bundleFor({ magnitude });
    const categories = new Set(lines.map((l) => l.category));
    for (const needed of ['GLOVES', 'SYRINGE', 'IV_CANNULA', 'GIVING_SET', 'PLASTER', 'WATER_FOR_INJECTION']) {
      expect(categories.has(needed), `${magnitude} has no ${needed}`).toBe(true);
    }
  });

  // Magnitude deliberately does NOT scale these any more.
  //
  // It scales the base theatre pack — gowns, drapes, gauze — which is where
  // the difference between a minor and a major case actually shows. A minor
  // case still needs the range of cannula gauges on the trolley, because
  // which one goes in depends on the patient's veins and not on the size of
  // the operation. Two of every size, every time; the theatre tunes it per
  // magnitude in Settings if it disagrees.
  it('carries the same standard consumables whatever the size of the case', () => {
    const total = (m: string) => bundleFor({ magnitude: m }).reduce((n, l) => n + l.quantity, 0);
    expect(total('MINOR')).toBe(total('INTERMEDIATE'));
    expect(total('INTERMEDIATE')).toBe(total('MAJOR'));
    expect(total('MAJOR')).toBe(total('SUPER_MAJOR'));
  });

  it('carries two of every size, not one', () => {
    // One of something is no spare. The second is what a dropped or
    // contaminated item is replaced from without leaving theatre.
    const lines = bundleFor({ magnitude: 'MAJOR' });
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach((l) => expect(l.quantity).toBe(2));
  });

  it('offers every glove size and every cannula gauge the catalogue stocks', () => {
    const lines = bundleFor({ magnitude: 'MINOR' });
    const sizesIn = (category: string) =>
      new Set(lines.filter((l) => l.category === category).map((l) => l.size));

    // The scrub nurse's hand size is not known at booking, so all of them.
    expect(sizesIn('GLOVES')).toContain('7.5');
    expect(sizesIn('GLOVES').size).toBeGreaterThanOrEqual(6);
    // Which gauge goes in depends on the patient's veins.
    expect(sizesIn('IV_CANNULA')).toContain('16G');
    expect(sizesIn('IV_CANNULA').size).toBeGreaterThanOrEqual(6);
  });

  it('keeps the blood giving set out until blood is anticipated', () => {
    const plain = bundleFor({ magnitude: 'MAJOR' });
    expect(plain.some((l) => /blood/i.test(l.name))).toBe(false);

    const withBlood = bundleFor({ magnitude: 'MAJOR', transfusionAnticipated: true });
    expect(withBlood.some((l) => /blood giving set/i.test(l.name))).toBe(true);
    expect(withBlood.some((l) => l.category === 'TRANSFUSION_ADJUNCT')).toBe(true);
  });

  it('gives a major case two large-bore cannulae', () => {
    // One is access; two is access that survives losing one.
    const large = bundleFor({ magnitude: 'MAJOR' }).filter(
      (l) => l.category === 'IV_CANNULA' && (l.size === '16G' || l.size === '14G'),
    );
    expect(large.reduce((n, l) => n + l.quantity, 0)).toBeGreaterThanOrEqual(2);
  });
});

describe('an unknown magnitude bundles NOTHING', () => {
  it.each([null, undefined, '', '   ', 'HUGE', 'minor-ish'])('%s', (magnitude) => {
    // Guessing MINOR for a case whose size nobody recorded would hide the
    // upstream fault and ship a pack that may be wrong either way.
    expect(bundleFor({ magnitude: magnitude as never })).toEqual([]);
  });

  it('accepts the real values whatever their casing', () => {
    expect(bundleFor({ magnitude: 'major' }).length).toBeGreaterThan(0);
    expect(bundleFor({ magnitude: ' Major ' }).length).toBeGreaterThan(0);
  });
});

describe('transfusion adds the whole trolley, not just the blood set', () => {
  it('includes the four adjuncts', () => {
    const names = bundleFor({ magnitude: 'MAJOR', transfusionAnticipated: true }).map((l) => l.name);
    for (const drug of ['Hydrocortisone', 'Calcium gluconate', 'Promethazine', 'Frusemide']) {
      expect(names.some((n) => n.includes(drug)), `${drug} is missing`).toBe(true);
    }
  });

  it('adds a blood giving set', () => {
    const lines = bundleFor({ magnitude: 'MINOR', transfusionAnticipated: true });
    expect(lines.some((l) => l.name.includes('Blood giving set'))).toBe(true);
  });

  it('adds none of it when transfusion is not anticipated', () => {
    const lines = bundleFor({ magnitude: 'MAJOR' });
    expect(lines.some((l) => l.category === 'TRANSFUSION_ADJUNCT')).toBe(false);
    expect(lines.some((l) => l.name.includes('Blood giving set'))).toBe(false);
  });
});

describe('local anaesthetic is asked for, never assumed', () => {
  it('asks only when the anaesthesia is local', () => {
    expect(needsLocalAnaestheticChoice('LOCAL')).toBe(true);
    expect(needsLocalAnaestheticChoice('LOCAL_ANAESTHESIA')).toBe(true);
    expect(needsLocalAnaestheticChoice('local')).toBe(true);
    expect(needsLocalAnaestheticChoice('GENERAL')).toBe(false);
    expect(needsLocalAnaestheticChoice('SPINAL')).toBe(false);
    expect(needsLocalAnaestheticChoice(null)).toBe(false);
    expect(needsLocalAnaestheticChoice('')).toBe(false);
  });

  it('adds NOTHING when the surgeon has not chosen an agent', () => {
    // PLAIN AND WITH-ADRENALINE ARE NOT INTERCHANGEABLE. Adrenaline near a
    // digit is an ischaemic finger. Defaulting to either one is the single
    // most dangerous thing this file could do.
    const lines = bundleFor({ magnitude: 'MINOR', anaesthesiaType: 'LOCAL' });
    expect(lines.some((l) => l.category === 'LOCAL_ANAESTHETIC')).toBe(false);
  });

  it('adds exactly the agent named', () => {
    const chosen = 'Lignocaine (xylocaine) plain 1%';
    const lines = bundleFor({
      magnitude: 'MINOR',
      anaesthesiaType: 'LOCAL',
      localAnaestheticName: chosen,
    });
    const la = lines.filter((l) => l.category === 'LOCAL_ANAESTHETIC');
    expect(la).toHaveLength(1);
    expect(la[0].name).toBe(chosen);
    expect(la[0].name).not.toMatch(/adrenaline/i);
  });

  it('ignores a named agent when the anaesthesia is not local', () => {
    const lines = bundleFor({
      magnitude: 'MINOR',
      anaesthesiaType: 'GENERAL',
      localAnaestheticName: 'Lignocaine (xylocaine) plain 1%',
    });
    expect(lines.some((l) => l.category === 'LOCAL_ANAESTHETIC')).toBe(false);
  });

  it('never orders less than one vial', () => {
    for (const q of [0, -3, undefined]) {
      const lines = bundleFor({
        magnitude: 'MINOR',
        anaesthesiaType: 'LOCAL',
        localAnaestheticName: 'Bupivacaine plain 0.5%',
        localAnaestheticQuantity: q as never,
      });
      expect(lines.find((l) => l.category === 'LOCAL_ANAESTHETIC')?.quantity).toBe(1);
    }
  });

  it('offers both a plain and an adrenaline option for each agent', () => {
    const la = catalogue.filter((c) => c.category === 'LOCAL_ANAESTHETIC');
    expect(la.some((c) => /plain/i.test(c.name))).toBe(true);
    expect(la.some((c) => /adrenaline/i.test(c.name))).toBe(true);
  });
});

describe('duplicate lines are merged, not listed twice', () => {
  it('sums quantities for the same item', () => {
    const merged = mergeLines([
      { category: 'GIVING_SET', name: 'IV giving set', quantity: 2 },
      { category: 'GIVING_SET', name: 'IV giving set', quantity: 2 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(4);
  });

  it('keeps different sizes apart', () => {
    const merged = mergeLines([
      { category: 'SYRINGE', name: 'Syringe', size: '5ml', quantity: 1 },
      { category: 'SYRINGE', name: 'Syringe', size: '10ml', quantity: 1 },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('leaves no duplicates in a real bundle', () => {
    // The store receiving one line for four beats two lines for two, which
    // is how one of them gets picked and the other forgotten.
    const lines = bundleFor({ magnitude: 'MAJOR', transfusionAnticipated: true });
    const keys = lines.map((l) => `${l.category}|${l.name}|${l.size ?? ''}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not mutate its input', () => {
    const input = [{ category: 'SYRINGE', name: 'Syringe', size: '5ml', quantity: 1 }];
    mergeLines([...input, ...input]);
    expect(input[0].quantity).toBe(1);
  });
});

describe('what the case carries automatically is not also offered to pick', () => {
  it('keeps every bundled category out of the picker', () => {
    // Offering these in "Special consumables and drugs" as well as
    // bundling them is a way of ordering them twice and charging the
    // patient twice — once in the pack, once on top.
    const offered = new Set(CATEGORY_LABELS.map((c) => c.key));
    NOT_IN_PICKER.forEach((c) =>
      expect(offered.has(c), `${c} is both bundled and offered in the picker`).toBe(false),
    );
  });

  it('still offers the things that genuinely vary with the operation', () => {
    const offered = new Set(CATEGORY_LABELS.map((c) => c.key));
    ['SUTURE', 'MESH', 'DRAIN', 'URETHRAL_CATHETER', 'ANTIBIOTIC'].forEach((c) =>
      expect(offered.has(c), `${c} should still be pickable`).toBe(true),
    );
  });

  it('bundles every category it withholds from the picker', () => {
    // The dangerous direction: a category removed from the picker but not
    // actually bundled is one a case silently never gets.
    const bundled = new Set(bundleFor({ magnitude: 'MAJOR' }).map((l) => l.category));
    const conditional = new Set(
      bundleFor({ magnitude: 'MAJOR', transfusionAnticipated: true }).map((l) => l.category),
    );
    NOT_IN_PICKER.forEach((c) =>
      expect(
        bundled.has(c) || conditional.has(c),
        `${c} is hidden from the picker but never bundled`,
      ).toBe(true),
    );
  });
});
