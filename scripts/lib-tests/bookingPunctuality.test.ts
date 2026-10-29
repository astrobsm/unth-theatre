import { describe, it, expect } from 'vitest';
import {
  buildPunctualityReport,
  buildCommendationMessage,
  standingFor,
  noticeHours,
  formatNotice,
  median,
  MIN_CASES_TO_RANK,
  COMMENDATION_RATE,
} from '../../src/lib/lateBooking/punctuality';
import { buildLateBookingReport } from '../../src/lib/lateBooking/report';
import type { LateBookingCaseInput } from '../../src/lib/lateBooking/report';

// This board puts named colleagues in rank order and sends some of them a
// letter of appreciation. The ways it can be wrong all land on a real person:
// topping the board with a single on-time booking, commending somebody whose
// record does not support it, or quoting a percentage that disagrees with the
// one the late-booking report shows for the same person.

// Scheduled 12 Oct. The deadline is 15:00 WAT on 11 Oct = 11 Oct 14:00 UTC.
const SCHEDULED = '2026-10-12T00:00:00Z';
const LATE_AT = '2026-10-11T18:40:00Z'; // 4h40 past the deadline
const NOTICE_2H = '2026-10-11T12:00:00Z'; // 2 hours of notice
const NOTICE_53H = '2026-10-09T09:00:00Z'; // 53 hours of notice

const CASE = (over: Partial<LateBookingCaseInput> = {}): LateBookingCaseInput => ({
  id: Math.random().toString(36).slice(2),
  scheduledDate: SCHEDULED,
  scheduledTime: '09:00',
  createdAt: NOTICE_53H,
  surgeryType: 'ELECTIVE',
  unit: 'General Surgery',
  subspecialty: 'General Surgery',
  procedureName: 'Hernia repair',
  patientName: 'Patient X',
  folderNumber: 'PT1',
  bookedById: 'u1',
  bookedByName: 'Dr Punctual',
  surgeonName: 'Mr S',
  supervisingConsultantName: 'Prof C',
  team: [],
  ...over,
});

const many = (n: number, over: Partial<LateBookingCaseInput> = {}) =>
  Array.from({ length: n }, () => CASE(over));

const WINDOW = { from: '2026-10-01', to: '2026-10-31' };

describe('notice, measured not assumed', () => {
  it('counts the hours between the booking and the deadline it had to beat', () => {
    expect(noticeHours({ scheduledDate: SCHEDULED, bookedAt: NOTICE_2H })).toBe(2);
    expect(noticeHours({ scheduledDate: SCHEDULED, bookedAt: NOTICE_53H })).toBe(53);
  });

  it('refuses to report notice for a late booking', () => {
    // A negative "notice" averaged in with the real ones would let somebody
    // improve their notice figure by booking later. It must be absent, not
    // signed.
    expect(noticeHours({ scheduledDate: SCHEDULED, bookedAt: LATE_AT })).toBeNull();
  });

  it('says nothing when the booking time is unknown', () => {
    expect(noticeHours({ scheduledDate: SCHEDULED, bookedAt: null })).toBeNull();
  });

  it('reads the way a clinician would say it', () => {
    expect(formatNotice(null)).toBe('—');
    expect(formatNotice(1)).toBe('1 hour');
    expect(formatNotice(19)).toBe('19 hours');
    expect(formatNotice(48)).toBe('2 days');
    expect(formatNotice(53)).toBe('2.2 days');
  });

  it('takes the median, not the mean', () => {
    // One case booked three weeks early must not make a habitually
    // last-minute booker look excellent.
    expect(median([1, 2, 500])).toBe(2);
    expect(median([2, 4])).toBe(3);
    expect(median([])).toBeNull();
  });
});

