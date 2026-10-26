import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// "I didn't find the place to prescribe the consumables and drugs."
//
// It was there — on the Team step, beneath the consent upload, because
// magnitude and anaesthesia type are answered by then so the standard pack
// arrives pre-filled. All true, and beside the point: the wizard has a step
// called "Packs & sign-off", and somebody looking for where to prescribe
// consumables goes there.
//
// A feature on the wrong step is a feature that does not exist.

const page = readFileSync(
  join(__dirname, '..', '..', 'src', 'app', 'dashboard', 'surgeries', 'new', 'page.tsx'),
  'utf8',
);
const picker = readFileSync(
  join(__dirname, '..', '..', 'src', 'components', 'SpecialNeedsPicker.tsx'),
  'utf8',
);

const STEP_NAMES = (() => {
  const m = page.match(/const STEP_NAMES = \[(.*?)\]/s);
  if (!m) throw new Error('STEP_NAMES is gone');
  return m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
})();

describe('the picker is where somebody would look for it', () => {
  it('sits on the step named for packs', () => {
    const packsStep = STEP_NAMES.findIndex((n) => /pack/i.test(n));
    expect(packsStep, 'no step mentions packs any more').toBeGreaterThan(-1);

    const at = page.indexOf('<SpecialNeedsPicker');
    expect(at).toBeGreaterThan(-1);
    // The wrapper immediately above it must gate on that step.
    const before = page.slice(Math.max(0, at - 400), at);
    expect(before, `the picker is not on the "${STEP_NAMES[packsStep]}" step`).toContain(
      `stepClass(${packsStep})`,
    );
  });

  it('is rendered exactly once', () => {
    // Two copies on two steps would double-add to the same state.
    expect(page.split('<SpecialNeedsPicker').length - 1).toBe(1);
  });

  it('sits beside the existing pack controls', () => {
    const pickerAt = page.indexOf('<SpecialNeedsPicker');
    // The HEADING, not the comment above the picker that happens to name
    // it — indexOf would otherwise find my own prose and pass trivially.
    const applyPackAt = page.indexOf('>Apply a pack<');
    expect(applyPackAt, 'the "Apply a pack" heading is gone').toBeGreaterThan(-1);
    expect(pickerAt).toBeLessThan(applyPackAt);
  });
});

describe('an unloaded catalogue says so', () => {
  it('distinguishes "not loaded" from "broken"', () => {
    // An empty dropdown looks exactly like a missing feature. It is the
    // same report either way: "I could not find it."
    expect(picker).toMatch(/catalogue has not been loaded yet/i);
  });

  it('says where to fix it', () => {
    expect(picker).toMatch(/Settings/);
    expect(picker).toMatch(/Special requirements catalogue/);
  });

  it('does not block the booking over it', () => {
    // The copy wraps across lines in the source, so match loosely.
    expect(picker).toMatch(/still\s+book[\s\S]{0,20}this case/i);
  });
});
