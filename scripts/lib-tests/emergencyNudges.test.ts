/**
 * The reminder ladder for an emergency that has not started.
 *
 * Proved as pure arithmetic, because getting it wrong is expensive in both
 * directions. Too slow and a patient waits while nobody is told. Too fast, or
 * repeating a rung, and a team is messaged twice for the same half hour — which
 * is precisely how people mute a channel, and a muted channel does not deliver
 * the one message that mattered either.
 *
 * The rung INDEX is what keeps a fifteen-minute cron from sending the same
 * reminder twice: it goes into the idempotency scope, so two runs inside the
 * same half hour resolve to the same rung and the second is a duplicate rather
 * than a second message. Every assertion about index here is really an
 * assertion about that.
 */
import { describe, expect, it } from 'vitest';

import {
  nudgeDueAt, humaniseElapsed,
  FIRST_NUDGE_MINUTES, SECOND_NUDGE_MINUTES, REPEAT_EVERY_MINUTES, MAX_NUDGES,
} from '../../src/lib/comms/emergencyNudges';

describe('when a nudge is due', () => {
  it('says nothing before the first rung', () => {
    // A team scrubbing at twenty minutes does not need chasing, and chasing
    // them is how the next message gets ignored.
    expect(nudgeDueAt(0)).toBeNull();
    expect(nudgeDueAt(29)).toBeNull();
  });

  it('fires the gentle rung at thirty minutes', () => {
    const s = nudgeDueAt(FIRST_NUDGE_MINUTES);
    expect(s?.index).toBe(1);
    expect(s?.templateCode).toBe('EMERGENCY_NOT_STARTED_30');
  });

  it('holds the first rung for the whole half hour', () => {
    // The cron runs every fifteen minutes. Both runs inside this window must
    // resolve to rung 1, or the second sends a duplicate.
    expect(nudgeDueAt(30)?.index).toBe(1);
    expect(nudgeDueAt(45)?.index).toBe(1);
    expect(nudgeDueAt(59)?.index).toBe(1);
  });

  it('fires the medicolegal rung at an hour', () => {
    const s = nudgeDueAt(SECOND_NUDGE_MINUTES);
    expect(s?.index).toBe(2);
    expect(s?.templateCode).toBe('EMERGENCY_NOT_STARTED_60');
  });

  it('then repeats every thirty minutes', () => {
    expect(nudgeDueAt(90)?.index).toBe(3);
    expect(nudgeDueAt(120)?.index).toBe(4);
    expect(nudgeDueAt(150)?.index).toBe(5);
    expect(nudgeDueAt(90)?.templateCode).toBe('EMERGENCY_NOT_STARTED_REPEAT');
  });

  it('holds each repeat rung for its whole interval', () => {
    // Same argument as the first rung, for every rung after it.
    for (let m = 90; m < 90 + REPEAT_EVERY_MINUTES; m += 5) {
      expect(nudgeDueAt(m)?.index).toBe(3);
    }
    expect(nudgeDueAt(90 + REPEAT_EVERY_MINUTES)?.index).toBe(4);
  });

  it('never goes backwards as time passes', () => {
    // The property that actually matters: a later minute can never resolve to
    // an earlier rung, or a case would re-send a reminder it already sent.
    let last = 0;
    for (let m = 0; m <= 60 * 13; m += 1) {
      const s = nudgeDueAt(m);
      if (!s) continue;
      expect(s.index).toBeGreaterThanOrEqual(last);
      last = s.index;
    }
  });

  it('stops after the ceiling', () => {
    // Twelve hours in, the governance ladder has long since taken over and a
    // message every half hour is one nobody reads.
    const lastMinute = SECOND_NUDGE_MINUTES + (MAX_NUDGES - 2) * REPEAT_EVERY_MINUTES;
    expect(nudgeDueAt(lastMinute)?.index).toBe(MAX_NUDGES);
    expect(nudgeDueAt(lastMinute + REPEAT_EVERY_MINUTES)).toBeNull();
  });

  it('reports the minute the rung was due, not the minute asked about', () => {
    // The elapsed time in the message must be the rung's, so two people
    // messaged in the same window read the same figure and the record of what
    // they were told is one fact rather than several.
    expect(nudgeDueAt(47)?.minutes).toBe(30);
    expect(nudgeDueAt(118)?.minutes).toBe(90);
  });
});

describe('elapsed time in words', () => {
  it('reads naturally at each rung', () => {
    expect(humaniseElapsed(30)).toBe('30 minutes');
    expect(humaniseElapsed(60)).toBe('1 hour');
    expect(humaniseElapsed(90)).toBe('1 hour 30 minutes');
    expect(humaniseElapsed(120)).toBe('2 hours');
    expect(humaniseElapsed(135)).toBe('2 hours 15 minutes');
  });
});
