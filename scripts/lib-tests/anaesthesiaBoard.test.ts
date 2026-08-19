import { describe, it, expect } from 'vitest';
import { summariseAnaesthesiaCase, livePrescription } from '../../src/lib/anaesthesia/board';

// What a consultant anaesthetist is deciding when they read this board: can
// today's list run, and what is waiting on me. The two ways of getting that
// wrong are counting a half-typed review as done, and reading a superseded
// prescription as the live one.

const surgery = {
  id: 's1',
  patientName: 'Eneh Abigail',
  folderNumber: 'F/1234',
  age: 34, gender: 'Female', ward: 'GYNAE',
  procedureName: 'Elective caesarean section',
  unit: 'O&G', subspecialty: 'Obstetrics',
  scheduledTime: '09:00', status: 'SCHEDULED', surgeryType: 'ELECTIVE',
  location: null, theatre: 'Theatre 4', anaesthesiaType: 'SPINAL',
  surgeonName: 'Val Ugwu',
  anaesthetist: { id: 'u1', name: 'Dr Chidi Okeke', phone: '08030000001' },
};

const review = (over: Record<string, unknown> = {}) => ({
  status: 'COMPLETED', reviewDate: new Date('2026-08-18T10:00:00Z'),
  anesthetistName: 'Dr Ada Nwosu', consultantName: 'Dr Briggs',
  fitnessDecision: 'FIT', approvedAt: null, asaClass: 'II',
  ...over,
}) as never;

const rx = (over: Record<string, unknown> = {}) => ({
  id: 'p1', status: 'APPROVED', version: 1,
  prescribedByName: 'Dr Ada Nwosu', approvedByName: 'Dr Briggs',
  supersededById: null, _count: { prescriptionItems: 5 },
  ...over,
}) as never;

describe('review state — started is not finished', () => {
  it('reports a case with no review as not reviewed', () => {
    const c = summariseAnaesthesiaCase({ surgery, review: null, prescriptions: [] });
    expect(c.review.state).toBe('NONE');
    expect(c.outstanding).toContain('Not yet reviewed');
  });

  it('does NOT count a half-typed review as reviewed', () => {
    // The row is created when the form is opened, so counting rows would
    // report a list as fully reviewed while half of it was drafts.
    const c = summariseAnaesthesiaCase({ surgery, review: review({ status: 'IN_PROGRESS' }), prescriptions: [rx()] });
    expect(c.review.state).toBe('IN_PROGRESS');
    expect(c.readyForTheatre).toBe(false);
    expect(c.outstanding).toContain('Review started, not completed');
  });

  it('names the person who actually did the review, not the consultant', () => {
    const c = summariseAnaesthesiaCase({ surgery, review: review(), prescriptions: [rx()] });
    expect(c.review.byName).toBe('Dr Ada Nwosu');
    expect(c.review.consultantName).toBe('Dr Briggs');
  });
});

describe('fitness — NOT FIT is disqualifying on its own', () => {
  it('never reports ready when the patient was assessed unfit', () => {
    // Everything else is in place. A green tick beside an unfit patient is
    // worse than no board at all.
    const c = summariseAnaesthesiaCase({
      surgery, review: review({ fitnessDecision: 'NOT_FIT' }), prescriptions: [rx()],
    });
    expect(c.readyForTheatre).toBe(false);
    expect(c.outstanding).toContain('Patient assessed NOT FIT');
  });

  it('treats an undecided review as undecided rather than fit', () => {
    const c = summariseAnaesthesiaCase({ surgery, review: review({ fitnessDecision: null }), prescriptions: [rx()] });
    expect(c.review.fitness).toBeNull();
    expect(c.readyForTheatre).toBe(true); // decision pending is not a refusal
  });
});

