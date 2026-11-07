// Resetting a password with the Staff ID number alone, with no one-time code.
//
// Instructed on 7 November. The trade is written out in the route itself; what
// is tested here is that the compensating measures asked no extra work of the
// real user and are still present: the throttle, the audit entry, the message
// to the account holder, and the refusal to act on a number that names two
// people.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  overLimit, pruneAttempts, retryAfterSeconds,
  WINDOW_MS, MAX_ATTEMPTS_PER_WINDOW, MAX_RESETS_PER_WINDOW,
} from '../../src/lib/auth/resetThrottle';
import { passwordChangedSms, SMS_SEGMENT } from '../../src/lib/auth/resetNotice';

const root = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const ROUTE = 'src/app/api/auth/staff-id-reset/route.ts';
const PAGE = 'src/app/auth/recover/page.tsx';

const NOW = 1_800_000_000_000;
const ago = (ms: number) => NOW - ms;

describe('the throttle', () => {
  it('lets a person mistype their own number several times', () => {
    const fumbles = [ago(60_000), ago(50_000), ago(40_000), ago(30_000)];
    expect(overLimit(fumbles, MAX_ATTEMPTS_PER_WINDOW, NOW)).toBe(false);
  });

  it('stops an address once it has worked through a dozen', () => {
    const many = Array.from({ length: MAX_ATTEMPTS_PER_WINDOW }, (_, i) => ago(i * 1000));
    expect(overLimit(many, MAX_ATTEMPTS_PER_WINDOW, NOW)).toBe(true);
  });

  it('is much tighter on completed resets than on lookups', () => {
    expect(MAX_RESETS_PER_WINDOW).toBeLessThan(MAX_ATTEMPTS_PER_WINDOW);
    const four = Array.from({ length: MAX_RESETS_PER_WINDOW }, (_, i) => ago(i * 1000));
    expect(overLimit(four, MAX_RESETS_PER_WINDOW, NOW)).toBe(true);
  });

  it('forgets what has aged out of the window', () => {
    const old = [ago(WINDOW_MS + 1), ago(WINDOW_MS + 60_000)];
    expect(overLimit(old, 1, NOW)).toBe(false);
    expect(pruneAttempts(old, NOW)).toEqual([]);
  });

  it('cannot grow without bound, however long the process runs', () => {
    const mixed = [ago(WINDOW_MS * 4), ago(WINDOW_MS * 2), ago(1000)];
    expect(pruneAttempts(mixed, NOW)).toEqual([ago(1000)]);
  });

  it('says how long to wait, counted from the oldest live attempt', () => {
    expect(retryAfterSeconds([ago(WINDOW_MS - 60_000)], NOW)).toBe(60);
    expect(retryAfterSeconds([], NOW)).toBe(0);
  });
});

describe('the message to the account holder', () => {
  it('says what happened, and what to do if it was not them', () => {
    const m = passwordChangedSms('CHIBUIKE ANAELI');
    expect(m).toContain('password was just changed');
    expect(m).toContain('If this was NOT you');
    expect(m).toContain('Theatre Manager');
  });

  it('is addressed to the person, and fits one SMS segment', () => {
    const m = passwordChangedSms('CHIBUIKE ANAELI');
    expect(m.startsWith('ANAELI')).toBe(true);
    expect(m.length).toBeLessThanOrEqual(SMS_SEGMENT);
  });

  it('survives a one-word name rather than addressing nobody', () => {
    expect(passwordChangedSms('Careline')).toContain('Careline');
    expect(passwordChangedSms('   ')).toBeTruthy();
  });
});

describe('what the route must keep doing', () => {
  const src = () => read(ROUTE);

  it('resolves the account through the shared resolver, which refuses ambiguity', () => {
    expect(src()).toContain("from '@/lib/auth/recoveryLookup'");
    expect(src()).toContain('await resolveRecoveryUser(identifier);');
  });

  it('throttles before it looks anything up', () => {
    const s = src();
    const throttled = s.indexOf('if (overLimit(');
    const looked = s.indexOf('await resolveRecoveryUser(identifier);');
    expect(throttled).toBeGreaterThan(-1);
    expect(looked).toBeGreaterThan(throttled);
  });

  it('writes an audit entry naming the method and the address', () => {
    const s = src();
    expect(s).toContain("action: 'PASSWORD_RESET_BY_STAFF_ID'");
    expect(s).toContain('requestIp: ip,');
  });

  it('tells the account holder, and never lets that failure block the reset', () => {
    const s = src();
    expect(s).toMatch(/sendSms\(user\.phoneNumber, passwordChangedSms\(user\.fullName\)\)[\s\S]{0,40}\.catch\(/);
    // Not awaited and not inside the transaction: a dead gateway must not undo
    // a password the user has already set.
    expect(s).not.toContain('await sendSms(');
  });

  it('kills anything else that could still open the account', () => {
    const s = src();
    expect(s).toContain('resetToken: null');
    expect(s).toContain('prisma.authOtp.updateMany(');
    expect(s).toContain('consumedAt: new Date()');
  });

  it('changes the password and the log together, or neither', () => {
    expect(src()).toContain('prisma.$transaction([');
  });

  it('still enforces the same minimum password length as the rest of the app', () => {
    expect(src()).toContain('const MIN_PASSWORD_LENGTH = 8;');
    expect(src()).toContain('newPassword.length < MIN_PASSWORD_LENGTH');
  });
});

describe('the screen', () => {
  const page = () => read(PAGE);

  it('no longer asks for a one-time code anywhere', () => {
    const s = page();
    expect(s).not.toContain('one-time-code');
    expect(s).not.toContain('/api/auth/otp/');
    expect(s).not.toContain('6-digit');
  });

  it('shows the name, so a mistyped digit is caught before the password changes', () => {
    expect(page()).toContain('{found.fullName}');
    expect(page()).toContain('That is not me');
  });

  it('says on screen that the account holder will be told', () => {
    expect(page()).toContain('found.willNotifyPhone');
    expect(page()).toContain('to say the password has been changed');
  });
});
