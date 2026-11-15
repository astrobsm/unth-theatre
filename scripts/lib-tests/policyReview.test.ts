import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  buildPolicySteps,
  firstUnansweredStepIndex,
  isKnownStepId,
  isStepComplete,
  policyProgress,
  resolveCursor,
  sectionIdOfStep,
  sectionStepId,
  GENERAL_STEP_ID,
  REVIEW_STEP_ID,
  WELCOME_STEP_ID,
  type SectionLike,
} from '../../src/lib/policy/steps';
import {
  parseHeadingText,
  parentNumberOf,
  parseMarkdownSections,
  summariseImport,
} from '../../src/lib/policy/import/sections';
import {
  detectDecisionItems,
  guessDecisionItemType,
  splitChoices,
  surroundingSentenceOf,
} from '../../src/lib/policy/import/decisionItems';
import {
  attributionFor,
  canObservePolicyReview,
  canOwnPolicyReview,
  canSeeIndividualResponses,
  policyRoleOf,
} from '../../src/lib/policy/access';
import {
  buildPolicyInviteMessage,
  formatClosing,
  hashPolicyInviteToken,
  newPolicyInviteToken,
  policyInviteState,
} from '../../src/lib/policy/invite';
import { displayContributor } from '../../src/lib/policy/owner';

// The Theatre Users Committee reviewing a draft policy inside ORM.
//
// Two things in this module are worth proving rather than reading, and both are
// about somebody not losing their work:
//
//   1. A member opens the link in WhatsApp on a phone, answers six sections, is
//      called away, and finishes on a desktop. The cursor tests below exist
//      because the booking wizard already gets this wrong -- it stores a step
//      INDEX and maps it through two arrays that have drifted out of order.
//   2. The importer decides what the committee is even asked. A parse that
//      merges two sections removes a question, and nothing downstream shows it.

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * Source with its comments stripped.
 *
 * Every absence assertion below runs against this, not against the raw file.
 * An assertion that a name does not appear in a module will otherwise match the
 * comment explaining why it does not appear -- which is how a guard comes to
 * fail on its own documentation. It happened here: invite.ts describes how it
 * differs from the single-use patient invite, and said "ALREADY_USED" while
 * doing so.
 */
const codeOf = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[\t ]*\/\/.*$/gm, '');

/** A section tree shaped like the real draft: 16 sections, 3 has children. */
const DRAFT_SECTIONS: SectionLike[] = [
  { id: 'sec1', number: '1', title: 'Purpose and scope', parentId: null, order: 0 },
  { id: 'sec2', number: '2', title: 'Definitions', parentId: null, order: 1 },
  { id: 'sec3', number: '3', title: 'Roles and responsibilities', parentId: null, order: 2 },
  { id: 'sec3a', number: '3.1', title: 'The surgeon', parentId: 'sec3', order: 0 },
  { id: 'sec3b', number: '3.2', title: 'The anaesthetist', parentId: 'sec3', order: 1 },
  { id: 'sec4', number: '4', title: 'Weekly rosters', parentId: null, order: 3 },
  { id: 'secA', number: 'A', title: 'Booking fields', parentId: null, order: 4, isAppendix: true },
];

