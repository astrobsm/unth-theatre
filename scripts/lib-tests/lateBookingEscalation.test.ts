import { describe, it, expect } from 'vitest';
import {
  escalationFor,
  countsTowardsEscalation,
  buildChaseMessage,
  buildConsultantNotice,
  DEFAULT_COUNTING_FROM,
  ESCALATION_LABELS,
} from '../../src/lib/lateBooking/escalation';
import { buildLateBookingReport, formatRate } from '../../src/lib/lateBooking/report';
import type { LateBookingCaseInput } from '../../src/lib/lateBooking/report';

// This decides whether a named clinician receives a disciplinary query.
// Every way of being wrong here lands on a real person: escalating somebody
// for conduct that preceded the rule, counting a consultant's name against a
// booking they did not make, or quietly dropping an offence so a repeat
// offender looks clean.

describe('the escalation ladder', () => {
  it('gives a first warning for the first offence', () => {
    const d = escalationFor(0);
    expect(d.level).toBe('FIRST_WARNING');
    expect(d.offenceNumber).toBe(1);
    expect(d.raisesQuery).toBe(false);
    expect(d.copyToHeadOfDepartment).toBe(false);
  });

  it('gives a second warning for the second', () => {
    const d = escalationFor(1);
    expect(d.level).toBe('SECOND_WARNING');
    expect(d.offenceNumber).toBe(2);
    expect(d.raisesQuery).toBe(false);
  });

  it('raises a query on the third, copied to the head of department', () => {
    const d = escalationFor(2);
    expect(d.level).toBe('QUERY');
    expect(d.offenceNumber).toBe(3);
    expect(d.raisesQuery).toBe(true);
    expect(d.copyToHeadOfDepartment).toBe(true);
  });

  it('keeps querying after the third rather than falling silent', () => {
    // A three-strike ladder that stops escalating is a three-strike amnesty.
    for (const prior of [3, 4, 9]) {
      const d = escalationFor(prior);
      expect(d.level).toBe('QUERY');
      expect(d.raisesQuery).toBe(true);
      expect(d.offenceNumber).toBe(prior + 1);
    }
  });

  it('treats nonsense counts as a first offence rather than throwing', () => {
    // A bad count must not escalate somebody. Failing towards the lightest
    // outcome is the only safe direction here.
    expect(escalationFor(-5).level).toBe('FIRST_WARNING');
    expect(escalationFor(0.4).level).toBe('FIRST_WARNING');
  });
});

describe('nobody is escalated for conduct that preceded the rule', () => {
  it('ignores bookings made before the counting start', () => {
    expect(countsTowardsEscalation('2026-10-28T10:00:00Z', '2026-10-29')).toBe(false);
  });

  it('counts bookings on or after it', () => {
    expect(countsTowardsEscalation('2026-10-29T00:00:00Z', '2026-10-29')).toBe(true);
    expect(countsTowardsEscalation('2026-11-05T09:00:00Z', '2026-10-29')).toBe(true);
  });

  it('counts nothing when the booking time is unknown', () => {
    expect(countsTowardsEscalation(null)).toBe(false);
    expect(countsTowardsEscalation(undefined)).toBe(false);
    expect(countsTowardsEscalation('not a date')).toBe(false);
  });

  it('defaults to the announced start date', () => {
    expect(DEFAULT_COUNTING_FROM).toBe('2026-10-29');
    expect(countsTowardsEscalation('2026-10-01T09:00:00Z')).toBe(false);
  });
});

