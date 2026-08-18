/**
 * Where each of a surgeon's patients is, and when standing still becomes a
 * problem worth saying out loud.
 *
 * The failure mode being guarded against is the one the personal board already
 * taught: a tracker that raises something on every case buries the one case
 * that matters. So most of these tests assert SILENCE — that an ordinary
 * patient moving normally through an ordinary list produces nothing at all.
 */
import { describe, expect, it } from 'vitest';

import {
  PHASE_STALL_MINUTES,
  formatMinutes,
  furthestPhase,
  nextResponsible,
  sortTracker,
  trackCase,
  trackerSummary,
  type TrackerCase,
} from './dashboard/perioperativeTracker';

const NOW = new Date('2026-08-18T09:00:00.000Z');

const surgery = (over: Partial<TrackerCase> = {}): TrackerCase => ({
  id: 's1',
  procedureName: 'Subtotal thyroidectomy',
  patientName: 'Nwoke Ngozi',
  folderNumber: '0294817',
  theatreName: 'Theatre 2',
  scheduledDate: '2026-08-18T00:00:00.000Z',
  scheduledTime: '09:00',
  status: 'SCHEDULED',
  ...over,
});

const at = (iso: string) => new Date(iso);

const healthy = {
  fitness: { decision: 'FIT' as const },
  hasAnaestheticReview: true,
  hasConsent: true,
  preopOutstanding: null,
};

describe('a case moving normally says nothing', () => {
  it('raises no alert for a patient who arrived in holding twenty minutes ago', () => {
    const row = trackCase({
      surgery: surgery(),
      movements: [{ phase: 'HOLDING_AREA', timestamp: at('2026-08-18T08:40:00.000Z') }],
      now: NOW,
      ...healthy,
    });
    expect(row.alerts).toEqual([]);
    expect(row.currentLabel).toBe('In holding');
    expect(row.minutesInPhase).toBe(20);
  });

  it('never times a long operation as a delay', () => {
    // A four-hour case is a four-hour case. Alerting on it would be alerting
    // on surgery happening.
    expect(PHASE_STALL_MINUTES.SURGERY_STARTED).toBe(null);
    const row = trackCase({
      surgery: surgery(),
      movements: [{ phase: 'SURGERY_STARTED', timestamp: at('2026-08-18T05:00:00.000Z') }],
      now: NOW,
      ...healthy,
    });
    expect(row.alerts).toEqual([]);
    expect(row.minutesInPhase).toBe(240);
  });

  it('says nothing about a completed or cancelled case', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'POSTPONED']) {
      const row = trackCase({
        surgery: surgery({ status }),
        movements: [],
        now: NOW,
        fitness: { decision: 'NOT_FIT' },
        hasConsent: false,
      });
      expect(row.alerts, status).toEqual([]);
    }
  });
});

describe('a patient who has stopped moving', () => {
  it('raises the wait once it passes the threshold for that phase', () => {
    // Dressed but not moved to recovery: 45 minutes is the limit.
    const row = trackCase({
      surgery: surgery(),
      movements: [{ phase: 'DRESSING_COMPLETED', timestamp: at('2026-08-18T08:00:00.000Z') }],
      now: NOW,
      ...healthy,
    });
    expect(row.alerts.map((a) => a.id)).toContain('s1:stalled');
    expect(row.alerts[0].detail).toContain('Recovery nurse');
  });

  it('escalates to critical at double the threshold', () => {
    const row = trackCase({
      surgery: surgery(),
      movements: [{ phase: 'DRESSING_COMPLETED', timestamp: at('2026-08-18T07:00:00.000Z') }],
      now: NOW,
      ...healthy,
    });
    expect(row.alerts.find((a) => a.id === 's1:stalled')?.severity).toBe('CRITICAL');
  });

  it('applies a different threshold to a different phase', () => {
    // The same hour: unremarkable in holding, a problem after dressing. The
    // duration has to sit BETWEEN the two thresholds to show anything — an
    // earlier version of this test used two hours, which is over both, and
    // passed only because the assertion was wrong rather than the code.
    const anHourAgo = at('2026-08-18T08:00:00.000Z');
    const inHolding = trackCase({
      surgery: surgery(), movements: [{ phase: 'HOLDING_AREA', timestamp: anHourAgo }], now: NOW, ...healthy,
    });
    const afterDressing = trackCase({
      surgery: surgery(), movements: [{ phase: 'DRESSING_COMPLETED', timestamp: anHourAgo }], now: NOW, ...healthy,
    });
    expect(inHolding.alerts).toEqual([]);
    expect(afterDressing.alerts.map((a) => a.id)).toContain('s1:stalled');
    expect(PHASE_STALL_MINUTES.HOLDING_AREA).toBeGreaterThan(PHASE_STALL_MINUTES.DRESSING_COMPLETED as number);
  });

  it('names who the surgeon is waiting on, not who last touched it', () => {
    // The person who recorded the last milestone has already done their part.
    expect(nextResponsible('HOLDING_AREA')).toBe('Scrub / circulating nurse');
    expect(nextResponsible('SURGERY_ENDED')).toBe('Scrub nurse');
    expect(nextResponsible('RETURNED_TO_WARD')).toBe('Journey complete');
  });
});

