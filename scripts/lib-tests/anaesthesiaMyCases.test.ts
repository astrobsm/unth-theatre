import { describe, it, expect } from 'vitest';
import { summariseAnaesthesiaCase } from '../../src/lib/anaesthesia/board';
import {
  addDays, approvablePrescriptionIds, headline, needsOf, sortForConsultant,
  summarise, waitingOnMe, watToday, NEED_LABEL, type MyCase,
} from '../../src/lib/anaesthesia/myCases';

// What a consultant anaesthetist is being told on his own dashboard: which of
// the cases booked in his name are waiting on him, and which of those he can
// clear from the dashboard itself. The ways of getting it wrong are telling
// him a case needs nothing when it does, offering him a one-press approval of
// a patient somebody has assessed unfit, and burying tomorrow's list under
// next week's.

const surgery = (over: Record<string, unknown> = {}) => ({
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
  ...over,
});

const review = (over: Record<string, unknown> = {}) => ({
  status: 'COMPLETED', reviewDate: new Date('2026-11-01T10:00:00Z'),
  anesthetistName: 'Dr Ada Nwosu', consultantName: 'Dr Briggs',
  fitnessDecision: 'FIT', approvedAt: null, asaClass: 'II',
  ...over,
}) as never;

const rx = (over: Record<string, unknown> = {}) => ({
  id: 'p1', status: 'APPROVED', version: 1,
  prescribedByName: 'Dr Ada Nwosu', approvedByName: 'Dr Briggs',
  supersededById: null, _count: { prescriptionItems: 6 },
  ...over,
}) as never;

const build = (args: {
  surgeryOver?: Record<string, unknown>;
  review?: unknown;
  prescriptions?: unknown[];
  date?: string;
}): MyCase => {
  const summary = summariseAnaesthesiaCase({
    surgery: surgery(args.surgeryOver) as never,
    review: (args.review ?? null) as never,
    prescriptions: (args.prescriptions ?? []) as never,
  });
  return {
    ...summary,
    scheduledDate: args.date ?? '2026-11-02',
    needs: needsOf(summary),
  };
};

describe('what a case still needs from the anaesthetist named on it', () => {
  it('asks for approval when the live prescription is awaiting it', () => {
    const c = build({ review: review(), prescriptions: [rx({ status: 'PENDING_APPROVAL' })] });
    expect(c.needs).toContain('APPROVE_PRESCRIPTION');
    expect(waitingOnMe(c)).toBe(true);
  });

  it('asks for nothing once everything is done', () => {
    const c = build({ review: review(), prescriptions: [rx()] });
    expect(c.needs).toEqual([]);
    expect(waitingOnMe(c)).toBe(false);
    expect(c.readyForTheatre).toBe(true);
  });

  it('includes a case nobody has reviewed', () => {
    const c = build({ review: null, prescriptions: [] });
    expect(c.needs).toContain('NOT_REVIEWED');
  });

  it('separates a review that was started from one that was never opened', () => {
    const started = build({ review: review({ status: 'IN_PROGRESS' }), prescriptions: [] });
    expect(started.needs).toContain('REVIEW_UNFINISHED');
    expect(started.needs).not.toContain('NOT_REVIEWED');
  });

  it('reports BOTH an unreviewed case and its waiting prescription', () => {
    // A registrar can write the drugs up before finishing the review form, and
    // often does. Filing the case under one heading would hide the other.
    const c = build({ review: null, prescriptions: [rx({ status: 'PENDING_APPROVAL' })] });
    expect(c.needs).toContain('NOT_REVIEWED');
    expect(c.needs).toContain('APPROVE_PRESCRIPTION');
  });

  it('puts NOT FIT first, ahead of the approval', () => {
    const c = build({
      review: review({ fitnessDecision: 'NOT_FIT' }),
      prescriptions: [rx({ status: 'PENDING_APPROVAL' })],
    });
    expect(c.needs[0]).toBe('NOT_FIT');
  });

  it('distinguishes a draft from a prescription that is actually waiting', () => {
    const draft = build({ review: review(), prescriptions: [rx({ status: 'DRAFT' })] });
    expect(draft.needs).toContain('PRESCRIPTION_DRAFT');
    expect(draft.needs).not.toContain('APPROVE_PRESCRIPTION');
  });

  it('asks nothing of him once pharmacy has it', () => {
    const packed = build({ review: review(), prescriptions: [rx({ status: 'PACKED' })] });
    expect(packed.needs).toEqual([]);
  });

  it('reads the live version, not the superseded one', () => {
    const c = build({
      review: review(),
      prescriptions: [
        rx({ id: 'v2', version: 2, status: 'PENDING_APPROVAL' }),
        rx({ id: 'v1', version: 1, status: 'APPROVED', supersededById: 'v2' }),
      ],
    });
    expect(c.needs).toContain('APPROVE_PRESCRIPTION');
    expect(c.prescription.id).toBe('v2');
  });

  it('has a human label for every need it can produce', () => {
    const all = build({
      review: review({ status: 'IN_PROGRESS', fitnessDecision: 'NOT_FIT' }),
      prescriptions: [rx({ status: 'REJECTED' })],
    });
    all.needs.forEach((n) => {
      expect(NEED_LABEL[n]).toBeTruthy();
      expect(NEED_LABEL[n]).not.toMatch(/_/); // never a raw enum on a dashboard
    });
  });
});

