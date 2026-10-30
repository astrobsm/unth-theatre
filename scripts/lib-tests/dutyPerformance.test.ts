import { describe, it, expect } from 'vitest';
import {
  buildDutyReport,
  formatMargin,
  formatRate,
  median,
  MIN_EVENTS_TO_RANK,
  COMMENDATION_RATE,
  CHASE_RATE,
} from '../../src/lib/dutyPerformance/report';
import { buildDutyChase, buildDutyCommendation } from '../../src/lib/dutyPerformance/messages';
import { buildWhatsAppSummary, buildCsv, periodLabel } from '../../src/lib/dutyPerformance/export';
import { DUTIES, DUTY_KEYS, isDutyKey, type DutyEvent } from '../../src/lib/dutyPerformance/types';
import { namesInDocument, dutyPdfFilename } from '../../src/lib/dutyPerformance/pdf';

// This board decides who is thanked in a departmental WhatsApp group and who
// receives a message about falling short. Every way of being wrong lands on a
// real person: scoring somebody 100% for work they never did, naming a
// colleague as failing in front of the whole department, or chasing a person
// who is meeting the standard.

const DUE = '2026-10-12T08:00:00Z';
const EARLY = '2026-10-11T08:00:00Z';   // 24h before the deadline
const JUST_LATE = '2026-10-12T09:00:00Z'; // 60 min past

const EV = (over: Partial<DutyEvent> = {}): DutyEvent => ({
  id: Math.random().toString(36).slice(2),
  personId: 'u1',
  personName: 'Dr A',
  unit: 'General Surgery',
  label: 'Patient X (PT1) — Hernia repair',
  dueAt: DUE,
  doneAt: EARLY,
  ...over,
});

const many = (n: number, over: Partial<DutyEvent> = {}) =>
  Array.from({ length: n }, () => EV(over));

const WINDOW = { from: '2026-10-01', to: '2026-10-31' };

describe('the five duties are declared once', () => {
  it('has a definition for every key, and no orphans', () => {
    DUTY_KEYS.forEach((k) => {
      expect(DUTIES[k]).toBeDefined();
      expect(DUTIES[k].key).toBe(k);
      // The chase and the commendation both read these. An empty one would
      // produce a message with a hole in the middle of a sentence.
      expect(DUTIES[k].label.length).toBeGreaterThan(0);
      expect(DUTIES[k].why.length).toBeGreaterThan(0);
      expect(DUTIES[k].deadline.length).toBeGreaterThan(0);
      expect(DUTIES[k].verb.length).toBeGreaterThan(0);
    });
    expect(Object.keys(DUTIES).sort()).toEqual(DUTY_KEYS.slice().sort());
  });

  it('recognises its own keys and nothing else', () => {
    expect(isDutyKey('PREOP_REVIEW')).toBe(true);
    expect(isDutyKey('NOT_A_DUTY')).toBe(false);
    expect(isDutyKey(null)).toBe(false);
  });
});

