/**
 * The analysis as it stands, recomputed on every submission.
 *
 * The request was for the analysis to run in real time as responses are
 * submitted. The paid AI run cannot: it costs money per press, takes three
 * passes, and is chunked across several requests because one pass does not
 * finish inside the sixty seconds the deployment allows. Eighteen members would
 * mean eighteen paid runs where only the last is ever read.
 *
 * So what updates on every submission is the part the database can answer for
 * nothing: which sections are settled, which are contested, which proposed
 * value is winning, and what safety concerns have been raised.
 *
 * The tests below are mostly about one failure: a provisional picture that
 * reads as a finished one. A single response must never produce "100% agree",
 * and a stored AI analysis must never sit on screen looking current while
 * eleven more responses arrive behind it.
 */
import { describe, expect, it } from 'vitest';
import {
  sectionSignal,
  signalLabel,
  engagedCount,
  rankSections,
  leadingValue,
  coverageOf,
  provisionalBanner,
  stalenessOf,
  worthRerunning,
  liveSummary,
  type SectionLike,
} from '../../src/lib/policy/livePreview';

const section = (over: Partial<SectionLike> = {}): SectionLike => ({
  sectionId: 's1',
  number: '3.1',
  title: 'Booking times',
  agree: 0,
  agreeWithChanges: 0,
  disagree: 0,
  notMyArea: 0,
  answered: 0,
  changeRequests: 0,
  patientSafety: 0,
  highPriority: 0,
  ...over,
});

describe('where a section stands', () => {
  it('calls a section with too few views THIN, not agreed', () => {
    // THE FAILURE THIS EXISTS TO PREVENT. One person agreeing is not consensus,
    // and "100% agree" off a single response is how a provisional picture
    // becomes a decision nobody meant to take.
    expect(sectionSignal(section({ agree: 1, answered: 1 }))).toBe('THIN');
    expect(sectionSignal(section({ agree: 2, answered: 2 }))).toBe('THIN');
    expect(signalLabel('THIN')).toBe('Too few views yet');
  });

  it('does not count "not my area" as a view', () => {
    // Three people saying a section is not their business is not three views
    // on it.
    const s = section({ agree: 1, notMyArea: 9, answered: 10 });
    expect(engagedCount(s)).toBe(1);
    expect(sectionSignal(s)).toBe('THIN');
  });

  it('calls a clean agreement settled once enough have engaged', () => {
    expect(sectionSignal(section({ agree: 4, answered: 4 }))).toBe('SETTLED');
  });

  it('calls it contested when most want changes', () => {
    expect(sectionSignal(section({ agree: 1, agreeWithChanges: 3, answered: 4 })))
      .toBe('CONTESTED');
  });

  it('calls real opposition DIVIDED, which outranks a wording quibble', () => {
    expect(sectionSignal(section({ agree: 3, disagree: 2, answered: 5 }))).toBe('DIVIDED');
    expect(signalLabel('DIVIDED')).toBe('Opposed');
  });

  it('treats a lone objection among many as contested rather than divided', () => {
    // One dissenting voice in nine is a concern to read, not a split committee.
    expect(sectionSignal(section({ agree: 8, disagree: 1, answered: 9 }))).toBe('CONTESTED');
  });
});

describe('what to read first', () => {
  it('puts opposed sections above contested, and settled last', () => {
    const ranked = rankSections([
      section({ sectionId: 'settled', agree: 5, answered: 5 }),
      section({ sectionId: 'thin', agree: 1, answered: 1 }),
      section({ sectionId: 'divided', agree: 2, disagree: 3, answered: 5 }),
      section({ sectionId: 'contested', agree: 3, agreeWithChanges: 4, answered: 7 }),
    ]);
    expect(ranked.map((s) => s.sectionId))
      .toEqual(['divided', 'contested', 'thin', 'settled']);
  });

  it('lifts a safety flag above an equally contested section', () => {
    const ranked = rankSections([
      section({ sectionId: 'plain', agree: 2, disagree: 2, answered: 4 }),
      section({ sectionId: 'safety', agree: 2, disagree: 2, answered: 4, patientSafety: 2 }),
    ]);
    expect(ranked[0].sectionId).toBe('safety');
  });
});

describe('which value is winning', () => {
  const tally = (over: Record<string, unknown> = {}) => ({
    decisionItemId: 'd1',
    placeholder: '[11:00]',
    currentValue: '11:00',
    accepted: 0,
    proposals: [] as Array<{ value: string; support: number }>,
    answered: 0,
    ...over,
  });

  it('says nothing is winning when nobody has answered', () => {
    const v = leadingValue(tally());
    expect(v.answered).toBe(false);
    expect(v.support).toBe(0);
  });

  it('reports the current value leading when it is accepted most', () => {
    const v = leadingValue(tally({
      accepted: 5, answered: 7, proposals: [{ value: '12:00', support: 2 }],
    }));
    expect(v.value).toBe('11:00');
    expect(v.isCurrent).toBe(true);
    expect(v.margin).toBe(3);
    expect(v.contested).toBe(false);
  });

  it('reports a proposal overtaking the bracketed value', () => {
    const v = leadingValue(tally({
      accepted: 1, answered: 6, proposals: [{ value: '12:00', support: 5 }],
    }));
    expect(v.value).toBe('12:00');
    expect(v.isCurrent).toBe(false);
  });

  it('calls a one-vote gap contested rather than settled', () => {
    const v = leadingValue(tally({
      accepted: 3, answered: 5, proposals: [{ value: '12:00', support: 2 }],
    }));
    expect(v.contested).toBe(true);
  });

  it('reports a tie as a tie instead of picking by order', () => {
    // Settling "[11:00] or [12:00]" on whatever order the database returned
    // would be inventing a committee decision.
    const v = leadingValue(tally({
      accepted: 2, answered: 4, proposals: [{ value: '12:00', support: 2 }],
    }));
    expect(v.margin).toBe(0);
    expect(v.contested).toBe(true);
  });
});

