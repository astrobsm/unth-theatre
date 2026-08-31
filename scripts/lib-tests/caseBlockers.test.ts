import { describe, it, expect } from 'vitest';
import {
  reportingWindow,
  describeBlocker,
  isBlockerReason,
  isCaseOutcome,
  BLOCKER_REASONS,
  CASE_OUTCOMES,
  ELECTIVE_GRACE_MINUTES,
  EMERGENCY_PROMPT_MINUTES,
} from '../../src/lib/caseBlockers';

const at = (iso: string) => new Date(iso);
const START = at('2026-08-31T09:00:00.000Z');
const BOOKED = at('2026-08-31T08:00:00.000Z');

const win = (over: Partial<Parameters<typeof reportingWindow>[0]> = {}) =>
  reportingWindow({
    surgeryType: 'ELECTIVE',
    scheduledStart: START,
    bookedAt: BOOKED,
    status: 'SCHEDULED',
    ...over,
  } as any);

describe('elective reporting window', () => {
  it('is shut before the scheduled start', () => {
    const w = win({ now: at('2026-08-31T08:55:00.000Z') });
    expect(w.open).toBe(false);
    expect(w.minutesLate).toBe(-5);
    expect(w.message).toMatch(/start in 5/);
  });

  // A theatre three minutes late is a theatre, not an incident. A prompt that
  // fires on every case is a prompt everybody learns to dismiss.
  it('is still shut during the grace period', () => {
    expect(win({ now: at('2026-08-31T09:00:00.000Z') }).open).toBe(false);
    expect(win({ now: at('2026-08-31T09:04:00.000Z') }).open).toBe(false);
  });

  it('opens exactly at the grace boundary', () => {
    const w = win({ now: at('2026-08-31T09:05:00.000Z') });
    expect(w.open).toBe(true);
    expect(w.prompt).toBe(true);
    expect(w.minutesLate).toBe(ELECTIVE_GRACE_MINUTES);
  });

  it('reports how late it actually is', () => {
    const w = win({ now: at('2026-08-31T09:47:00.000Z') });
    expect(w.minutesLate).toBe(47);
    expect(w.message).toMatch(/47 minutes past/);
  });

  it('opens with no scheduled start, but does not nag', () => {
    const w = win({ scheduledStart: null, now: at('2026-08-31T09:47:00.000Z') });
    expect(w.open).toBe(true);
    expect(w.prompt).toBe(false);
  });
});

describe('emergency reporting window', () => {
  const em = (over = {}) =>
    win({ surgeryType: 'EMERGENCY', scheduledStart: null, ...over });

  // An emergency has no scheduled start to be late against, so reporting is
  // available from the moment it is booked.
  it('is open immediately', () => {
    const w = em({ now: at('2026-08-31T08:01:00.000Z') });
    expect(w.open).toBe(true);
    expect(w.prompt).toBe(false);
  });

  it('starts prompting an hour after booking', () => {
    expect(em({ now: at('2026-08-31T08:59:00.000Z') }).prompt).toBe(false);
    const w = em({ now: at('2026-08-31T09:00:00.000Z') });
    expect(w.prompt).toBe(true);
    expect(w.minutesLate).toBe(EMERGENCY_PROMPT_MINUTES);
    expect(w.message).toMatch(/Booked 60 minutes ago/);
  });

  it('counts from booking even when a slot exists', () => {
    const w = em({ scheduledStart: START, now: at('2026-08-31T10:00:00.000Z') });
    expect(w.minutesLate).toBe(120);
  });
});

describe('a closed case cannot be blocked', () => {
  for (const status of ['COMPLETED', 'CANCELLED']) {
    it(`is shut when ${status}`, () => {
      const w = win({ status, now: at('2026-08-31T12:00:00.000Z') });
      expect(w.open).toBe(false);
      expect(w.prompt).toBe(false);
      expect(w.message).toMatch(/closed/i);
    });
  }

  it('stays open for a case merely in progress', () => {
    expect(win({ status: 'IN_PROGRESS', now: at('2026-08-31T09:30:00.000Z') }).open).toBe(true);
  });
});

describe('the vocabularies', () => {
  it('accepts only known reasons', () => {
    expect(isBlockerReason('TEAM_ABSENT')).toBe(true);
    expect(isBlockerReason('OTHER')).toBe(true);
    expect(isBlockerReason('SOMETHING_ELSE')).toBe(false);
    expect(isBlockerReason(null)).toBe(false);
  });

  it('accepts only known outcomes', () => {
    expect(isCaseOutcome('COMPLETED')).toBe(true);
    expect(isCaseOutcome('RESCHEDULED')).toBe(true);
    expect(isCaseOutcome('CANCELLED')).toBe(true);
    expect(isCaseOutcome('PENDING')).toBe(true);
    expect(isCaseOutcome('ABANDONED')).toBe(false);
  });

  it('covers the reasons the request actually named', () => {
    const codes = BLOCKER_REASONS.map((r) => r.code);
    expect(codes).toContain('TEAM_ABSENT');
    expect(codes).toContain('TEAM_UNREACHABLE');
    expect(codes).toContain('OTHER');
  });

  it('offers the three outcomes asked for, plus still-waiting', () => {
    expect(CASE_OUTCOMES.map((o) => o.code)).toEqual(
      expect.arrayContaining(['COMPLETED', 'RESCHEDULED', 'CANCELLED', 'PENDING']),
    );
  });
});

describe('describeBlocker', () => {
  it('names the reason, the note, the lateness and the person', () => {
    const s = describeBlocker({
      reason: 'TEAM_ABSENT',
      detail: 'scrub nurse in Theatre 2',
      reportedByName: 'Dr Ngozi Anyanwu',
      minutesLate: 25,
    });
    expect(s).toBe('Team members not on ground: scrub nurse in Theatre 2 (25 min late) — reported by Dr Ngozi Anyanwu');
  });

  it('copes with only a reason', () => {
    expect(describeBlocker({ reason: 'NO_BLOOD' })).toBe('Blood not available');
  });

  it('omits lateness when it is not late', () => {
    expect(describeBlocker({ reason: 'NO_BLOOD', minutesLate: 0 })).toBe('Blood not available');
  });

  it('falls back to the raw code rather than hiding an unknown reason', () => {
    expect(describeBlocker({ reason: 'MYSTERY' })).toBe('MYSTERY');
  });
});
