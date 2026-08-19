import { describe, it, expect } from 'vitest';
import {
  isOfflineQueued,
  offlineQueuedReason,
  queuedMessage,
  OFFLINE_SAVED_MESSAGE,
  TIMED_OUT_SAVED_MESSAGE,
} from '../../src/lib/offlineResponse';

// The distinction these protect: a write that TIMED OUT has usually already
// reached the server — that is where the duplicated cases on the theatre list
// came from. A write queued because the device was offline has not. Telling a
// surgeon the wrong one of those decides whether the list gets one case or two.

// The real Response.headers is case-insensitive, so the stub is too — a test
// that only passes against an exact-case Map would not prove much.
const mk = (headers: Record<string, string>): Response => {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (k: string) => lower[k.toLowerCase()] ?? null } } as unknown as Response;
};

describe('isOfflineQueued', () => {
  it('recognises the interceptor’s synthetic response', () => {
    expect(isOfflineQueued(mk({ 'X-Offline-Queued': 'true' }))).toBe(true);
  });

  it('does not treat an ordinary response as queued', () => {
    expect(isOfflineQueued(mk({}))).toBe(false);
    expect(isOfflineQueued(mk({ 'X-Offline-Queued': 'false' }))).toBe(false);
  });

  it('survives a response with no usable headers rather than throwing', () => {
    // A synthetic or cross-origin response can have headers that throw on read.
    const hostile = { headers: { get() { throw new Error('opaque'); } } } as unknown as Response;
    expect(isOfflineQueued(hostile)).toBe(false);
  });
});

describe('offlineQueuedReason', () => {
  it('reports a timeout as a timeout', () => {
    expect(offlineQueuedReason(mk({ 'X-Offline-Reason': 'timeout' }))).toBe('timeout');
  });

  it('defaults to offline when the reason is absent', () => {
    // Older builds queue without the header. Defaulting to 'offline' keeps the
    // previous wording rather than claiming a timeout that may not have happened.
    expect(offlineQueuedReason(mk({}))).toBe('offline');
  });

  it('treats any unrecognised value as offline rather than guessing', () => {
    expect(offlineQueuedReason(mk({ 'X-Offline-Reason': 'something-else' }))).toBe('offline');
  });
});

describe('queuedMessage', () => {
  it('tells a timed-out user NOT to enter it again', () => {
    // The single most important sentence in this file.
    const msg = queuedMessage(mk({ 'X-Offline-Reason': 'timeout' }));
    expect(msg).toBe(TIMED_OUT_SAVED_MESSAGE);
    expect(msg.toLowerCase()).toContain('do not enter it again');
  });

  it('does not tell somebody on a working connection that they are offline', () => {
    // Saying "you are offline" to somebody who plainly is not costs trust in
    // everything else the screen says.
    expect(queuedMessage(mk({ 'X-Offline-Reason': 'timeout' })).toLowerCase()).not.toContain('offline');
  });

  it('keeps the offline wording when the device really was offline', () => {
    expect(queuedMessage(mk({ 'X-Offline-Reason': 'offline' }))).toBe(OFFLINE_SAVED_MESSAGE);
    expect(queuedMessage(mk({}))).toBe(OFFLINE_SAVED_MESSAGE);
  });

  it('never returns an empty message', () => {
    for (const r of ['timeout', 'offline', 'nonsense']) {
      expect(queuedMessage(mk({ 'X-Offline-Reason': r })).length).toBeGreaterThan(20);
    }
  });
});
