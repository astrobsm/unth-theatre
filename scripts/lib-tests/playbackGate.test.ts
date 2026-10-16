/**
 * One voice at a time on the theatre radio.
 *
 * The player had no gate on this. It spoke the top of the queue whenever the
 * queue changed, which is every poll, so a workflow announcement being read
 * out and an emergency arriving mid-sentence produced BOTH — not one
 * interrupting the other, but two at once, because a neural-voice
 * announcement plays through an <audio> element and the fallback speaks
 * through speechSynthesis. Separate channels. Two voices, neither
 * intelligible.
 *
 * The easy half is "wait your turn". These tests are mostly about the three
 * places where the obvious rule is wrong:
 *
 *   an emergency must not queue behind a welcome message,
 *   an emergency must not cut off another emergency,
 *   and a wedged announcement must not silence the radio for ever.
 */
import { describe, expect, it } from 'vitest';

import { gatePlayback, MAX_PLAY_MS } from '../../src/lib/radio/playbackGate';

const T0 = 1_700_000_000_000;

const routine = (id: string) => ({ id, urgent: false });
const emergency = (id: string) => ({ id, urgent: true });
const playing = (id: string, urgent: boolean, startedAt = T0) => ({ id, urgent, startedAt });

describe('nothing is sounding', () => {
  it('lets a routine announcement start', () => {
    expect(gatePlayback({
      candidate: routine('a'), nowPlaying: null, now: T0,
    })).toBe('play');
  });

  it('lets an emergency start', () => {
    expect(gatePlayback({
      candidate: emergency('a'), nowPlaying: null, now: T0,
    })).toBe('play');
  });
});

describe('something routine is sounding', () => {
  const nowPlaying = playing('a', false);

  it('makes another routine announcement wait', () => {
    // THE REPORTED BUG. Previously both sounded.
    expect(gatePlayback({
      candidate: routine('b'), nowPlaying, now: T0 + 2_000,
    })).toBe('wait');
  });

  it('lets an emergency pre-empt it', () => {
    // An emergency does not queue behind a welcome message. 'pre-empt' tells
    // the caller to stop the current one FIRST, so there is still one voice.
    expect(gatePlayback({
      candidate: emergency('b'), nowPlaying, now: T0 + 2_000,
    })).toBe('pre-empt');
  });
});

describe('an emergency is sounding', () => {
  const nowPlaying = playing('a', true);

  it('makes routine traffic wait', () => {
    expect(gatePlayback({
      candidate: routine('b'), nowPlaying, now: T0 + 2_000,
    })).toBe('wait');
  });

  it('makes ANOTHER emergency wait rather than cutting it off', () => {
    // Deliberate. Two half-read emergencies convey nothing; one read in full
    // conveys something. The second is still in the queue and goes out next.
    expect(gatePlayback({
      candidate: emergency('b'), nowPlaying, now: T0 + 2_000,
    })).toBe('wait');
  });
});

describe('the announcement that is already sounding', () => {
  it('is not started a second time', () => {
    expect(gatePlayback({
      candidate: routine('a'), nowPlaying: playing('a', false), now: T0 + 2_000,
    })).toBe('already');
  });

  it('does not overlap ITSELF when a requireAck emergency repeats', () => {
    // A 30-second repeat on a 40-second announcement overlapped itself,
    // permanently, for as long as nobody acknowledged it.
    expect(gatePlayback({
      candidate: emergency('a'), nowPlaying: playing('a', true), now: T0 + 30_000,
    })).toBe('already');
  });

  it('checks identity before urgency, so a repeat is never a pre-empt', () => {
    expect(gatePlayback({
      candidate: emergency('a'), nowPlaying: playing('a', false), now: T0 + 1_000,
    })).toBe('already');
  });
});

describe('a wedged announcement', () => {
  it('holds the radio only up to the ceiling', () => {
    const nowPlaying = playing('a', false);
    expect(gatePlayback({
      candidate: routine('b'), nowPlaying, now: T0 + MAX_PLAY_MS - 1,
    })).toBe('wait');
    expect(gatePlayback({
      candidate: routine('b'), nowPlaying, now: T0 + MAX_PLAY_MS,
    })).toBe('pre-empt');
  });

  it('never silences the radio permanently', () => {
    // If 'ended' never fires — a corrupt file, a slept handset, a throttled
    // background tab — "something is playing" would be true for ever and
    // nothing would be heard again.
    const stuck = playing('a', true);
    expect(gatePlayback({
      candidate: routine('b'), nowPlaying: stuck, now: T0 + 60 * 60 * 1000,
    })).toBe('pre-empt');
  });

  it('says pre-empt, not play, so the caller clears the jam first', () => {
    // Starting without stopping would hand the new announcement the same
    // jammed audio element.
    expect(gatePlayback({
      candidate: routine('b'), nowPlaying: playing('a', false), now: T0 + MAX_PLAY_MS,
    })).toBe('pre-empt');
  });

  it('keeps the ceiling longer than any real announcement and under the server net', () => {
    // The uploaded MP3s run to about a minute; the server marks a stranded
    // item PLAYED after five.
    expect(MAX_PLAY_MS).toBeGreaterThan(90_000);
    expect(MAX_PLAY_MS).toBeLessThan(5 * 60 * 1000);
  });

  it('honours an overridden ceiling', () => {
    expect(gatePlayback({
      candidate: routine('b'), nowPlaying: playing('a', false),
      now: T0 + 1_000, maxPlayMs: 500,
    })).toBe('pre-empt');
  });
});

describe('every decision is reachable', () => {
  it('produces all four verdicts', () => {
    const seen = new Set([
      gatePlayback({ candidate: routine('b'), nowPlaying: null, now: T0 }),
      gatePlayback({ candidate: routine('a'), nowPlaying: playing('a', false), now: T0 }),
      gatePlayback({ candidate: routine('b'), nowPlaying: playing('a', false), now: T0 + 1 }),
      gatePlayback({ candidate: emergency('b'), nowPlaying: playing('a', false), now: T0 + 1 }),
    ]);
    expect(seen).toEqual(new Set(['play', 'already', 'wait', 'pre-empt']));
  });
});
