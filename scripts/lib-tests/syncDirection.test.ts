/**
 * Push and pull must not be able to stall each other between cycles.
 *
 * They shared one failure counter and one sleep, so a fault in EITHER
 * direction stalled BOTH — and the one that mattered was the push: a case
 * booked in theatre sat in the journal while the worker served a backoff
 * earned by the cloud being briefly unreachable for a read.
 *
 * On 19 November a momentary `fetch failed` put the next attempt 893 seconds
 * away. Fifteen minutes in which a theatre list could not leave the building,
 * over a link that had come back inside a second.
 *
 * The within-a-cycle half was fixed earlier that day: a failing push no longer
 * unwinds the cycle before the pull is attempted. This is the other half, and
 * these are the rules that decide it.
 */
import { describe, expect, it } from 'vitest';
import {
  freshDirection,
  isDue,
  noteSuccess,
  noteFailure,
  nextWakeMs,
  combinedState,
} from '../../src/lib/sync/direction';

const MINUTE = 60_000;
const NOW = 1_700_000_000_000;

describe('a direction on its own', () => {
  it('starts due, so a worker that has just booted sends immediately', () => {
    const d = freshDirection();
    expect(isDue(d, NOW)).toBe(true);
    expect(d.failures).toBe(0);
    expect(d.lastError).toBeNull();
  });

  it('goes back on the ordinary interval when it works', () => {
    const d = freshDirection();
    noteFailure(d, NOW, 10 * MINUTE, 'fetch failed');
    noteSuccess(d, NOW + 1000, MINUTE);
    expect(d.failures).toBe(0);
    expect(d.lastError).toBeNull();
    expect(d.nextAttemptAt).toBe(NOW + 1000 + MINUTE);
  });

  it('is not due until its wait has run', () => {
    const d = freshDirection();
    noteFailure(d, NOW, 5 * MINUTE, 'fetch failed');
    expect(isDue(d, NOW + 5 * MINUTE - 1)).toBe(false);
    expect(isDue(d, NOW + 5 * MINUTE)).toBe(true);
  });

  it('counts consecutive failures and remembers the last one', () => {
    const d = freshDirection();
    noteFailure(d, NOW, MINUTE, 'first');
    noteFailure(d, NOW, MINUTE, 'second');
    expect(d.failures).toBe(2);
    expect(d.lastError).toBe('second');
  });
});

describe('19 November, replayed', () => {
  /**
   * The incident, in the numbers the log actually printed: a transient
   * `fetch failed` on BOTH directions, then the link came back. Under the old
   * single counter the next attempt — for the push as well — was 893 seconds
   * away. The push had nothing wrong with it.
   */
  const BACKOFF_893 = 893_000;

  it('does not let a sick pull hold up a healthy push', () => {
    const push = freshDirection();
    const pull = freshDirection();

    // The push went through. The pull did not.
    noteSuccess(push, NOW, MINUTE);
    noteFailure(pull, NOW, BACKOFF_893, 'pull failed: fetch failed');

    // The worker wakes on the push's ordinary minute, not the pull's quarter
    // of an hour. THIS IS THE WHOLE FIX.
    expect(nextWakeMs(push, pull, NOW, MINUTE)).toBe(MINUTE);

    // And at that minute the push is attempted and the pull is left alone.
    const atWake = NOW + MINUTE;
    expect(isDue(push, atWake)).toBe(true);
    expect(isDue(pull, atWake)).toBe(false);
  });

  it('does not let a sick push hold up a healthy pull either', () => {
    // The mirror image. A theatre that cannot send is still a theatre that
    // should receive — that was the two-and-a-half-hour fault in August.
    const push = freshDirection();
    const pull = freshDirection();
    noteFailure(push, NOW, BACKOFF_893, 'push failed: fetch failed');
    noteSuccess(pull, NOW, MINUTE);

    expect(nextWakeMs(push, pull, NOW, MINUTE)).toBe(MINUTE);
    expect(isDue(pull, NOW + MINUTE)).toBe(true);
    expect(isDue(push, NOW + MINUTE)).toBe(false);
  });

  it('charges the failure only to the direction that failed', () => {
    const push = freshDirection();
    const pull = freshDirection();
    noteSuccess(push, NOW, MINUTE);
    noteFailure(pull, NOW, BACKOFF_893, 'fetch failed');
    noteFailure(pull, NOW, BACKOFF_893, 'fetch failed');

    expect(pull.failures).toBe(2);
    // A push that never failed must never carry a failure count, because the
    // count is what chooses the length of the next wait.
    expect(push.failures).toBe(0);
  });

  it('lets the recovered direction resume at full speed', () => {
    // The pull coming good must not inherit the backoff it was serving.
    const pull = freshDirection();
    noteFailure(pull, NOW, BACKOFF_893, 'fetch failed');
    noteFailure(pull, NOW, BACKOFF_893, 'fetch failed');
    noteSuccess(pull, NOW + BACKOFF_893, MINUTE);
    expect(pull.failures).toBe(0);
    expect(pull.nextAttemptAt).toBe(NOW + BACKOFF_893 + MINUTE);
  });
});

