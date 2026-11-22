/**
 * The participation roster that goes out with the analysis.
 *
 * What was missing: the exported synthesis reported findings and cited response
 * ids, and said nothing at all about who had been asked. Management's first
 * question about a committee recommendation is how many of the committee stood
 * behind it, and the answer was on a screen in the app that nobody holding the
 * PDF could reach.
 *
 * The tests below are mostly about not flattering the result. A roster is a
 * document that can mislead in exactly one direction — by making a review of
 * four look like a review of four out of four — so the silent members, the
 * people who opened a link and did nothing, and the withdrawn invitations all
 * have to survive into the table and the arithmetic.
 */
import { describe, expect, it } from 'vitest';
import {
  participationLevel,
  levelLabel,
  countsAsParticipating,
  withLevels,
  sortRoster,
  rosterSummary,
  rosterSentence,
  rosterMarkdown,
  rosterTableRows,
  answeredText,
  ROSTER_COLUMNS,
  type RosterInput,
} from '../../src/lib/policy/roster';

const row = (over: Partial<RosterInput> = {}): RosterInput => ({
  contributor: 'Dr A. Example (Consultant, Surgery)',
  openedAt: null,
  submittedAt: null,
  revokedAt: null,
  answered: 0,
  ...over,
});

describe('how far one member got', () => {
  it('counts a submitted review as submitted', () => {
    expect(participationLevel(row({ openedAt: new Date(), submittedAt: new Date(), answered: 22 })))
      .toBe('SUBMITTED');
  });

  it('counts work done but not sent as in progress', () => {
    expect(participationLevel(row({ openedAt: new Date(), answered: 7 }))).toBe('IN_PROGRESS');
  });

  it('does NOT count merely opening the link as taking part', () => {
    // THE FIGURE THAT WOULD BE INFLATED. Tapping a WhatsApp link is what
    // everybody does first; treating it as participation would report a
    // committee as engaged when nobody had written a word.
    const level = participationLevel(row({ openedAt: new Date(), answered: 0 }));
    expect(level).toBe('OPENED_ONLY');
    expect(countsAsParticipating(level)).toBe(false);
  });

  it('counts silence as silence', () => {
    expect(participationLevel(row())).toBe('NOT_OPENED');
  });

  it('puts a withdrawal above everything that happened before it', () => {
    expect(participationLevel(row({
      openedAt: new Date(), submittedAt: new Date(), revokedAt: new Date(), answered: 22,
    }))).toBe('WITHDRAWN');
  });

  it('treats only a submitted review as participation', () => {
    expect(countsAsParticipating('SUBMITTED')).toBe(true);
    for (const l of ['IN_PROGRESS', 'OPENED_ONLY', 'NOT_OPENED', 'WITHDRAWN'] as const) {
      expect(countsAsParticipating(l)).toBe(false);
    }
  });

  it('reads ISO strings, because the roster is built from JSON', () => {
    expect(participationLevel(row({ submittedAt: '2026-11-19T21:00:00.000Z', answered: 3 })))
      .toBe('SUBMITTED');
  });
});

describe('the order the table is read in', () => {
  it('leads with those who submitted and ends with withdrawals', () => {
    // The document is read to find out who did NOT respond. That should not
    // require reading to the bottom of eleven rows.
    const rows = withLevels([
      row({ contributor: 'Z silent' }),
      row({ contributor: 'W withdrawn', revokedAt: new Date() }),
      row({ contributor: 'A submitted', submittedAt: new Date(), answered: 22 }),
      row({ contributor: 'M partway', openedAt: new Date(), answered: 4 }),
    ]);
    expect(sortRoster(rows).map((r) => r.contributor))
      .toEqual(['A submitted', 'M partway', 'Z silent', 'W withdrawn']);
  });

  it('breaks ties alphabetically so the list is stable between exports', () => {
    const rows = withLevels([
      row({ contributor: 'Dr Zebra', submittedAt: new Date(), answered: 1 }),
      row({ contributor: 'Dr Apple', submittedAt: new Date(), answered: 1 }),
    ]);
    expect(sortRoster(rows).map((r) => r.contributor)).toEqual(['Dr Apple', 'Dr Zebra']);
  });
});

