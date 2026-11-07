// ============================================================
// One place that decides WHICH account a locked-out person is claiming
// ------------------------------------------------------------
// This used to be written out twice — once in /api/auth/otp/request and once
// again in /api/auth/otp/verify — in two copies that had to agree. They did,
// by luck, as long as nobody added a way of identifying yourself. The moment
// the Staff ID was added to one of them, the other would have rejected the
// code it had just sent: the request would find you by your Staff ID, and the
// verify would look for a user whose USERNAME was that number, find nobody,
// and answer "that code is not valid". A locked-out member of staff would have
// received a working code that could never be accepted.
//
// So the lookup lives here once, and both routes call it.
//
// WHAT COUNTS AS IDENTIFYING YOURSELF, in the order tried:
//
//   1. the phone number registered on the account
//   2. the Staff ID number printed on the hospital ID card
//   3. the duty code typed on the duty-logging board  (every approved account
//      has one; 112 approved accounts have no Staff ID, and they are mostly
//      the porters and cleaners who have least to fall back on)
//   4. the username
//
// AMBIGUITY IS REFUSED, NOT GUESSED. Every tier is searched, not just the
// first that looks plausible, because a ten-digit Staff ID also parses as a
// phone number and the most common Staff ID length in this database is ten.
// If the tiers between them name more than one person, nobody is returned.
// The cost of that is one member of staff being told to see the Theatre
// Manager. The cost of guessing would be a password reset landing on the
// wrong account.
// ============================================================

import prisma from '@/lib/prisma';
import { normaliseNigerianPhone } from './otp';
import { staffNumberSpellings } from './staffIdentifier';

/** How the person was recognised. Recorded in the audit log, not shown. */
export type MatchedBy = 'PHONE' | 'STAFF_ID' | 'DUTY_CODE' | 'USERNAME';

export interface RecoveryUser {
  id: string;
  username: string;
  fullName: string;
  phoneNumber: string | null;
}

/** At most this many rows per tier. The route is unauthenticated. */
const TIER_LIMIT = 5;

export interface Tier<T> {
  matchedBy: MatchedBy;
  users: readonly T[];
}

export type MatchVerdict<T> =
  | { outcome: 'FOUND'; user: T; matchedBy: MatchedBy }
  | { outcome: 'NONE' }
  | { outcome: 'AMBIGUOUS'; ids: string[] };

/**
 * Decide between what the tiers found.
 *
 * Pure, so the rule can be proved rather than read: exactly one distinct
 * person across every tier, or nothing. The same person appearing in two
 * tiers — their Staff ID and their duty code being the same string, say — is
 * one person and is allowed.
 */
export function pickSingleMatch<T extends { id: string }>(tiers: readonly Tier<T>[]): MatchVerdict<T> {
  const seen = new Map<string, { user: T; matchedBy: MatchedBy }>();
  for (const tier of tiers) {
    for (const user of tier.users) {
      if (!seen.has(user.id)) seen.set(user.id, { user, matchedBy: tier.matchedBy });
    }
  }
  if (seen.size === 0) return { outcome: 'NONE' };
  if (seen.size > 1) return { outcome: 'AMBIGUOUS', ids: Array.from(seen.keys()) };
  const only = Array.from(seen.values())[0];
  return { outcome: 'FOUND', user: only.user, matchedBy: only.matchedBy };
}

/**
 * The spellings of a phone number this database actually holds.
 *
 * The same person is stored as 08039133373 by one admin and +2348039133373 by
 * another, and as "0803 913 3373" by a spreadsheet import.
 */
export function phoneSpellings(raw: string | null | undefined): string[] {
  const e164 = normaliseNigerianPhone(raw);
  if (!e164) return [];
  const local = `0${e164.slice(3)}`;
  return [
    e164,
    `+${e164}`,
    local,
    local.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3'),
  ];
}

const SELECT = {
  id: true,
  username: true,
  fullName: true,
  phoneNumber: true,
} as const;

/**
 * Which approved account is this person claiming?
 *
 * Returns null for "no idea" and for "more than one idea" alike: the caller
 * must answer the same way in both cases, or the route becomes a way to find
 * out which staff numbers are real.
 */
export async function resolveRecoveryUser(
  identifier: string,
): Promise<{ user: RecoveryUser; matchedBy: MatchedBy } | null> {
  const typed = String(identifier ?? '').trim();
  if (!typed) return null;

  const phones = phoneSpellings(typed);
  const staffNumbers = staffNumberSpellings(typed);

  const [byPhone, byStaffId, byDutyCode, byUsername] = await Promise.all([
    phones.length
      ? prisma.user.findMany({
          where: { status: 'APPROVED', phoneNumber: { in: phones } },
          select: SELECT,
          take: TIER_LIMIT,
        })
      : Promise.resolve([]),
    staffNumbers.length
      ? prisma.user.findMany({
          where: {
            status: 'APPROVED',
            OR: [
              { staffId: { in: staffNumbers } },
              // Covers a stored spelling in a case nobody would think to type.
              { staffId: { equals: typed, mode: 'insensitive' } },
            ],
          },
          select: SELECT,
          take: TIER_LIMIT,
        })
      : Promise.resolve([]),
    staffNumbers.length
      ? prisma.user.findMany({
          where: {
            status: 'APPROVED',
            OR: [
              { staffCode: { in: staffNumbers } },
              { staffCode: { equals: typed, mode: 'insensitive' } },
            ],
          },
          select: SELECT,
          take: TIER_LIMIT,
        })
      : Promise.resolve([]),
    prisma.user.findMany({
      where: {
        status: 'APPROVED',
        OR: [
          { username: typed },
          { username: { equals: typed, mode: 'insensitive' } },
        ],
      },
      select: SELECT,
      take: TIER_LIMIT,
    }),
  ]);

  const verdict = pickSingleMatch<RecoveryUser>([
    { matchedBy: 'PHONE', users: byPhone },
    { matchedBy: 'STAFF_ID', users: byStaffId },
    { matchedBy: 'DUTY_CODE', users: byDutyCode },
    { matchedBy: 'USERNAME', users: byUsername },
  ]);

  if (verdict.outcome === 'AMBIGUOUS') {
    // Worth an administrator's attention: two approved accounts answer to one
    // number, and until that is fixed neither person can recover.
    console.warn(
      '[recoveryLookup] one identifier matched several approved accounts; refusing.',
      { accounts: verdict.ids.length },
    );
    return null;
  }
  if (verdict.outcome === 'NONE') return null;

  return { user: verdict.user, matchedBy: verdict.matchedBy };
}