describe('the board', () => {
  it('counts on-time elective bookings and leaves emergencies out', () => {
    const r = buildPunctualityReport(
      [
        CASE(),
        CASE({ createdAt: LATE_AT }),
        // An emergency could not have been booked ahead. Including it would
        // reward a unit for cases it had no control over.
        CASE({ surgeryType: 'EMERGENCY', createdAt: LATE_AT }),
      ],
      WINDOW,
    );
    expect(r.totalElective).toBe(2);
    expect(r.totalOnTime).toBe(1);
    expect(r.overallComplianceRate).toBe(0.5);
  });

  it('will not rank somebody on one case', () => {
    // One elective case booked on time is 100%. Putting that above a surgeon
    // with forty of forty-one turns the board into a prize for doing nothing.
    const r = buildPunctualityReport(
      [
        CASE({ bookedById: 'solo', bookedByName: 'Dr Solo' }),
        ...many(4, { bookedById: 'busy', bookedByName: 'Dr Busy' }),
      ],
      WINDOW,
    );
    expect(r.bookers.map((b) => b.name)).toEqual(['Dr Busy']);
    expect(r.unranked.map((b) => b.name)).toEqual(['Dr Solo']);
    // Listed, though — not quietly dropped.
    expect(r.unranked[0].complianceRate).toBe(1);
    expect(r.unranked[0].commendable).toBe(false);
  });

  it('needs the volume floor exactly, not nearly', () => {
    const r = buildPunctualityReport(
      many(MIN_CASES_TO_RANK, { bookedById: 'edge', bookedByName: 'Dr Edge' }),
      WINDOW,
    );
    expect(r.bookers[0].ranked).toBe(true);
    const under = buildPunctualityReport(
      many(MIN_CASES_TO_RANK - 1, { bookedById: 'edge', bookedByName: 'Dr Edge' }),
      WINDOW,
    );
    expect(under.bookers).toEqual([]);
  });

  it('ranks compliance first', () => {
    const r = buildPunctualityReport(
      [
        ...many(3, { bookedById: 'a', bookedByName: 'Dr A' }),
        ...many(2, { bookedById: 'b', bookedByName: 'Dr B' }),
        CASE({ bookedById: 'b', bookedByName: 'Dr B', createdAt: LATE_AT }),
      ],
      WINDOW,
    );
    expect(r.bookers.map((b) => b.name)).toEqual(['Dr A', 'Dr B']);
    expect(r.bookers[0].complianceRate).toBe(1);
    expect(Math.round((r.bookers[1].complianceRate ?? 0) * 100)).toBe(67);
  });

  it('breaks a tie on compliance with the notice given', () => {
    // Both are perfectly compliant. One books three days ahead and one books
    // two hours ahead. Treating them as equal would tell the hospital that
    // notice does not matter.
    const r = buildPunctualityReport(
      [
        ...many(5, { bookedById: 'rush', bookedByName: 'Dr Rush', createdAt: NOTICE_2H }),
        ...many(3, { bookedById: 'early', bookedByName: 'Dr Early', createdAt: NOTICE_53H }),
      ],
      WINDOW,
    );
    expect(r.bookers.map((b) => b.name)).toEqual(['Dr Early', 'Dr Rush']);
    expect(r.bookers[0].medianNoticeHours).toBe(53);
  });

  it('breaks a tie on compliance and notice with volume', () => {
    // Forty of forty on time is a larger achievement than three of three.
    const r = buildPunctualityReport(
      [
        ...many(3, { bookedById: 'few', bookedByName: 'Dr Few' }),
        ...many(12, { bookedById: 'many', bookedByName: 'Dr Many' }),
      ],
      WINDOW,
    );
    expect(r.bookers.map((b) => b.name)).toEqual(['Dr Many', 'Dr Few']);
  });

  it('commends only a record that meets both the floor and the rate', () => {
    const r = buildPunctualityReport(
      [
        // 4 of 4 — commendable.
        ...many(4, { bookedById: 'good', bookedByName: 'Dr Good' }),
        // 3 of 5 (60%) — ranked, not commendable.
        ...many(3, { bookedById: 'mid', bookedByName: 'Dr Mid' }),
        ...many(2, { bookedById: 'mid', bookedByName: 'Dr Mid', createdAt: LATE_AT }),
        // 1 of 1 — above the rate, below the floor.
        CASE({ bookedById: 'tiny', bookedByName: 'Dr Tiny' }),
      ],
      WINDOW,
    );
    expect(r.commendable.map((b) => b.name)).toEqual(['Dr Good']);
    expect(r.bookers.find((b) => b.name === 'Dr Mid')!.commendable).toBe(false);
    expect(COMMENDATION_RATE).toBeGreaterThan(0.6);
  });

  it('never commends a case with no booker recorded', () => {
    // An unattributed case is a data problem, not a performer. It stays
    // visible, but there is nobody to thank.
    const r = buildPunctualityReport(
      many(4, { bookedById: null, bookedByName: null }),
      WINDOW,
    );
    expect(r.bookers).toEqual([]);
    expect(r.unranked[0].name).toBe('Not recorded');
    expect(r.unranked[0].commendable).toBe(false);
  });

  it('keeps two people with the same name apart', () => {
    const r = buildPunctualityReport(
      [
        ...many(3, { bookedById: 'x', bookedByName: 'Dr Same' }),
        ...many(3, { bookedById: 'y', bookedByName: 'Dr Same', createdAt: LATE_AT }),
      ],
      WINDOW,
    );
    expect(r.bookers.length).toBe(2);
    expect(r.bookers.map((b) => b.complianceRate)).toEqual([1, 0]);
  });

  it('ranks units the same way and marks the ones too small to rank', () => {
    const r = buildPunctualityReport(
      [
        ...many(4, { unit: 'Urology', bookedById: 'u' }),
        ...many(2, { unit: 'Plastics', bookedById: 'p' }),
        ...many(2, { unit: 'Neuro', bookedById: 'n', createdAt: LATE_AT }),
        ...many(2, { unit: 'Neuro', bookedById: 'n' }),
      ],
      WINDOW,
    );
    expect(r.units[0].unit).toBe('Urology');
    expect(r.units[0].complianceRate).toBe(1);
    expect(r.units.find((u) => u.unit === 'Plastics')!.ranked).toBe(false);
    expect(r.units.find((u) => u.unit === 'Neuro')!.complianceRate).toBe(0.5);
  });

  it('returns an empty board rather than failing on no cases', () => {
    const r = buildPunctualityReport([], WINDOW);
    expect(r.totalElective).toBe(0);
    expect(r.overallComplianceRate).toBeNull();
    expect(r.medianNoticeHours).toBeNull();
    expect(r.bookers).toEqual([]);
    expect(r.commendable).toEqual([]);
  });
});

