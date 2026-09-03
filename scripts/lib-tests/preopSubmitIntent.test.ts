import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The pre-operative review saved itself while the anaesthetist was still
 * choosing anaesthesia packs.
 *
 * Step 7 is the LAST step, and it holds the pack picker — whose "view pack
 * content" modal carries quantity, dose and item-name inputs. Those inputs are
 * inside the review's own <form>, and a browser submits a form when Enter is
 * pressed in a text input. So adjusting a quantity and pressing Enter created
 * the review and sent the prescription to Pharmacy, mid-edit, with whatever had
 * been picked so far.
 *
 * The form already guarded the EARLIER steps against exactly this — "Enter
 * pressed in a text field partway through must advance the section" — but the
 * last step had nothing, because that is where submitting is supposed to
 * happen.
 *
 * Both layers are pinned here. Neither is provable by a pure unit test, and
 * both are one careless edit away from returning.
 */
const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

describe('creating the review takes a deliberate press', () => {
  const src = read('src/app/dashboard/preop-reviews/new/page.tsx');

  it('refuses a submit that no button asked for', () => {
    expect(src).toContain('if (!submitIntent.current) return;');
  });

  it('clears the intention immediately, so it cannot be reused', () => {
    // Otherwise a stray Enter after one real submit would create a second.
    expect(src).toMatch(/if \(!submitIntent\.current\) return;\s*\r?\n\s*submitIntent\.current = false;/);
  });

  it('sets it only from the final button', () => {
    expect(src).toContain('onClick={() => { submitIntent.current = true; }}');
    // One place only. A second setter is a second way in.
    expect(src.split('submitIntent.current = true').length - 1).toBe(1);
  });

  it('still advances the section when Enter is pressed earlier in the form', () => {
    // The original guard must survive — it is what stops a half-built
    // prescription reaching Pharmacy from step 3.
    expect(src).toContain('if (step < LAST_STEP)');
  });
});

describe('the pack picker never submits the form around it', () => {
  const src = read('src/components/AnaesthesiaPackPicker.tsx');

  it('swallows Enter from its inputs', () => {
    expect(src).toContain("if (e.key === 'Enter' && el.tagName === 'INPUT') e.preventDefault();");
  });

  it('leaves textareas alone, so notes keep their newlines', () => {
    expect(src).not.toContain("el.tagName === 'TEXTAREA'");
  });

  it('keeps every one of its buttons out of the submit path', () => {
    // A <button> with no type is a submit button. In a component that lives
    // inside someone else's form, that is a booking nobody meant to make.
    const buttons = src.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(b, `button without type="button": ${b}`).toContain('type="button"');
    }
  });
});