describe('what the person actually receives', () => {
  const base = {
    personName: 'Dr A',
    patientLabel: 'Patient X (PT1234)',
    procedureName: 'Inguinal hernia repair',
    scheduledFor: '12 Oct 2026',
    bookedAtLabel: '11 Oct 2026, 7:40 PM',
    unit: 'General Surgery',
  };

  it('states the case, the rule and the consequence', () => {
    const msg = buildChaseMessage({ ...base, decision: escalationFor(0) });
    expect(msg).toContain('Inguinal hernia repair');
    expect(msg).toContain('11 Oct 2026, 7:40 PM');
    expect(msg).toContain('15:00');
    expect(msg).toContain('1 November 2026');
    // The route to raising a genuine difficulty must be in every message,
    // or the policy reads as punishment with no remedy.
    expect(msg).toContain('12 noon');
    expect(msg).toMatch(/Theatre Manager|Theatre Chairman/);
  });

  it('says a head of department HAS been copied only when one has', () => {
    // The hazard is a message claiming a copy that was never made.
    const copied = /has been copied to your head of department/i;
    expect(buildChaseMessage({ ...base, decision: escalationFor(0) })).not.toMatch(copied);
    expect(buildChaseMessage({ ...base, decision: escalationFor(2) })).toMatch(copied);
  });

  it('warns at the second that the third goes to the head of department', () => {
    // Forewarning is the point of a second warning. Somebody who reaches a
    // query without having been told what the third offence costs has a
    // fair complaint.
    const second = buildChaseMessage({ ...base, decision: escalationFor(1) });
    expect(second).toContain('head of department');
    expect(second).not.toMatch(/has been copied/i);
  });

  it('tells the consultant who booked it, not that they did', () => {
    const n = buildConsultantNotice({
      bookerName: 'Dr A',
      unit: 'General Surgery',
      patientLabel: 'Patient X',
      procedureName: 'Hernia repair',
      scheduledFor: '12 Oct 2026',
      decision: escalationFor(1),
    });
    expect(n.message).toContain('Dr A booked');
    expect(n.title).toContain('General Surgery');
    expect(n.message).toContain('number 2');
  });

  it('asks, rather than only telling', () => {
    // Theatre management asked for the chase to read as an appeal. The
    // outcome wanted is an earlier booking tomorrow, and a message that
    // reads as an attack produces a defensive colleague instead.
    const msg = buildChaseMessage({ ...base, decision: escalationFor(0) });
    expect(msg).toMatch(/barest minimum/i);
    expect(msg).toMatch(/appeal|asking|pleading/i);
    // And it still says what was done, because a plea that hides the
    // consequence leaves somebody surprised by a query nobody warned them
    // about.
    expect(msg).toMatch(/first warning/i);
  });

  it('quotes their own rate back to them when it is known', () => {
    const msg = buildChaseMessage({
      ...base,
      decision: escalationFor(0),
      standing: {
        electiveTotal: 10,
        late: 4,
        lateRate: 0.4,
        periodLabel: 'the last 90 days',
      },
    });
    expect(msg).toContain('4 of your 10');
    expect(msg).toContain('40%');
    expect(msg).toContain('the last 90 days');
  });

  it('invents no percentage when the record is not known', () => {
    // A figure a clinician can dispute undoes the whole appeal. Better to
    // ask without one than to quote one that was estimated.
    const msg = buildChaseMessage({ ...base, decision: escalationFor(0) });
    expect(msg).not.toMatch(/\d+%/);
    expect(msg).toMatch(/barest minimum/i);
  });

  it('pleads harder with a heavy offender than with a near-miss', () => {
    const heavy = buildChaseMessage({
      ...base,
      decision: escalationFor(0),
      standing: { electiveTotal: 10, late: 8, lateRate: 0.8, periodLabel: 'the last 90 days' },
    });
    const light = buildChaseMessage({
      ...base,
      decision: escalationFor(0),
      standing: { electiveTotal: 10, late: 1, lateRate: 0.1, periodLabel: 'the last 90 days' },
    });
    expect(heavy).not.toBe(light);
    // Somebody already booking most cases on time should be told so, not
    // addressed as though they were the worst in the hospital.
    expect(light).toMatch(/most of your cases on time/i);
    expect(heavy).not.toMatch(/most of your cases on time/i);
  });

  it('still appeals at the query rung rather than only condemning', () => {
    const msg = buildChaseMessage({ ...base, decision: escalationFor(2) });
    expect(msg).toMatch(/has been copied to your head of department/i);
    expect(msg).toMatch(/bring the figure down/i);
  });

  it('labels every level in words a non-technical reader understands', () => {
    expect(ESCALATION_LABELS.FIRST_WARNING).toBe('First warning');
    expect(ESCALATION_LABELS.SECOND_WARNING).toBe('Second warning');
    expect(ESCALATION_LABELS.QUERY).toBe('Formal query');
  });
});

// ── The report ─────────────────────────────────────────────────────────
const CASE = (over: Partial<LateBookingCaseInput> = {}): LateBookingCaseInput => ({
  id: Math.random().toString(36).slice(2),
  scheduledDate: '2026-10-12T00:00:00Z',
  scheduledTime: '09:00',
  // 11 Oct 18:40 UTC = 19:40 WAT, well past the 15:00 cut-off the day before.
  createdAt: '2026-10-11T18:40:00Z',
  surgeryType: 'ELECTIVE',
  unit: 'General Surgery',
  subspecialty: 'General Surgery',
  procedureName: 'Hernia repair',
  patientName: 'Patient X',
  folderNumber: 'PT1',
  bookedById: 'u1',
  bookedByName: 'Dr A',
  surgeonName: 'Mr S',
  supervisingConsultantName: 'Prof C',
  team: [
    { role: 'SENIOR_REGISTRAR', name: 'Dr SR' },
    { role: 'HOUSE_OFFICER', name: 'Dr HO' },
  ],
  ...over,
});

