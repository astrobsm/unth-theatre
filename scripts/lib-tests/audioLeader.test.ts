import { describe, it, expect } from 'vitest';
import { evaluateClaim, isLeaderRecord, STALE_MS } from '../../src/lib/audioLeader';

// The reported failure: an emergency appeared on a nurse's phone with no sound,
// and the window explained that it was "being announced in your other open
// window". It was not. The holder was a background tab — alive enough to
// refresh a heartbeat on time, so never stale, and unable to make a sound
// because no user gesture had ever reached it. Electing on liveness alone
// guaranteed the silence could not resolve itself.

const NOW = 1_000_000;
const ME = 'me';
const OTHER = 'other';

const fresh = (over: Partial<{ id: string; ts: number; visible: boolean }> = {}) => ({
  id: OTHER, ts: NOW, visible: true, ...over,
});

describe('evaluateClaim — the silence that could not resolve', () => {
  it('takes the lock from a HIDDEN holder that is refreshing perfectly well', () => {
    // The exact reported case. The holder is not stale, so waiting for it to
    // expire would have waited for ever.
    const r = evaluateClaim({ record: fresh({ visible: false }), myId: ME, iAmVisible: true, now: NOW });
    expect(r.claim).toBe(true);
    expect(r.reason).toBe('took-over-from-hidden');
  });

  it('does not take the lock from a visible holder', () => {
    const r = evaluateClaim({ record: fresh({ visible: true }), myId: ME, iAmVisible: true, now: NOW });
    expect(r.claim).toBe(false);
    expect(r.reason).toBe('deferring');
  });

  it('a hidden window does not steal from another hidden window', () => {
    // Otherwise two background tabs trade the lock every two seconds for ever.
    const r = evaluateClaim({ record: fresh({ visible: false }), myId: ME, iAmVisible: false, now: NOW });
    expect(r.claim).toBe(false);
  });
});

describe('evaluateClaim — the ordinary cases still hold', () => {
  it('claims when nobody holds the lock', () => {
    expect(evaluateClaim({ record: null, myId: ME, iAmVisible: true, now: NOW }))
      .toEqual({ claim: true, reason: 'no-leader' });
  });

  it('claims when the holder has gone stale', () => {
    const r = evaluateClaim({ record: fresh({ ts: NOW - STALE_MS - 1 }), myId: ME, iAmVisible: false, now: NOW });
    expect(r.claim).toBe(true);
    expect(r.reason).toBe('leader-stale');
  });

  it('does not treat a holder that is merely late as stale', () => {
    // One missed heartbeat on a busy phone must not cause a takeover, or the
    // lock oscillates and the audio stutters.
    const r = evaluateClaim({ record: fresh({ ts: NOW - STALE_MS + 1 }), myId: ME, iAmVisible: false, now: NOW });
    expect(r.claim).toBe(false);
  });

  it('keeps its own lock, hidden or not', () => {
    for (const iAmVisible of [true, false]) {
      const r = evaluateClaim({ record: fresh({ id: ME }), myId: ME, iAmVisible, now: NOW });
      expect(r).toEqual({ claim: true, reason: 'already-mine' });
    }
  });

  it('prefers its own record over the hidden-takeover rule', () => {
    // Reported reason matters for the log; "already-mine" is the truth here.
    const r = evaluateClaim({ record: fresh({ id: ME, visible: false }), myId: ME, iAmVisible: true, now: NOW });
    expect(r.reason).toBe('already-mine');
  });
});

describe('isLeaderRecord — tolerating a record written by an older build', () => {
  it('accepts a record with no visible flag', () => {
    // During a rollout one window writes the new shape and another the old.
    expect(isLeaderRecord({ id: 'x', ts: 1 })).toBe(true);
  });

  it('does not steal from a holder whose visibility is simply unknown', () => {
    // `visible === false` is required to take over, not merely "not true" —
    // otherwise every updated window robs every un-updated one on sight.
    const r = evaluateClaim({
      record: { id: OTHER, ts: NOW } as never,
      myId: ME, iAmVisible: true, now: NOW,
    });
    expect(r.claim).toBe(false);
  });

  it('rejects malformed records rather than trusting them', () => {
    expect(isLeaderRecord(null)).toBe(false);
    expect(isLeaderRecord('leader')).toBe(false);
    expect(isLeaderRecord({ id: 1, ts: 1 })).toBe(false);
    expect(isLeaderRecord({ id: 'x' })).toBe(false);
  });
});
