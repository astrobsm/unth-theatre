import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// THE APK IS A SHELL, NOT THE APP.
//
// capacitor.config.ts points server.url at the live site, and webDir is a
// three-file stub. So almost every change ships over the web, and a new
// release delivers essentially nothing on its own.
//
// "Check for Updates" used to report the APK version on Android and RETURN,
// never touching the web layer. The card therefore said "Android app is up
// to date. Installed version: 1.6." while the phone ran weeks-old
// JavaScript — and somebody reasonably concluded they already had the fix
// they had been waiting three releases for.

const read = (...p: string[]) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');

const settings = read('src', 'app', 'dashboard', 'settings', 'page.tsx');
const capacitor = read('capacitor.config.ts');

describe('the premise: the app is served, not shipped', () => {
  it('still loads from a remote url', () => {
    // If this ever changes, the reasoning below changes with it.
    expect(capacitor).toMatch(/url:\s*LANDING_URL/);
    expect(capacitor).toMatch(/webDir:\s*'mobile-shell'/);
  });
});

describe('checking for updates checks the part that actually changes', () => {
  it('refreshes the web layer through one shared path', () => {
    expect(settings).toContain('const refreshWebApp');
  });

  it('does that on Android too, not only on the web', () => {
    // The native branch returns early. The refresh must happen BEFORE that
    // return, or Android silently never updates its app code.
    const nativeBranch = settings.indexOf('if (isNativeAndroid)');
    const nativeReturn = settings.indexOf('return;', nativeBranch);
    const refreshCall = settings.indexOf('await refreshWebApp()', nativeBranch);
    expect(nativeBranch).toBeGreaterThan(-1);
    expect(refreshCall).toBeGreaterThan(-1);
    expect(refreshCall, 'the web refresh is skipped on Android').toBeLessThan(nativeReturn);
  });

  it('clears caches so the reload fetches the new build', () => {
    // Swapping the worker without dropping caches can serve the old page
    // straight back, which looks exactly like the update not working.
    expect(settings).toMatch(/caches\.keys\(\)/);
    expect(settings).toMatch(/caches\.delete/);
  });

  it('never reports "up to date" over a stale app', () => {
    // The old message named only the APK version. It must now distinguish
    // the shell from the content.
    expect(settings).toMatch(/Android shell/);
    expect(settings).toMatch(/app content/i);
  });
});