describe('the arithmetic', () => {
  const roster = withLevels([
    row({ contributor: 'S1', submittedAt: new Date(), answered: 22 }),
    row({ contributor: 'S2', submittedAt: new Date(), answered: 20 }),
    row({ contributor: 'P1', openedAt: new Date(), answered: 5 }),
    row({ contributor: 'O1', openedAt: new Date() }),
    row({ contributor: 'N1' }),
    row({ contributor: 'W1', revokedAt: new Date() }),
  ]);

  it('counts every state, and every invitee', () => {
    const s = rosterSummary(roster);
    expect(s).toMatchObject({
      invited: 6, submitted: 2, inProgress: 1, openedOnly: 1, notOpened: 1, withdrawn: 1,
    });
  });

  it('takes the rate over those actually asked, not over everybody', () => {
    // 2 submitted of 5 asked = 40%. Over all 6 it would read 33% and understate
    // the committee; counting the withdrawal as a response would overstate it.
    expect(rosterSummary(roster).responseRatePercent).toBe(40);
  });

  it('never divides by zero on a round where every invitation was withdrawn', () => {
    const s = rosterSummary(withLevels([row({ revokedAt: new Date() })]));
    expect(s.responseRatePercent).toBe(0);
  });

  it('reports an empty round as empty rather than as 0%', () => {
    expect(rosterSentence(rosterSummary([]))).toContain('Nobody was invited');
  });
});

describe('the sentence under the table', () => {
  it('gives the rate and then accounts for everybody else', () => {
    const s = rosterSentence(rosterSummary(withLevels([
      row({ submittedAt: new Date(), answered: 22 }),
      row({ openedAt: new Date(), answered: 3 }),
      row({ openedAt: new Date() }),
      row({}),
    ])));
    expect(s).toContain('1 of 4 invited members submitted a review (25%)');
    expect(s).toContain('1 started but did not submit');
    expect(s).toContain('1 opened the link without answering');
    expect(s).toContain('1 never opened it');
  });

  it('says withdrawals are excluded, rather than silently excluding them', () => {
    const s = rosterSentence(rosterSummary(withLevels([
      row({ submittedAt: new Date(), answered: 1 }),
      row({ revokedAt: new Date() }),
    ])));
    expect(s).toContain('excluded from the rate');
  });

  it('agrees with itself: one asked member reads "1 of 1 invited member"', () => {
    const s = rosterSentence(rosterSummary(withLevels([
      row({ submittedAt: new Date(), answered: 1 }),
    ])));
    expect(s).toContain('1 of 1 invited member submitted a review (100%)');
    expect(s).not.toContain('members submitted');
  });
});

describe('sections answered', () => {
  it('reads "7 of 22"', () => {
    const r = withLevels([row({ openedAt: new Date(), answered: 7 })])[0];
    expect(answeredText(r, 22)).toBe('7 of 22');
  });

  it('shows nothing for a withdrawal, where a count would imply it counted', () => {
    const r = withLevels([row({ revokedAt: new Date(), answered: 9 })])[0];
    expect(answeredText(r, 22)).toBe('—');
  });

  it('does not print "of 0" when the section total is unknown', () => {
    const r = withLevels([row({ answered: 3 })])[0];
    expect(answeredText(r, 0)).toBe('3');
  });
});

describe('the Markdown table', () => {
  const roster = withLevels([
    row({ contributor: 'Dr A. One', submittedAt: new Date(2026, 10, 19, 21, 0), answered: 22 }),
    row({ contributor: 'Dr B. Two' }),
  ]);

  it('lists every invitee, including the one who never answered', () => {
    const md = rosterMarkdown(roster, 22);
    expect(md).toContain('Dr A. One');
    expect(md).toContain('Dr B. Two');
    expect(md).toContain('Never opened the link');
  });

  it('writes the date from local parts', () => {
    expect(rosterMarkdown(roster, 22)).toContain('19 Nov 2026');
  });

  it('escapes a pipe in a unit name instead of silently adding a column', () => {
    const md = rosterMarkdown(withLevels([
      row({ contributor: 'Dr C (Theatre | Recovery)' }),
    ]), 22);
    expect(md).toContain('Theatre \\| Recovery');
  });

  it('marks somebody who joined through the group link', () => {
    const md = rosterMarkdown(withLevels([
      row({ contributor: 'Dr D', selfEnrolled: true, submittedAt: new Date(), answered: 2 }),
    ]), 22);
    expect(md).toContain('joined via group link');
  });

  it('says so plainly when nobody was invited', () => {
    expect(rosterMarkdown([], 22)).toContain('Nobody was invited');
  });
});

describe('the rows handed to the PDF', () => {
  it('match the column headings, so the table cannot be built skewed', () => {
    const rows = rosterTableRows(withLevels([row({ submittedAt: new Date(), answered: 2 })]), 22);
    expect(rows[0]).toHaveLength(ROSTER_COLUMNS.length);
  });

  it('carry the same order as the Markdown', () => {
    const roster = withLevels([
      row({ contributor: 'Z silent' }),
      row({ contributor: 'A submitted', submittedAt: new Date(), answered: 22 }),
    ]);
    expect(rosterTableRows(roster, 22).map((r) => r[0]))
      .toEqual(['A submitted', 'Z silent']);
  });
});
