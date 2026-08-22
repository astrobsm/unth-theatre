import { describe, it, expect } from 'vitest';

import {
  isAttendedTo,
  stillOwesAnOutcome,
  shouldMoveToAudit,
  applyAction,
  statusLabel,
  AUDIT_AFTER_MS,
  MIN_DELAY_REASON,
  type AttentionRecord,
} from '../../src/lib/deadlineAttention';

// The rule these hold: a missed deadline goes to the person who can still fix
// it, not to the CMD's office. It escalates only when nobody attends to it.
//
// The distinction the whole design rests on is between EXPLAINING a delay and
// RESOLVING it. A system that treated those as the same would let every missed
// deadline be closed with one sentence, which is how a safety mechanism turns
// into a box to tick.

const NOW = new Date('2026-08-22T18:00:00Z');
const rec = (over: Partial<AttentionRecord> = {}): AttentionRecord => ({
  status: 'OPEN',
  notifiedAt: new Date('2026-08-22T12:00:00Z'), // six hours before NOW
  ...over,
});

describe('what counts as attended to', () => {
  it('an untouched record is not', () => {
    expect(isAttendedTo(rec())).toBe(false);
  });

  it('a logged delay reason IS — it stops the clock', () => {
    expect(isAttendedTo(rec({ status: 'DELAY_LOGGED' }))).toBe(true);
  });

  it('a resolved record is', () => {
    expect(isAttendedTo(rec({ status: 'RESOLVED' }))).toBe(true);
  });

  it('one already in audit is NOT', () => {
    // It got there by being ignored. Counting it as attended afterwards would
    // quietly erase that it was ever missed.
    expect(isAttendedTo(rec({ status: 'IN_AUDIT' }))).toBe(false);
  });
});

describe('explaining is not finishing', () => {
  it('a delay reason leaves an outcome owed', () => {
    expect(stillOwesAnOutcome(rec({ status: 'DELAY_LOGGED' }))).toBe(true);
  });

  it('and resolving discharges it', () => {
    expect(stillOwesAnOutcome(rec({ status: 'RESOLVED' }))).toBe(false);
  });

  it('says so on the dashboard, in words a person can act on', () => {
    expect(statusLabel(rec({ status: 'DELAY_LOGGED' })))
      .toBe('Explained — still needs an outcome');
  });
});

describe('when it moves to Theatre Audit', () => {
  it('not before twelve hours', () => {
    const justUnder = new Date(NOW.getTime() - (AUDIT_AFTER_MS - 60_000));
    expect(shouldMoveToAudit(rec({ notifiedAt: justUnder }), NOW)).toBe(false);
  });

  it('at twelve hours', () => {
    const exactly = new Date(NOW.getTime() - AUDIT_AFTER_MS);
    expect(shouldMoveToAudit(rec({ notifiedAt: exactly }), NOW)).toBe(true);
  });

  it('NEVER once a delay reason has been logged', () => {
    // The point of this one. Somebody who explained is dealing with it, and
    // hauling them into an audit discussion anyway teaches everybody else to
    // say nothing at all.
    const old = new Date(NOW.getTime() - 5 * AUDIT_AFTER_MS);
    expect(shouldMoveToAudit(rec({ status: 'DELAY_LOGGED', notifiedAt: old }), NOW)).toBe(false);
  });

  it('never twice', () => {
    const old = new Date(NOW.getTime() - 5 * AUDIT_AFTER_MS);
    expect(shouldMoveToAudit(rec({ notifiedAt: old, movedToAuditAt: NOW }), NOW)).toBe(false);
  });

  it('never for something already resolved', () => {
    const old = new Date(NOW.getTime() - 5 * AUDIT_AFTER_MS);
    expect(shouldMoveToAudit(rec({ status: 'RESOLVED', notifiedAt: old }), NOW)).toBe(false);
  });
});

describe('marking the case started', () => {
  it('closes it outright', () => {
    const out = applyAction(rec(), { kind: 'START' });
    expect(out.ok).toBe(true);
    expect(out.next?.status).toBe('RESOLVED');
  });

  it('works even after it reached audit', () => {
    // The work still matters. The audit record of it having got there stays.
    const out = applyAction(rec({ status: 'IN_AUDIT' }), { kind: 'START' });
    expect(out.ok).toBe(true);
    expect(out.next?.status).toBe('RESOLVED');
  });
});

describe('logging a delay', () => {
  it('refuses a reason too short to mean anything', () => {
    const out = applyAction(rec(), { kind: 'DELAY', reason: 'late' });
    expect(out.ok).toBe(false);
    expect(out.message).toContain(String(MIN_DELAY_REASON));
  });

  it('accepts a real one and says what is still owed', () => {
    const out = applyAction(rec(), {
      kind: 'DELAY',
      reason: 'Theatre 3 flooded; case moved to the afternoon list.',
    });
    expect(out.ok).toBe(true);
    expect(out.next?.status).toBe('DELAY_LOGGED');
    // The message has to tell them it is not finished, or they will assume it is.
    expect(out.message).toContain('stays open');
  });

  it('is refused once the matter is in audit', () => {
    const out = applyAction(rec({ status: 'IN_AUDIT' }), {
      kind: 'DELAY',
      reason: 'Theatre 3 flooded; case moved to the afternoon list.',
    });
    expect(out.ok).toBe(false);
    expect(out.message).toContain('Theatre Audit');
  });
});

describe('resolving', () => {
  it('requires saying HOW, not just that it is done', () => {
    const out = applyAction(rec({ status: 'DELAY_LOGGED' }), { kind: 'RESOLVE', resolution: 'done' });
    expect(out.ok).toBe(false);
  });

  it('closes a record that owed an outcome', () => {
    const out = applyAction(rec({ status: 'DELAY_LOGGED' }), {
      kind: 'RESOLVE',
      resolution: 'Case ran at 14:30 in Theatre 5 once the leak was fixed.',
    });
    expect(out.ok).toBe(true);
    expect(out.next?.status).toBe('RESOLVED');
    expect(out.next?.resolution).toContain('Theatre 5');
  });

  it('closes one that reached audit, without pretending it never did', () => {
    const out = applyAction(rec({ status: 'IN_AUDIT' }), {
      kind: 'RESOLVE',
      resolution: 'Patient was operated on the following morning; family informed.',
    });
    expect(out.ok).toBe(true);
    expect(out.next?.status).toBe('RESOLVED');
  });

  it('will not reopen something already closed', () => {
    const out = applyAction(rec({ status: 'RESOLVED' }), {
      kind: 'RESOLVE',
      resolution: 'Trying to write over a closed record.',
    });
    expect(out.ok).toBe(false);
  });
});
