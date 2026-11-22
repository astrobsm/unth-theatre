/**
 * Signing the reviewed policy.
 *
 * The round used to end at a recommendation nobody had endorsed, with the
 * endorsement happening in a WhatsApp thread — the thing this module exists to
 * stop being the record.
 *
 * Two properties carry the weight here and both are tested hard.
 *
 * A signature is bound to the exact text signed. Edit the document afterwards
 * and the signature must be reported as standing against an EARLIER version,
 * never silently carried onto words nobody agreed to. That is the difference
 * between a signature page and a decoration.
 *
 * A link is personal. Links arrive in a shared WhatsApp group and ten staff
 * share eight handsets in this theatre, so a link opened on the wrong phone
 * must not quietly accept somebody else's name.
 */
import { describe, expect, it } from 'vitest';
import {
  outcomeFingerprint,
  signoffState,
  eligibleForSignoff,
  signoffEligibilitySentence,
  signatureStanding,
  standingLabel,
  signoffSummary,
  signoffSentence,
  buildSignoffMessage,
  SIGNOFF_PROBLEM_MESSAGE,
  newSignoffToken,
  hashSignoffToken,
  policySignUrl,
} from '../../src/lib/policy/signoff';
import {
  signatureProblem,
  nameMatchProblem,
  signProblem,
  nameTokens,
  approxBytesOfDataUrl,
  SIGNATURE_MIN_BYTES,
  SIGNATURE_MAX_BYTES,
} from '../../src/lib/policy/signature';

/** A PNG data URL of a given decoded size, for the size rules. */
const pngOf = (bytes: number) =>
  `data:image/png;base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`;

describe('the token', () => {
  it('is never stored, only its hash', () => {
    const { token, tokenHash } = newSignoffToken();
    expect(tokenHash).toBe(hashSignoffToken(token));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
  });

  it('is fresh every time', () => {
    expect(newSignoffToken().token).not.toBe(newSignoffToken().token);
  });

  it('survives a round trip through a URL', () => {
    const { token } = newSignoffToken();
    const url = policySignUrl(token);
    expect(url).toContain('/policy-sign?t=');
    // base64url can contain - and _; neither needs escaping, but the token must
    // come back byte-identical or every link fails with NOT_FOUND.
    const back = decodeURIComponent(url.split('t=')[1]);
    expect(back).toBe(token);
  });
});

describe('what a signature is bound to', () => {
  const body = '# Theatre policy\n\n3.1 Cases are posted by 11:00.\n';

  it('is the same for the same words', () => {
    expect(outcomeFingerprint(body)).toBe(outcomeFingerprint(body));
  });

  it('ignores re-wrapping and line endings between the two nodes', () => {
    // The cloud and the theatre node disagree about line endings. A signature
    // must not be invalidated by that, or every signature breaks on sync.
    expect(outcomeFingerprint(body))
      .toBe(outcomeFingerprint('# Theatre policy\r\n\r\n3.1 Cases are posted by  11:00.\r\n'));
  });

  it('changes when a single value in the policy changes', () => {
    // THE WHOLE POINT. 11:00 becoming 12:00 is exactly the kind of edit that
    // must not ride on an existing signature.
    expect(outcomeFingerprint(body))
      .not.toBe(outcomeFingerprint(body.replace('11:00', '12:00')));
  });
});

describe('where a signature stands against the document as it is now', () => {
  const base = { revokedAt: null, signedAt: new Date(), signedFingerprint: 'aaa' };

  it('counts as signed when the text has not moved', () => {
    expect(signatureStanding({ ...base, currentFingerprint: 'aaa' })).toBe('SIGNED');
  });

  it('goes STALE when the document was edited after signing', () => {
    const s = signatureStanding({ ...base, currentFingerprint: 'bbb' });
    expect(s).toBe('STALE');
    // Named in a way that cannot be mistaken for agreement with the current text.
    expect(standingLabel(s)).toBe('Signed an earlier version');
  });

  it('is awaiting when nothing has been signed', () => {
    expect(signatureStanding({ ...base, signedAt: null, signedFingerprint: null, currentFingerprint: 'aaa' }))
      .toBe('AWAITING');
  });

  it('reports a withdrawn link as withdrawn, whatever was signed before', () => {
    expect(signatureStanding({ ...base, revokedAt: new Date(), currentFingerprint: 'aaa' }))
      .toBe('WITHDRAWN');
  });

  it('does not call a signature stale merely because the current text is unknown', () => {
    // Defensive: no final proposal loaded is not evidence that the text changed.
    expect(signatureStanding({ ...base, currentFingerprint: null })).toBe('SIGNED');
  });
});

