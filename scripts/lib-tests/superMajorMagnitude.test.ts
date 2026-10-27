import { describe, it, expect } from 'vitest';
import { bundleFor, type Magnitude } from '../../src/lib/specialNeeds/bundle';
import { toPackMagnitude } from '../../src/lib/baseConsumablePack';
import { suturesFor } from '../../src/lib/packs/standards';
import { fromMagnitude } from '../../src/lib/analytics/caseMix';
import { MAGNITUDES } from '../../src/lib/specialNeeds/pricing';

/**
 * SUPER_MAJOR became bookable, and the dangerous thing about adding a value
 * to an enum is not the code that handles it — it is the code that does not.
 *
 * Several modules sized a case with `magnitude === 'MAJOR' ? 1 :
 * magnitude === 'INTERMEDIATE' ? 0.7 : 0.5`. A fourth value falls off the
 * end of that chain and lands on 0.5, so the longest operation in the
 * theatre was issued the MINOR pack. Nothing throws. The pack is simply
 * short, and the first anybody knows is a scrub nurse opening it.
 *
 * These tests fix the direction of failure: unknown and new magnitudes must
 * round UP, because over-supplying a theatre is recoverable and
 * under-supplying it is not.
 */

describe('every bookable magnitude carries something', () => {
  it.each(MAGNITUDES)('%s has a bundle', (m) => {
    const lines = bundleFor({ magnitude: m });
    expect(lines.length).toBeGreaterThan(0);
  });

  it('still refuses to invent a bundle for a magnitude nobody recorded', () => {
    // An absence means something upstream went wrong, and guessing MINOR
    // would hide it.
    expect(bundleFor({ magnitude: null })).toEqual([]);
    expect(bundleFor({ magnitude: 'NONSENSE' })).toEqual([]);
  });

  it('gives a super major at least as much as a major, line for line', () => {
    const qty = (m: Magnitude) => {
      const out = new Map<string, number>();
      bundleFor({ magnitude: m }).forEach((l) =>
        out.set(`${l.category}\u0000${l.name}\u0000${l.size ?? ''}`, l.quantity),
      );
      return out;
    };
    const major = qty('MAJOR');
    const superMajor = qty('SUPER_MAJOR');

    major.forEach((count, key) => {
      const mine = superMajor.get(key);
      expect(mine, `super major is missing ${key}`).toBeDefined();
      expect(mine!, `super major has less ${key} than major`).toBeGreaterThanOrEqual(count);
    });
  });
});

describe('pack sizing fails upwards, never downwards', () => {
  it('maps a super major onto the largest pack size, not the smallest', () => {
    expect(toPackMagnitude('SUPER_MAJOR')).toBe('MAJOR');
  });

  it.each([null, undefined, '', 'WHATEVER_COMES_NEXT'])(
    'maps %s to MAJOR rather than guessing small',
    (v) => {
      expect(toPackMagnitude(v as never)).toBe('MAJOR');
    },
  );

  it('passes the three known sizes through untouched', () => {
    expect(toPackMagnitude('MINOR')).toBe('MINOR');
    expect(toPackMagnitude('INTERMEDIATE')).toBe('INTERMEDIATE');
    expect(toPackMagnitude('MAJOR')).toBe('MAJOR');
  });

  it('does not issue a super major case the minor suture scale', () => {
    // The original bug, stated as the number it produced.
    const atSuperMajor = suturesFor('GENERAL', 'SUPER_MAJOR' as never);
    const atMajor = suturesFor('GENERAL', 'MAJOR');
    const atMinor = suturesFor('GENERAL', 'MINOR');

    const total = (rows: { quantity: number }[]) =>
      rows.reduce((a, r) => a + r.quantity, 0);

    expect(total(atSuperMajor)).toBe(total(atMajor));
    expect(total(atSuperMajor)).toBeGreaterThan(total(atMinor));
  });
});

describe('a booked super major still counts in the case mix', () => {
  it('bands as Major rather than dropping out entirely', () => {
    // Returning null would lose the hospital's heaviest work from the
    // figures altogether.
    expect(fromMagnitude('SUPER_MAJOR')).toBe('Major');
  });

  it('does not let a booking claim Supermajor', () => {
    // Supermajor is measured after the fact — over four hours, over a
    // litre of blood, ICU expected. A booking is a prediction and may not
    // assert it.
    expect(fromMagnitude('SUPER_MAJOR')).not.toBe('Supermajor');
    expect(fromMagnitude('MAJOR')).not.toBe('Supermajor');
  });
});
