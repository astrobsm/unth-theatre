// ============================================================
// The two directions keep their own clocks
// ------------------------------------------------------------
// Push and pull shared one failure counter and one sleep. So a fault in
// EITHER direction stalled BOTH, and the one that mattered was the push: a
// case booked in theatre sat in the journal while the worker served a backoff
// earned by the cloud being briefly unreachable for a read.
//
// That is what happened on 19 November. A momentary `fetch failed` took the
// counter to its ceiling and the next attempt was 893 seconds away — fifteen
// minutes in which the theatre list could not leave the building, over a link
// that had come back inside a second.
//
// Half the problem was already fixed: a failing push no longer unwinds the
// cycle before the pull is attempted, so neither direction can starve the
// other WITHIN a cycle. This is the other half — neither direction can starve
// the other BETWEEN cycles either. Each carries its own consecutive-failure
// count and its own due time, and the worker sleeps until the SOONER of the
// two. A healthy push keeps its ordinary minute while the pull is serving a
// fifteen-minute backoff, and vice versa.
//
// WHY NOT SIMPLY SHORTEN THE BACKOFF. Because the backoff is right. A peer
// that is struggling should be left alone for longer each time, or a hospital
// with a bad link spends its morning hammering a server that cannot answer.
// The fault was never the length of the wait; it was charging it to a
// direction that had not failed.
// ============================================================

/** One direction's health, as the worker's loop needs it. */
export interface DirectionState {
  /** Consecutive failures. Zero means the last attempt succeeded. */
  failures: number;
  /**
   * Epoch milliseconds before which this direction is not attempted again.
   * Zero means "attempt it now", which is how both directions start.
   */
  nextAttemptAt: number;
  /** The most recent failure, for the operator-facing state. Null when well. */
  lastError: string | null;
}

export function freshDirection(): DirectionState {
  return { failures: 0, nextAttemptAt: 0, lastError: null };
}

/** Is this direction due to be attempted? */
export function isDue(state: DirectionState, now: number): boolean {
  return now >= state.nextAttemptAt;
}

/**
 * This direction worked. Clear its failures and put it back on the ordinary
 * interval.
 */
export function noteSuccess(
  state: DirectionState,
  now: number,
  intervalMs: number,
): DirectionState {
  state.failures = 0;
  state.lastError = null;
  state.nextAttemptAt = now + intervalMs;
  return state;
}

/**
 * This direction failed. Count it and set when it may be tried again.
 *
 * `waitMs` is supplied rather than computed here because the two reasons for
 * waiting are different questions with different answers: an exponential
 * backoff answers "the peer is struggling", and a short fixed wait answers "we
 * sent too much and are about to send less", which is a DIFFERENT request
 * rather than a repeat of a failed one.
 */
export function noteFailure(
  state: DirectionState,
  now: number,
  waitMs: number,
  message: string,
): DirectionState {
  state.failures += 1;
  state.lastError = message;
  state.nextAttemptAt = now + Math.max(0, waitMs);
  return state;
}

/**
 * How long the loop should sleep: until the sooner of the two directions is
 * due.
 *
 * Clamped at both ends, for two different reasons.
 *
 * Never SHORTER than `minMs`, so a due time already in the past cannot turn
 * the loop into a hot spin against a peer that is struggling.
 *
 * Never LONGER than the ordinary interval, which is not needed to pick the
 * right direction -- the minimum above does that -- but keeps the loop turning
 * through an outage. The cycle does local work between the two directions
 * (retrying deferred entries, which unblocks children whose parent has since
 * arrived) and that work has nothing to do with the link being down. With both
 * directions backed off, the wake-ups attempt no network at all: they are due
 * times in the future, and the cycle skips them.
 */
export function nextWakeMs(
  push: DirectionState,
  pull: DirectionState,
  now: number,
  intervalMs: number,
  minMs = 1_000,
): number {
  const due = Math.min(push.nextAttemptAt, pull.nextAttemptAt);
  return Math.max(minMs, Math.min(intervalMs, due - now));
}

/**
 * The single health row still has one error count and one message, and both
 * are read by the health endpoint and by why-not-syncing.sh.
 *
 * The WORSE of the two directions, named. "2 consecutive errors" without
 * saying which direction is a number an operator cannot act on — the whole
 * point of splitting the two is that "the push is fine and the pull is not" is
 * now a thing the system can be in, and a status line that cannot express it
 * would hide exactly the state this change creates.
 */
export function combinedState(
  push: DirectionState,
  pull: DirectionState,
): { failures: number; lastError: string | null } {
  const failures = Math.max(push.failures, pull.failures);
  if (failures === 0) return { failures: 0, lastError: null };

  const parts: string[] = [];
  if (push.failures > 0 && push.lastError) {
    parts.push(`push (${push.failures}): ${push.lastError}`);
  }
  if (pull.failures > 0 && pull.lastError) {
    parts.push(`pull (${pull.failures}): ${pull.lastError}`);
  }
  return { failures, lastError: parts.join(' | ') || null };
}
