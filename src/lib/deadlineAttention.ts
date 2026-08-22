// ============================================================
// What "attended to" means, and when it stops being your business
// ------------------------------------------------------------
// A missed deadline used to become a disciplinary query immediately: a letter
// from the CMD's office to a named clinician, escalated after six hours. It
// ended a conversation before one had been had, and it landed on people who
// may well have been in theatre at the time.
//
// The sequence now is: tell the person, give them a way to say what happened,
// and escalate only what nobody attends to.
//
// Pure, so the rule can be argued about against tests rather than against a
// running server — and so the dashboard, the API and the checker cannot each
// have their own idea of what counts as attended.
// ============================================================

export type DeadlineAttentionStatus = 'OPEN' | 'DELAY_LOGGED' | 'RESOLVED' | 'IN_AUDIT';

/** Twelve hours unattended and it becomes an audit matter. */
export const AUDIT_AFTER_MS = 12 * 60 * 60 * 1000;

/** Long enough to say something useful. A one-word reason is not a reason. */
export const MIN_DELAY_REASON = 10;
/** The resolution has to say HOW. That takes more than a word too. */
export const MIN_RESOLUTION = 10;

export interface AttentionRecord {
  status: DeadlineAttentionStatus;
  notifiedAt: Date | string;
  delayReason?: string | null;
  resolution?: string | null;
  movedToAuditAt?: Date | string | null;
}

const ms = (d: Date | string) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/**
 * Has this been attended to?
 *
 * TRUE for exactly two things: it is resolved, or a delay reason has been
 * logged. The second is deliberately enough to stop the clock and NOT enough
 * to close the record — see stillOwesAnOutcome. Somebody who says "theatre
 * flooded, case moved to tomorrow" has attended to it; they have not finished
 * with it.
 *
 * A record already in audit is NOT attended to. It went there by being
 * ignored, and marking it attended afterwards would quietly erase that.
 */
export function isAttendedTo(r: AttentionRecord): boolean {
  return r.status === 'RESOLVED' || r.status === 'DELAY_LOGGED';
}

/**
 * Explained, but not finished.
 *
 * This is the state the whole design exists to make visible. A reason for a
 * delay is an explanation, not an outcome, and a system that treated the two
 * as the same would let every missed deadline be closed with a sentence.
 */
export function stillOwesAnOutcome(r: AttentionRecord): boolean {
  return r.status === 'DELAY_LOGGED';
}

/**
 * Should this move to Theatre Audit now?
 *
 * Only what nobody touched. A logged delay reason keeps it out of audit even
 * while it still owes an outcome, because somebody IS dealing with it — and
 * hauling that person into an audit discussion is how you teach everybody
 * else to say nothing at all.
 */
export function shouldMoveToAudit(r: AttentionRecord, now: Date = new Date()): boolean {
  if (r.status !== 'OPEN') return false;
  if (r.movedToAuditAt) return false;
  return now.getTime() - ms(r.notifiedAt) >= AUDIT_AFTER_MS;
}

export type AttentionAction =
  | { kind: 'START' }
  | { kind: 'DELAY'; reason: string }
  | { kind: 'RESOLVE'; resolution: string };

export interface ActionOutcome {
  ok: boolean;
  /** What to write. Absent when ok is false. */
  next?: {
    status: DeadlineAttentionStatus;
    delayReason?: string;
    resolution?: string;
  };
  /** Shown to the person. Says what to do, not what they did wrong. */
  message: string;
}

/**
 * Apply what somebody just told us.
 *
 * Note what is allowed from IN_AUDIT: resolving it. A case that reached audit
 * because nobody answered in twelve hours can still be closed out by the
 * person doing the work — the audit record of it having got there is not
 * erased, but the live item stops nagging. What is NOT allowed from IN_AUDIT
 * is logging a delay reason, because "here is why it was late" twelve hours
 * afterwards is a submission to the audit discussion, not an attention.
 */
export function applyAction(
  r: AttentionRecord,
  action: AttentionAction,
): ActionOutcome {
  if (r.status === 'RESOLVED') {
    return { ok: false, message: 'This has already been closed.' };
  }

  switch (action.kind) {
    case 'START':
      // Starting the case is the outcome. Nothing further is owed.
      return {
        ok: true,
        next: { status: 'RESOLVED', resolution: 'Case marked as started.' },
        message: 'Recorded as started. Nothing further is needed.',
      };

    case 'DELAY': {
      if (r.status === 'IN_AUDIT') {
        return {
          ok: false,
          message:
            'This has already gone to Theatre Audit. Record what happened and how it ' +
            'was resolved instead — that is what the discussion will work from.',
        };
      }
      const reason = action.reason.trim();
      if (reason.length < MIN_DELAY_REASON) {
        return {
          ok: false,
          message: `Please say briefly what delayed it — at least ${MIN_DELAY_REASON} characters.`,
        };
      }
      return {
        ok: true,
        next: { status: 'DELAY_LOGGED', delayReason: reason },
        message:
          'Thank you — recorded, and this will not go to audit. It stays open until ' +
          'you confirm the case started, or record how the issue was resolved.',
      };
    }

    case 'RESOLVE': {
      const resolution = action.resolution.trim();
      if (resolution.length < MIN_RESOLUTION) {
        return {
          ok: false,
          message: `Please say how it was resolved — at least ${MIN_RESOLUTION} characters.`,
        };
      }
      return {
        ok: true,
        next: { status: 'RESOLVED', resolution },
        message: 'Recorded and closed. Thank you.',
      };
    }
  }
}

/** What the person sees on their dashboard, in plain words. */
export function statusLabel(r: AttentionRecord): string {
  switch (r.status) {
    case 'OPEN':
      return 'Needs your attention';
    case 'DELAY_LOGGED':
      return 'Explained — still needs an outcome';
    case 'RESOLVED':
      return 'Closed';
    case 'IN_AUDIT':
      return 'Referred to Theatre Audit';
  }
}
