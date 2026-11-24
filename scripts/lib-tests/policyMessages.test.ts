/**
 * How the committee is addressed, and how it is chased.
 *
 * The invitation opened "Dear Colleague," on a message asking a head of
 * department for twenty-five minutes of their evening, while the roster it was
 * built from held their name the whole time. And it said nothing about the link
 * being personal — these arrive in a committee WhatsApp group, where forwarding
 * a useful link is the normal courtesy and a forwarded one records a
 * colleague's answers under somebody else's name.
 *
 * The reminder wording lived privately inside the reminders route. One wording
 * now serves the scheduled job, the owner's bulk chase and the per-member
 * button, because a second copy written for a button is how a committee starts
 * receiving two differently-worded reminders about one review.
 */
import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';
import {
  salutationFor,
  buildPolicyInviteMessage,
  buildPolicyReminderMessage,
} from '../../src/lib/policy/messages';

const CLOSES = new Date(2026, 10, 26, 23, 59);
const NOW = new Date(2026, 10, 22, 11, 0);

describe('addressing somebody by name', () => {
  it('uses the title and the surname', () => {
    expect(salutationFor('Prof. Augustine Okeke')).toBe('Prof. Okeke');
    expect(salutationFor('Dr Ngozi Eze')).toBe('Dr Eze');
  });

  it('normalises how the title was typed', () => {
    // A roster is typed by hand. "Dear PROF. okeke" reads as a mail-merge,
    // which is the one thing this is trying not to be.
    expect(salutationFor('PROFESSOR augustine OKEKE')).toBe('Prof. OKEKE');
    expect(salutationFor('prof augustine okeke')).toBe('Prof. okeke');
    expect(salutationFor('DR. Ngozi Eze')).toBe('Dr Eze');
  });

  it('skips initials, which are not something to be addressed by', () => {
    expect(salutationFor('Prof. A. B. Okeke')).toBe('Prof. Okeke');
  });

  it('keeps a hyphenated surname whole', () => {
    expect(salutationFor('Mrs Adaeze Nwosu-Okeke')).toBe('Mrs Nwosu-Okeke');
  });

  it('handles the other honorifics this hospital actually uses', () => {
    expect(salutationFor('Engr Chidi Obi')).toBe('Engr. Obi');
    expect(salutationFor('Matron Grace Ali')).toBe('Matron Ali');
    expect(salutationFor('Chief Emeka Nwankwo')).toBe('Chief Nwankwo');
    expect(salutationFor('Rev. Father Paul')).toBe('Rev. Paul');
  });

  it('uses the WHOLE name when there is no title', () => {
    // "Dear Okeke," is abrupt in a way an invitation cannot afford, and
    // inventing a title — or a gendered one — would be worse than either.
    expect(salutationFor('Augustine Okeke')).toBe('Augustine Okeke');
  });

  it('falls back to Colleague only when there is no name at all', () => {
    expect(salutationFor('')).toBe('Colleague');
    expect(salutationFor(null)).toBe('Colleague');
    expect(salutationFor('   ')).toBe('Colleague');
  });

  it('copes with a title and nothing else', () => {
    expect(salutationFor('Dr')).toBe('Dr');
    expect(salutationFor('Prof.')).toBe('Prof.');
  });

  it('tidies stray spacing rather than echoing it', () => {
    expect(salutationFor('  Prof.   Augustine    Okeke ')).toBe('Prof. Okeke');
  });
});

describe('the invitation', () => {
  const message = (name?: string | null) => buildPolicyInviteMessage({
    url: 'https://unth-theatre.link/policy-review?t=abc123',
    inviteeName: name,
    closesAt: CLOSES,
    policyTitle: 'Theatre Booking and Pre-operative Preparation Policy',
    signatory: 'Prof. Chairman',
    signatoryTitle: 'Chairman, Theatre Users Committee, UNTH',
  });

  it('opens with their name, not "Dear Colleague"', () => {
    const m = message('Prof. Augustine Okeke');
    expect(m).toContain('Dear Prof. Okeke,');
    expect(m).not.toContain('Dear Colleague');
  });

  it('still opens politely when the roster has no name', () => {
    expect(message(null)).toContain('Dear Colleague,');
  });

  it('says the link is theirs alone, and why that matters', () => {
    const m = message('Dr Ngozi Eze');
    expect(m).toContain('individual to you');
    expect(m).toContain('recorded as yours');
    expect(m).toContain('do not forward it');
  });

  it('calls it a personal link where it gives it', () => {
    expect(message('Dr Ngozi Eze')).toContain('*Your personal review link:*');
  });

  it('still carries the link, the deadline and the time needed', () => {
    const m = message('Dr Ngozi Eze');
    expect(m).toContain('https://unth-theatre.link/policy-review?t=abc123');
    expect(m).toContain('26 November 2026');
    expect(m).toContain('20–30 minutes');
  });

  it('is signed by the office, and by the person when named', () => {
    expect(message('Dr Ngozi Eze')).toContain('Chairman, Theatre Users Committee, UNTH');
    expect(message('Dr Ngozi Eze')).toContain('*Prof. Chairman*');
  });
});

