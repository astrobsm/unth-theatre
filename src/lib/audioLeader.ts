// ============================================================
// Which open window is allowed to speak
// ------------------------------------------------------------
// Several windows of ORM are often open on one device — a tab, the installed
// app, a wall display left on since morning. Only one may speak, or an
// emergency arrives as a chorus.
//
// The original election chose on LIVENESS alone: whichever window claimed the
// heartbeat first kept it until it closed. That is the wrong question. A
// background tab is perfectly alive and can rewrite a timestamp every two
// seconds while being completely unable to make a sound — no user gesture has
// ever reached it, so the browser refuses it audio. It held the lock, and the
// window the nurse was actually looking at reported "being announced in your
// other open window" and stayed silent. The announcement was displayed, and
// heard by nobody.
//
// So the question is not "who got here first" but "who can actually be heard".
// A VISIBLE window outranks a hidden one and takes the lock immediately. A
// hidden window keeps it only while no visible window wants it, which is the
// case that dedupe was invented for in the first place.
//
// Pure, so the rules can be exercised without a browser — this is the part that
// decides whether an emergency is audible, and it should not need two phones
// and a stopwatch to verify.
// ============================================================

/** Rewritten by the leader every 2s. */
export const HEARTBEAT_MS = 2000;

/**
 * How long a record survives without a refresh. Deliberately more than two
 * heartbeats: a single missed interval on a busy phone must not trigger a
 * takeover, or two windows trade the lock back and forth and stutter.
 */
export const STALE_MS = 5000;

export interface LeaderRecord {
  id: string;
  ts: number;
  /** Whether the holder could actually be heard when it last wrote. */
  visible: boolean;
}

export function isLeaderRecord(v: unknown): v is LeaderRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  // `visible` is optional on read: a record written by an older build has no
  // such field, and treating that as malformed would drop the lock every time
  // one tab updates before another.
  return typeof r.id === 'string' && typeof r.ts === 'number';
}

export interface ClaimInput {
  record: LeaderRecord | null;
  myId: string;
  /** Can THIS window be heard right now? */
  iAmVisible: boolean;
  now: number;
}

export type ClaimReason =
  | 'no-leader'
  | 'leader-stale'
  | 'already-mine'
  | 'took-over-from-hidden'
  | 'deferring';

/**
 * Whether this window should hold the speaking lock, and why.
 *
 * The reason is returned rather than a bare boolean because "why is this window
 * silent" is the question somebody will be asking at the time it matters, and
 * a log line that answers it is worth the extra field.
 */
export function evaluateClaim(input: ClaimInput): { claim: boolean; reason: ClaimReason } {
  const { record, myId, iAmVisible, now } = input;

  if (!record) return { claim: true, reason: 'no-leader' };
  if (record.id === myId) return { claim: true, reason: 'already-mine' };
  if (now - record.ts > STALE_MS) return { claim: true, reason: 'leader-stale' };

  // The rule this file exists for. A window that can be heard takes the lock
  // from one that cannot, immediately and without waiting for it to go stale —
  // a hidden tab refreshing its heartbeat on time never goes stale, which is
  // precisely how the silent failure lasted.
  //
  // `visible !== false` rather than `visible === true`: a record from an older
  // build carries no flag, and must not be treated as hidden and stolen from,
  // or two updated windows would fight over an unmigrated one.
  if (iAmVisible && record.visible === false) {
    return { claim: true, reason: 'took-over-from-hidden' };
  }

  return { claim: false, reason: 'deferring' };
}