describe('a patient nobody has sent for', () => {
  it('says nothing when the case is hours away', () => {
    const row = trackCase({
      surgery: surgery({ scheduledTime: '15:00' }), movements: [], now: NOW, ...healthy,
    });
    expect(row.alerts).toEqual([]);
  });

  it('warns as the case approaches', () => {
    const row = trackCase({
      surgery: surgery({ scheduledTime: '09:30' }), movements: [], now: NOW, ...healthy,
    });
    expect(row.alerts.map((a) => a.id)).toContain('s1:not-sent');
  });

  it('is critical once the case is overdue', () => {
    const row = trackCase({
      surgery: surgery({ scheduledTime: '08:00' }), movements: [], now: NOW, ...healthy,
    });
    const a = row.alerts.find((x) => x.id === 's1:not-moved');
    expect(a?.severity).toBe('CRITICAL');
  });
});

describe('what stops the case entirely', () => {
  it('reports an unfit patient above everything else', () => {
    const row = trackCase({
      surgery: surgery(),
      movements: [],
      now: NOW,
      fitness: { decision: 'NOT_FIT', outstandingRequirements: 2 },
      hasAnaestheticReview: true,
      hasConsent: true,
    });
    expect(row.alerts[0].id).toBe('s1:not-fit');
    expect(row.alerts[0].severity).toBe('CRITICAL');
    expect(row.alerts[0].detail).toContain('2 requirements outstanding');
  });

  it('distinguishes an unfit patient from an unreviewed one', () => {
    // Two very different things a single badge would merge.
    const unreviewed = trackCase({
      surgery: surgery(), movements: [], now: NOW,
      fitness: { decision: null }, hasAnaestheticReview: false, hasConsent: true,
    });
    expect(unreviewed.alerts.map((a) => a.id)).toContain('s1:no-review');
    expect(unreviewed.alerts.map((a) => a.id)).not.toContain('s1:not-fit');
  });

  it('does not chase a review for a case next week', () => {
    const row = trackCase({
      surgery: surgery({ scheduledDate: '2026-08-30T00:00:00.000Z' }),
      movements: [], now: NOW,
      fitness: { decision: null }, hasAnaestheticReview: false, hasConsent: true,
    });
    expect(row.alerts).toEqual([]);
  });
});

describe('reading the list', () => {
  it('puts the worst case first, then the earliest', () => {
    const rows = [
      trackCase({ surgery: surgery({ id: 'a', scheduledTime: '14:00' }), movements: [], now: NOW, ...healthy }),
      trackCase({
        surgery: surgery({ id: 'b', scheduledTime: '08:00' }), movements: [], now: NOW,
        fitness: { decision: 'NOT_FIT' }, hasAnaestheticReview: true, hasConsent: true,
      }),
      trackCase({ surgery: surgery({ id: 'c', scheduledTime: '11:00' }), movements: [], now: NOW, ...healthy }),
    ];
    expect(sortTracker(rows).map((r) => r.surgeryId)).toEqual(['b', 'c', 'a']);
  });

  it('takes the furthest milestone, not the latest recorded', () => {
    // A milestone back-filled after the fact must not appear to send the
    // patient backwards through the journey.
    const f = furthestPhase([
      { phase: 'SURGERY_STARTED', timestamp: at('2026-08-18T08:00:00.000Z') },
      { phase: 'HOLDING_AREA', timestamp: at('2026-08-18T08:30:00.000Z') }, // entered late
    ]);
    expect(f?.phase).toBe('SURGERY_STARTED');
  });

  it('counts what the header shows', () => {
    const rows = [
      trackCase({ surgery: surgery({ id: 'a' }), movements: [{ phase: 'HOLDING_AREA', timestamp: NOW }], now: NOW, ...healthy }),
      trackCase({ surgery: surgery({ id: 'b' }), movements: [{ phase: 'SURGERY_STARTED', timestamp: NOW }], now: NOW, ...healthy }),
    ];
    const s = trackerSummary(rows);
    expect(s.total).toBe(2);
    expect(s.inHolding).toBe(1);
    expect(s.inTheatre).toBe(1);
  });

  it('writes a duration a person reads at a glance', () => {
    expect(formatMinutes(20)).toBe('20 min');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(135)).toBe('2h 15m');
  });
});
