// Recovery by Staff ID number: the rules, and the wiring that must not drift.
//
// The pure rules are tested directly. The wiring is tested by reading the
// source, because the two things that would break this flow in production are
// not expressible as a unit test: the two OTP routes going back to having
// their own private copy of the account lookup, and the end of the flow
// sending a locked-out person to a page that does not exist.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  canonicalStaffNumber,
  looksLikeStaffNumber,
  staffNumberSpellings,
  MIN_STAFF_NUMBER_LENGTH,
  MAX_STAFF_NUMBER_LENGTH,
} from '../../src/lib/auth/staffIdentifier';
import { pickSingleMatch, phoneSpellings } from '../../src/lib/auth/recoveryLookup';

const root = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const REQUEST_ROUTE = 'src/app/api/auth/otp/request/route.ts';
const VERIFY_ROUTE = 'src/app/api/auth/otp/verify/route.ts';
const RESET_ROUTE = 'src/app/api/auth/otp/reset/route.ts';
const RECOVER_PAGE = 'src/app/auth/recover/page.tsx';
const LOOKUP = 'src/lib/auth/recoveryLookup.ts';

describe('canonicalStaffNumber', () => {
  it('ignores the separators a card, a spreadsheet and a person all differ on', () => {
    const expected = 'UNTH1234';
    for (const typed of ['UNTH1234', 'UNTH/1234', 'UNTH-1234', 'UNTH 1234',
      'unth/1234', ' UNTH / 1234 ', 'UNTH.1234', 'UNTH\\1234', 'UNTH_1234']) {
      expect(canonicalStaffNumber(typed)).toBe(expected);
    }
  });

  it('accepts a plain number, which is what most of this database holds', () => {
    expect(canonicalStaffNumber('0123456789')).toBe('0123456789');
  });

  it('refuses what cannot be a staff number', () => {
    expect(canonicalStaffNumber(null)).toBeNull();
    expect(canonicalStaffNumber(undefined)).toBeNull();
    expect(canonicalStaffNumber('')).toBeNull();
    expect(canonicalStaffNumber('   ')).toBeNull();
    expect(canonicalStaffNumber('ab')).toBeNull();            // shorter than the floor
    expect(canonicalStaffNumber('a'.repeat(61))).toBeNull();  // past the cap
    expect(canonicalStaffNumber('me@unth.edu.ng')).toBeNull();
    expect(canonicalStaffNumber("'; drop table users --")).toBeNull();
    expect(canonicalStaffNumber('my staff id is 1234')).toBeNull();
  });

  it('agrees with its own stated bounds', () => {
    expect(canonicalStaffNumber('A'.repeat(MIN_STAFF_NUMBER_LENGTH))).not.toBeNull();
    expect(canonicalStaffNumber('A'.repeat(MIN_STAFF_NUMBER_LENGTH - 1))).toBeNull();
    expect(canonicalStaffNumber('A'.repeat(MAX_STAFF_NUMBER_LENGTH))).not.toBeNull();
    expect(canonicalStaffNumber('A'.repeat(MAX_STAFF_NUMBER_LENGTH + 1))).toBeNull();
  });

  it('looksLikeStaffNumber is the same question', () => {
    expect(looksLikeStaffNumber('UNTH/1234')).toBe(true);
    expect(looksLikeStaffNumber('ab')).toBe(false);
  });
});