describe('what "approve all" would actually sign', () => {
  it('offers only the prescriptions that are awaiting approval', () => {
    const cases = [
      build({ review: review(), prescriptions: [rx({ id: 'a', status: 'PENDING_APPROVAL' })] }),
      build({ review: review(), prescriptions: [rx({ id: 'b', status: 'APPROVED' })] }),
      build({ review: review(), prescriptions: [rx({ id: 'c', status: 'DRAFT' })] }),
      build({ review: null, prescriptions: [] }),
    ];
    expect(approvablePrescriptionIds(cases)).toEqual(['a']);
  });

  it('never offers a prescription with no id', () => {
    // A count that included one would be a lie: there is nothing to approve.
    const cases = [build({ review: review(), prescriptions: [] })];
    expect(approvablePrescriptionIds(cases)).toEqual([]);
  });
});

describe('the order he reads them in', () => {
  it('puts the soonest list first', () => {
    const sorted = sortForConsultant([
      build({ date: '2026-11-06', surgeryOver: { id: 'friday' }, review: null }),
      build({ date: '2026-11-02', surgeryOver: { id: 'monday' }, review: null }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['monday', 'friday']);
  });

  it('within a day, puts the cases that need something above the ones that do not', () => {
    const sorted = sortForConsultant([
      build({ date: '2026-11-02', surgeryOver: { id: 'done', scheduledTime: '08:00' }, review: review(), prescriptions: [rx()] }),
      build({ date: '2026-11-02', surgeryOver: { id: 'owed', scheduledTime: '14:00' }, review: null }),
    ]);
    expect(sorted[0].id).toBe('owed');
  });
});

describe('the one line at the top of the card', () => {
  it('leads with the approvals, because they are what he can finish here', () => {
    const cases = [
      build({ review: review(), prescriptions: [rx({ status: 'PENDING_APPROVAL' })] }),
      build({ surgeryOver: { id: 's2' }, review: null }),
    ];
    const line = headline(summarise(cases));
    expect(line).toMatch(/1 prescription awaiting your approval/);
    expect(line.indexOf('awaiting your approval')).toBeLessThan(line.indexOf('not yet reviewed'));
  });

  it('says so plainly when nothing is outstanding', () => {
    const cases = [build({ review: review(), prescriptions: [rx()] })];
    expect(headline(summarise(cases))).toMatch(/All 1 of your cases are ready/);
  });

  it('says so when he has no cases at all', () => {
    expect(headline(summarise([]))).toMatch(/No cases assigned/);
  });

  it('counts an unreviewed case once, however it is unreviewed', () => {
    const cases = [
      build({ review: null }),
      build({ surgeryOver: { id: 's2' }, review: review({ status: 'IN_PROGRESS' }) }),
    ];
    expect(headline(summarise(cases))).toMatch(/2 not yet reviewed/);
  });
});

describe('the window', () => {
  it('reads the calendar day in WAT, not UTC', () => {
    // 00:30 WAT on 2 November is still 23:30 UTC on 1 November. A board that
    // used the UTC day would show yesterday's list for that half-hour.
    expect(watToday(new Date('2026-11-01T23:30:00Z'))).toBe('2026-11-02');
    expect(watToday(new Date('2026-11-01T22:30:00Z'))).toBe('2026-11-01');
  });

  it('steps days without tripping over a month end', () => {
    expect(addDays('2026-11-28', 7)).toBe('2026-12-05');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});