describe('the two boards cannot disagree about one person', () => {
  it('reports a compliance rate that is the complement of the breach rate', () => {
    // A breach rate of 40% on one page beside a compliance rate of 70% on the
    // other is the kind of discrepancy that gets raised in a meeting, and the
    // person raising it would be right.
    const rows = [
      ...many(6, { bookedById: 'u1', bookedByName: 'Dr A' }),
      ...many(4, { bookedById: 'u1', bookedByName: 'Dr A', createdAt: LATE_AT }),
    ];
    const late = buildLateBookingReport(rows, WINDOW);
    const board = buildPunctualityReport(rows, WINDOW);

    expect(late.totalElective).toBe(board.totalElective);
    expect((late.overallRate ?? 0) + (board.overallComplianceRate ?? 0)).toBeCloseTo(1, 10);
    expect(late.offenders[0].count).toBe(board.bookers[0].late);
  });

  it('gives the chase the same figure the board shows', () => {
    // standingFor is what the chase message quotes back to a named clinician.
    // It has to agree with the board, or a warning states one rate while the
    // ranking states another.
    const rows = [
      ...many(7, { bookedById: 'u1' }),
      ...many(3, { bookedById: 'u1', createdAt: LATE_AT }),
    ];
    const board = buildPunctualityReport(rows, WINDOW);
    const standing = standingFor(
      rows.map((r) => ({
        scheduledDate: r.scheduledDate,
        createdAt: r.createdAt,
        surgeryType: r.surgeryType,
      })),
    );

    expect(standing.electiveTotal).toBe(board.bookers[0].electiveTotal);
    expect(standing.late).toBe(board.bookers[0].late);
    expect(standing.lateRate).toBe(0.3);
    expect(standing.complianceRate).toBe(board.bookers[0].complianceRate);
  });

  it('says nothing rather than zero when there is nothing to report', () => {
    const s = standingFor([]);
    expect(s.lateRate).toBeNull();
    expect(s.complianceRate).toBeNull();
  });
});

describe('the letter of appreciation', () => {
  const perf = {
    electiveTotal: 12,
    onTime: 12,
    complianceRate: 1,
    medianNoticeHours: 53,
    perfect: true,
  };

  it('names the figures, so it cannot read as a circular', () => {
    const msg = buildCommendationMessage({
      personName: 'Dr Early',
      performance: perf,
      periodLabel: '1 October to 31 October 2026',
    });
    expect(msg).toContain('Dr Early');
    expect(msg).toContain('12');
    expect(msg).toContain('2.2 days');
    expect(msg).toContain('1 October to 31 October 2026');
  });

  it('quotes the percentage when the record is not perfect', () => {
    const msg = buildCommendationMessage({
      personName: 'Dr Good',
      performance: { electiveTotal: 10, onTime: 9, complianceRate: 0.9, medianNoticeHours: 30, perfect: false },
      periodLabel: 'October',
    });
    expect(msg).toContain('9 of your 10');
    expect(msg).toContain('90%');
  });

  it('carries no threat, no deadline and no sanction', () => {
    // The moment a letter of appreciation mentions what happens if you slip,
    // it stops being appreciation and becomes a warning with a compliment
    // attached. Nobody is thanked by that.
    const msg = buildCommendationMessage({
      personName: 'Dr Early',
      performance: perf,
      periodLabel: 'October',
    });
    expect(msg).not.toMatch(/warning|query|sanction|disciplin|will not have a nurse/i);
  });

  it('claims the top spot only when told to', () => {
    const plain = buildCommendationMessage({
      personName: 'Dr Early',
      performance: perf,
      periodLabel: 'October',
    });
    expect(plain).not.toMatch(/best .* record/i);
    const top = buildCommendationMessage({
      personName: 'Dr Early',
      performance: perf,
      periodLabel: 'October',
      rankLabel: 'This is the best elective booking record in the hospital for the period.',
    });
    expect(top).toMatch(/best elective booking record/i);
  });
});
