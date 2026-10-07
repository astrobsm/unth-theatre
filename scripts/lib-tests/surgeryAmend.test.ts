/**
 * Correcting a booking that has already been closed.
 *
 * A case scheduled for 8 October was marked COMPLETED on the 7th, the day
 * before it was due. The ordinary PUT then refused every edit — status,
 * anaesthetist, theatre, all of it — because a completed surgery is a clinical
 * record and casual editing of one is how a theatre log stops being evidence.
 *
 * That rule is right. What it lacked was a way out of an ordinary slip, and a
 * system with no way back from a mis-click invites people to work around it.
 *
 * So the amendment path is a separate door, and these tests are about the
 * things that make it a door rather than a hole: it refuses without a written
 * reason, it refuses the wrong people, it records exactly what changed, and
 * it does not leave a completedAt behind on a case that is no longer
 * complete — which would keep it in every report counting completions.
 */
import { describe, expect, it } from 'vitest';

import {
  validateAmendment, diffAmendment, isReopening, clearedTimestamps, looksDuplicated,
  MIN_REASON_LENGTH, MAY_AMEND,
} from '../../src/lib/surgery/amend';

const GOOD_REASON = 'Marked complete by mistake; the case is tomorrow.';

describe('who may amend, and on what terms', () => {
  it('refuses somebody outside theatre management', () => {
    const r = validateAmendment({
      role: 'CONSULTANT_SURGEON', reason: GOOD_REASON, changes: { status: 'SCHEDULED' },
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('NO_ACCESS');
  });

  it('allows theatre management and administrators', () => {
    for (const role of MAY_AMEND) {
      const r = validateAmendment({ role, reason: GOOD_REASON, changes: { status: 'SCHEDULED' } });
      expect(r.ok, `${role} should be allowed`).toBe(true);
    }
  });

  it('is not fooled by lower case', () => {
    expect(validateAmendment({
      role: 'theatre_manager', reason: GOOD_REASON, changes: { status: 'SCHEDULED' },
    }).ok).toBe(true);
  });

  it('refuses without a reason', () => {
    // The whole distinction between this path and the strict one. A
    // correction with no reason is indistinguishable from an error, and
    // whoever reads the record next cannot tell which it was.
    for (const reason of [undefined, null, '', '   ', 'typo']) {
      const r = validateAmendment({ role: 'ADMIN', reason, changes: { status: 'SCHEDULED' } });
      expect(r.ok, `"${reason}" should be refused`).toBe(false);
      expect(r.code).toBe('REASON_REQUIRED');
    }
  });

  it('accepts a reason at exactly the minimum', () => {
    const r = validateAmendment({
      role: 'ADMIN', reason: 'x'.repeat(MIN_REASON_LENGTH), changes: { status: 'SCHEDULED' },
    });
    expect(r.ok).toBe(true);
  });

  it('refuses a status that does not exist', () => {
    const r = validateAmendment({
      role: 'ADMIN', reason: GOOD_REASON, changes: { status: 'FINISHED' },
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('BAD_STATUS');
  });

  it('refuses an amendment that changes nothing', () => {
    const r = validateAmendment({ role: 'ADMIN', reason: GOOD_REASON, changes: {} });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('NOTHING_TO_DO');
  });

  it('allows assigning somebody without touching the status', () => {
    // The second half of the problem: the case also had no anaesthetist, and
    // assigning one must not require pretending the status is changing.
    const r = validateAmendment({
      role: 'THEATRE_MANAGER', reason: GOOD_REASON, changes: { anesthetistId: 'dr-123' },
    });
    expect(r.ok).toBe(true);
  });
});

describe('what the audit entry records', () => {
  const before = {
    status: 'COMPLETED', theatreId: 'th-1', anesthetistId: null,
    scrubNurseId: null, theatreTechnicianId: null, assistantSurgeonId: null,
  };

  it('lists only what genuinely differs', () => {
    // An audit trail padded with non-changes is one nobody reads, and the real
    // change hides among them.
    const diff = diffAmendment(before, { status: 'SCHEDULED', theatreId: 'th-1' });
    expect(diff).toHaveLength(1);
    expect(diff[0]).toEqual({ field: 'status', from: 'COMPLETED', to: 'SCHEDULED' });
  });

  it('records an assignment made from nothing', () => {
    const diff = diffAmendment(before, { anesthetistId: 'dr-123' });
    expect(diff).toEqual([{ field: 'anesthetistId', from: null, to: 'dr-123' }]);
  });

  it('treats an empty string as clearing the field', () => {
    // A select set back to "-- none --" sends '', which means unassign rather
    // than "assign somebody called empty string".
    const diff = diffAmendment({ ...before, anesthetistId: 'dr-123' }, { anesthetistId: '' });
    expect(diff).toEqual([{ field: 'anesthetistId', from: 'dr-123', to: null }]);
  });

  it('does not record clearing something already empty', () => {
    expect(diffAmendment(before, { anesthetistId: '' })).toEqual([]);
  });

  it('ignores fields that were not submitted', () => {
    expect(diffAmendment(before, {})).toEqual([]);
  });
});

describe('re-opening a closed case', () => {
  it('recognises coming back from completed or cancelled', () => {
    expect(isReopening('COMPLETED', 'SCHEDULED')).toBe(true);
    expect(isReopening('CANCELLED', 'SCHEDULED')).toBe(true);
  });

  it('is not re-opening when the case was already open', () => {
    expect(isReopening('SCHEDULED', 'IN_PROGRESS')).toBe(false);
  });

  it('is not re-opening when it stays closed', () => {
    expect(isReopening('COMPLETED', 'CANCELLED')).toBe(false);
  });

  it('clears completedAt when a case stops being complete', () => {
    // Left behind, it would sit in the record saying the operation finished at
    // a time it did not, and every report counting completions by date would
    // go on counting it.
    expect(clearedTimestamps('COMPLETED', 'SCHEDULED')).toEqual({ completedAt: null });
  });

  it('leaves completedAt alone when the case is still complete', () => {
    expect(clearedTimestamps('COMPLETED', 'COMPLETED')).toEqual({});
    expect(clearedTimestamps('SCHEDULED', 'IN_PROGRESS')).toEqual({});
  });
});

describe('spotting a booking made twice', () => {
  const base = {
    patientId: 'p-1',
    procedureName: 'Craniotomy plus microsurgical excision of pituitary macroadenoma',
    scheduledDate: '2026-10-08T08:30:00Z',
  };

  it('matches the case from the theatre list', () => {
    expect(looksDuplicated(base, { ...base })).toBe(true);
  });

  it('tolerates spacing and case in the procedure', () => {
    expect(looksDuplicated(base, {
      ...base, procedureName: '  CRANIOTOMY PLUS  microsurgical excision of pituitary macroadenoma ',
    })).toBe(true);
  });

  it('matches across a different time on the same day', () => {
    // A resubmission can land on a slightly different time if the form
    // recalculated one.
    expect(looksDuplicated(base, { ...base, scheduledDate: '2026-10-08T14:00:00Z' })).toBe(true);
  });

  it('does not match a different patient', () => {
    expect(looksDuplicated(base, { ...base, patientId: 'p-2' })).toBe(false);
  });

  it('does not match a different procedure on the same patient and day', () => {
    // Two genuine operations in one day happen, and flagging them as
    // duplicates would invite somebody to cancel a real one.
    expect(looksDuplicated(base, { ...base, procedureName: 'Wound debridement' })).toBe(false);
  });

  it('does not match the same procedure on another day', () => {
    // A staged procedure or a return to theatre. Both are real.
    expect(looksDuplicated(base, { ...base, scheduledDate: '2026-10-15T08:30:00Z' })).toBe(false);
  });
});
