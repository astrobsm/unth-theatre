/**
 * Reissuing a lost review link.
 *
 * The bug this fixes: the owner page told the Chairman to "reissue it from the
 * list below", and the list below had three columns and no buttons. The API
 * supported reissue from the first day; nothing on any screen called it. So a
 * Chairman who closed the shown-once panel without copying the links had no way
 * to reach his committee, and the instruction on screen pointed at a control
 * that did not exist.
 *
 * What is tested here is not the token — that is crypto and it is already
 * tested — but the DECISION. Reissuing breaks the link the member is holding,
 * so the dangerous case is the helpful-looking "reissue everything" that
 * silently invalidates the links of the four people already part-way through
 * their review.
 */
import { describe, expect, it } from 'vitest';
import {
  reissueRisk,
  reissueWarning,
  needsConfirmation,
  bulkReissueTargets,
  bulkReissueSentence,
} from '../../src/lib/policy/reissue';

const invite = (over: Record<string, unknown> = {}) => ({
  id: 'inv1',
  openedAt: null,
  submittedAt: null,
  revokedAt: null,
  ...over,
});

describe('what reissuing would cost this member', () => {
  it('is free for somebody who never opened their link', () => {
    expect(reissueRisk(invite())).toBe('NEVER_OPENED');
    expect(reissueWarning('NEVER_OPENED')).toBeNull();
    expect(needsConfirmation('NEVER_OPENED')).toBe(false);
  });

  it('warns when the member already has a working link', () => {
    const risk = reissueRisk(invite({ openedAt: new Date() }));
    expect(risk).toBe('OPENED');
    // The consequence, not the mechanism: he is deciding whether to break the
    // link sitting in somebody's WhatsApp thread.
    expect(reissueWarning(risk)).toContain('stops the old one working');
    expect(needsConfirmation(risk)).toBe(true);
  });

  it('reassures that a submitted review is not lost', () => {
    // THE FEAR WORTH ANSWERING. Responses hang off the invitation, not the
    // token, so a new link cannot delete an answer. If the warning did not say
    // so, nobody would ever press the button on somebody who had submitted.
    const risk = reissueRisk(invite({ openedAt: new Date(), submittedAt: new Date() }));
    expect(risk).toBe('SUBMITTED');
    expect(reissueWarning(risk)).toContain('answers are kept');
    expect(needsConfirmation(risk)).toBe(true);
  });

  it('says plainly that reissuing a withdrawn invitation re-admits them', () => {
    const risk = reissueRisk(invite({ revokedAt: new Date() }));
    expect(risk).toBe('REVOKED');
    expect(reissueWarning(risk)).toContain('back into');
  });

  it('ranks withdrawn above everything the member did before it', () => {
    // Somebody took that decision. It is not overridden by the fact that they
    // had opened and answered beforehand.
    expect(reissueRisk(invite({
      openedAt: new Date(), submittedAt: new Date(), revokedAt: new Date(),
    }))).toBe('REVOKED');
  });

  it('ranks submitted above merely opened', () => {
    expect(reissueRisk(invite({ openedAt: new Date(), submittedAt: new Date() })))
      .toBe('SUBMITTED');
  });

  it('reads an ISO string the same as a Date, since the API sends strings', () => {
    // The page receives JSON. If only Date counted as set, every member would
    // look NEVER_OPENED on screen and the bulk action would quietly sweep up
    // the whole committee.
    expect(reissueRisk(invite({ openedAt: '2026-11-21T09:00:00.000Z' }))).toBe('OPENED');
    expect(reissueRisk(invite({ openedAt: '' }))).toBe('NEVER_OPENED');
    expect(reissueRisk(invite({ openedAt: undefined }))).toBe('NEVER_OPENED');
  });
});

describe('who the bulk action touches', () => {
  const roster = [
    invite({ id: 'a' }),
    invite({ id: 'b' }),
    invite({ id: 'c', openedAt: new Date() }),
    invite({ id: 'd', openedAt: new Date(), submittedAt: new Date() }),
    invite({ id: 'e', revokedAt: new Date() }),
  ];

  it('covers only the members holding nothing', () => {
    // THE WHOLE POINT. A bulk reissue that included c, d and e would break a
    // review in progress, a submitted member's ability to revise, and re-admit
    // somebody who was deliberately withdrawn — all from one button.
    expect(bulkReissueTargets(roster).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('leaves a withdrawn invitation out, so re-admitting is always deliberate', () => {
    expect(bulkReissueTargets([invite({ id: 'e', revokedAt: new Date() })])
      .map((i) => i.id)).toEqual([]);
  });

  it('returns nothing rather than throwing on an empty round', () => {
    expect(bulkReissueTargets([])).toEqual([]);
  });
});

describe('the sentence on the bulk panel', () => {
  it('names both what it does and what it leaves alone', () => {
    const s = bulkReissueSentence([
      invite(), invite(), invite(),
      invite({ openedAt: new Date() }),
    ]);
    expect(s).toContain('3 members');
    expect(s).toContain('left alone');
  });

  it('says nothing is disturbed when nobody has opened theirs', () => {
    const s = bulkReissueSentence([invite(), invite()]);
    expect(s).toContain('2 members');
    expect(s).toContain('Nothing anybody is already using is touched');
  });

  it('counts one member as one, not "1 members"', () => {
    const s = bulkReissueSentence([invite()]);
    expect(s).toContain('one member');
    expect(s).not.toContain('1 members');
    expect(s).toContain('has not opened');
  });

  it('refuses the bulk action when everybody already holds a link', () => {
    const s = bulkReissueSentence([
      invite({ openedAt: new Date() }),
      invite({ submittedAt: new Date() }),
    ]);
    expect(s).toContain('nothing to issue in bulk');
    expect(s).toContain('beside a name');
  });

  it('handles an empty round', () => {
    expect(bulkReissueSentence([])).toContain('Nobody is invited');
  });
});
