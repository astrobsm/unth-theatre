// ============================================================
// A password somebody has to read off a phone and type correctly
// ------------------------------------------------------------
// This is not a password a machine will handle. It is going to arrive on
// WhatsApp, be read on a cracked screen in a corridor, and typed into a login
// box — possibly by somebody reading it aloud to somebody else.
//
// So the alphabet excludes every pair that looks alike in a sans-serif font:
// 0 and O, 1 and l and I, 5 and S, 2 and Z, 8 and B. Each of those is a support
// call, and a support call is exactly what this feature exists to prevent.
// Dropping them costs about a bit and a half per character, which is bought
// back by making it longer.
//
// Grouped with hyphens for the same reason. "K7RM-4TQX-9FHD" is read back
// correctly far more often than the same twelve characters in one run, and the
// hyphens are not part of the secret — they are stripped before comparison
// nowhere, they are simply part of the password. The user types them.
// ============================================================

import { randomInt } from 'crypto';

/**
 * Unambiguous characters only.
 *
 * Removed: 0 O o, 1 l I i, 5 S s, 2 Z z, 8 B, and lower case entirely — a
 * mixed-case password read over a phone produces "was that a capital?" every
 * time, and case confusion is the commonest reason a correct password is typed
 * wrongly.
 */
const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY34679';

/** Characters per group, and groups. 12 characters over this alphabet. */
const GROUP_SIZE = 4;
const GROUPS = 3;

/** How long a temporary password stays valid before it must be reissued. */
export const TEMP_PASSWORD_TTL_HOURS = 48;

/**
 * A temporary password: three groups of four, hyphen-separated.
 *
 * Uses crypto.randomInt, not Math.random. This is a credential; a predictable
 * one is not a credential at all, and Math.random is seeded predictably enough
 * that two accounts reset in the same second could receive related passwords.
 *
 * randomInt is also free of the modulo bias that `bytes[i] % alphabet.length`
 * introduces — with a 26-character alphabet that bias is small but it is real,
 * and there is no reason to accept it.
 */
export function generateTemporaryPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let group = '';
    for (let i = 0; i < GROUP_SIZE; i++) {
      group += ALPHABET[randomInt(0, ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

/** When a password issued now stops being usable. */
export function temporaryPasswordExpiry(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setHours(d.getHours() + TEMP_PASSWORD_TTL_HOURS);
  return d;
}

/**
 * Same shape as every other message the app sends.
 *
 * The house convention, set by emergencyEscalationMessages and
 * bookerChaseMessage: a builder returns { title, body }; the body opens by
 * naming the person in full and stating their relationship to the thing; there
 * is no greeting and no "this is UNTH Theatre" preamble, because a message that
 * introduces itself reads like a circular; and it closes with one specific ask
 * rather than a sign-off.
 *
 * WHO SENT IT is named, for the reason bookerChaseMessage gives — "a reminder
 * from nobody is easy to ignore" — and for a second reason that matters more
 * here: a credential arriving from a named colleague can be checked, and one
 * arriving from nowhere is indistinguishable from a phishing message.
 *
 * The username is sent as well as the password. The complaint this answers is
 * "I have forgotten my username AND my password", and a message carrying only a
 * password leaves half of it unanswered.
 *
 * No link, for the same reason: credentials plus a link is the exact shape of
 * the attack, and staff should not be trained to expect one from the hospital.
 */
const when = (d: Date) =>
  d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function credentialMessage(input: {
  fullName: string;
  username: string;
  temporaryPassword: string;
  expiresAt: Date;
  /** The administrator who sent it, when known. */
  sentByName?: string | null;
}): { title: string; body: string } {
  const name = input.fullName.trim() || 'You';
  const by = input.sentByName?.trim();
  return {
    title: 'Your ORM sign-in details',
    body:
      `${name}, your ORM sign-in details have been reset` +
      `${by ? ` by ${by}` : ''}.\n\n` +
      `Username: ${input.username}\n` +
      `Temporary password: ${input.temporaryPassword}\n\n` +
      `This password stops working at ${when(input.expiresAt)}, and you will be asked ` +
      `to set your own as soon as you sign in.\n\n` +
      `If you did not ask for this, tell the theatre manager — somebody has reset your account.`,
  };
}

/** The same facts as template variables, for the approved WhatsApp template. */
export function credentialTemplateVariables(input: {
  fullName: string;
  username: string;
  temporaryPassword: string;
  expiresAt: Date;
  sentByName?: string | null;
}): Record<string, string> {
  return {
    // Full name, as the rest of the app addresses people.
    name: input.fullName.trim() || 'Colleague',
    username: input.username,
    password: input.temporaryPassword,
    expires: when(input.expiresAt),
    sentBy: input.sentByName?.trim() || 'the theatre office',
  };
}
