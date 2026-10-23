import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// THE ONE THING THAT MATTERS: fingerprint sign-in must never become the only
// way in. A surgeon with wet hands, a cracked sensor or a phone that has
// forgotten its prints has to reach a password box, in a theatre, now.
//
// That property lives in control flow rather than in a pure function, so
// these read the source. A source-reading test is weaker than a behavioural
// one, but the alternative here is no test at all, and the failure being
// guarded is not "the gate is wrong" — it is "the gate is a locked door".

const read = (...p: string[]) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');

const gate = read('src', 'components', 'BiometricGate.tsx');
const enrol = read('src', 'components', 'BiometricEnrolment.tsx');
const lib = read('src', 'lib', 'native', 'biometric.ts');
const dashboardLayout = read('src', 'app', 'dashboard', 'layout.tsx');

describe('the lock screen always has a way past it', () => {
  it('offers the password before any failure, not after one', () => {
    expect(gate).toContain('Use password instead');
    // The escape hatch must not be rendered conditionally on having already
    // failed — making someone fail first to discover it is the bug.
    expect(gate).not.toMatch(/\{\s*failed\s*&&[\s\S]{0,200}Use password instead/);
  });

  it('wires that button straight to opening the app', () => {
    expect(gate).toMatch(/onClick=\{markOpen\}/);
  });

  it('never disables the escape hatch', () => {
    // Being left tapping a greyed-out button is how the first real handset
    // got stuck: "Scanning..." with nothing behind it.
    const at = gate.indexOf('Use password instead');
    const start = gate.lastIndexOf('<button', at);
    expect(gate.slice(start, at)).not.toContain('disabled');
  });

  it('fails OPEN on an unexpected error, never closed', () => {
    // A plugin error must not lock the theatre out of its own system.
    expect(gate).toMatch(/catch[\s\S]{0,200}markOpen\(\)/);
  });

  it('opens when biometrics are unavailable or the phone is not enrolled', () => {
    expect(gate).toMatch(/if \(!available \|\| !enrolled\)[\s\S]{0,80}markOpen\(\)/);
  });
});

describe('a credential the server rejects is thrown away', () => {
  it('forgets it when sign-in is refused', () => {
    // Keeping it would make every future cold start fail at the fingerprint
    // instead of going to the password box that would actually work.
    const at = gate.indexOf('res?.error');
    expect(at, 'no refusal branch').toBeGreaterThan(-1);
    expect(gate.slice(at, at + 900)).toContain('forgetCredential()');
  });

  it('forgets it when the Keystore turns out to be empty', () => {
    expect(gate).toMatch(/!credential[\s\S]{0,200}forgetCredential\(\)/);
  });
});

describe('enrolment leaves nothing behind on a half-finished setup', () => {
  it('verifies the fingerprint BEFORE writing the secret to the device', () => {
    const verifyAt = enrol.indexOf('promptFingerprint');
    const storeAt = enrol.indexOf('storeCredential');
    expect(verifyAt).toBeGreaterThan(-1);
    expect(storeAt).toBeGreaterThan(-1);
    expect(verifyAt, 'the secret is stored before the fingerprint is confirmed').toBeLessThan(storeAt);
  });

  it('cleans up if the device will not store it', () => {
    // Otherwise the server believes the phone is enrolled and the phone has
    // nothing — every cold start then fails at the fingerprint.
    const at = enrol.indexOf('!stored');
    expect(at, 'no store-failure branch').toBeGreaterThan(-1);
    expect(enrol.slice(at, at + 700)).toContain('forgetCredential()');
  });

  it('only offers itself to someone already signed in', () => {
    expect(enrol).toContain("status !== 'authenticated'");
  });

  it('remembers a refusal, so it is asked once and not every launch', () => {
    expect(enrol).toContain('orm.biometric.declined');
    expect(enrol).toMatch(/const DECLINED_KEY = 'orm\.biometric\.declined'/);
    expect(enrol).toMatch(/localStorage\.setItem\(DECLINED_KEY/);
  });
});

describe('the two storages are not interchangeable', () => {
  it('uses sessionStorage for the per-launch unlock', () => {
    // localStorage here would survive the app being killed and the gate
    // would never ask again — which is exactly the behaviour that was asked
    // for and would silently not happen.
    expect(gate).toMatch(/sessionStorage\.setItem\(UNLOCKED_KEY/);
    expect(gate).not.toContain("localStorage.setItem('orm.biometric.unlocked'");
  });
});

describe('signing out actually signs you out', () => {
  it('revokes the credential server-side and forgets it locally', () => {
    // Without both, "Sign Out" is cosmetic: the next cold start reads the
    // Keystore and signs the same person back in.
    expect(dashboardLayout).toMatch(/\/api\/device-credentials[\s\S]{0,120}DELETE/);
    expect(dashboardLayout).toContain('forgetCredential');
    expect(dashboardLayout).toContain("sessionStorage.removeItem('orm.biometric.unlocked')");
  });
});

describe('the prompt can never hang for ever', () => {
  it('races the system prompt against a timeout', () => {
    // verifyIdentity does not always settle — a back-gesture dismissal, or a
    // prompt that never displays, left the lock screen saying "Scanning..."
    // with no way forward. On a hospital system that is a locked door, not a
    // hung promise. This happened on a real handset.
    expect(lib).toContain('PROMPT_TIMEOUT_MS');
    expect(lib).toMatch(/Promise\.race/);
  });

  it('treats a timeout as a refusal, so the caller reaches the password', () => {
    const at = lib.indexOf('export async function promptFingerprint');
    const next = lib.indexOf('export async function', at + 1);
    const body = lib.slice(at, next === -1 ? undefined : next);
    expect(body).toMatch(/timedOut[\s\S]{0,200}return false/);
  });
});

describe('a handset where the prompt never works stops being gated', () => {
  it('counts consecutive failures and gives up', () => {
    expect(gate).toContain('MAX_STRIKES');
    expect(gate).toMatch(/readStrikes\(\) >= MAX_STRIKES[\s\S]{0,250}markOpen\(\)/);
  });

  it('clears the count once a fingerprint actually works', () => {
    expect(gate).toMatch(/markUnlocked[\s\S]{0,160}writeStrikes\(0\)/);
  });
});

describe('the device wrapper never throws at its callers', () => {
  it('returns a value on every path instead of propagating plugin errors', () => {
    for (const fn of [
      'biometricAvailable',
      'hasStoredCredential',
      'promptFingerprint',
      'storeCredential',
      'readCredential',
    ]) {
      const at = lib.indexOf(`export async function ${fn}`);
      expect(at, `${fn} is missing`).toBeGreaterThan(-1);
      // Slice to the next export rather than a fixed window: these functions
      // grow, and a window that silently falls short would pass for the
      // wrong reason.
      const next = lib.indexOf('export async function', at + 1);
      const body = lib.slice(at, next === -1 ? undefined : next);
      expect(body, `${fn} has no catch`).toContain('catch');
    }
  });

  it('keeps the secret out of localStorage', () => {
    // Keystore only. localStorage is plain text and readable by anything
    // that reaches the WebView.
    // The word appears in the comment explaining why it is not used, so
    // match actual calls rather than any mention.
    expect(lib).not.toMatch(/localStorage\s*\.\s*(set|get)Item/);
    expect(lib).not.toMatch(/sessionStorage\s*\.\s*(set|get)Item/);
    expect(lib).toContain('setCredentials');
  });
});