describe('policy review steps — one list, shared by the page and the route', () => {
  const steps = buildPolicySteps(DRAFT_SECTIONS);

  it('opens with welcome and ends with review and submit', () => {
    expect(steps[0].id).toBe(WELCOME_STEP_ID);
    expect(steps[steps.length - 1].id).toBe(REVIEW_STEP_ID);
    expect(steps[steps.length - 2].id).toBe(GENERAL_STEP_ID);
  });

  it('gives a step to each TOP-LEVEL section only', () => {
    // Section 3 alone has twelve subsections in the real draft. A step each
    // would make this a sixty-step form on a phone over hospital mobile data.
    const sectionSteps = steps.filter((s) => s.kind === 'section');
    expect(sectionSteps.map((s) => s.sectionId)).toEqual([
      'sec1', 'sec2', 'sec3', 'sec4', 'secA',
    ]);
  });

  it('collects a parent and its subsections in the SAME step', () => {
    const three = steps.find((s) => s.sectionId === 'sec3');
    expect(three!.requires).toEqual(['sec3', 'sec3a', 'sec3b']);
  });

  it('labels a step the way the committee cites it', () => {
    expect(steps.find((s) => s.sectionId === 'sec3')!.label)
      .toBe('3. Roles and responsibilities');
  });

  it('keeps the step id stable and recoverable', () => {
    expect(sectionStepId('sec3')).toBe('section:sec3');
    expect(sectionIdOfStep('section:sec3')).toBe('sec3');
    expect(sectionIdOfStep(GENERAL_STEP_ID)).toBeNull();
    expect(sectionIdOfStep(null)).toBeNull();
    expect(sectionIdOfStep('section:')).toBeNull();
  });

  it('treats an orphaned subsection as top level rather than dropping it', () => {
    // Losing a section silently is worse than showing it at the wrong depth:
    // nobody reviews what they cannot see.
    const orphan = buildPolicySteps([
      { id: 'a', number: '1', title: 'One', parentId: null, order: 0 },
      { id: 'b', number: '9.4', title: 'Stray', parentId: 'gone', order: 1 },
    ]);
    expect(orphan.filter((s) => s.kind === 'section').map((s) => s.sectionId))
      .toEqual(['a', 'b']);
  });

  it('orders deterministically when the importer gave everything order 0', () => {
    const flat = buildPolicySteps([
      { id: 'b', number: '10', title: 'Ten', parentId: null, order: 0 },
      { id: 'a', number: '2', title: 'Two', parentId: null, order: 0 },
    ]);
    // Numeric collation, so 2 precedes 10 rather than sorting as strings.
    expect(flat.filter((s) => s.kind === 'section').map((s) => s.sectionId))
      .toEqual(['a', 'b']);
  });

  it('counts a step done only when every section in it is answered', () => {
    const three = steps.find((s) => s.sectionId === 'sec3')!;
    expect(isStepComplete(three, new Set(['sec3', 'sec3a']))).toBe(false);
    expect(isStepComplete(three, new Set(['sec3', 'sec3a', 'sec3b']))).toBe(true);
  });

  it('never reports a non-section step as complete', () => {
    // Welcome and submit are not work. Counting them would let a reviewer who
    // has answered nothing be shown as part-way through.
    for (const step of steps.filter((s) => s.kind !== 'section')) {
      expect(isStepComplete(step, new Set(['sec1', 'sec2']))).toBe(false);
    }
  });
});

describe('progress — what "7 of 22" is counted from', () => {
  const steps = buildPolicySteps(DRAFT_SECTIONS);

  it('counts section steps, not every screen', () => {
    const p = policyProgress(steps, new Set(['sec1']));
    expect(p.total).toBe(5);
    expect(p.done).toBe(1);
    expect(p.percent).toBe(20);
  });

  it('counts individual sections too, subsections included', () => {
    const p = policyProgress(steps, new Set(['sec1', 'sec3', 'sec3a']));
    expect(p.sectionsTotal).toBe(7);
    expect(p.sectionsAnswered).toBe(3);
    // Section 3 is not DONE, because 3.2 is unanswered.
    expect(p.done).toBe(1);
  });

  it('reports zero rather than dividing by zero on an empty document', () => {
    const p = policyProgress(buildPolicySteps([]), new Set());
    expect(p).toMatchObject({ done: 0, total: 0, percent: 0 });
  });
});