describe('the reminder', () => {
  const remind = (over: Record<string, unknown> = {}) => buildPolicyReminderMessage({
    inviteeName: 'Prof. Augustine Okeke',
    policyTitle: 'Theatre Booking and Pre-operative Preparation Policy',
    closesAt: CLOSES,
    now: NOW,
    ...over,
  });

  it('addresses them by name and opens with the apology, not the request', () => {
    const m = remind();
    expect(m).toContain('Dear Prof. Okeke,');
    expect(m).toContain('We are sorry to intrude on your time.');
    expect(m).toContain('Thank you.');
  });

  it('pleads for their own professional opinion, and says who is asking', () => {
    // THE WORDING THE CHAIRMAN ASKED FOR, and the reason it is pinned: a chase
    // that simply says "please respond" reads as an administrative demand on a
    // consultant's evening. This one says who is asking, why their judgement
    // in particular, and what it is for.
    const m = remind();
    expect(m).toContain('Hospital Management sincerely pleads');
    expect(m).toContain('your opinion on the Theatre Booking and Pre-operative Preparation Policy');
    expect(m).toContain('based on your professional experience');
    expect(m).toContain('robust policy to guide our practice in the theatre');
  });

  it('apologises before it asks for anything', () => {
    // Order, not just presence. An apology after the request is not an
    // apology for the intrusion, it is a postscript.
    const m = remind();
    expect(m.indexOf('sorry to intrude')).toBeLessThan(m.indexOf('sincerely pleads'));
    expect(m.indexOf('sincerely pleads')).toBeLessThan(m.indexOf('Closing'));
  });

  it('is very short — a chase that restates the invitation is not read', () => {
    // The Chairman's instruction, and the reason it is a test: every later
    // addition to this message will look individually reasonable.
    const lines = (m: string) => m.split('\n').filter((l) => l.trim() !== '').length;
    expect(lines(remind())).toBeLessThanOrEqual(10);
    expect(lines(remind({
      url: 'https://unth-theatre.link/policy-review?t=abc123',
      answered: 7,
      totalSections: 22,
      signatory: 'Prof. Chairman',
    }))).toBeLessThanOrEqual(10);
  });

  it('carries the member\u2019s personal link when the caller could mint one', () => {
    // The whole reason the reminder changed. "Use the link I sent on Tuesday"
    // asks a head of department to go and find a message; this gives them
    // something to tap.
    const m = remind({ url: 'https://unth-theatre.link/policy-review?t=abc123' });
    expect(m).toContain('*Your personal review link:* https://unth-theatre.link/policy-review?t=abc123');
    expect(m).toContain('Kindly use the link above to make your contribution.');
  });

  it('points at the link they already hold when it has none, and invents nothing', () => {
    // A reminder that printed a guessed URL would send a consultant to a page
    // telling them their link is not recognised.
    const m = remind();
    expect(m).not.toContain('policy-review?t=');
    expect(m).toContain('personal link sent to you earlier');
    expect(m).toContain('a new one will be sent to you');
    expect(m).not.toContain('link above');
  });

  it('acknowledges sections already answered', () => {
    // THE POINT OF PASSING THE COUNT. Telling somebody who has answered seven
    // sections that nothing has been received reads as though it was not
    // noticed, and is the quickest way to lose them for the rest of the round.
    const m = remind({ answered: 7, totalSections: 22 });
    expect(m).toContain('You have completed 7 of 22 sections');
    expect(m).toContain('reopens where you stopped');
  });

  it('says one section, not "1 sections"', () => {
    expect(remind({ answered: 1, totalSections: 22 })).toContain('1 of 22 section —');
  });

  it('says nothing about progress when there is none to report', () => {
    // Shorter, and it avoids the earlier wording that told somebody their
    // response "has not yet reached the Committee" -- true, but it is the
    // sentence that makes a chase feel like an accusation.
    const m = remind({ answered: 0 });
    expect(m).not.toContain('You have completed');
    expect(m).not.toContain('has not yet reached the Committee');
  });

  it('gives hours when the deadline is close, and a date when it is not', () => {
    expect(remind()).toContain('*Closing Thursday, 26 November 2026 at 23:59.*');
    const soon = remind({ now: new Date(2026, 10, 26, 12, 0) });
    expect(soon).toContain('Closing in about 12 hours');
  });

  it('never tells somebody not to bother once the date has passed', () => {
    // A lapsed deadline is not a closed round — the Chairman can extend it, and
    // a member holding a working link should not be told to stop.
    const late = remind({ now: new Date(2026, 10, 28, 9, 0) });
    expect(late).toContain('still open');
    expect(late).toContain('can still be included');
  });

  it('signs off as the committee when no signatory is given', () => {
    expect(remind()).toContain('Theatre Users Committee, UNTH');
  });

  it('uses the signatory when there is one', () => {
    const m = remind({ signatory: 'Prof. Chairman', signatoryTitle: 'Chairman, TUC' });
    expect(m).toContain('*Prof. Chairman*');
    expect(m).toContain('Chairman, TUC');
  });
});