describe('counting a duty', () => {
  it('keeps work never done in the denominator', () => {
    // THE LINE THAT MATTERS MOST. Drop outstanding work and the person who
    // did nothing scores 100%, beating the person who did everything a
    // little late.
    const r = buildDutyReport('PREOP_REVIEW', [
      ...many(2),
      ...many(2, { doneAt: null }),
    ], WINDOW);
    expect(r.total).toBe(4);
    expect(r.done).toBe(2);
    expect(r.outstanding).toBe(2);
    expect(r.completionRate).toBe(0.5);
    expect(r.people[0].completionRate).toBe(0.5);
  });

  it('separates not doing it from doing it late', () => {
    const r = buildDutyReport('PREOP_REVIEW', [
      ...many(2),                               // on time
      ...many(3, { doneAt: JUST_LATE }),         // late
      ...many(1, { doneAt: null }),              // never
    ], WINDOW);
    expect(r.onTime).toBe(2);
    expect(r.late).toBe(3);
    expect(r.outstanding).toBe(1);
    // Completion counts everything; punctuality only what was actually done.
    expect(r.completionRate).toBeCloseTo(5 / 6, 10);
    expect(r.punctualityRate).toBeCloseTo(2 / 5, 10);
  });

  it('applies the duty’s own grace and no other', () => {
    // PREOP_REVIEW has no grace; EMERGENCY_ACK has five minutes. The same
    // event must be judged differently, because the two deadlines mean
    // different things.
    const fourMinLate = [EV({ doneAt: '2026-10-12T08:04:00Z' })];
    expect(DUTIES.PREOP_REVIEW.graceMinutes).toBe(0);
    expect(DUTIES.EMERGENCY_ACK.graceMinutes).toBe(5);
    expect(buildDutyReport('PREOP_REVIEW', fourMinLate, WINDOW).late).toBe(1);
    expect(buildDutyReport('EMERGENCY_ACK', fourMinLate, WINDOW).late).toBe(0);
  });

  it('never calls a duty with no deadline late', () => {
    // A null due time means "we do not know when this was owed". Treating
    // that as late would invent a failure out of missing data.
    const r = buildDutyReport('PREOP_REVIEW', [EV({ dueAt: null })], WINDOW);
    expect(r.late).toBe(0);
    expect(r.done).toBe(1);
  });

  it('takes the median margin, not the mean', () => {
    expect(median([1, 2, 500])).toBe(2);
    expect(median([])).toBeNull();
  });
});

describe('who may be ranked, thanked and chased', () => {
  it('will not rank somebody on one or two', () => {
    const r = buildDutyReport('PREOP_REVIEW', [
      ...many(MIN_EVENTS_TO_RANK - 1, { personId: 'few', personName: 'Dr Few' }),
      ...many(5, { personId: 'many', personName: 'Dr Many' }),
    ], WINDOW);
    expect(r.people.map((p) => p.name)).toEqual(['Dr Many']);
    expect(r.unranked.map((p) => p.name)).toEqual(['Dr Few']);
    expect(r.unranked[0].commendable).toBe(false);
  });

  it('judges commendation on all their work, not only what they did', () => {
    // Three of twenty, perfectly, is not a well-performed duty. Judging on
    // punctuality alone would commend exactly that.
    const r = buildDutyReport('PREOP_REVIEW', [
      ...many(3, { personId: 'partial', personName: 'Dr Partial' }),
      ...many(17, { personId: 'partial', personName: 'Dr Partial', doneAt: null }),
    ], WINDOW);
    const p = r.people.find((x) => x.name === 'Dr Partial')!;
    expect(p.punctualityRate).toBe(1);
    expect(p.commendable).toBe(false);
  });

  it('commends a record that is on time across the board', () => {
    const r = buildDutyReport('PREOP_REVIEW', many(10, { personId: 'good', personName: 'Dr Good' }), WINDOW);
    expect(r.commendable.map((p) => p.name)).toEqual(['Dr Good']);
    expect(r.people[0].perfect).toBe(true);
    expect(COMMENDATION_RATE).toBeGreaterThan(CHASE_RATE);
  });

  it('chases only those below the mark, worst first', () => {
    const r = buildDutyReport('PREOP_REVIEW', [
      ...many(10, { personId: 'fine', personName: 'Dr Fine' }),
      // 5 of 10 on time
      ...many(5, { personId: 'half', personName: 'Dr Half' }),
      ...many(5, { personId: 'half', personName: 'Dr Half', doneAt: null }),
      // 1 of 10 on time — worse
      ...many(1, { personId: 'worst', personName: 'Dr Worst' }),
      ...many(9, { personId: 'worst', personName: 'Dr Worst', doneAt: null }),
    ], WINDOW);
    expect(r.chaseable.map((p) => p.name)).toEqual(['Dr Worst', 'Dr Half']);
    expect(r.chaseable.some((p) => p.name === 'Dr Fine')).toBe(false);
  });

  it('never ranks, commends or chases work with no name on it', () => {
    // Unattributed work is a data problem, not a performer. It stays in the
    // totals, where it is visible, and out of every list that names people.
    const r = buildDutyReport('PREOP_REVIEW', many(6, { personId: null, personName: null }), WINDOW);
    expect(r.total).toBe(6);
    expect(r.people).toEqual([]);
    expect(r.commendable).toEqual([]);
    expect(r.chaseable).toEqual([]);
    expect(r.unranked[0].name).toBe('Not recorded');
  });

  it('keeps two people with the same name apart', () => {
    const r = buildDutyReport('PREOP_REVIEW', [
      ...many(3, { personId: 'x', personName: 'Dr Same' }),
      ...many(3, { personId: 'y', personName: 'Dr Same', doneAt: null }),
    ], WINDOW);
    expect(r.people.length + r.unranked.length).toBe(2);
  });

  it('puts the worst instances at the top of the detail', () => {
    const r = buildDutyReport('PREOP_REVIEW', [
      EV({ doneAt: EARLY }),
      EV({ doneAt: null }),
      EV({ doneAt: JUST_LATE }),
    ], WINDOW);
    expect(r.cases.map((c) => c.state)).toEqual(['OUTSTANDING', 'LATE', 'ON_TIME']);
  });

  it('returns an empty board rather than failing on nothing', () => {
    const r = buildDutyReport('PREOP_REVIEW', [], WINDOW);
    expect(r.total).toBe(0);
    expect(r.completionRate).toBeNull();
    expect(r.punctualityRate).toBeNull();
    expect(r.people).toEqual([]);
  });
});