describe('who is asked to sign', () => {
  const inv = (over: Record<string, unknown> = {}) => ({
    id: 'i', submittedAt: null, revokedAt: null, ...over,
  });

  it('is the members who submitted a review, and nobody else', () => {
    // Somebody who never opened the draft has nothing to endorse, and a
    // signature list padded with them tells Management the committee agreed
    // when most of it never looked.
    const list = [
      inv({ id: 'a', submittedAt: new Date() }),
      inv({ id: 'b' }),
      inv({ id: 'c', submittedAt: new Date() }),
    ];
    expect(eligibleForSignoff(list).map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('excludes a withdrawn member even though they submitted', () => {
    // Withdrawing somebody is a decision; handing them a signing link would
    // quietly reverse it.
    const list = [inv({ id: 'a', submittedAt: new Date(), revokedAt: new Date() })];
    expect(eligibleForSignoff(list)).toEqual([]);
  });

  it('says so plainly when nobody has submitted', () => {
    expect(signoffEligibilitySentence([inv(), inv()]))
      .toContain('Nobody has submitted a review yet');
  });

  it('counts one member as one', () => {
    const s = signoffEligibilitySentence([inv({ submittedAt: new Date() })]);
    expect(s).toContain('one member');
    expect(s).not.toContain('1 members');
  });

  it('mentions a withdrawal rather than quietly shrinking the number', () => {
    const s = signoffEligibilitySentence([
      inv({ id: 'a', submittedAt: new Date() }),
      inv({ id: 'b', submittedAt: new Date(), revokedAt: new Date() }),
    ]);
    expect(s).toContain('since been withdrawn');
  });
});

describe('whether the link works', () => {
  it('refuses a link it does not recognise', () => {
    expect(signoffState({ row: null, hasOutcome: true })).toBe('NOT_FOUND');
  });

  it('refuses a withdrawn link', () => {
    expect(signoffState({ row: { revokedAt: new Date(), signedAt: null }, hasOutcome: true }))
      .toBe('REVOKED');
  });

  it('says the document is not ready rather than that the link is broken', () => {
    // The member keeps the link; telling them it is invalid guarantees they
    // throw it away and have to be chased.
    expect(signoffState({ row: { revokedAt: null, signedAt: null }, hasOutcome: false }))
      .toBe('NO_OUTCOME');
    expect(SIGNOFF_PROBLEM_MESSAGE.NO_OUTCOME).toContain('keep it');
  });

  it('tells somebody who already signed that it is on the record', () => {
    expect(signoffState({ row: { revokedAt: null, signedAt: new Date() }, hasOutcome: true }))
      .toBe('ALREADY_SIGNED');
    expect(SIGNOFF_PROBLEM_MESSAGE.ALREADY_SIGNED).toContain('already signed');
  });

  it('has no expiry, unlike a review link', () => {
    // A review closes with the round because the analysis runs on what was said
    // by the deadline. A signature arriving late is still a signature.
    expect(signoffState({ row: { revokedAt: null, signedAt: null }, hasOutcome: true }))
      .toBeNull();
  });
});

describe('the drawn signature', () => {
  it('accepts an ordinary signature', () => {
    expect(signatureProblem(pngOf(8000))).toBeNull();
  });

  it('refuses an untouched canvas, which is the likeliest failure', () => {
    const p = signatureProblem(pngOf(SIGNATURE_MIN_BYTES - 200));
    expect(p).toContain('looks empty');
  });

  it('refuses nothing at all', () => {
    expect(signatureProblem('')).toContain('Please sign');
    expect(signatureProblem(null)).toContain('Please sign');
  });

  it('refuses something that is not a PNG data URL', () => {
    expect(signatureProblem('https://example.com/sig.png')).toContain('could not be read');
    expect(signatureProblem('data:image/svg+xml;base64,AAAA')).toContain('could not be read');
  });

  it('refuses an image too large to replicate', () => {
    expect(signatureProblem(pngOf(SIGNATURE_MAX_BYTES + 5000))).toContain('too large');
  });

  it('measures a data URL without decoding it', () => {
    expect(approxBytesOfDataUrl(pngOf(3000))).toBeGreaterThan(2900);
    expect(approxBytesOfDataUrl(pngOf(3000))).toBeLessThan(3100);
  });
});

describe('the typed name', () => {
  it('accepts the name on record', () => {
    expect(nameMatchProblem('Augustine Okeke', 'Dr Augustine Okeke')).toBeNull();
  });

  it('accepts a different title and a partial name', () => {
    // Refusing "Prof. Okeke" for "Dr Augustine Okeke" is the fastest way to
    // make eleven heads of department give up on the whole exercise.
    expect(nameMatchProblem('Prof. Okeke', 'Dr Augustine Okeke')).toBeNull();
    expect(nameMatchProblem('A. Okeke', 'Dr Augustine Okeke')).toBeNull();
  });

  it('refuses an unrelated name, and says whose link it is', () => {
    // THE SHARED-HANDSET CASE. Ten staff share eight devices and links arrive
    // in a group chat.
    const p = nameMatchProblem('Ngozi Eze', 'Dr Augustine Okeke');
    expect(p).toContain('Dr Augustine Okeke');
    expect(p).toContain('do not sign');
  });

  it('refuses a title on its own', () => {
    expect(nameMatchProblem('Dr', 'Dr Augustine Okeke')).toBeTruthy();
    expect(nameMatchProblem('Professor', 'Dr Augustine Okeke'))
      .toContain('not a title on its own');
  });

  it('does not match on a shared initial', () => {
    // "A. Okeke" and "A. Nwosu" share nothing but the A, so single letters
    // cannot be allowed to carry a match.
    expect(nameTokens('A. Okeke')).toEqual(['okeke']);
    expect(nameMatchProblem('A. Nwosu', 'Dr Augustine Okeke')).toBeTruthy();
  });

  it('accepts any plausible name when the record holds no name at all', () => {
    // An invitation entered as just "Dr" yields nothing to match on. Refusing
    // would be a dead end: there is no screen for correcting an invitee name,
    // so the holder could never sign.
    expect(nameMatchProblem('Chidi Obi', 'Dr')).toBeNull();
  });

  it('still guards a record that reads as a role rather than a person', () => {
    // "The Registrar" DOES yield tokens, and nothing can reliably tell a role
    // description from a surname. The shared-handset guard is worth more than
    // the convenience, so this refuses -- and the message says what to do.
    const p = nameMatchProblem('Chidi Obi', 'The Registrar');
    expect(p).toContain('The Registrar');
    expect(p).toContain('Secretariat');
  });

  it('handles a hyphenated name', () => {
    expect(nameMatchProblem('Adaeze Nwosu-Okeke', 'Mrs Adaeze Nwosu-Okeke')).toBeNull();
  });
});

describe('the gate on the Sign button', () => {
  const ok = {
    typedName: 'Augustine Okeke',
    signature: pngOf(8000),
    nameOnRecord: 'Dr Augustine Okeke',
    confirmed: true,
  };

  it('lets a complete, confirmed signature through', () => {
    expect(signProblem(ok)).toBeNull();
  });

  it('requires the confirmation to be ticked', () => {
    expect(signProblem({ ...ok, confirmed: false })).toContain('tick the box');
  });

  it('reports the name problem before the signature problem', () => {
    // Both wrong: tell them whose link it is first. Asking somebody to redraw a
    // signature they should not be giving at all is the wrong instruction.
    const p = signProblem({ ...ok, typedName: 'Someone Else', signature: '' });
    expect(p).toContain('do not sign');
  });

  it('still catches an empty canvas when the name is right', () => {
    expect(signProblem({ ...ok, signature: '' })).toContain('Please sign');
  });
});

describe('the arithmetic on the signature page', () => {
  it('counts the states and takes the rate over those asked', () => {
    const s = signoffSummary(['SIGNED', 'SIGNED', 'STALE', 'AWAITING', 'WITHDRAWN']);
    expect(s).toMatchObject({ asked: 4, signed: 2, stale: 1, awaiting: 1, withdrawn: 1 });
    expect(s.percentSigned).toBe(50);
  });

  it('does not count a stale signature as agreement with the current text', () => {
    const s = signoffSummary(['SIGNED', 'STALE']);
    expect(s.signed).toBe(1);
    expect(s.percentSigned).toBe(50);
  });

  it('never divides by zero', () => {
    expect(signoffSummary(['WITHDRAWN']).percentSigned).toBe(0);
    expect(signoffSummary([]).percentSigned).toBe(0);
  });

  it('calls out stale signatures in the sentence, separately from signed', () => {
    const s = signoffSentence(signoffSummary(['SIGNED', 'STALE', 'AWAITING']));
    expect(s).toContain('1 of 3 participants have signed the current version (33%)');
    expect(s).toContain('signed an earlier version');
    expect(s).toContain('has not signed yet');
  });

  it('says plainly when nobody has been asked', () => {
    expect(signoffSentence(signoffSummary([]))).toContain('Nobody has been asked');
  });
});

describe('the message that carries the link', () => {
  it('says why they in particular are being asked, and not to forward it', () => {
    const m = buildSignoffMessage({
      url: 'https://unth-theatre.link/policy-sign?t=abc',
      policyTitle: 'Theatre Booking and Pre-operative Preparation Policy',
      version: '0.3',
      signatory: 'Prof. Chairman',
      signatoryTitle: 'Chairman, Theatre Users Committee',
      signerName: 'Prof. Augustine Okeke',
    });
    // Addressed by name, like the invitation and the reminder. A member written
    // to twice as 'Prof. Okeke' and then asked to SIGN by a message with no name
    // at all reads the third one as an automated circular.
    expect(m).toContain('Dear Prof. Okeke,');
    expect(m).toContain('version 0.3');
    expect(m).toContain('You reviewed this draft');
    expect(m).toContain('do not forward it');
    expect(m).toContain('https://unth-theatre.link/policy-sign?t=abc');
    expect(m).toContain('Chairman, Theatre Users Committee');
  });

  it('works without a signatory', () => {
    const m = buildSignoffMessage({ url: 'u', policyTitle: null, version: '0.3' });
    expect(m).toContain('the theatre policy');
  });
});
