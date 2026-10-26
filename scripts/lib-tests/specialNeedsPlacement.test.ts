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

describe('the picker is on the step the case is booked from', () => {
  // WRONG TWICE. First on Team-beneath-consent, then on "Packs & sign-off"
  // because the step is named for packs. Both reports were the same
  // sentence: I could not find it.
  //
  // The deciding fact is not what a step is CALLED, it is where the "Book
  // now" button lives. Almost nobody walks to the end of a six-step wizard
  // before booking, so a section after that button is a section that does
  // not exist.
  // The rendered BUTTON, not the two comments that mention it by name —
  // indexOf would otherwise match prose near the top of the file.
  const bookNowAt = page.indexOf('Book now — put it on the theatre list');
  const pickerAt = page.indexOf('<SpecialNeedsPicker');

  it('appears before the booking button, not after it', () => {
    expect(bookNowAt, 'the "Book now" button is gone').toBeGreaterThan(-1);
    expect(pickerAt).toBeGreaterThan(-1);
    expect(pickerAt, 'the picker is rendered after the booking button').toBeLessThan(bookNowAt);
  });

  it('sits beside the Special Needs checkboxes', () => {
    // "Blood transfusion, diathermy, stirrups" and "2/0 vicryl, a 16Fr
    // Foley" are the same question at two levels of detail.
    const specialNeedsAt = page.indexOf('Blood Transfusion Required');
    expect(specialNeedsAt).toBeGreaterThan(-1);
    expect(Math.abs(pickerAt - specialNeedsAt)).toBeLessThan(4000);
  });

  it('is rendered exactly once', () => {
    // Two copies would both write to the same state.
    expect(page.split('<SpecialNeedsPicker').length - 1).toBe(1);
  });
});

describe('the blocking dialog can actually reach what it names', () => {
  it('names a field that exists', () => {
    // It referred to "consentUpload", which was not the name of any input,
    // so "Go to it" dead-ended on "that field is not on this part of the
    // form" — leaving somebody blocked with nowhere to go.
    const named = page.match(/name: '([a-zA-Z]+)', label: 'Signed consent'/);
    expect(named, 'the consent blocker entry is gone').toBeTruthy();
    expect(page, `no input is named ${named![1]}`).toContain(`name="${named![1]}"`);
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