/**
 * The plumbing that lets the reminder carry a link at all.
 *
 * Source-level, because the thing worth protecting is not a string: it is that
 * minting a link for a chase DOES NOT STOP THE LINK THE MEMBER ALREADY HOLDS.
 * That went wrong once already -- src/lib/policy/reissue.ts opens with the
 * warning -- and it is invisible from the Chairman's screen, because the member
 * only finds out when they tap an old message and are told the link is not
 * recognised.
 */
describe('a reminder that mints a link must not break the one they hold', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

  const schema = read('prisma/schema.prisma');
  const migration = read(
    'prisma/migrations/20261124090000_policy_invite_prior_token/migration.sql',
  );
  const minter = read('src/lib/policy/reminderLink.ts');
  const server = read('src/lib/policy/server.ts');
  const reminders = read('src/app/api/policy/reminders/route.ts');
  const invitations = read('src/app/api/policy/rounds/[id]/invitations/route.ts');

  it('stores the hash of the link being replaced', () => {
    const model = schema.slice(
      schema.indexOf('model PolicyInvitation {'),
      schema.indexOf('@@map("policy_invitations")'),
    );
    expect(model).toContain('priorTokenHash String? @unique');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "priorTokenHash"');
  });

  it('keeps the previous hash when minting, and can put it back', () => {
    // The two halves of the guarantee: the old link survives, and a mint for
    // a message that was never sent can be undone.
    expect(minter).toContain('priorTokenHash: before.tokenHash');
    expect(minter).toContain('rollback');
    expect(minter).toContain('data: { tokenHash: before.tokenHash, priorTokenHash: before.priorTokenHash }');
  });

  it('opens a review for either live hash', () => {
    const block = server.slice(
      server.indexOf('if (opts.token) {'),
      server.indexOf('policyInviteState(invitation'),
    );
    expect(block).toContain('{ tokenHash: hash }');
    expect(block).toContain('{ priorTokenHash: hash }');
  });

  it('rolls the mint back when the message was not queued', () => {
    const block = reminders.slice(
      reminders.indexOf('const minted = await mintReminderLink'),
      reminders.indexOf('return { roundId, window'),
    );
    expect(block).toContain('url: minted?.url ?? null');
    expect(block).toContain('await minted.rollback()');
  });

  it('still chases a member whose link could not be minted', () => {
    // The mint is a convenience, not a precondition. A member whose row moved
    // under the loop must still be chased, with the older wording.
    expect(reminders).toContain('url: minted?.url ?? null');
    expect(reminders).not.toContain('if (!minted) continue');
  });

  it('keeps the deliberate reissue deliberate', () => {
    // "New link" exists to STOP the old link working. A reminder keeping the
    // previous hash alive must not quietly turn that into a no-op.
    const block = invitations.slice(
      invitations.indexOf('// Reissue: a new token'),
      // lastIndexOf: POST builds a link the same way when invitations are
      // first created, and that one comes earlier in the file.
      invitations.lastIndexOf('const url = policyInviteUrl(token)'),
    );
    expect(block).toContain('priorTokenHash: null');
  });

  it('withdraws both links at once, because revocation is per invitation', () => {
    // Not a token-level flag, so there is nothing to miss. Pinned because the
    // obvious "fix" for two live tokens is a second revoked column.
    const block = invitations.slice(
      invitations.indexOf("if (parsed.data.action === 'revoke')"),
      invitations.indexOf("if (parsed.data.action === 'restore')"),
    );
    expect(block).toContain('revokedAt: new Date()');
    expect(block).not.toContain('TokenHash');
  });

  it('composes the per-member reminder on the server, where a link can be minted', () => {
    expect(invitations).toContain("action === 'remind-link'");
    expect(invitations).toContain('buildPolicyReminderMessage');
    // Reading the message is not sending it, so nothing is recorded as sent.
    const block = invitations.slice(
      invitations.indexOf("if (parsed.data.action === 'remind-link')"),
      invitations.indexOf('// Reissue: a new token'),
    );
    expect(block).not.toContain('remindedAt');
  });

  it('never puts a token hash on the wire', () => {
    expect(invitations).not.toContain('priorTokenHash: true');
    expect(reminders).not.toContain('tokenHash: true');
  });
});