describe('coverage and the provisional banner', () => {
  it('needs three responses before the reading is called reliable', () => {
    expect(coverageOf({ invited: 18, submitted: 2 }).enoughForAnalysis).toBe(false);
    expect(coverageOf({ invited: 18, submitted: 2 }).needed).toBe(1);
    expect(coverageOf({ invited: 18, submitted: 3 }).enoughForAnalysis).toBe(true);
  });

  it('always says what the picture is based on', () => {
    // A provisional analysis that does not announce itself gets quoted in a
    // meeting as though the committee had finished.
    const b = provisionalBanner(coverageOf({ invited: 18, submitted: 7 }), false);
    expect(b).toContain('PROVISIONAL');
    expect(b).toContain('7 of 18');
    expect(b).toContain('39%');
    expect(b).toContain('updates as each response arrives');
  });

  it('warns when there are too few to read anything into', () => {
    const b = provisionalBanner(coverageOf({ invited: 18, submitted: 1 }), false);
    expect(b).toContain('Too few');
    expect(b).toContain('2 more needed');
  });

  it('drops the provisional wording once the round is closed', () => {
    const b = provisionalBanner(coverageOf({ invited: 18, submitted: 15 }), true);
    expect(b).not.toContain('PROVISIONAL');
    expect(b).toContain('all 15 responses');
  });

  it('says so plainly when nothing has come in', () => {
    expect(provisionalBanner(coverageOf({ invited: 18, submitted: 0 }), false))
      .toContain('No responses yet');
  });

  it('never divides by zero on a round with nobody invited', () => {
    expect(coverageOf({ invited: 0, submitted: 0 }).percent).toBe(0);
  });
});

describe('how far the stored analysis has fallen behind', () => {
  it('says when it has never run', () => {
    const s = stalenessOf({ submittedAtRun: null, submittedNow: 7, lastRunAt: null });
    expect(s.hasRun).toBe(false);
    expect(s.stale).toBe(false);
  });

  it('is up to date when nothing has arrived since', () => {
    const s = stalenessOf({ submittedAtRun: 7, submittedNow: 7, lastRunAt: new Date() });
    expect(s.stale).toBe(false);
    expect(s.message).toContain('Up to date');
  });

  it('counts what has arrived since and says what the analysis covers', () => {
    // THE WHOLE REASON THE COUNT IS STORED. Without this, an analysis of seven
    // responses sits on screen looking current while eleven more arrive, and
    // nothing distinguishes the two.
    const s = stalenessOf({ submittedAtRun: 7, submittedNow: 11, lastRunAt: new Date() });
    expect(s.stale).toBe(true);
    expect(s.newSince).toBe(4);
    expect(s.message).toContain('4 further responses have arrived');
    expect(s.message).toContain('reflects 7 of 11');
  });

  it('reads correctly for a single new response', () => {
    const s = stalenessOf({ submittedAtRun: 7, submittedNow: 8, lastRunAt: new Date() });
    expect(s.message).toContain('1 further response has arrived');
  });

  it('never reports a negative backlog', () => {
    // Defensive: a response withdrawn after a run must not read as "-1 arrived".
    const s = stalenessOf({ submittedAtRun: 9, submittedNow: 7, lastRunAt: new Date() });
    expect(s.newSince).toBe(0);
    expect(s.stale).toBe(false);
  });
});

describe('whether to suggest paying for another run', () => {
  const enough = coverageOf({ invited: 18, submitted: 7 });

  it('suggests the first run once there is enough to analyse', () => {
    const s = stalenessOf({ submittedAtRun: null, submittedNow: 7, lastRunAt: null });
    expect(worthRerunning(s, enough)).toBe(true);
  });

  it('does not suggest one before three responses exist', () => {
    const thin = coverageOf({ invited: 18, submitted: 2 });
    const s = stalenessOf({ submittedAtRun: null, submittedNow: 2, lastRunAt: null });
    expect(worthRerunning(s, thin)).toBe(false);
  });

  it('holds off until a few more have come in', () => {
    // It is a SUGGESTION, never a trigger: the run spends money per press, and
    // a threshold that quietly re-ran would remove that rule by the back door.
    const one = stalenessOf({ submittedAtRun: 6, submittedNow: 7, lastRunAt: new Date() });
    expect(worthRerunning(one, enough)).toBe(false);

    const three = stalenessOf({ submittedAtRun: 4, submittedNow: 7, lastRunAt: new Date() });
    expect(worthRerunning(three, enough)).toBe(true);
  });
});

describe('the one-line summary', () => {
  it('counts each band and puts safety concerns first', () => {
    const line = liveSummary([
      section({ agree: 5, answered: 5 }),
      section({ agree: 1, agreeWithChanges: 4, answered: 5 }),
      section({ agree: 2, disagree: 3, answered: 5, patientSafety: 1 }),
      section({ agree: 1, answered: 1 }),
    ], coverageOf({ invited: 18, submitted: 7 }));

    expect(line).toContain('1 section agreed so far');
    expect(line).toContain('1 with changes requested');
    expect(line).toContain('1 opposed');
    expect(line).toContain('1 with too few views yet');
    expect(line).toContain('1 patient-safety concern raised — read those first');
  });

  it('says nothing to summarise before anybody has answered', () => {
    expect(liveSummary([], coverageOf({ invited: 18, submitted: 0 })))
      .toContain('Nothing to summarise');
  });
});
