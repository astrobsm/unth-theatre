import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// THE ONE THING THAT MATTERS: fingerprint sign-in must never stand between a
// clinician and this system. It twice did — a full-screen gate asked for a
// fingerprint before the login page, and on a handset whose system prompt
// never appeared that was a dead screen in front of a hospital system.
//
// The gate is gone. Fingerprint is now an option BELOW the password form on
// the login page, which cannot block anything, because the password box is
// already on screen. These tests exist to keep it that way.

const root = (...p: string[]) => join(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(root(...p), 'utf8');

const lib = read('src', 'lib', 'native', 'biometric.ts');
const signin = read('src', 'components', 'FingerprintSignIn.tsx');
const enrol = read('src', 'components', 'BiometricEnrolment.tsx');
const loginPage = read('src', 'app', 'auth', 'login', 'page.tsx');
const providers = read('src', 'app', 'providers.tsx');
const dashboardLayout = read('src', 'app', 'dashboard', 'layout.tsx');
const setting = read('src', 'components', 'FingerprintSetting.tsx');
const settingsPage = read('src', 'app', 'dashboard', 'settings', 'page.tsx');

describe('nothing stands in front of the password box', () => {
  it('the blocking lock gate is gone, not merely unmounted', () => {
    // Left on disk it would be re-mounted by someone tidying up later.
    expect(existsSync(root('src', 'components', 'BiometricGate.tsx'))).toBe(false);
    expect(providers).not.toContain('BiometricGate');
  });

  it('the fingerprint option lives on the login page', () => {
    expect(loginPage).toContain('<FingerprintSignIn />');
    expect(loginPage).toContain("from '@/components/FingerprintSignIn'");
  });

  it('sits BELOW the sign-in button, not in front of the form', () => {
    const submitAt = loginPage.indexOf("{loading ? 'Signing in...' : 'Sign in'}");
    const fingerprintAt = loginPage.indexOf('<FingerprintSignIn />');
    expect(submitAt).toBeGreaterThan(-1);
    expect(fingerprintAt).toBeGreaterThan(submitAt);
  });

  it('hides itself rather than offering a button that cannot work', () => {
    expect(signin).toMatch(/if \(!show\) return null/);
    expect(signin).toMatch(/status\.available && enrolled/);
  });
});

describe('the feature can be found', () => {
  // The bug report was "I cannot find the biometric sign-in", and it was
  // right: the login button only appears once a phone is enrolled, and the
  // only way to enrol was a card shown once that vanished for good when
  // dismissed. Three dead ends and no door.
  it('has a permanent home in Settings', () => {
    expect(settingsPage).toContain('<FingerprintSetting />');
    expect(settingsPage).toContain("from '@/components/FingerprintSetting'");
  });

  it('can turn it on AND off from there', () => {
    expect(setting).toMatch(/Turn on fingerprint sign-in/);
    expect(setting).toMatch(/Turn off fingerprint sign-in/);
  });

  it('explains itself rather than hiding when unavailable', () => {
    // "No such setting" and "your phone has no fingerprints saved" look
    // identical when the answer is a missing row, and only one of them is
    // something the person can go and fix.
    expect(setting).toContain('status.reason');
    expect(setting).not.toMatch(/if \(!status\.available\) return null/);
  });

  it('does not grey out the button when the phone reports a problem', () => {
    // A disabled button with no explanation is what sent somebody looking
    // for a setting that was in front of them.
    expect(setting).toMatch(/disabled=\{busy\}/);
    expect(setting).not.toMatch(/disabled=\{busy \|\| !status/);
  });

  it('lets enabling here undo an earlier "Not now"', () => {
    expect(setting).toMatch(/removeItem\(DECLINED_KEY\)/);
  });

  it('turning it off revokes server-side as well as locally', () => {
    const at = setting.indexOf('const disable');
    expect(at).toBeGreaterThan(-1);
    const body = setting.slice(at, at + 900);
    expect(body).toContain('DELETE');
    expect(body).toContain('forgetCredential()');
  });

  it('proves the sensor works before enabling it', () => {
    const at = setting.indexOf('const enable');
    const body = setting.slice(at, setting.indexOf('const disable'));
    const verifyAt = body.indexOf('promptFingerprint');
    const storeAt = body.indexOf('storeCredential');
    expect(verifyAt).toBeGreaterThan(-1);
    expect(storeAt).toBeGreaterThan(verifyAt);
  });
});

describe('every failure says why', () => {
  it('maps the plugin error codes to plain language', () => {
    // Swallowing these into "that did not work" is what turned two real
    // failures into guesswork. 3 = no fingerprints saved, 2 = locked out,
    // 14 = no screen lock set: three different things to go and do.
    for (const code of [1, 2, 3, 4, 10, 14, 16]) {
      expect(lib, `error code ${code} has no message`).toMatch(
        new RegExp(`\\n\\s*${code}:\\s*'`),
      );
    }
  });

  it('checks availability before prompting, so "none enrolled" is reported as that', () => {
    const at = lib.indexOf('export async function promptFingerprint');
    const next = lib.indexOf('/** Store the credential', at);
    const body = lib.slice(at, next === -1 ? undefined : next);
    const statusAt = body.indexOf('biometricStatus()');
    const verifyAt = body.indexOf('verifyIdentity');
    expect(statusAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeGreaterThan(statusAt);
  });

  it('returns a message on every failing path, never a bare false', () => {
    expect(lib).toContain('export interface PromptResult');
    expect(lib).toMatch(/Promise<PromptResult>/);
  });

  it('shows the reason to the person', () => {
    expect(signin).toContain('result.message');
    expect(enrol).toContain('verified.message');
  });
});

describe('callers read .ok, not the object', () => {
  // `if (!result)` on an object is ALWAYS false, so a failure would read as
  // a success and sign nobody in while reporting nothing. TypeScript accepts
  // it happily, which is exactly why this has to be a test.
  it.each([
    ['FingerprintSignIn', signin],
    ['BiometricEnrolment', enrol],
  ])('%s', (_name, src) => {
    expect(src).toMatch(/\.ok\b/);
    expect(src).not.toMatch(/if \(!(verified|result)\)/);
  });
});

describe('the prompt can never hang for ever', () => {
  it('races the system prompt against a timeout', () => {
    // verifyIdentity does not always settle: on a real handset the prompt
    // never appeared and the promise never resolved or rejected.
    expect(lib).toContain('PROMPT_TIMEOUT_MS');
    expect(lib).toMatch(/Promise\.race/);
  });

  it('reports a timeout as a reason rather than as a rejected fingerprint', () => {
    expect(lib).toMatch(/timedOut[\s\S]{0,400}did not open/);
  });
});

describe('a credential the server rejects is thrown away', () => {
  it('forgets it when sign-in is refused', () => {
    const at = signin.indexOf('res?.error');
    expect(at).toBeGreaterThan(-1);
    expect(signin.slice(at, at + 700)).toContain('forgetCredential()');
  });

  it('forgets it when the Keystore turns out to be empty', () => {
    const at = signin.indexOf('!credential');
    expect(at).toBeGreaterThan(-1);
    expect(signin.slice(at, at + 400)).toContain('forgetCredential()');
  });
});

describe('enrolment leaves nothing behind on a half-finished setup', () => {
  it('verifies the fingerprint BEFORE writing the secret to the device', () => {
    const verifyAt = enrol.indexOf('promptFingerprint');
    const storeAt = enrol.indexOf('storeCredential');
    expect(verifyAt).toBeGreaterThan(-1);
    expect(storeAt).toBeGreaterThan(verifyAt);
  });

  it('cleans up if the device will not store it', () => {
    const at = enrol.indexOf('!stored');
    expect(at).toBeGreaterThan(-1);
    expect(enrol.slice(at, at + 700)).toContain('forgetCredential()');
  });

  it('only offers itself to someone already signed in', () => {
    expect(enrol).toContain("status !== 'authenticated'");
  });
});

describe('signing out actually signs you out', () => {
  it('revokes the credential server-side and forgets it locally', () => {
    expect(dashboardLayout).toMatch(/\/api\/device-credentials[\s\S]{0,120}DELETE/);
    expect(dashboardLayout).toContain('forgetCredential');
  });
});

describe('the device wrapper never throws at its callers', () => {
  it('returns a value on every path instead of propagating plugin errors', () => {
    for (const fn of [
      'biometricStatus',
      'hasStoredCredential',
      'promptFingerprint',
      'storeCredential',
      'readCredential',
    ]) {
      const at = lib.indexOf(`export async function ${fn}`);
      expect(at, `${fn} is missing`).toBeGreaterThan(-1);
      // Slice to the next export rather than a fixed window: these grow, and
      // a window that silently falls short would pass for the wrong reason.
      const next = lib.indexOf('export async function', at + 1);
      const body = lib.slice(at, next === -1 ? undefined : next);
      expect(body, `${fn} has no catch`).toContain('catch');
    }
  });

  it('keeps the secret out of browser storage', () => {
    // Keystore only. localStorage is plain text and readable by anything
    // that reaches the WebView. The word appears in a comment explaining
    // why, so match calls rather than mentions.
    expect(lib).not.toMatch(/localStorage\s*\.\s*(set|get)Item/);
    expect(lib).not.toMatch(/sessionStorage\s*\.\s*(set|get)Item/);
    expect(lib).toContain('setCredentials');
  });
});
