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

  it('addresses them by name and asks politely', () => {
    const m = remind();
    expect(m).toContain('Dear Prof. Okeke,');
    expect(m).toContain('May I kindly follow up');
    expect(m).toContain('Thank you for your time.');
  });

  it('is short — a chase that restates the invitation is not read', () => {
    // Also: it must not read as the first message being resent because they
    // were not trusted to have read it.
    expect(remind().split('\n').filter((l) => l.trim() !== '').length).toBeLessThanOrEqual(10);
  });

  it('acknowledges sections already answered', () => {
    // THE POINT OF PASSING THE COUNT. Telling somebody who has answered seven
    // sections that nothing has been received reads as though it was not
    // noticed, and is the quickest way to lose them for the rest of the round.
    const m = remind({ answered: 7, totalSections: 22 });
    expect(m).toContain('You have completed 7 of 22 sections');
    expect(m).not.toContain('has not yet reached the Committee');
  });

  it('says one section, not "1 sections"', () => {
    expect(remind({ answered: 1, totalSections: 22 })).toContain('1 of 22 section,');
  });

  it('says nothing has arrived when nothing has', () => {
    expect(remind({ answered: 0 })).toContain('has not yet reached the Committee');
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

  it('points at the link they already have, and offers a new one', () => {
    // It CANNOT carry their link: only the token's SHA-256 is stored, so no
    // query can rebuild a personal URL. Offering a replacement is both the
    // honest answer and the polite one.
    const m = remind();
    expect(m).toContain('personal link sent to you earlier');
    expect(m).toContain('a new one will be sent to you');
    expect(m).not.toContain('policy-review?t=');
  });

  it('mentions that they may skip sections outside their area', () => {
    expect(remind()).toContain('skip any section outside your area');
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
