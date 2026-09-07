import { describe, it, expect } from 'vitest';
import { isUrgentAnnouncement, URGENT_PRIORITY } from '../../src/lib/announcementUrgency';

describe('what counts as urgent', () => {
  it('treats anything requiring acknowledgement as urgent', () => {
    // The case that was silent. This renders a green ACKNOWLEDGE EMERGENCY
    // banner, and the old playback gate — which looked only at category and
    // priority — filed it as routine and left it to the leader window.
    expect(isUrgentAnnouncement({ requireAck: true, category: 'GENERAL', priority: 10 })).toBe(true);
  });

  it('treats the EMERGENCY category as urgent', () => {
    expect(isUrgentAnnouncement({ category: 'EMERGENCY', priority: 0, requireAck: false })).toBe(true);
    expect(isUrgentAnnouncement({ category: 'emergency', priority: 0 })).toBe(true);
    expect(isUrgentAnnouncement({ category: '  Emergency  ', priority: 0 })).toBe(true);
  });

  it('treats high priority as urgent, at the boundary', () => {
    expect(isUrgentAnnouncement({ priority: URGENT_PRIORITY })).toBe(true);
    expect(isUrgentAnnouncement({ priority: URGENT_PRIORITY - 1 })).toBe(false);
    expect(isUrgentAnnouncement({ priority: 100 })).toBe(true);
  });

  it('leaves ordinary radio traffic alone', () => {
    expect(isUrgentAnnouncement({ category: 'GENERAL', priority: 10, requireAck: false })).toBe(false);
    expect(isUrgentAnnouncement({ category: 'WELCOME', priority: 0 })).toBe(false);
  });

  it('is false for nothing at all, rather than throwing', () => {
    expect(isUrgentAnnouncement(null)).toBe(false);
    expect(isUrgentAnnouncement(undefined)).toBe(false);
    expect(isUrgentAnnouncement({})).toBe(false);
  });

  it('does not treat a missing priority as zero-and-therefore-safe by accident', () => {
    // Guards the `typeof number` check: an item with no priority field at all
    // must not compare undefined >= 90 and must not throw.
    expect(isUrgentAnnouncement({ category: 'GENERAL' })).toBe(false);
    expect(isUrgentAnnouncement({ category: 'GENERAL', priority: null })).toBe(false);
  });

  it('agrees with the alert badge, which was always the broadest test', () => {
    // The badge used `requireAck || EMERGENCY || >= 90`. Every item the badge
    // flagged must now also be spoken — that equivalence is the fix.
    const badge = (t: { requireAck: boolean; category: string; priority: number }) =>
      !!(t.requireAck || t.category === 'EMERGENCY' || t.priority >= 90);

    const cases = [
      { requireAck: true, category: 'GENERAL', priority: 0 },
      { requireAck: false, category: 'EMERGENCY', priority: 0 },
      { requireAck: false, category: 'GENERAL', priority: 95 },
      { requireAck: false, category: 'GENERAL', priority: 5 },
      { requireAck: true, category: 'EMERGENCY', priority: 99 },
    ];
    for (const c of cases) {
      expect(isUrgentAnnouncement(c)).toBe(badge(c));
    }
  });
});
