// ============================================================
// Hybrid Logical Clock — ordering events across two databases
// ------------------------------------------------------------
// Sync needs to say which of two writes happened later. The obvious answer,
// wall-clock time, does not survive contact with this deployment:
//
//   The MikroTik's own log shows its clock a YEAR adrift until it reached a
//   cloud time service, and it will be adrift again after any power cut that
//   outlasts the internet. The local server has the same exposure. A
//   last-write-wins rule on now() would resolve every conflict in favour of
//   whichever machine was most wrong, and would do so silently.
//
// A Hybrid Logical Clock (Kulkarni et al., 2014) fixes this. A stamp is
//
//     physicalMs . counter . nodeId
//
// compared in that order. Three properties matter here:
//
//   MONOTONIC — the clock never goes backwards, even when the system clock
//   does. A node that jumps back a year keeps issuing increasing stamps.
//
//   CAUSAL — receiving a message advances the local clock past it, so if A
//   happened before B and B saw A, B always sorts after A. Wall clocks cannot
//   promise this across machines.
//
//   READABLE — it stays within a few milliseconds of real time when clocks are
//   healthy, so an operator reading the journal sees recognisable timestamps
//   rather than opaque counters.
//
// The nodeId tiebreak makes the ordering total: two nodes stamping in the same
// millisecond still get a deterministic, identical answer on both sides, which
// is what stops them disagreeing about who won.
// ============================================================

export interface Hlc {
  /** Physical time in milliseconds since the epoch. */
  physical: number;
  /** Disambiguates events within the same millisecond. */
  counter: number;
  /** The node that issued the stamp. Breaks ties between nodes. */
  node: string;
}

/**
 * Maximum drift accepted from a peer, in milliseconds.
 *
 * A stamp from further in the future than this is treated as a broken clock
 * rather than a real event: without the cap, one machine with a clock set to
 * 2099 would drag both nodes' clocks forward permanently and every subsequent
 * comparison would be meaningless. 24 hours is generous enough to tolerate a
 * timezone misconfiguration while still catching a wildly wrong clock.
 */
export const MAX_DRIFT_MS = 24 * 60 * 60 * 1000;

const PAD = 15; // ms since epoch fits in 13 digits until the year 5138

/** Serialise to a string that sorts correctly with a plain comparison. */
export function formatHlc(h: Hlc): string {
  return `${String(h.physical).padStart(PAD, '0')}:${String(h.counter).padStart(6, '0')}:${h.node}`;
}

export function parseHlc(s: string): Hlc | null {
  const m = /^(\d{1,15}):(\d{1,6}):(.+)$/.exec(s);
  if (!m) return null;
  return { physical: Number(m[1]), counter: Number(m[2]), node: m[3] };
}

/** Negative if a < b, positive if a > b, zero only if identical. */
export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.physical !== b.physical) return a.physical - b.physical;
  if (a.counter !== b.counter) return a.counter - b.counter;
  return a.node < b.node ? -1 : a.node > b.node ? 1 : 0;
}

/**
 * A clock for one node.
 *
 * `now` is injected rather than calling Date.now() internally so the tests can
 * drive a clock backwards, which is the whole point of this class and cannot
 * be exercised otherwise.
 */
export class HybridLogicalClock {
  private last: Hlc;

  constructor(
    private readonly node: string,
    private readonly now: () => number = () => Date.now()
  ) {
    this.last = { physical: 0, counter: 0, node };
  }

  /** The most recent stamp issued or observed. */
  current(): Hlc {
    return { ...this.last };
  }

  /**
   * Stamp a local event.
   *
   * If the system clock has not advanced — or has gone backwards — the counter
   * increments instead. That is what keeps the sequence monotonic through a
   * clock correction.
   */
  tick(): Hlc {
    const wall = this.now();
    if (wall > this.last.physical) {
      this.last = { physical: wall, counter: 0, node: this.node };
    } else {
      this.last = { physical: this.last.physical, counter: this.last.counter + 1, node: this.node };
    }
    return { ...this.last };
  }

  /**
   * Absorb a stamp received from another node, then stamp the receipt.
   *
   * Advancing past the remote stamp is what encodes causality: everything this
   * node does afterwards sorts after the event it just learned about.
   *
   * A stamp implausibly far in the future is NOT absorbed. Accepting it would
   * let one broken clock poison both nodes permanently — the receiving node
   * would jump forward and could never issue a lower stamp again.
   */
  receive(remote: Hlc): { stamp: Hlc; rejectedDrift: boolean } {
    const wall = this.now();

    if (remote.physical - wall > MAX_DRIFT_MS) {
      // Treat it as a local event: we still order after our own history, but
      // we refuse to inherit a clock that is obviously wrong.
      return { stamp: this.tick(), rejectedDrift: true };
    }

    const physical = Math.max(wall, this.last.physical, remote.physical);

    let counter: number;
    if (physical === this.last.physical && physical === remote.physical) {
      counter = Math.max(this.last.counter, remote.counter) + 1;
    } else if (physical === this.last.physical) {
      counter = this.last.counter + 1;
    } else if (physical === remote.physical) {
      counter = remote.counter + 1;
    } else {
      counter = 0;
    }

    this.last = { physical, counter, node: this.node };
    return { stamp: { ...this.last }, rejectedDrift: false };
  }
}
