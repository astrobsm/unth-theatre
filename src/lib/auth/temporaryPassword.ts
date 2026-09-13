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
 * The message a member of staff receives.
 *
 * Deliberately says the username as well as the password. The complaint this
 * answers is "I have forgotten my username AND my password", and a message
 * carrying only a password leaves half of it unanswered — they would still
 * have to ring somebody to ask who they are.
 *
 * It does NOT include a link. A message containing credentials and a link is
 * the exact shape of a phishing message, and staff should not be trained to
 * expect one from the hospital.
 */
export function credentialMessage(input: {
  fullName: string;
  username: string;
  temporaryPassword: string;
  expiresAt: Date;
}): string {
  const when = input.expiresAt.toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const firstName = input.fullName.trim().split(/\s+/)[0] || 'there';
  return [
    `Hello ${firstName}, this is UNTH Theatre (ORM).`,
    '',
    `Username: ${input.username}`,
    `Temporary password: ${input.temporaryPassword}`,
    '',
    `It expires ${when} and you will be asked to set your own password as soon as you sign in.`,
    '',
    'If you did not ask for this, tell the theatre manager — somebody has reset your account.',
  ].join('\n');
}

/** The same, as template variables, for the approved WhatsApp template path. */
export function credentialTemplateVariables(input: {
  fullName: string;
  username: string;
  temporaryPassword: string;
  expiresAt: Date;
}): Record<string, string> {
  return {
    name: input.fullName.trim().split(/\s+/)[0] || 'there',
    username: input.username,
    password: input.temporaryPassword,
    expires: input.expiresAt.toLocaleString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }),
  };
}