describe('resolving the cursor — the "continue where you stopped" promise', () => {
  const steps = buildPolicySteps(DRAFT_SECTIONS);

  it('puts a first-time visitor on the welcome screen', () => {
    const at = resolveCursor({ steps, storedStepId: null, answered: new Set() });
    expect(at).toMatchObject({ index: 0, stepId: WELCOME_STEP_ID, reason: 'fresh' });
  });

  it('returns somebody to exactly the step they saved', () => {
    const at = resolveCursor({
      steps,
      storedStepId: sectionStepId('sec3'),
      answered: new Set(['sec1', 'sec2']),
    });
    expect(at.reason).toBe('saved');
    expect(at.stepId).toBe(sectionStepId('sec3'));
  });

  it('honours a saved step even when that step is already answered', () => {
    // They may have stopped mid-edit deliberately. Skipping them forward would
    // discard the reason they were there.
    const at = resolveCursor({
      steps,
      storedStepId: sectionStepId('sec1'),
      answered: new Set(['sec1']),
    });
    expect(at).toMatchObject({ stepId: sectionStepId('sec1'), reason: 'saved' });
  });

  it('resolves a VANISHED step FORWARD, never back to the beginning', () => {
    // The failure this module exists to avoid. A cursor pointing at a section
    // that was merged away must not dump somebody who has answered four
    // sections back at the start of a twenty-two step review.
    const at = resolveCursor({
      steps,
      storedStepId: sectionStepId('merged-away'),
      answered: new Set(['sec1', 'sec2', 'sec3', 'sec3a', 'sec3b']),
    });
    expect(at.reason).toBe('step-missing');
    expect(at.index).toBeGreaterThan(0);
    expect(at.stepId).toBe(sectionStepId('sec4'));
  });

  it('never resolves to the welcome step once there is any progress', () => {
    // Belt and braces across every shape of stored cursor, because this is the
    // one regression a reviewer would describe as "it lost my work".
    const answered = new Set(['sec1']);
    for (const storedStepId of [null, undefined, '', 'section:gone', 'nonsense']) {
      const at = resolveCursor({ steps, storedStepId, answered });
      expect(at.stepId, `stored=${String(storedStepId)}`).not.toBe(WELCOME_STEP_ID);
      expect(at.index, `stored=${String(storedStepId)}`).toBeGreaterThan(0);
    }
  });

  it('lands on review and submit when everything is answered', () => {
    const all = new Set(DRAFT_SECTIONS.map((s) => s.id));
    const at = resolveCursor({ steps, storedStepId: null, answered: all });
    expect(at).toMatchObject({ stepId: REVIEW_STEP_ID, reason: 'complete' });
  });

  it('skips a step whose subsection is still unanswered', () => {
    const at = firstUnansweredStepIndex(steps, new Set(['sec1', 'sec2', 'sec3', 'sec3a']));
    expect(steps[at].sectionId).toBe('sec3');
  });

  it('validates a step id against the round, not a hardcoded list', () => {
    expect(isKnownStepId(steps, sectionStepId('sec3'))).toBe(true);
    expect(isKnownStepId(steps, REVIEW_STEP_ID)).toBe(true);
    expect(isKnownStepId(steps, sectionStepId('nope'))).toBe(false);
    expect(isKnownStepId(steps, null)).toBe(false);
  });

  it('survives an empty document without throwing', () => {
    const at = resolveCursor({ steps: [], storedStepId: 'anything', answered: new Set() });
    expect(at.index).toBe(0);
  });
});

describe('reading a heading', () => {
  it('splits the numbered forms the draft actually uses', () => {
    expect(parseHeadingText('5.4 Perioperative laboratory service'))
      .toMatchObject({ number: '5.4', title: 'Perioperative laboratory service' });
    expect(parseHeadingText('Section 6: Pre-anaesthetic review'))
      .toMatchObject({ number: '6', title: 'Pre-anaesthetic review' });
    expect(parseHeadingText('10. Valid and invalid reasons for cancellation'))
      .toMatchObject({ number: '10', title: 'Valid and invalid reasons for cancellation' });
    expect(parseHeadingText('3.12 Dedicated clinical assistants'))
      .toMatchObject({ number: '3.12', title: 'Dedicated clinical assistants' });
  });

  it('reads an appendix as an appendix, in both forms', () => {
    expect(parseHeadingText('Appendix A: Booking fields'))
      .toMatchObject({ number: 'A', title: 'Booking fields', isAppendix: true });
    expect(parseHeadingText('B. Cancellation codes'))
      .toMatchObject({ number: 'B', title: 'Cancellation codes', isAppendix: true });
  });

  it('leaves an unnumbered heading unnumbered rather than inventing one', () => {
    expect(parseHeadingText('Document control'))
      .toMatchObject({ number: null, title: 'Document control', isAppendix: false });
  });

  it('gives a bare number a title of its own', () => {
    expect(parseHeadingText('12.')).toMatchObject({ number: '12', title: 'Section 12' });
  });

  it('never returns an empty title', () => {
    expect(parseHeadingText('   ').title).toBe('Untitled section');
    expect(parseHeadingText('###').title).toBeTruthy();
  });

  it('knows a subsection states its own parent', () => {
    expect(parentNumberOf('5.4')).toBe('5');
    expect(parentNumberOf('3.12.1')).toBe('3.12');
    expect(parentNumberOf('7')).toBeNull();
    expect(parentNumberOf('A')).toBeNull();
    expect(parentNumberOf(null)).toBeNull();
  });
});