describe('how long the loop sleeps', () => {
  it('waits for the sooner of the two', () => {
    const push = freshDirection();
    const pull = freshDirection();
    push.nextAttemptAt = NOW + 20_000;
    pull.nextAttemptAt = NOW + 50_000;
    expect(nextWakeMs(push, pull, NOW, MINUTE)).toBe(20_000);
    push.nextAttemptAt = NOW + 50_000;
    pull.nextAttemptAt = NOW + 20_000;
    expect(nextWakeMs(push, pull, NOW, MINUTE)).toBe(20_000);
  });

  it('never spins when a due time is already past', () => {
    // A hot loop against a peer that is struggling is how a bad link becomes
    // an outage.
    const push = freshDirection();
    const pull = freshDirection();
    push.nextAttemptAt = NOW - 10 * MINUTE;
    expect(nextWakeMs(push, pull, NOW, MINUTE)).toBe(1_000);
    expect(nextWakeMs(push, pull, NOW, MINUTE, 5_000)).toBe(5_000);
  });

  it('keeps turning through an outage, without touching the network', () => {
    // Both directions backed off a quarter of an hour. The loop still wakes on
    // the ordinary interval, because the cycle does LOCAL work between the two
    // — retrying deferred entries, which unblocks children whose parent has
    // since arrived — and that has nothing to do with the link being down.
    const push = freshDirection();
    const pull = freshDirection();
    noteFailure(push, NOW, 15 * MINUTE, 'fetch failed');
    noteFailure(pull, NOW, 15 * MINUTE, 'fetch failed');

    expect(nextWakeMs(push, pull, NOW, MINUTE)).toBe(MINUTE);
    // ...and neither direction is attempted at that wake-up, so the peer is
    // left alone exactly as the backoff intends.
    const atWake = NOW + MINUTE;
    expect(isDue(push, atWake)).toBe(false);
    expect(isDue(pull, atWake)).toBe(false);
  });
});

describe('what the status row says', () => {
  it('is clean when both directions are well', () => {
    expect(combinedState(freshDirection(), freshDirection())).toEqual({
      failures: 0, lastError: null,
    });
  });

  it('reports the worse of the two, and names which direction', () => {
    // "2 consecutive errors" without saying which direction is a number an
    // operator cannot act on, and "the push is fine and the pull is not" is
    // now a state the system can be in.
    const push = freshDirection();
    const pull = freshDirection();
    noteSuccess(push, NOW, MINUTE);
    noteFailure(pull, NOW, MINUTE, 'fetch failed');
    noteFailure(pull, NOW, MINUTE, 'fetch failed');

    const c = combinedState(push, pull);
    expect(c.failures).toBe(2);
    expect(c.lastError).toBe('pull (2): fetch failed');
    expect(c.lastError).not.toContain('push');
  });

  it('names both when both are failing', () => {
    const push = freshDirection();
    const pull = freshDirection();
    noteFailure(push, NOW, MINUTE, 'batch too large');
    noteFailure(pull, NOW, MINUTE, 'fetch failed');
    noteFailure(pull, NOW, MINUTE, 'fetch failed');

    const c = combinedState(push, pull);
    expect(c.failures).toBe(2);
    expect(c.lastError).toContain('push (1): batch too large');
    expect(c.lastError).toContain('pull (2): fetch failed');
  });

  it('does not report a direction that has recovered', () => {
    // A stale error beside a healthy count is how an operator spends twenty
    // minutes chasing a fault that cleared itself.
    const push = freshDirection();
    const pull = freshDirection();
    noteFailure(push, NOW, MINUTE, 'fetch failed');
    noteSuccess(push, NOW + MINUTE, MINUTE);
    noteFailure(pull, NOW + MINUTE, MINUTE, 'still broken');

    const c = combinedState(push, pull);
    expect(c.failures).toBe(1);
    expect(c.lastError).toBe('pull (1): still broken');
  });
});
