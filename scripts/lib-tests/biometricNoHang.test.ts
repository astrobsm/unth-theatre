import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// LEARNED TWICE, SO GUARDED AS A CATEGORY.
//
// First verifyIdentity never settled and left a lock screen on "Scanning...".
// A timeout was added around that one call. Then "Turn on fingerprint
// sign-in" hung on "Setting up..." — because isAvailable and getCredentials
// were still unguarded and run BEFORE the part that had the timeout, and
// because fetch has no default timeout at all.
//
// Guarding the call that bit you is not the same as guarding the class of
// fault. These tests check the class: every native call and every network
// call in this feature has a deadline.

const read = (...p: string[]) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');

const lib = read('src', 'lib', 'native', 'biometric.ts');
const setting = read('src', 'components', 'FingerprintSetting.tsx');
const enrol = read('src', 'components', 'BiometricEnrolment.tsx');
const signin = read('src', 'components', 'FingerprintSignIn.tsx');

describe('no native call can hang', () => {
  it('has one guard helper rather than per-call patches', () => {
    expect(lib).toContain('PLUGIN_TIMEOUT_MS');
    expect(lib).toMatch(/async function guarded</);
  });

  it('routes every plugin method through it', () => {
    // Every call into the plugin must sit inside a guarded() closure. Some
    // are written `guarded('x', () => nb.foo())` and some wrap a block, so
    // look back from each call for the nearest guarded( — a bare await with
    // no guard above it in the same expression is the fault being caught.
    for (const method of ['isAvailable', 'getCredentials', 'setCredentials', 'deleteCredentials']) {
      // Plain string scanning, not a RegExp: `nb.${method}(` inside a
      // template literal loses its escapes and the bare "(" opens a group,
      // which throws rather than failing — a test that errors is not a test
      // that passes, and it took a minute to see which.
      const needle = `nb.${method}(`;
      let found = 0;
      for (let i = lib.indexOf(needle); i !== -1; i = lib.indexOf(needle, i + 1)) {
        found += 1;
        const before = lib.slice(Math.max(0, i - 320), i);
        expect(before, `nb.${method} is called outside guarded()`).toContain('guarded(');
      }
      expect(found, `nb.${method} is never called`).toBeGreaterThan(0);
    }
  });

  it('still races the fingerprint prompt separately', () => {
    // That one needs a much longer deadline than the others, because a
    // person is standing there deciding.
    expect(lib).toContain('PROMPT_TIMEOUT_MS');
    expect(lib).toMatch(/Promise\.race/);
  });
});

describe('no network call can hang', () => {
  it.each([
    ['FingerprintSetting', setting],
    ['BiometricEnrolment', enrol],
  ])('%s gives every fetch a deadline', (_name, src) => {
    const fetches = src.match(/fetch\(/g)?.length ?? 0;
    const deadlines = src.match(/AbortSignal\.timeout\(/g)?.length ?? 0;
    expect(fetches).toBeGreaterThan(0);
    expect(deadlines, 'a fetch is missing AbortSignal.timeout').toBeGreaterThanOrEqual(fetches);
  });

  it('names the network when it is the network', () => {
    // "Something went wrong" sends somebody to the theatre manager. "The
    // connection was too slow" sends them to a better signal.
    expect(setting).toContain('TimeoutError');
    expect(setting).toMatch(/connection was too slow/);
  });
});

describe('no screen is left busy for ever', () => {
  it.each([
    ['FingerprintSetting', setting],
    ['BiometricEnrolment', enrol],
    ['FingerprintSignIn', signin],
  ])('%s always clears its busy state', (_name, src) => {
    // Either a finally block, or setBusy(false) on every branch. A finally
    // is the only one that survives an exception nobody predicted.
    const hasFinally = /finally\s*\{[\s\S]{0,120}setBusy\(false\)/.test(src);
    const clearsInCatch = /catch[\s\S]{0,300}setBusy\(false\)/.test(src);
    expect(hasFinally || clearsInCatch, 'busy state can stick').toBe(true);
  });
});