describe('parsing a draft into sections', () => {
  const MD = [
    'Version 0.2, prepared for the Theatre Users Committee.',
    '',
    '# 1 Purpose and scope',
    'This policy covers booking.',
    '',
    '# 3 Roles and responsibilities',
    'Everyone has a part.',
    '',
    '# 3.1 The surgeon',
    'The surgeon books by [15:30].',
    '',
    '## 3.2 The anaesthetist',
    'The anaesthetist reviews.',
    '',
    '# Appendix A: Booking fields',
    '| Field | Required |',
    '| --- | --- |',
    '| Folder number | Yes |',
  ].join('\n');

  const parsed = parseMarkdownSections(MD);
  const byTitle = (t: string) => parsed.find((s) => s.title === t)!;

  it('keeps content that appears before the first heading', () => {
    // In this draft that block is the document control table, which the
    // committee does review. Dropping it would silently remove a section.
    const front = byTitle('Front matter');
    expect(front.body).toContain('Version 0.2');
    expect(front.parentKey).toBeNull();
  });

  it('nests by NUMBER, not by heading depth', () => {
    // 3.1 is written as "#" and 3.2 as "##" -- exactly the inconsistency a
    // word-processor export produces. Both belong to section 3.
    const three = byTitle('Roles and responsibilities');
    expect(byTitle('The surgeon').parentKey).toBe(three.key);
    expect(byTitle('The anaesthetist').parentKey).toBe(three.key);
  });

  it('leaves appendices at the top level', () => {
    const appendix = byTitle('Booking fields');
    expect(appendix.parentKey).toBeNull();
    expect(appendix.isAppendix).toBe(true);
  });

  it('preserves a table in the body as written', () => {
    expect(byTitle('Booking fields').body).toContain('| Folder number | Yes |');
  });

  it('numbers siblings in document order from zero', () => {
    expect(byTitle('The surgeon').order).toBe(0);
    expect(byTitle('The anaesthetist').order).toBe(1);
  });

  it('ignores a # inside a fenced code block', () => {
    // The draft's appendices contain fenced blocks. A "#" in one is a comment
    // character; without this the importer invents sections out of samples.
    const withFence = parseMarkdownSections([
      '# 1 Real section',
      '',
      '```',
      '# NOT a heading',
      '```',
      '',
      '# 2 Another real section',
    ].join('\n'));
    expect(withFence.map((s) => s.title))
      .toEqual(['Real section', 'Another real section']);
  });

  it('keeps a subsection whose parent is missing', () => {
    const orphan = parseMarkdownSections('# 9.4 Stray subsection\nText.');
    expect(orphan).toHaveLength(1);
    expect(orphan[0].parentKey).toBeNull();
  });

  it('summarises the parse for the preview screen', () => {
    const summary = summariseImport(parsed);
    expect(summary.sections).toBe(parsed.length);
    expect(summary.appendices).toBe(1);
    expect(summary.topLevel).toBeGreaterThan(0);
  });

  it('returns nothing at all for an empty upload, without throwing', () => {
    expect(parseMarkdownSections('')).toEqual([]);
    expect(parseMarkdownSections('   \n  \n')).toEqual([]);
  });
});

