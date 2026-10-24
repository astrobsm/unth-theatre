import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// "Keep me signed in" is a control that can SIGN SOMEBODY OUT, which makes
// its failure mode worse than its feature. A surgeon dropped to the login
// screen mid-list because a storage read returned nothing is a far worse
// outcome than a phone that stayed signed in when it should not have.
// Everything here is about that asymmetry.

const read = (...p: string[]) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');

const login = read('src', 'app', 'auth', 'login', 'page.tsx');
const guard = read('src', 'components', 'SessionLifetimeGuard.tsx');
const providers = read('src', 'app', 'providers.tsx');

describe('the control exists and is visible', () => {
  it('is a real checkbox on the login page', () => {
    expect(login).toContain('id="keepSignedIn"');
    expect(login).toContain('type="checkbox"');
    expect(login).toContain('Keep me signed in on this device');
  });

  it('defaults to ticked', () => {
    // Thirty days is what the app already did; unticking is the new
    // capability. Defaulting to off would quietly change behaviour for
    // everyone who never notices the box.
    expect(login).toMatch(/useState\(true\)[^\n]*\n?/);
    expect(login).toMatch(/const \[keepSignedIn, setKeepSignedIn\] = useState\(true\)/);
  });

  it('sits above the sign-in button, where it is read before submitting', () => {
    const boxAt = login.indexOf('id="keepSignedIn"');
    const btnAt = login.indexOf("{loading ? 'Signing in...' : 'Sign in'}");
    expect(boxAt).toBeGreaterThan(-1);
    expect(boxAt).toBeLessThan(btnAt);
  });
});

describe('the choice is recorded', () => {
  it('writes the flag on every sign-in, not only the first', () => {
    expect(login).toMatch(/localStorage\.setItem\('orm\.keepSignedIn', keepSignedIn \? '1' : '0'\)/);
  });

  it('records it before signing in, so a fast redirect cannot lose it', () => {
    const writeAt = login.indexOf("localStorage.setItem('orm.keepSignedIn'");
    const signInAt = login.indexOf("await signIn('credentials'");
    expect(writeAt).toBeGreaterThan(-1);
    expect(writeAt).toBeLessThan(signInAt);
  });
});

describe('the guard fails safe towards staying signed in', () => {
  it('signs out ONLY when the flag is explicitly off', () => {
    expect(guard).toMatch(/keep === '0'/);
    // Never on absence, never on a falsy read.
    expect(guard).not.toMatch(/if \(!keep\)/);
  });

  it('treats a missing flag as "keep me signed in"', () => {
    expect(guard).toMatch(/getItem\(KEEP_KEY\) \?\? '1'/);
  });

  it('does nothing at all when storage throws', () => {
    // A private window or blocked site data must not sign anyone out.
    const at = guard.indexOf('} catch {');
    expect(at).toBeGreaterThan(-1);
    expect(guard.slice(at, at + 200)).toContain('return');
  });

  it('only acts on a cold start, not on every navigation', () => {
    expect(guard).toContain('sessionStorage');
    expect(guard).toMatch(/alreadyChecked/);
  });

  it('only runs for a signed-in session', () => {
    expect(guard).toMatch(/status !== 'authenticated'\) return/);
  });

  it('is mounted', () => {
    expect(providers).toContain('<SessionLifetimeGuard />');
  });
});
