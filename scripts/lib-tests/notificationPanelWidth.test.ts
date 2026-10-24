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
  it('clamps its width to the viewport', () => {
    expect(panel).toContain('w-[calc(100vw-1.5rem)]');
  });

  it('still caps at the old desktop width', () => {
    // The fix must not make the panel enormous on a monitor.
    expect(panel).toContain('max-w-[24rem]');
  });

  it('has no unconditional fixed pixel width', () => {
    // w-96 is what caused this. Any bare w-<n> on an edge-anchored panel
    // reintroduces it on the next narrower handset.
    expect(panel).not.toMatch(/(^|\s)w-\d+(\s|$)/);
  });

  it('is still anchored to the bell rather than floating', () => {
    expect(panel).toContain('absolute');
    expect(panel).toContain('right-0');
  });

  it('still limits its height, so a long list scrolls instead of growing', () => {
    expect(panel).toContain('max-h-[80vh]');
  });
});