describe('finding the values in [square brackets]', () => {
  it('types each form the draft uses', () => {
    expect(guessDecisionItemType('11:00')).toBe('TIME');
    expect(guessDecisionItemType('15.30')).toBe('TIME');
    expect(guessDecisionItemType('80%')).toBe('PERCENTAGE');
    expect(guessDecisionItemType('24 hours')).toBe('DURATION');
    expect(guessDecisionItemType('30 minutes')).toBe('DURATION');
    expect(guessDecisionItemType('twenty-four hours')).toBe('DURATION');
    expect(guessDecisionItemType('3')).toBe('NUMBER');
    expect(guessDecisionItemType('number')).toBe('NUMBER');
    expect(guessDecisionItemType('agreed secure location')).toBe('FREE_TEXT');
  });

  it('only calls something a choice when it really looks like one', () => {
    // A sentence containing the word "or" must not become a dropdown.
    expect(splitChoices('11:00 or 14:00')).toEqual(['11:00', '14:00']);
    expect(splitChoices('weekly / fortnightly')).toEqual(['weekly', 'fortnightly']);
    expect(splitChoices('agreed secure location')).toBeNull();
    expect(splitChoices(
      'the theatre manager or, where unavailable, the deputy; decided locally.',
    )).toBeNull();
  });

  it('pulls every open value out of a section, in document order', () => {
    const body = 'Bookings close at [15:30]. Review starts by [11:00]. Target [80%].';
    const items = detectDecisionItems(body);
    expect(items.map((i) => i.currentValue)).toEqual(['15:30', '11:00', '80%']);
    expect(items.map((i) => i.type)).toEqual(['TIME', 'TIME', 'PERCENTAGE']);
  });

  it('does NOT treat a Markdown link as an open value', () => {
    // The draft cites circulars this way. Asking the committee to choose a new
    // value for "the 2024 circular" is worse than useless.
    const items = detectDecisionItems('See [the 2024 circular](https://x.example) and [11:00].');
    expect(items.map((i) => i.currentValue)).toEqual(['11:00']);
  });

  it('does NOT treat a form checkbox as an open value', () => {
    // Appendix F is a form of these.
    const items = detectDecisionItems('- [ ] Consent signed\n- [x] Notes ready\n- By [11:00].');
    expect(items.map((i) => i.currentValue)).toEqual(['11:00']);
  });

  it('keeps the surrounding sentence, because a bare [80%] means nothing', () => {
    const body = 'Cases must start on time. The target is [80%] of first cases. Audit monthly.';
    const items = detectDecisionItems(body);
    expect(items[0].surroundingSentence).toBe('The target is [80%] of first cases.');
  });

  it('reads a table row as the context when the value lives in a table', () => {
    const body = '| On-time start | [80%] | Monthly |';
    expect(detectDecisionItems(body)[0].surroundingSentence)
      .toBe('On-time start — [80%] — Monthly');
  });

  it('does not run off the end of the body', () => {
    expect(surroundingSentenceOf('By [11:00]', 3, 10)).toBe('By [11:00]');
    expect(detectDecisionItems('[11:00]')[0].surroundingSentence).toBe('[11:00]');
  });

  it('finds nothing in a section with nothing open', () => {
    expect(detectDecisionItems('A plain paragraph with no brackets.')).toEqual([]);
    expect(detectDecisionItems('')).toEqual([]);
  });
});

describe('who may do what', () => {
  it('makes the committee chairman the owner', () => {
    expect(policyRoleOf('THEATRE_CHAIRMAN')).toBe('owner');
    expect(canOwnPolicyReview('THEATRE_CHAIRMAN')).toBe(true);
  });

  it('lets an administrator name a deputy without widening the role list', () => {
    // A named deputy is a named person. Adding THEATRE_MANAGER to the owner
    // roles would hand every head of department the raw responses.
    expect(canOwnPolicyReview('THEATRE_MANAGER')).toBe(false);
    expect(canOwnPolicyReview('THEATRE_MANAGER', ['policy-review'])).toBe(true);
  });

  it('gives Management read-only sight and nothing more', () => {
    for (const role of ['CMAC', 'DC_MAC', 'CHIEF_MEDICAL_DIRECTOR']) {
      expect(policyRoleOf(role), role).toBe('observer');
      expect(canOwnPolicyReview(role), role).toBe(false);
      expect(canObservePolicyReview(role), role).toBe(true);
    }
  });

  it('shuts out every other role', () => {
    for (const role of ['SURGEON', 'SCRUB_NURSE', 'WARD_NURSE_IN_CHARGE', 'PORTER', '', null]) {
      expect(policyRoleOf(role), String(role)).toBe('none');
      expect(canObservePolicyReview(role), String(role)).toBe(false);
    }
  });

  it('does not demote an owner who also holds an observer role', () => {
    expect(policyRoleOf('ADMIN')).toBe('owner');
  });

  it('keeps individual responses from an observer until they are released', () => {
    const observer = { role: 'CMAC' as string | null };
    expect(canSeeIndividualResponses({ ...observer, visibility: 'OWNER_ONLY' })).toBe(false);
    expect(canSeeIndividualResponses({ ...observer, visibility: 'RELEASED_BY_ROLE' })).toBe(true);
    expect(attributionFor({ ...observer, visibility: 'RELEASED_BY_ROLE' })).toBe('role-only');
    expect(attributionFor({ ...observer, visibility: 'RELEASED_ATTRIBUTED' })).toBe('full');
  });

  it('always shows the owner who said what', () => {
    // They cannot reconcile two heads of department disagreeing without
    // knowing which two.
    expect(attributionFor({ role: 'THEATRE_CHAIRMAN', visibility: 'OWNER_ONLY' })).toBe('full');
  });

  it('shows a stranger nothing, however the round is set', () => {
    for (const visibility of ['OWNER_ONLY', 'RELEASED_ATTRIBUTED', 'RELEASED_BY_ROLE'] as const) {
      expect(attributionFor({ role: 'PORTER', visibility }), visibility).toBe('none');
    }
  });
});

