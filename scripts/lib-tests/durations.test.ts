/**
 * Theatre timings.
 *
 * The behaviour worth protecting above all: a milestone nobody recorded is
 * UNKNOWN, not zero. Zero averages into the statistics and flatters the
 * department; null is excluded and shows up as "not recorded", which is itself
 * the finding.
 */
import { describe, expect, it } from 'vitest';

import {
  at,
  formatMinutes,
  meanMinutes,
  minutesBetween,
  onTimePercent,
  outOfSequencePhases,
  timingsFor,
  turnoverMinutes,
  utilisationPercent,
} from '../../src/lib/theatreOps/durations';

const T = (hhmm: string) => new Date(`2026-08-04T${hhmm}:00Z`);
const mv = (phase: string, hhmm: string) => ({ phase, timestamp: T(hhmm) });

/** A case that ran cleanly, scheduled for 09:00. */
const CLEAN = [
  mv('PORTER_DISPATCHED', '08:30'),
  mv('INSIDE_THEATRE', '08:50'),
  mv('ANAESTHESIA_STARTED', '09:00'),
  mv('WHO_TIMEOUT_COMPLETED', '09:10'),
  mv('SURGERY_STARTED', '09:15'),
  mv('SURGERY_ENDED', '10:45'),
  mv('DRESSING_COMPLETED', '10:55'),
  mv('RECOVERY_ROOM', '11:00'),
];

describe('reading a milestone', () => {
  it('finds the timestamp for a phase', () => {
    expect(at(CLEAN, 'SURGERY_STARTED')?.toISOString()).toBe(T('09:15').toISOString());
  });

  it('returns null for one that was never recorded', () => {
    expect(at([], 'SURGERY_STARTED')).toBeNull();
  });

  it('takes the FIRST occurrence when a phase was recorded twice', () => {
    // A nurse correcting a mis-tap must not move the clock the case ran to.
    const twice = [mv('SURGERY_STARTED', '09:15'), mv('SURGERY_STARTED', '09:40')];
    expect(at(twice, 'SURGERY_STARTED')?.toISOString()).toBe(T('09:15').toISOString());
  });

  it('ignores an unparseable timestamp rather than throwing', () => {
    expect(at([{ phase: 'SURGERY_STARTED', timestamp: 'not a date' }], 'SURGERY_STARTED')).toBeNull();
  });
});

describe('the gap between two milestones', () => {
  it('counts whole minutes', () => {
    expect(minutesBetween(T('09:00'), T('09:45'))).toBe(45);
  });

  it('is null when either end is missing', () => {
    expect(minutesBetween(null, T('09:45'))).toBeNull();
    expect(minutesBetween(T('09:00'), null)).toBeNull();
  });

  it('discards a negative gap rather than reporting one', () => {
    // Knife recorded before the patient arrived is a slip, not a case that
    // finished before it began — and a negative would corrupt any average.
    expect(minutesBetween(T('10:00'), T('09:00'))).toBeNull();
  });
});

describe('a case that ran cleanly', () => {
  const t = timingsFor({ movements: CLEAN, scheduledStart: T('09:00') });

  it('measures each interval', () => {
    expect(t.transferMinutes).toBe(20);      // 08:30 → 08:50
    expect(t.waitingMinutes).toBe(10);       // 08:50 → 09:00
    expect(t.anaesthesiaPrepMinutes).toBe(15); // 09:00 → 09:15
    expect(t.operativeMinutes).toBe(90);     // 09:15 → 10:45
    expect(t.closingMinutes).toBe(15);       // 10:45 → 11:00
    expect(t.occupancyMinutes).toBe(130);    // 08:50 → 11:00
  });

  it('reports the delay against the scheduled time', () => {
    expect(t.delayMinutes).toBe(15);
    expect(t.onTime).toBe(false);
  });

  it('finds nothing missing or out of order', () => {
    expect(t.missing).toHaveLength(0);
    expect(t.outOfSequence).toHaveLength(0);
  });
});

describe('a case that started early', () => {
  it('reports a NEGATIVE delay rather than clamping it to zero', () => {
    // Delay is the one figure that may legitimately go below zero.
    const t = timingsFor({ movements: CLEAN, scheduledStart: T('09:30') });
    expect(t.delayMinutes).toBe(-15);
    expect(t.onTime).toBe(true);
  });
});

describe('a case with milestones missing', () => {
  const partial = [mv('INSIDE_THEATRE', '08:50'), mv('SURGERY_STARTED', '09:15')];
  const t = timingsFor({ movements: partial, scheduledStart: T('09:00') });

  it('reports the unknown intervals as null, NOT zero', () => {
    // Zero would average in and quietly flatter the department.
    expect(t.anaesthesiaPrepMinutes).toBeNull();
    expect(t.operativeMinutes).toBeNull();
    expect(t.occupancyMinutes).toBeNull();
  });

  it('still measures what it can', () => {
    expect(t.delayMinutes).toBe(15);
  });

  it('names what was never recorded', () => {
    expect(t.missing).toContain('ANAESTHESIA_STARTED');
    expect(t.missing).toContain('SURGERY_ENDED');
    expect(t.missing).not.toContain('SURGERY_STARTED');
  });
});

