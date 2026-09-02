import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  validateUsername,
  normaliseUsername,
  usernameKey,
  usernamesCollide,
  USERNAME_MIN,
  USERNAME_MAX,
} from '../../src/lib/usernameRules';

/**
 * Admins can now change a sign-in name. Onyeka Tonia, a consultant
 * anaesthetist, had been signing in as
 * "onyeka.elective.roster.name.to.be.confirmed" — a placeholder from a roster
 * import that became her real credential, on both nodes, with no way to correct
 * it.
 *
 * A username is not a profile field, so the rules that guard it are worth
 * proving rather than reading.
 */
describe('what makes an acceptable sign-in name', () => {
  it('accepts the ordinary shapes staff actually use', () => {
    for (const ok of ['tonia', 'onyeka.tonia', 'dr.nnaji', 'astro_douglas', 'chidis-orm', 'user123']) {
      expect(validateUsername(ok), ok).toBeNull();
    }
  });

  it('refuses what cannot be typed back reliably', () => {
    // Spaces and quotes are the ones that matter: a name nobody can retype is a
    // person who cannot sign in.
    for (const bad of ['on yeka', "o'brien", 'a@b', 'tonia!', 'naïve', 'semi;colon', 'quote"']) {
      expect(validateUsername(bad), bad).not.toBeNull();
    }
  });

  it('refuses blank, too short and too long', () => {
    expect(validateUsername('')).toBe('A username is required.');
    expect(validateUsername('   ')).toBe('A username is required.');
    expect(validateUsername(null)).toBe('A username is required.');
    expect(validateUsername('ab')).toContain(`${USERNAME_MIN}`);
    expect(validateUsername('a'.repeat(USERNAME_MAX + 1))).toContain(`${USERNAME_MAX}`);
    expect(validateUsername('a'.repeat(USERNAME_MAX))).toBeNull();
  });

  it('trims before judging, so a stray space is not an error', () => {
    expect(validateUsername('  tonia  ')).toBeNull();
    expect(normaliseUsername('  tonia  ')).toBe('tonia');
  });
});

describe('uniqueness follows sign-in, not the database constraint', () => {
  it('treats differing capitalisation as the same login', () => {
    // THE HAZARD. The @unique constraint is case-SENSITIVE, so the database
    // would accept "Tonia" beside an existing "tonia" — after which one typed
    // name matches two accounts and whichever is found first wins.
    expect(usernamesCollide('Tonia', 'tonia')).toBe(true);
    expect(usernamesCollide('AstroDouglas', 'astrodouglas')).toBe(true);
    expect(usernameKey('  ToNiA ')).toBe('tonia');
  });

  it('does not collide different names', () => {
    expect(usernamesCollide('tonia', 'tonia2')).toBe(false);
    expect(usernamesCollide('onyeka.tonia', 'onyeka_tonia')).toBe(false);
  });

  it('never treats blank as a collision', () => {
    // Otherwise every user with no name would block every other.
    expect(usernamesCollide('', '')).toBe(false);
    expect(usernamesCollide(null, undefined)).toBe(false);
    expect(usernamesCollide('   ', 'tonia')).toBe(false);
  });
});

describe('both sides use the shared rule', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

  it('the API validates through it and checks uniqueness case-insensitively', () => {
    const src = read('src/app/api/users/[id]/route.ts');
    expect(src).toContain('validateUsername');
    // The uniqueness query must be insensitive, or the guard is decorative.
    expect(src).toContain("mode: 'insensitive'");
  });

  it('the API restricts a username change to ADMIN', () => {
    const src = read('src/app/api/users/[id]/route.ts');
    expect(src).toContain('Only ADMIN can change a username.');
  });

  it('the API records the change', () => {
    // A credential that changed with no trace is not acceptable here.
    expect(read('src/app/api/users/[id]/route.ts')).toContain('USER_USERNAME_CHANGED');
  });

  it('the screen validates with the same rule rather than its own regex', () => {
    const src = read('src/app/dashboard/users/page.tsx');
    expect(src).toContain('validateUsername');
    expect(src).not.toContain('/^[A-Za-z0-9._-]+$/.test(nextUsername)');
  });
});