describe('the link that reaches a head of department', () => {
  it('stores only the hash, never the token', () => {
    const { token, tokenHash } = newPolicyInviteToken();
    expect(token).not.toBe(tokenHash);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hashPolicyInviteToken(token)).toBe(tokenHash);
  });

  it('issues a different token every time', () => {
    const a = newPolicyInviteToken();
    const b = newPolicyInviteToken();
    expect(a.token).not.toBe(b.token);
  });

  const open = {
    status: 'OPEN',
    opensAt: new Date('2026-11-15T08:00:00Z'),
    closesAt: new Date('2026-11-19T22:59:00Z'),
  };
  const live = { revokedAt: null, expiresAt: new Date('2026-11-19T22:59:00Z') };
  const now = new Date('2026-11-16T10:00:00Z');

  it('opens for an invited member while the round is open', () => {
    expect(policyInviteState(live, open, now)).toEqual({ ok: true });
  });

  it('refuses a link nobody issued', () => {
    expect(policyInviteState(null, open, now)).toMatchObject({ problem: 'NOT_FOUND' });
  });

  it('refuses a withdrawn link immediately', () => {
    const revoked = { ...live, revokedAt: new Date('2026-11-16T09:00:00Z') };
    expect(policyInviteState(revoked, open, now)).toMatchObject({ problem: 'REVOKED' });
  });

  it('tells somebody who is too early to keep the message', () => {
    expect(policyInviteState(live, { ...open, status: 'DRAFT' }, now))
      .toMatchObject({ problem: 'ROUND_NOT_OPEN' });
    const later = { ...open, opensAt: new Date('2026-11-18T08:00:00Z') };
    expect(policyInviteState(live, later, now))
      .toMatchObject({ problem: 'ROUND_NOT_OPEN' });
  });

  it('refuses once the deadline has passed', () => {
    const after = new Date('2026-11-20T06:00:00Z');
    expect(policyInviteState(live, open, after)).toMatchObject({ problem: 'EXPIRED' });
  });

  it('has NO already-used state, because a member may revise until the deadline', () => {
    // The patient feedback invite is single use and must be. This is the
    // opposite: a head of department who re-reads section 7 at midnight should
    // be able to correct themselves, so submitting does not close the link.
    const states = ['NOT_FOUND', 'REVOKED', 'EXPIRED', 'ROUND_NOT_OPEN'];
    const code = codeOf('src/lib/policy/invite.ts');
    expect(code).not.toContain('ALREADY_USED');
    for (const s of states) expect(code, s).toContain(s);
    // And proving it behaviourally, not just by absence.
    expect(policyInviteState(live, open, now)).toEqual({ ok: true });
  });

  it('gives each refusal its own words', () => {
    const seen = new Set<string>();
    const cases: Array<[typeof live | null, typeof open]> = [
      [null, open],
      [{ ...live, revokedAt: now }, open],
      [live, { ...open, status: 'DRAFT' }],
    ];
    for (const [invite, round] of cases) {
      const state = policyInviteState(invite, round, now);
      expect(state.ok).toBe(false);
      if (!state.ok) seen.add(state.message);
    }
    expect(seen.size).toBe(3);
  });
});