describe('staffNumberSpellings', () => {
  it('looks for what was typed first, so the common case is the first hit', () => {
    expect(staffNumberSpellings('UNTH/1234')[0]).toBe('UNTH/1234');
  });

  it('covers the spellings this database actually holds', () => {
    const s = staffNumberSpellings('unth1234');
    expect(s).toContain('unth1234');
    expect(s).toContain('UNTH1234');
    expect(s).toContain('UNTH/1234');
    expect(s).toContain('UNTH-1234');
    expect(s).toContain('UNTH 1234');
  });

  it('finds a slashed record from an unslashed entry and the other way round', () => {
    expect(staffNumberSpellings('UNTH1234')).toContain('UNTH/1234');
    expect(staffNumberSpellings('UNTH/1234')).toContain('UNTH1234');
  });

  it('stays small, because this runs on an unauthenticated route', () => {
    expect(staffNumberSpellings('UNTH/1234').length).toBeLessThanOrEqual(12);
    expect(new Set(staffNumberSpellings('UNTH/1234')).size)
      .toBe(staffNumberSpellings('UNTH/1234').length);
  });

  it('does not invent separator variants for a plain number', () => {
    const s = staffNumberSpellings('0123456789');
    expect(s.some((x) => /[-/ ]/.test(x))).toBe(false);
  });

  it('is empty for anything that is not a staff number, so no query is run', () => {
    expect(staffNumberSpellings('ab')).toEqual([]);
    expect(staffNumberSpellings('me@unth.edu.ng')).toEqual([]);
    expect(staffNumberSpellings(null)).toEqual([]);
  });
});

describe('phoneSpellings', () => {
  it('produces every spelling an admin or an import has used', () => {
    const s = phoneSpellings('08039133373');
    expect(s).toContain('2348039133373');
    expect(s).toContain('+2348039133373');
    expect(s).toContain('08039133373');
    expect(s).toContain('0803 913 3373');
  });

  it('reaches the same set from any form the person types', () => {
    const a = phoneSpellings('08039133373').sort();
    expect(phoneSpellings('+2348039133373').sort()).toEqual(a);
    expect(phoneSpellings('234 803 913 3373').sort()).toEqual(a);
  });

  it('is empty when the input is not a phone number at all', () => {
    expect(phoneSpellings('UNTH/1234')).toEqual([]);
    expect(phoneSpellings('')).toEqual([]);
  });

  it('OVERLAPS with staff numbers, which is why every tier is searched', () => {
    // A ten-digit staff number also parses as a phone number, and ten is the
    // commonest staff-number length in this database. If the lookup stopped at
    // the first tier that merely looked plausible, these people would never be
    // found.
    expect(phoneSpellings('8039133373')).not.toEqual([]);
    expect(staffNumberSpellings('8039133373')).not.toEqual([]);
  });
});

describe('pickSingleMatch', () => {
  const u = (id: string) => ({ id });

  it('finds nobody when no tier matched', () => {
    expect(pickSingleMatch([
      { matchedBy: 'PHONE', users: [] },
      { matchedBy: 'STAFF_ID', users: [] },
    ])).toEqual({ outcome: 'NONE' });
  });

  it('returns the one person found, and how they were recognised', () => {
    const v = pickSingleMatch([
      { matchedBy: 'PHONE', users: [] },
      { matchedBy: 'STAFF_ID', users: [u('a')] },
    ]);
    expect(v).toEqual({ outcome: 'FOUND', user: u('a'), matchedBy: 'STAFF_ID' });
  });

  it('counts one person found twice as one person', () => {
    // Somebody whose Staff ID and duty code are the same string. Two tiers
    // match; it is still one account and recovery must not be refused.
    const v = pickSingleMatch([
      { matchedBy: 'STAFF_ID', users: [u('a')] },
      { matchedBy: 'DUTY_CODE', users: [u('a')] },
    ]);
    expect(v.outcome).toBe('FOUND');
    if (v.outcome === 'FOUND') expect(v.matchedBy).toBe('STAFF_ID'); // earliest tier wins
  });

  it('REFUSES rather than guesses when two accounts answer to one number', () => {
    const v = pickSingleMatch([
      { matchedBy: 'PHONE', users: [u('a')] },
      { matchedBy: 'STAFF_ID', users: [u('b')] },
    ]);
    expect(v.outcome).toBe('AMBIGUOUS');
    if (v.outcome === 'AMBIGUOUS') expect(v.ids.sort()).toEqual(['a', 'b']);
  });

  it('refuses two accounts inside a single tier too', () => {
    expect(pickSingleMatch([{ matchedBy: 'STAFF_ID', users: [u('a'), u('b')] }]).outcome)
      .toBe('AMBIGUOUS');
  });
});