const WINDOW = { from: '2026-10-01', to: '2026-10-31' };

describe('the report', () => {
  it('counts only late elective cases', () => {
    const r = buildLateBookingReport(
      [
        CASE(),
        CASE({ createdAt: '2026-10-10T09:00:00Z' }), // on time
        CASE({ surgeryType: 'EMERGENCY' }), // never late by definition
      ],
      WINDOW,
    );
    expect(r.totalLate).toBe(1);
    // The denominator excludes the emergency.
    expect(r.totalElective).toBe(2);
    expect(formatRate(r.overallRate)).toBe('50%');
  });

  it('ranks units worst first by count', () => {
    const r = buildLateBookingReport(
      [
        CASE({ unit: 'Urology' }),
        CASE({ unit: 'General Surgery' }),
        CASE({ unit: 'General Surgery' }),
        CASE({ unit: 'General Surgery' }),
      ],
      WINDOW,
    );
    expect(r.units.map((u) => u.unit)).toEqual(['General Surgery', 'Urology']);
    expect(r.units[0].lateCount).toBe(3);
  });

  it('tallies offences against the booker, never the consultant', () => {
    const r = buildLateBookingReport(
      [
        CASE({ bookedById: 'u1', bookedByName: 'Dr A', supervisingConsultantName: 'Prof C' }),
        CASE({ bookedById: 'u1', bookedByName: 'Dr A', supervisingConsultantName: 'Prof C' }),
        CASE({ bookedById: 'u2', bookedByName: 'Dr B', supervisingConsultantName: 'Prof C' }),
      ],
      WINDOW,
    );
    expect(r.offenders.map((o) => [o.name, o.count])).toEqual([
      ['Dr A', 2],
      ['Dr B', 1],
    ]);
    // Prof C supervised all three and booked none. They must not appear as
    // an offender.
    expect(r.offenders.some((o) => o.name === 'Prof C')).toBe(false);
    expect(r.units[0].consultants).toContain('Prof C');
  });

  it('keeps two people with the same name apart, and one person together', () => {
    const r = buildLateBookingReport(
      [
        CASE({ bookedById: 'u1', bookedByName: 'Dr Same' }),
        CASE({ bookedById: 'u2', bookedByName: 'Dr Same' }),
        CASE({ bookedById: 'u1', bookedByName: 'Dr Same' }),
      ],
      WINDOW,
    );
    // Keyed on id: two tallies, one of 2 and one of 1 — not a single 3 that
    // would push an innocent person onto the query rung.
    expect(r.offenders.map((o) => o.count).sort()).toEqual([1, 2]);
  });

  it('names the senior registrars and house officers on the case', () => {
    const r = buildLateBookingReport([CASE()], WINDOW);
    expect(r.units[0].seniorRegistrars).toEqual(['Dr SR']);
    expect(r.units[0].houseOfficers).toEqual(['Dr HO']);
    expect(r.units[0].cases[0].seniorRegistrars).toEqual(['Dr SR']);
  });

  it('shows a missing booker as unrecorded rather than dropping the case', () => {
    // A case nobody is recorded against is itself a finding, and hiding it
    // would understate the unit.
    const r = buildLateBookingReport(
      [CASE({ bookedById: null, bookedByName: null })],
      WINDOW,
    );
    expect(r.totalLate).toBe(1);
    expect(r.offenders[0].name).toBe('Not recorded');
  });

  it('reports the rate beside the count so volume alone does not condemn', () => {
    const r = buildLateBookingReport(
      [
        // A small unit: 2 late out of 2.
        CASE({ unit: 'Small', bookedById: 'a' }),
        CASE({ unit: 'Small', bookedById: 'a' }),
        // A big unit: 3 late out of 10.
        ...Array.from({ length: 3 }, () => CASE({ unit: 'Big', bookedById: 'b' })),
        ...Array.from({ length: 7 }, () =>
          CASE({ unit: 'Big', bookedById: 'b', createdAt: '2026-10-09T09:00:00Z' }),
        ),
      ],
      WINDOW,
    );
    const big = r.units.find((u) => u.unit === 'Big')!;
    const small = r.units.find((u) => u.unit === 'Small')!;
    expect(big.lateCount).toBeGreaterThan(small.lateCount);
    expect(formatRate(small.lateRate)).toBe('100%');
    expect(formatRate(big.lateRate)).toBe('30%');
  });

  it('returns an empty report rather than failing when nothing is late', () => {
    const r = buildLateBookingReport([CASE({ createdAt: '2026-10-09T09:00:00Z' })], WINDOW);
    expect(r.totalLate).toBe(0);
    expect(r.units).toEqual([]);
    expect(r.offenders).toEqual([]);
  });
});