describe('reading the numbers', () => {
  it('says early and late in words, with a sign that cannot be misread', () => {
    expect(formatMargin(null)).toBe('—');
    expect(formatMargin(0)).toBe('on the deadline');
    expect(formatMargin(45)).toBe('45m early');
    expect(formatMargin(-45)).toBe('45m late');
    expect(formatMargin(-90)).toBe('1h 30m late');
    expect(formatMargin(1440)).toBe('1d early');
  });

  it('rounds rates rather than implying precision it has not got', () => {
    expect(formatRate(null)).toBe('—');
    expect(formatRate(0.666)).toBe('67%');
  });

  it('names the period the way a person would say it', () => {
    expect(periodLabel('2026-10-01', '2026-10-31')).toBe('1–31 October 2026');
    expect(periodLabel('2026-10-28', '2026-11-03')).toBe('28 October – 3 November 2026');
  });
});

describe('the message that is actually sent', () => {
  const perf = {
    personId: 'u1', name: 'Dr A', units: ['General Surgery'],
    total: 10, done: 4, outstanding: 6, late: 2, onTime: 2,
    completionRate: 0.4, punctualityRate: 0.5, medianMarginMinutes: -30,
    perfect: false, ranked: true, commendable: false,
  };

  it('appeals rather than reprimands, and quotes their own figures', () => {
    const msg = buildDutyChase({
      personName: 'Dr A', duty: 'PHARMACY_PACKING', performance: perf, periodLabel: 'October',
    });
    expect(msg).toMatch(/appeal, not an accusation/i);
    expect(msg).toContain('4 of 10');
    expect(msg).toContain('6 never done');
    // The route out has to be in every one of these, or the message is a
    // complaint with no remedy attached.
    expect(msg).toMatch(/Theatre Manager|Theatre Chairman/);
    expect(msg).toContain(DUTIES.PHARMACY_PACKING.deadline);
  });

  it('carries no threat in a letter of appreciation', () => {
    // The moment a thank-you mentions what happens if you slip it stops
    // being a thank-you and becomes a warning with a compliment attached.
    const good = { ...perf, total: 10, done: 10, outstanding: 0, late: 0, onTime: 10,
      completionRate: 1, punctualityRate: 1, medianMarginMinutes: 600, perfect: true, commendable: true };
    const msg = buildDutyCommendation({
      personName: 'Dr A', duty: 'PREOP_REVIEW', performance: good, periodLabel: 'October',
    });
    expect(msg).not.toMatch(/warning|query|sanction|disciplin|falling short/i);
    expect(msg).toContain('10');
  });

  it('claims the top spot only when told to', () => {
    const good = { ...perf, done: 10, outstanding: 0, late: 0, onTime: 10, perfect: true, commendable: true };
    const plain = buildDutyCommendation({ personName: 'Dr A', duty: 'PREOP_REVIEW', performance: good, periodLabel: 'Oct' });
    expect(plain).not.toMatch(/best record/i);
    const top = buildDutyCommendation({
      personName: 'Dr A', duty: 'PREOP_REVIEW', performance: good, periodLabel: 'Oct',
      rankLabel: 'That is the best record in the hospital for this duty over the period.',
    });
    expect(top).toMatch(/best record/i);
  });
});

