import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// The alert panel was 384px wide (w-96), anchored to the bell at the top
// right of a ~360px phone screen. It therefore hung off the LEFT edge and
// every line lost its first few words: "...ee Amputation", "...a Chiemerie
// in". It looked like a cosmetic quirk. It meant a surgeon could not see
// which patient an alert was about.
//
// Fixed-pixel widths on anything anchored to a screen edge are the whole
// category of bug here, so this guards the category rather than the one
// instance.

const bell = readFileSync(
  join(__dirname, '..', '..', 'src', 'components', 'NotificationBell.tsx'),
  'utf8',
);

/** The dropdown panel's own class list. */
const panel = (() => {
  const at = bell.indexOf('{isOpen && (');
  const open = bell.indexOf('className="', at);
  return bell.slice(open + 11, bell.indexOf('"', open + 11));
})();

describe('the alert panel fits the screen it is shown on', () => {
  it('is positioned against the VIEWPORT on a phone, not against the bell', () => {
    // THE ANCHOR WAS THE BUG, NOT THE WIDTH. `absolute right-0` pins the
    // panel's right edge to the bell, and the bell sits mid-header with the
    // role chip beside it — so the panel started off-screen to the left.
    // Clamping the width could not fix that, and did not.
    expect(panel).toContain('fixed');
    expect(panel).toContain('left-3');
    expect(panel).toContain('right-3');
  });

  it('returns to an anchored dropdown on a wide screen', () => {
    expect(panel).toContain('sm:absolute');
    expect(panel).toContain('sm:right-0');
    expect(panel).toContain('sm:w-96');
    // Without this the mobile `left-3` keeps applying and the desktop panel
    // stretches the full width of the monitor.
    expect(panel).toContain('sm:left-auto');
  });

  it('has no unconditional fixed pixel width', () => {
    // A bare w-<n> outside a breakpoint reintroduces the original fault on
    // the next narrower handset.
    expect(panel).not.toMatch(/(^|\s)w-\d+(\s|$)/);
  });

  it('still limits its height, so a long list scrolls instead of growing', () => {
    expect(panel).toMatch(/max-h-\[\d+vh\]/);
  });
});

describe('the text is readable, not clipped', () => {
  it('never truncates an alert', () => {
    // A truncated line hid the patient's name — "...ee Amputation" instead
    // of who it was for. Wrapping costs a line and saves the point of the
    // alert.
    expect(bell).not.toContain('truncate');
  });

  it('lets titles and messages wrap', () => {
    expect(bell).toContain('break-words');
  });
});
