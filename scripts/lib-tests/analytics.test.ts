/**
 * Operational analytics.
 *
 * These numbers will be used to judge theatres and departments, so the suite
 * is mostly about honesty rather than arithmetic: small samples declared,
 * unrecorded kept apart from failed, and nothing attributed to a person.
 */
import { describe, expect, it } from 'vitest';

import {
  bottlenecks,
  byDepartment,
  bySpecialty,
  byTheatre,
  delayTrend,
  MIN_SAMPLE_FOR_RANKING,
  overall,
  utilisation,
} from '../../src/lib/theatreOps/analytics';

const timings = (o: Record<string, unknown> = {}) => ({
  delayMinutes: null,
  onTime: null,
  transferMinutes: null,
  waitingMinutes: null,
  anaesthesiaPrepMinutes: null,
  operativeMinutes: null,
  closingMinutes: null,
  occupancyMinutes: null,
  missing: [],
  outOfSequence: [],
  ...o,
}) as never;

const kase = (id: string, o: Record<string, unknown> = {}, t: Record<string, unknown> = {}) => ({
  id,
  theatreName: 'Theatre 1',
  specialty: 'General Surgery',
  surgeryType: 'ELECTIVE',
  ...o,
  timings: timings(t),
});

describe('grouping performance', () => {
  it('splits by theatre and counts each', () => {
    const rows = byTheatre([
      kase('a', { theatreName: 'Theatre 1' }),
      kase('b', { theatreName: 'Theatre 1' }),
      kase('c', { theatreName: 'Theatre 2' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].key).toBe('Theatre 1');
    expect(rows[0].cases).toBe(2);
  });

  it('puts cases with no theatre into Unassigned rather than dropping them', () => {
    const rows = byTheatre([kase('a', { theatreName: null })]);
    expect(rows[0].key).toBe('Unassigned');
  });

  it('splits by specialty too', () => {
    const rows = bySpecialty([kase('a', { specialty: 'Urology' }), kase('b', { specialty: 'Urology' })]);
    expect(rows[0].key).toBe('Urology');
  });
});

describe('a small sample is declared, not hidden', () => {
  it('flags a group with too few assessable cases', () => {
    // Three cases give an on-time rate of 0, 33, 67 or 100 and nothing between.
    const rows = byTheatre([
      kase('a', {}, { onTime: true }),
      kase('b', {}, { onTime: false }),
      kase('c', {}, { onTime: true }),
    ]);
    expect(rows[0].smallSample).toBe(true);
    expect(rows[0].assessed).toBe(3);
  });

  it('does not flag one with enough to rank', () => {
    const many = Array.from({ length: MIN_SAMPLE_FOR_RANKING }, (_, i) => kase(`c${i}`, {}, { onTime: true }));
    expect(byTheatre(many)[0].smallSample).toBe(false);
  });
});

describe('unrecorded is not failure', () => {
  it('excludes unassessable cases from the on-time rate', () => {
    const rows = byTheatre([
      kase('a', {}, { onTime: true }),
      kase('b', {}, { onTime: null }),
      kase('c', {}, { onTime: null }),
    ]);
    expect(rows[0].onTimePercent).toBe(100);
    expect(rows[0].assessed).toBe(1);
    expect(rows[0].cases).toBe(3);
  });

  it('counts incomplete records separately, as a record-keeping figure', () => {
    const rows = byTheatre([
      kase('a', {}, { missing: ['ANAESTHESIA_STARTED'] }),
      kase('b', {}, { missing: [] }),
    ]);
    expect(rows[0].incompleteRecords).toBe(1);
  });

  it('reports record completeness alongside the headline', () => {
    const o = overall([
      kase('a', {}, { missing: [] }),
      kase('b', {}, { missing: [] }),
      kase('c', {}, { missing: ['SURGERY_ENDED'] }),
    ]);
    expect(o.recordCompleteness).toBe(67);
  });

  it('says nothing about completeness when there are no cases', () => {
    expect(overall([]).recordCompleteness).toBeNull();
  });
});

describe('the average delay', () => {
  it('averages only the cases that were actually LATE', () => {
    // Including early starts would net a genuinely late list back toward zero
    // and hide the problem.
    const rows = byTheatre([
      kase('a', {}, { delayMinutes: 30 }),
      kase('b', {}, { delayMinutes: -20 }),
      kase('c', {}, { delayMinutes: 50 }),
    ]);
    expect(rows[0].averageDelayMinutes).toBe(40);
  });

  it('is null when nothing was late', () => {
    expect(byTheatre([kase('a', {}, { delayMinutes: -5 })])[0].averageDelayMinutes).toBeNull();
  });
});

describe('the bottleneck list', () => {
  const delays = [
    // Twice a month, two hours each.
    { categoryCode: 'PACK_UNAVAILABLE', minutesLate: 120, recordedAt: '2026-08-01' },
    { categoryCode: 'PACK_UNAVAILABLE', minutesLate: 120, recordedAt: '2026-08-02' },
    // Daily, five minutes each.
    ...Array.from({ length: 20 }, (_, i) => ({
      categoryCode: 'DOCUMENTATION_INCOMPLETE', minutesLate: 5, recordedAt: `2026-08-${String(i + 1).padStart(2, '0')}`,
    })),
  ];

  it('ranks by MINUTES LOST, not by how often it happens', () => {
    // The rare, expensive cause is the one worth fixing, and ranking by count
    // would bury it beneath the frequent trivial one.
    const rows = bottlenecks(delays);
    expect(rows[0].code).toBe('PACK_UNAVAILABLE');
    expect(rows[0].totalMinutes).toBe(240);
    expect(rows[1].code).toBe('DOCUMENTATION_INCOMPLETE');
  });

  it('reports each cause’s share of the time lost', () => {
    const rows = bottlenecks(delays);
    expect(rows[0].sharePercent).toBeGreaterThan(60);
  });

  it('carries whether the cause was avoidable, without naming anyone', () => {
    const rows = bottlenecks([{ categoryCode: 'DIFFICULT_AIRWAY', minutesLate: 40, recordedAt: '2026-08-01' }]);
    expect(rows[0].avoidable).toBe(false);
  });

  it('handles a period with no delays', () => {
    expect(bottlenecks([])).toHaveLength(0);
  });
});

describe('the trend line', () => {
  it('includes days with no delays as an explicit zero', () => {
    // A gap reads as "no data"; a zero reads as "a good day". They are not the
    // same and the chart must say which.
    const trend = delayTrend(
      [{ categoryCode: 'PACK_UNAVAILABLE', minutesLate: 30, recordedAt: '2026-08-03T09:00:00Z' }],
      new Date('2026-08-01'),
      new Date('2026-08-05')
    );
    expect(trend).toHaveLength(5);
    expect(trend.find((d) => d.date === '2026-08-02')?.count).toBe(0);
    expect(trend.find((d) => d.date === '2026-08-03')?.count).toBe(1);
  });
});

describe('departmental responsiveness', () => {
  const e = (o: Record<string, unknown>) => ({
    notifiedRole: 'CSSD_STAFF',
    status: 'RESOLVED',
    createdAt: '2026-08-04T09:00:00Z',
    ...o,
  }) as never;

  it('averages acknowledgement time over those that WERE acknowledged', () => {
    const rows = byDepartment([
      e({ acknowledgedAt: '2026-08-04T09:10:00Z' }),
      e({ acknowledgedAt: '2026-08-04T09:20:00Z' }),
    ]);
    expect(rows[0].averageAcknowledgeMinutes).toBe(15);
  });

  it('counts an unanswered escalation as a FAILURE, not a very slow response', () => {
    // Folding it in as a huge number would let one case swamp the average and
    // obscure the simpler, more damning fact that nobody replied.
    const rows = byDepartment([
      e({ acknowledgedAt: '2026-08-04T09:10:00Z' }),
      e({ status: 'OPEN', acknowledgedAt: null }),
    ]);
    expect(rows[0].averageAcknowledgeMinutes).toBe(10);
    expect(rows[0].neverAcknowledged).toBe(1);
    expect(rows[0].stillOpen).toBe(1);
  });

  it('reports null when nothing was ever acknowledged', () => {
    expect(byDepartment([e({ status: 'OPEN', acknowledgedAt: null })])[0].averageAcknowledgeMinutes).toBeNull();
  });

  it('flags a department with too few escalations to judge', () => {
    expect(byDepartment([e({ acknowledgedAt: '2026-08-04T09:05:00Z' })])[0].smallSample).toBe(true);
  });

  it('never lets a negative clock produce a negative response time', () => {
    const rows = byDepartment([e({ acknowledgedAt: '2026-08-04T08:00:00Z' })]);
    expect(rows[0].averageAcknowledgeMinutes).toBe(0);
  });
});

describe('utilisation', () => {
  it('is occupied time over the sessions that actually ran', () => {
    const u = utilisation({
      cases: [kase('a', {}, { occupancyMinutes: 240 }), kase('b', {}, { occupancyMinutes: 120 })],
      daysWithLists: 1,
      sessionMinutesPerDay: 480,
    });
    expect(u.percent).toBe(75);
  });

  it('does not count a day with no list against a theatre', () => {
    const u = utilisation({ cases: [kase('a', {}, { occupancyMinutes: 240 })], daysWithLists: 1 });
    expect(u.availableMinutes).toBe(480);
  });

  it('caps at 100 rather than reporting an over-run as over-capacity', () => {
    const u = utilisation({ cases: [kase('a', {}, { occupancyMinutes: 600 })], daysWithLists: 1, sessionMinutesPerDay: 480 });
    expect(u.percent).toBe(100);
  });

  it('says how many cases could not be measured, so the figure is not mistaken for exact', () => {
    const u = utilisation({
      cases: [kase('a', {}, { occupancyMinutes: 240 }), kase('b', {}, { occupancyMinutes: null })],
      daysWithLists: 1,
    });
    expect(u.unrecorded).toBe(1);
  });

  it('reports null rather than dividing by no sessions', () => {
    expect(utilisation({ cases: [], daysWithLists: 0 }).percent).toBeNull();
  });
});