describe('a case with no scheduled time', () => {
  it('cannot be assessed for delay, and says so rather than guessing', () => {
    // Exactly why a committed start time is required at booking.
    const t = timingsFor({ movements: CLEAN, scheduledStart: null });
    expect(t.delayMinutes).toBeNull();
    expect(t.onTime).toBeNull();
  });

  it('still measures the intervals that do not need one', () => {
    const t = timingsFor({ movements: CLEAN, scheduledStart: null });
    expect(t.operativeMinutes).toBe(90);
  });
});

describe('milestones recorded out of order', () => {
  it('surfaces them rather than silently correcting them', () => {
    const muddled = [
      mv('INSIDE_THEATRE', '09:00'),
      mv('SURGERY_STARTED', '08:45'), // before the patient arrived
      mv('SURGERY_ENDED', '10:00'),
    ];
    expect(outOfSequencePhases(muddled)).toContain('SURGERY_STARTED');
  });

  it('finds none in a clean case', () => {
    expect(outOfSequencePhases(CLEAN)).toHaveLength(0);
  });
});

describe('averaging across cases', () => {
  it('ignores the cases where nothing was recorded', () => {
    expect(meanMinutes([30, null, 60, null])).toBe(45);
  });

  it('returns null when nothing at all was recorded', () => {
    // So a screen says "not recorded" rather than a confident zero.
    expect(meanMinutes([null, null])).toBeNull();
  });
});

describe('the on-time figure', () => {
  const t = (onTime: boolean | null) => ({ onTime } as never);

  it('is the proportion of assessable cases that started on time', () => {
    const r = onTimePercent([t(true), t(true), t(false), t(false)]);
    expect(r.percent).toBe(50);
    expect(r.assessed).toBe(4);
  });

  it('EXCLUDES unassessable cases rather than counting them as late', () => {
    // Counting an unrecorded case as a failure punishes poor record-keeping as
    // though it were poor punctuality, and the two need different remedies.
    const r = onTimePercent([t(true), t(null), t(null)]);
    expect(r.percent).toBe(100);
    expect(r.assessed).toBe(1);
    expect(r.total).toBe(3);
  });

  it('says nothing when no case can be assessed', () => {
    expect(onTimePercent([t(null)]).percent).toBeNull();
  });
});

describe('turnover between cases in a theatre', () => {
  it('measures the gap from one patient leaving to the next entering', () => {
    const gaps = turnoverMinutes([
      { enteredAt: T('08:00'), leftAt: T('09:00') },
      { enteredAt: T('09:30'), leftAt: T('10:30') },
      { enteredAt: T('11:00'), leftAt: T('12:00') },
    ]);
    expect(gaps).toEqual([30, 30]);
  });

  it('sorts the list, so cases recorded out of order still give sane gaps', () => {
    const gaps = turnoverMinutes([
      { enteredAt: T('11:00'), leftAt: T('12:00') },
      { enteredAt: T('08:00'), leftAt: T('09:00') },
      { enteredAt: T('09:30'), leftAt: T('10:30') },
    ]);
    expect(gaps).toEqual([30, 30]);
  });

  it('drops overlapping cases rather than averaging a negative turnover', () => {
    // Two cases in one theatre at once is a different problem from a slow
    // turnover, and folding it in would hide both.
    const gaps = turnoverMinutes([
      { enteredAt: T('08:00'), leftAt: T('10:00') },
      { enteredAt: T('09:00'), leftAt: T('11:00') },
    ]);
    expect(gaps).toHaveLength(0);
  });

  it('a single case has no turnover to measure', () => {
    expect(turnoverMinutes([{ enteredAt: T('08:00'), leftAt: T('09:00') }])).toHaveLength(0);
  });
});

describe('utilisation', () => {
  it('is occupied time over session time', () => {
    expect(utilisationPercent(240, 480)).toBe(50);
  });

  it('caps at 100 rather than reporting 140%', () => {
    // Over-running is real, but it is over-running — not utilisation above
    // capacity — and 140% invites the wrong conversation.
    expect(utilisationPercent(672, 480)).toBe(100);
  });

  it('will not divide by a zero-length session', () => {
    expect(utilisationPercent(100, 0)).toBeNull();
  });
});

describe('minutes as a person reads them', () => {
  it('reads naturally at each scale', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(135)).toBe('2 h 15 min');
  });

  it('says so plainly when nothing was recorded', () => {
    expect(formatMinutes(null)).toBe('not recorded');
  });

  it('keeps the sign on an early start', () => {
    expect(formatMinutes(-15)).toBe('-15 min');
  });
});