describe('the WhatsApp message', () => {
  const closesAt = new Date('2026-11-19T22:59:00Z');

  it('states the deadline in Lagos time, not the server time', () => {
    // The cloud node runs in UTC. Formatting in the server zone would put
    // 22:59 in a message whose deadline is 23:59 -- an hour members plan around.
    const text = formatClosing(closesAt);
    expect(text).toContain('19 November 2026');
    expect(text).toContain('23:59');
  });

  it('rolls the date over correctly near midnight', () => {
    const text = formatClosing(new Date('2026-11-19T23:30:00Z'));
    expect(text).toContain('20 November 2026');
    expect(text).toContain('00:30');
  });

  it('carries the link, the deadline and the promise that work is not lost', () => {
    const msg = buildPolicyInviteMessage({
      url: 'https://unth-theatre.link/policy-review?t=abc',
      closesAt,
    });
    expect(msg).toContain('https://unth-theatre.link/policy-review?t=abc');
    expect(msg).toContain('23:59');
    expect(msg).toContain('20–30 minutes');
    expect(msg.toLowerCase()).toContain('come back');
  });

  it('names no person in the source, only the office', () => {
    // A chairman's name baked into a library is wrong the day the committee
    // elects somebody else, and real officers' names stay in configuration.
    const msg = buildPolicyInviteMessage({ url: 'https://x.example/r', closesAt });
    expect(msg).toContain('Chairman, Theatre Users Committee');
    expect(codeOf('src/lib/policy/invite.ts')).not.toMatch(/Nnadi|Chibuike/i);
  });

  it('signs with whoever the round says', () => {
    const msg = buildPolicyInviteMessage({
      url: 'https://x.example/r',
      closesAt,
      signatory: 'Dr A. Example',
      signatoryTitle: 'Acting Chairman',
    });
    expect(msg).toContain('*Dr A. Example*');
    expect(msg).toContain('Acting Chairman');
  });
});

describe('the new tables are classified for replication', () => {
  // syncCapture.test.ts already fails by name if a captured table has no
  // policy. These two assertions are about the pair staying in step for THIS
  // module, so the failure names the policy review rather than the sync layer.
  const POLICY_TABLES = [
    'policy_documents', 'policy_sections', 'policy_decision_items',
    'policy_review_rounds', 'policy_invitations', 'policy_participations',
    'policy_section_responses', 'policy_decision_item_responses',
    'policy_general_responses', 'policy_response_revisions',
    'policy_analysis_runs', 'policy_proposed_changes', 'policy_final_proposals',
  ];

  const migration = read(
    'prisma/migrations/20261115120000_policy_review/migration.sql',
  );
  const policy = read('src/lib/sync/syncPolicy.ts');

  it('enables capture for every table it creates', () => {
    const missing = POLICY_TABLES
      .filter((t) => !migration.includes(`sync_enable_table('${t}')`));
    expect(missing).toEqual([]);
  });

  it('classifies every table it enables', () => {
    const missing = POLICY_TABLES.filter((t) => !policy.includes(`table: '${t}'`));
    expect(missing).toEqual([]);
  });

  it('keeps the edit history append-only and the rest cloud-owned', () => {
    expect(policy).toContain(
      "{ table: 'policy_response_revisions', cls: 'APPEND_ONLY'",
    );
    expect(policy).toContain(
      "{ table: 'policy_section_responses', cls: 'CLOUD_AUTHORITATIVE'",
    );
  });

  it('carries no Prisma doc comment into the SQL', () => {
    // A triple slash in a migration once broke `migrate deploy` and blocked
    // every release for a day.
    expect(migration).not.toContain('///');
  });
});

