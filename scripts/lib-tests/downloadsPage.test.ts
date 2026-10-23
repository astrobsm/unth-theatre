import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// The download page is the only route a person reaches BEFORE they have the
// app, so nothing on it can be checked by someone already inside the system.
// Every failure here is silent: the page renders, the button looks right, and
// the tap 404s on a phone in a corridor.
//
// The version, the release tag and the href are three places that say the same
// thing, and publishing a release means editing all three. These tests exist
// because editing two of them looks exactly like editing three.

const page = readFileSync(
  join(__dirname, '..', '..', 'src', 'app', 'downloads', 'page.tsx'),
  'utf8',
);
const route = readFileSync(
  join(__dirname, '..', '..', 'src', 'app', 'downloads', 'android', 'route.ts'),
  'utf8',
);

const routeTag = () => {
  const m = route.match(/const APK_TAG = '([^']+)'/);
  if (!m) throw new Error('the redirect route declares no APK_TAG');
  return m[1];
};

const literal = (name: string) => {
  const m = page.match(new RegExp(`const ${name} = '([^']+)'`));
  if (!m) throw new Error(`${name} is not declared as a plain string literal`);
  return m[1];
};

describe('download link — the places that must agree', () => {
  it('hangs the APK off a tag that matches the advertised version', () => {
    expect(literal('APK_TAG')).toBe(`android-v${literal('APK_VERSION')}`);
  });

  it('redirects to the same tag the page advertises', () => {
    // The page and the redirect declare the tag separately, so a release that
    // bumps one and not the other serves the PREVIOUS build from a link that
    // claims the current version — and nothing about it looks wrong.
    expect(routeTag()).toBe(literal('APK_TAG'));
  });

  it('sends staff to a hospital address, not to github.com', () => {
    // An address nobody recognises is where a careful person stops, and this
    // app already asks them to override two security warnings.
    expect(page).toContain('href="/downloads/android"');
    expect(page).not.toContain('href="https://github.com');
    expect(page).not.toContain('vercel.app');
  });

  it('keeps the binary out of this deployment', () => {
    // public/downloads/*.apk is gitignored precisely so the binary never
    // re-enters the repository; the route redirects to a release instead.
    expect(route).toContain('https://github.com/astrobsm/unth-theatre/releases/download/');
    expect(page).not.toMatch(/href=["']\/downloads\/[^"']*\.apk/);
  });
});

describe('fingerprint — the one thing a cautious person can verify', () => {
  it('publishes a full SHA-1, lowercase and colon-separated', () => {
    expect(literal('APK_SHA1')).toMatch(/^([0-9a-f]{2}:){19}[0-9a-f]{2}$/);
  });
});

describe('reachability', () => {
  it('stays outside the dashboard, so it needs no sign-in', () => {
    // If this ever moves under src/app/dashboard/, the page becomes a circle:
    // sign in to get the app you need in order to sign in.
    expect(() =>
      readFileSync(
        join(__dirname, '..', '..', 'src', 'app', 'dashboard', 'downloads', 'page.tsx'),
        'utf8',
      ),
    ).toThrow();
  });
});