describe('livePrescription — a case can hold several versions', () => {
  it('picks the version nothing has superseded, not the newest number', () => {
    const rows = [rx({ id: 'v2', version: 2, supersededById: 'v3' }), rx({ id: 'v1', version: 1, supersededById: 'v2' })];
    // Both are superseded; nothing is live, so it falls back rather than
    // reporting a case with three prescriptions as having none.
    expect(livePrescription(rows)?.id).toBe('v2');
  });

  it('prefers the live row over a higher superseded version', () => {
    const rows = [
      rx({ id: 'old', version: 3, supersededById: 'x' }),
      rx({ id: 'live', version: 2, supersededById: null }),
    ];
    expect(livePrescription(rows)?.id).toBe('live');
  });

  it('ignores a row marked SUPERSEDED even with no link', () => {
    const rows = [rx({ id: 'gone', version: 9, status: 'SUPERSEDED' }), rx({ id: 'live', version: 1 })];
    expect(livePrescription(rows)?.id).toBe('live');
  });

  it('returns nothing for a case with no prescription', () => {
    expect(livePrescription([])).toBeNull();
  });

  it('flags a case that has been amended', () => {
    const c = summariseAnaesthesiaCase({
      surgery, review: review(),
      prescriptions: [rx({ id: 'v2', version: 2 }), rx({ id: 'v1', version: 1, supersededById: 'v2' })],
    });
    expect(c.prescription.amended).toBe(true);
    expect(c.prescription.version).toBe(2);
  });
});

describe('prescription state — what is waiting on the consultant', () => {
  it('surfaces one awaiting approval in the words a consultant would use', () => {
    const c = summariseAnaesthesiaCase({ surgery, review: review(), prescriptions: [rx({ status: 'PENDING_APPROVAL' })] });
    expect(c.prescription.state).toBe('AWAITING_APPROVAL');
    expect(c.outstanding).toContain('Prescription awaiting your approval');
    expect(c.readyForTheatre).toBe(false);
  });

  it('counts everything past approval as settled', () => {
    // Dispensed, packed, collected, in use — the consultant's decision is made
    // and pharmacy has taken it on.
    for (const status of ['DISPENSED', 'PACKED', 'COLLECTED', 'IN_USE', 'RECONCILED']) {
      const c = summariseAnaesthesiaCase({ surgery, review: review(), prescriptions: [rx({ status })] });
      expect(c.prescription.state).toBe('IN_PHARMACY');
      expect(c.readyForTheatre).toBe(true);
    }
  });

  it('treats a draft as not yet something the consultant can act on', () => {
    const c = summariseAnaesthesiaCase({ surgery, review: review(), prescriptions: [rx({ status: 'DRAFT' })] });
    expect(c.outstanding).toContain('Prescription still a draft');
    expect(c.readyForTheatre).toBe(false);
  });

  it('does not treat a rejected prescription as one in force', () => {
    const c = summariseAnaesthesiaCase({ surgery, review: review(), prescriptions: [rx({ status: 'REJECTED' })] });
    expect(c.outstanding).toContain('Prescription rejected — needs rewriting');
    expect(c.readyForTheatre).toBe(false);
  });
});

describe('the whole case', () => {
  it('reports ready only when assigned, reviewed, fit and approved', () => {
    const c = summariseAnaesthesiaCase({ surgery, review: review(), prescriptions: [rx()] });
    expect(c.readyForTheatre).toBe(true);
    expect(c.outstanding).toEqual([]);
  });

  it('counts an unassigned anaesthetist as outstanding', () => {
    const c = summariseAnaesthesiaCase({
      surgery: { ...surgery, anaesthetist: null }, review: review(), prescriptions: [rx()],
    });
    expect(c.readyForTheatre).toBe(false);
    expect(c.outstanding[0]).toBe('No anaesthetist assigned');
  });

  it('lists what is outstanding in the order it would be chased', () => {
    const c = summariseAnaesthesiaCase({
      surgery: { ...surgery, anaesthetist: null }, review: null, prescriptions: [],
    });
    expect(c.outstanding).toEqual([
      'No anaesthetist assigned',
      'Not yet reviewed',
      'No anaesthetic prescription',
    ]);
  });
});