describe('whose name goes on a response', () => {
  const invitation = {
    inviteeName: 'Dr A. Example',
    inviteeRole: 'Head of Anaesthesia',
    inviteeUnit: 'Anaesthesia',
  };

  it('gives the owner the name and the office', () => {
    expect(displayContributor(invitation, 'full'))
      .toBe('Dr A. Example (Head of Anaesthesia, Anaesthesia)');
  });

  it('reduces to the office alone when the owner released by role', () => {
    // "The Head of Anaesthesia objected" is often the useful fact, where the
    // name attached to it turns a policy review into a personal dispute.
    const shown = displayContributor(invitation, 'role-only');
    expect(shown).toBe('Head of Anaesthesia, Anaesthesia');
    expect(shown).not.toContain('Dr A. Example');
  });

  it('never leaks the name through a missing role or unit', () => {
    const anonymous = { inviteeName: 'Dr A. Example', inviteeRole: null, inviteeUnit: null };
    expect(displayContributor(anonymous, 'role-only')).toBe('A committee member');
    expect(displayContributor(anonymous, 'none')).toBe('Withheld');
    expect(displayContributor(invitation, 'none')).not.toContain('Example');
  });
});

describe('the invariants that live in the routes and the page', () => {
  // Source scans, deliberately few: each one pins a decision that is invisible
  // in behaviour until the day it is wrong.

  it('stores the step by its ID, never by its index', () => {
    // The booking wizard stores an index and maps it through two arrays that
    // have drifted out of order, so a resumed booking lands on the wrong step.
    const page = codeOf('src/app/policy-review/page.tsx');
    expect(page).toContain("kind: 'cursor', stepId");
    const route = codeOf('src/app/api/policy/review/route.ts');
    expect(route).toContain('isKnownStepId(buildPolicySteps(');
  });

  it('flushes the step on visibilitychange with a beacon, not on unload', () => {
    // On these handsets a member switching to WhatsApp may never get an
    // unload event: Android simply reclaims the tab.
    const page = codeOf('src/app/policy-review/page.tsx');
    expect(page).toContain('navigator.sendBeacon');
    expect(page).toContain("'visibilitychange'");
    expect(page).not.toContain('beforeunload');
  });

  it('answers a refused link with 200 and words, not a bare 404', () => {
    const route = codeOf('src/app/api/policy/review/route.ts');
    expect(route).toContain('status: 200');
  });

  it('never returns a token or its hash from the invitations route', () => {
    // Only the SHA-256 is stored; sending even that to a screen would serve no
    // purpose but to invite somebody to try reversing it.
    const route = codeOf('src/app/api/policy/rounds/[id]/invitations/route.ts');
    const selectBlock = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
    expect(selectBlock).not.toContain('tokenHash');
  });

  it('puts the general link outside /dashboard', () => {
    // /dashboard/policy-review is gated to the Chairman, so canAccessPath()
    // would refuse a surgeon the one page the general link exists to give them.
    const invite = codeOf('src/lib/policy/invite.ts');
    expect(invite).toContain('/policy-review?round=');
    expect(invite).not.toContain('/dashboard/policy-review/respond');
  });

  it('guards the reminder job and only QUEUES, never sends', () => {
    // Writing to WhatsApp directly would route around the kill switch, the
    // retry accounting and the audit trail. deadline-checker is the older,
    // unauthenticated pattern and is deliberately not copied.
    const route = codeOf('src/app/api/policy/reminders/route.ts');
    expect(route).toContain('authoriseCron(request)');
    expect(route).toContain('queueMessage(');
    expect(route).not.toContain('sendTemplate');
    expect(route).not.toContain('dispatchWhatsApp');
  });

  it('clears a concern that a "not my area" stance cannot support', () => {
    // A row claiming a HIGH patient-safety concern on a section the reviewer
    // marked outside their area would be counted as a safety objection.
    const route = codeOf('src/app/api/policy/review/route.ts');
    expect(route).toContain('wantsChange ? change.concernType ?? null : null');
  });

  it('is registered as a module the Chairman and Management can reach', () => {
    const modules = codeOf('src/lib/modules.ts');
    expect(modules).toContain("id: 'policy-review'");
    expect(modules).toContain("defaultRoles: ['THEATRE_CHAIRMAN', ...ADMIN_VIEWERS]");
  });

  it('has a scheduled run for the reminders', () => {
    expect(read('vercel.json')).toContain('/api/policy/reminders');
  });
});