describe('what gets pasted into the group', () => {
  const report = () => buildDutyReport('CONSUMABLE_PACKING', [
    ...many(10, { personId: 'good', personName: 'Mrs Good' }),
    ...many(2, { personId: 'bad', personName: 'Mr Behind' }),
    ...many(8, { personId: 'bad', personName: 'Mr Behind', doneAt: null }),
  ], WINDOW);

  it('praises by name', () => {
    const text = buildWhatsAppSummary(report());
    expect(text).toContain('Mrs Good');
  });

  it('never names the people falling short', () => {
    // THE JUDGEMENT IN THIS FILE. A group message listing who is failing is a
    // public reprimand delivered to an audience with no standing to act on
    // it, and it produces humiliation and silence rather than packed
    // trolleys. The shortfall is reported as a count; the conversation
    // happens one to one.
    const text = buildWhatsAppSummary(report());
    expect(text).not.toContain('Mr Behind');
    expect(text).toMatch(/1 colleague is below/i);
    expect(text).toMatch(/not the place for names/i);
  });

  it('states the totals honestly, including what was never done', () => {
    const text = buildWhatsAppSummary(report());
    expect(text).toContain('20 due');
    expect(text).toContain('Not done at all: 8');
  });

  it('says so plainly when nothing was due', () => {
    const text = buildWhatsAppSummary(buildDutyReport('PREOP_REVIEW', [], WINDOW));
    expect(text).toMatch(/Nothing was due/i);
  });

  it('exports every instance to CSV, escaped so a comma cannot break a row', () => {
    const csv = buildCsv(buildDutyReport('PREOP_REVIEW', [
      EV({ label: 'Smith, John (PT1) — Repair' }),
    ], WINDOW));
    const lines = csv.split('\n');
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('"Smith, John (PT1) — Repair"');
  });
});

// ── Who the PDF names ──────────────────────────────────────────────────
//
// The decision that can actually harm somebody. A PDF is forwarded, pinned to
// a notice board and photographed; a name printed under "falling short"
// travels a great deal further than whoever printed it intended, and long
// after the conversation is over.

describe('who the printed document names', () => {
  const report = () => buildDutyReport('PHARMACY_PACKING', [
    ...many(10, { personId: 'good', personName: 'Mrs Good' }),
    ...many(2, { personId: 'bad', personName: 'Mr Behind' }),
    ...many(8, { personId: 'bad', personName: 'Mr Behind', doneAt: null }),
  ], WINDOW);

  it('names the commended by default', () => {
    // A thank-you to "the pharmacy team" thanks nobody.
    const named = namesInDocument(report());
    expect(named.commended).toContain('Mrs Good');
  });

  it('names nobody as falling short unless the annexe was asked for', () => {
    const named = namesInDocument(report());
    expect(named.shortfall).toEqual([]);
    expect(named.commended).not.toContain('Mr Behind');
  });

  it('names them only when the annexe is deliberately requested', () => {
    const named = namesInDocument(report(), { includeShortfallAnnexe: true });
    expect(named.shortfall).toEqual(['Mr Behind']);
  });

  it('treats an absent option as off, never as on', () => {
    // The dangerous default is the one that prints names. Any falsy value
    // must land on the safe side.
    expect(namesInDocument(report(), {}).shortfall).toEqual([]);
    expect(namesInDocument(report(), { includeShortfallAnnexe: false }).shortfall).toEqual([]);
    expect(namesInDocument(report(), { includeShortfallAnnexe: undefined }).shortfall).toEqual([]);
  });

  it('names a file so two periods cannot overwrite each other', () => {
    const r = report();
    expect(dutyPdfFilename(r)).toBe('duty-pharmacy-packing-2026-10-01-to-2026-10-31.pdf');
  });
});
