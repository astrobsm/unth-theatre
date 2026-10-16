/**
 * Can you actually reach the bottom of the actions menu?
 *
 * Two bugs in a row said no, and neither was visible in a diff:
 *
 *   The menu was 70vh tall wherever its button was, so for a row low down the
 *   page the last group — the one holding "Cancel this case" — ran off the
 *   bottom of the screen.
 *
 *   Reaching it meant scrolling, and a capture-phase scroll listener closed
 *   the menu the instant anybody tried.
 *
 * The scroll half is fixed in the component. This covers the geometry: the
 * menu must never be taller than the room it has, must open upwards for a
 * button near the bottom, and must stay on screen horizontally at the right
 * edge of a wide table.
 */
import { describe, expect, it } from 'vitest';

import {
  placeMenu, MENU_WIDTH, GAP, MARGIN, FLIP_BELOW, MIN_HEIGHT,
} from '../../src/lib/ui/menuPlacement';

/** A typical laptop window. */
const LAPTOP = { width: 1440, height: 800 };

describe('a button with room below it', () => {
  const button = { top: 100, bottom: 130, right: 1400 };

  it('opens downwards', () => {
    const p = placeMenu(button, LAPTOP);
    expect(p.up).toBe(false);
    expect(p.top).toBe(130 + GAP);
  });

  it('is only as tall as the room underneath', () => {
    const p = placeMenu(button, LAPTOP);
    // 800 - 130 - 6 - 12 = 652
    expect(p.maxHeight).toBe(652);
  });

  it('never extends past the bottom of the window', () => {
    // THE FIRST BUG, stated as an invariant. 70vh of an 800px window is
    // 560px, which from a button at y=130 reaches 696 — fine here, but at
    // y=400 it reached 966 and ran 166px off the screen.
    for (const bottom of [130, 300, 400, 500, 600, 700]) {
      const p = placeMenu({ top: bottom - 30, bottom, right: 1400 }, LAPTOP);
      expect(p.top + p.maxHeight, `button at ${bottom}`)
        .toBeLessThanOrEqual(LAPTOP.height - MARGIN + 1);
    }
  });
});

describe('a button near the bottom of the page', () => {
  // The last row of a long surgery list — exactly where somebody reaches for
  // "Cancel this case".
  const button = { top: 720, bottom: 750, right: 1400 };

  it('opens upwards, where the room is', () => {
    const p = placeMenu(button, LAPTOP);
    expect(p.up).toBe(true);
  });

  it('sits above the button, not over it', () => {
    const p = placeMenu(button, LAPTOP);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(button.top - GAP + 1);
  });

  it('uses the room above', () => {
    const p = placeMenu(button, LAPTOP);
    // 720 - 6 - 12 = 702
    expect(p.maxHeight).toBe(702);
  });

  it('stays inside the top of the window', () => {
    const p = placeMenu(button, LAPTOP);
    expect(p.top).toBeGreaterThanOrEqual(MARGIN);
  });
});

describe('when to flip and when not to', () => {
  it('does not flip while there is comfortable room below', () => {
    // Exactly at the threshold: FLIP_BELOW of room is still enough.
    const bottom = LAPTOP.height - FLIP_BELOW - GAP - MARGIN;
    expect(placeMenu({ top: bottom - 30, bottom, right: 1400 }, LAPTOP).up).toBe(false);
  });

  it('flips once the room below drops under the threshold', () => {
    const bottom = LAPTOP.height - FLIP_BELOW - GAP - MARGIN + 1;
    expect(placeMenu({ top: bottom - 30, bottom, right: 1400 }, LAPTOP).up).toBe(true);
  });

  it('does not flip when there is even less room above', () => {
    // A short window where both are cramped. Flipping would cover what the
    // person was looking at and gain nothing.
    const squat = { width: 1440, height: 300 };
    const p = placeMenu({ top: 40, bottom: 70, right: 1400 }, squat);
    expect(p.up).toBe(false);
  });
});

describe('a cramped window', () => {
  it('never produces a scroll window too small to use', () => {
    const tiny = { width: 400, height: 220 };
    for (const bottom of [20, 100, 180, 210]) {
      const p = placeMenu({ top: Math.max(0, bottom - 30), bottom, right: 390 }, tiny);
      expect(p.maxHeight, `button at ${bottom}`).toBeGreaterThanOrEqual(MIN_HEIGHT);
    }
  });
});

describe('staying on screen sideways', () => {
  it('right-aligns to the button', () => {
    // The actions column is at the right edge of a wide table; a left-aligned
    // menu would open off the page.
    const p = placeMenu({ top: 100, bottom: 130, right: 1400 }, LAPTOP);
    expect(p.left).toBe(1400 - MENU_WIDTH);
  });

  it('does not run off the right edge', () => {
    const p = placeMenu({ top: 100, bottom: 130, right: 1439 }, LAPTOP);
    expect(p.left + MENU_WIDTH).toBeLessThanOrEqual(LAPTOP.width - MARGIN);
  });

  it('does not run off the left edge on a narrow phone', () => {
    // 320px wide is narrower than the menu itself.
    const phone = { width: 320, height: 640 };
    const p = placeMenu({ top: 100, bottom: 130, right: 300 }, phone);
    expect(p.left).toBeGreaterThanOrEqual(MARGIN);
  });

  it('keeps the left edge on screen whatever the button does', () => {
    for (const right of [0, 50, 300, 700, 1200, 1440, 2000]) {
      const p = placeMenu({ top: 100, bottom: 130, right }, LAPTOP);
      expect(p.left, `right=${right}`).toBeGreaterThanOrEqual(MARGIN);
    }
  });
});

describe('the numbers are the ones stated', () => {
  it('keeps the menu wide enough for the action names', () => {
    expect(MENU_WIDTH).toBe(300);
  });

  it('keeps a usable floor and a sane flip threshold', () => {
    expect(MIN_HEIGHT).toBeLessThan(FLIP_BELOW);
  });
});