describe('the lookup is shared, and stays shared', () => {
  it('both OTP routes resolve the account through the one resolver', () => {
    for (const p of [REQUEST_ROUTE, VERIFY_ROUTE]) {
      const src = read(p);
      expect(src).toContain("from '@/lib/auth/recoveryLookup'");
      expect(src).toContain('await resolveRecoveryUser(identifier);');
    }
  });

  it('neither route keeps its own copy of the account lookup', () => {
    // The copies were identical by luck. The moment one of them learned about
    // Staff IDs, the other would have rejected the code it had just sent.
    for (const p of [REQUEST_ROUTE, VERIFY_ROUTE]) {
      const src = read(p);
      expect(src).not.toContain('{ phoneNumber: asPhone }');
      expect(src).not.toContain('where: { username: identifier');
    }
  });

  it('every tier is restricted to approved accounts', () => {
    const src = read(LOOKUP);
    const tiers = src.match(/status: 'APPROVED'/g) ?? [];
    expect(tiers.length).toBe(4);
  });

  it('searches the Staff ID and the duty code, not just the phone and username', () => {
    const src = read(LOOKUP);
    expect(src).toContain('staffId: { in: staffNumbers }');
    expect(src).toContain('staffCode: { in: staffNumbers }');
  });

  it('bounds every tier, because the route is unauthenticated', () => {
    const src = read(LOOKUP);
    expect((src.match(/take: TIER_LIMIT/g) ?? []).length).toBe(4);
  });
});

describe('a Staff ID identifies but never unlocks', () => {
  it('the password is only changed against a ticket, which only a code buys', () => {
    const reset = read(RESET_ROUTE);
    expect(reset).toContain('resetToken: hashCode(ticket, PEPPER)');
    expect(reset).toContain('resetTokenExpiry: { gt: new Date() }');
    // No route may take a staff number and set a password in the same breath.
    expect(reset).not.toContain('staffId');
    expect(reset).not.toContain('staffCode');
  });

  it('the ticket is issued only after a code verifies', () => {
    const verify = read(VERIFY_ROUTE);
    const codeChecked = verify.indexOf('verifyCode(otp, submitted, PEPPER)');
    const ticketMade = verify.indexOf('crypto.randomBytes(32)');
    expect(codeChecked).toBeGreaterThan(-1);
    expect(ticketMade).toBeGreaterThan(-1);
    expect(ticketMade).toBeGreaterThan(codeChecked);
  });
});

describe('the recovery screen', () => {
  const page = () => read(RECOVER_PAGE);

  it('asks for the Staff ID number first', () => {
    expect(page()).toContain("'Your Staff ID number'");
    expect(page()).toContain("useState<IdMode>('STAFF_ID')");
  });

  it('tells the people with no Staff ID that their duty code works', () => {
    expect(page()).toContain('that code works here too');
  });

  it('names the username, before and after the password is changed', () => {
    const src = page();
    // Twice on purpose: once on the confirm screen, so somebody who only
    // forgot the username can stop there, and once at the end.
    expect((src.match(/Your username is/g) ?? []).length).toBe(2);
    expect(src).toContain('Copy username');
  });

  it('offers sign-in with the username already filled in', () => {
    expect(page()).toContain('/auth/login?u=${encodeURIComponent(found.username)}');
  });

  it('does not send a locked-out person to a page that does not exist', () => {
    // /auth/signin has never existed in this application; the sign-in page is
    // /auth/login. Both the button and the back link used to 404, which means
    // the last thing a successful recovery did was fail.
    expect(page()).not.toContain('/auth/signin');
    expect(page()).toContain('href="/auth/login"');
  });

  it('still says what to do when SMS cannot reach you', () => {
    expect(page()).toContain('Ask the Theatre Manager');
  });
});
