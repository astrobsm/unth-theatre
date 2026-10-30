import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  bookingGate,
  isFormUsable,
  isOpenCase,
  blockingCases,
  readableStatus,
  CLOSED_STATUSES,
} from '../../src/lib/bookingGate';

/**
 * Two gates in front of an elective booking.
 *
 * A patient must be chosen before anything else can be filled in — the form
 * used to let somebody complete a procedure, a theatre and a team and only
 * then find they had never picked a patient.
 *
 * And a patient whose last operation was never marked completed cannot simply
 * be booked again: that puts one person on the theatre list twice, and
 * afterwards nobody can tell which entry is real or which one PACU is admitting
 * against.
 */
const openCase = {
  id: 's1',
  procedureName: 'Exploratory laparotomy',
  status: 'SCHEDULED',
  scheduledDate: '2026-08-28',
  surgeonName: 'Dr Nnaji',
};

describe('nothing may be filled in before a patient is chosen', () => {
  it('shuts the form when there is no patient', () => {
    const g = bookingGate({ patientId: '', priorCases: [] });
    expect(g.state).toBe('NEEDS_PATIENT');
    expect(isFormUsable(g)).toBe(false);
    expect(g.message).toMatch(/select the patient first/i);
  });

  it('treats null and undefined the same as empty', () => {
    expect(bookingGate({ patientId: null, priorCases: [] }).state).toBe('NEEDS_PATIENT');
    expect(bookingGate({ patientId: undefined, priorCases: [] }).state).toBe('NEEDS_PATIENT');
  });
});

describe('while the check is still running', () => {
  it('keeps the form shut rather than opening and shutting again', () => {
    // Opening it while the answer is unknown means somebody types into a field
    // that then goes dead under them.
    const g = bookingGate({ patientId: 'p1', priorCases: null });
    expect(g.state).toBe('CHECKING');
    expect(isFormUsable(g)).toBe(false);
  });
});

describe('a patient with an unfinished operation', () => {
  it('cannot simply be booked again', () => {
    const g = bookingGate({ patientId: 'p1', priorCases: [openCase], patientName: 'Aneke Chikamso' });
    expect(g.state).toBe('NEEDS_CLOSING');
    expect(isFormUsable(g)).toBe(false);
    if (g.state === 'NEEDS_CLOSING') {
      expect(g.cases).toHaveLength(1);
      expect(g.message).toContain('Aneke Chikamso');
      expect(g.message).toMatch(/appear on the list twice/i);
    }
  });

  it('counts several correctly, in words', () => {
    const g = bookingGate({
      patientId: 'p1',
      priorCases: [openCase, { ...openCase, id: 's2' }],
    });
    if (g.state !== 'NEEDS_CLOSING') throw new Error('expected NEEDS_CLOSING');
    expect(g.message).toContain('2 earlier operations');
    expect(g.message).toContain('were never marked completed');
  });

  it('says "it" for one and "them" for several', () => {
    const one = bookingGate({ patientId: 'p1', priorCases: [openCase] });
    const two = bookingGate({ patientId: 'p1', priorCases: [openCase, { ...openCase, id: 's2' }] });
    if (one.state !== 'NEEDS_CLOSING' || two.state !== 'NEEDS_CLOSING') throw new Error('expected NEEDS_CLOSING');
    expect(one.message).toContain('Close it before booking');
    expect(two.message).toContain('Close them before booking');
  });
});

describe('what counts as finished', () => {
  it('lets a completed or cancelled case through', () => {
    for (const status of CLOSED_STATUSES) {
      const g = bookingGate({ patientId: 'p1', priorCases: [{ ...openCase, status }] });
      expect(g.state, status).toBe('OPEN');
      expect(isFormUsable(g)).toBe(true);
    }
  });

  it('blocks on every state that is not finished', () => {
    // A case in the holding area or on the table is emphatically not finished.
    for (const status of ['SCHEDULED', 'IN_HOLDING_AREA', 'READY_FOR_THEATRE', 'IN_PROGRESS']) {
      expect(isOpenCase({ status }), status).toBe(true);
      expect(bookingGate({ patientId: 'p1', priorCases: [{ ...openCase, status }] }).state).toBe('NEEDS_CLOSING');
    }
  });

  it('ignores capitalisation in the stored status', () => {
    expect(isOpenCase({ status: 'completed' })).toBe(false);
    expect(isOpenCase({ status: 'Cancelled' })).toBe(false);
  });

  it('opens the form for a patient with no history at all', () => {
    expect(bookingGate({ patientId: 'p1', priorCases: [] }).state).toBe('OPEN');
  });

  it('lists only the cases that actually block', () => {
    const mixed = [openCase, { ...openCase, id: 's2', status: 'COMPLETED' }];
    expect(blockingCases(mixed).map((c) => c.id)).toEqual(['s1']);
  });
});

describe('how a status reads to a person', () => {
  it('is not shouted in database case', () => {
    expect(readableStatus('IN_PROGRESS')).toBe('In progress');
    expect(readableStatus('SCHEDULED')).toBe('Scheduled');
    expect(readableStatus('READY_FOR_THEATRE')).toBe('Ready for theatre');
  });
});

describe('the form is gated by the browser, not by hope', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src/app/dashboard/surgeries/new/page.tsx'),
    'utf8',
  );

  it('disables every control below the patient with a fieldset', () => {
    // A fieldset disables everything inside it, including inputs added later.
    // Hand-written disabled={...} on each field is the version that rots.
    expect(src).toContain('<fieldset disabled={!formUsable}');
  });

  it('shows the floating notice', () => {
    expect(src).toContain('<BookingGateNotice');
  });

  it('checks the patient for unfinished operations when one is chosen', () => {
    expect(src).toContain('/api/patients/${patientId}/open-surgeries');
  });
});

// ── A lookup that fails, rather than one that is slow ──────────────────
//
// On 29 October a surgeon selected a patient, the check returned 500 three
// times, and the form stayed dead behind a spinner reading "Checking this
// patient for an unfinished operation…". There was no retry, no reason shown
// and no way forward: a failed lookup was indistinguishable from a slow one,
// so the gate waited for an answer that was never coming.

describe('when the check cannot be run at all', () => {
  const PATIENT = { patientId: 'p1', priorCases: null, patientName: 'Mr A' };

  it('still says CHECKING while an answer may yet arrive', () => {
    expect(bookingGate(PATIENT).state).toBe('CHECKING');
  });

  it('says so once the lookup has given up', () => {
    const g = bookingGate({ ...PATIENT, lookupFailed: true });
    expect(g.state).toBe('CHECK_FAILED');
    // The reason has to be in the message. A spinner that never stops tells
    // somebody nothing they can act on.
    expect(g.state === 'CHECK_FAILED' && g.message).toMatch(/did not answer|could not check/i);
  });

  it('keeps the form shut until somebody decides otherwise', () => {
    expect(isFormUsable(bookingGate({ ...PATIENT, lookupFailed: true }))).toBe(false);
  });

  it('lets the booker carry on deliberately', () => {
    // A theatre cannot stop booking because one endpoint is unwell. The harm
    // of a possible duplicate is smaller than the harm of a certain
    // unbooked case, and this way somebody chose it.
    const g = bookingGate({ ...PATIENT, lookupFailed: true, proceedAnyway: true });
    expect(g.state).toBe('OPEN');
    expect(isFormUsable(g)).toBe(true);
  });

  it('will not let the override skip a real unfinished case', () => {
    // THE IMPORTANT ONE. The escape is from a broken endpoint, never from a
    // finding. An answer that arrived and said "this patient has an open
    // case" must block regardless of what was pressed earlier.
    const g = bookingGate({
      patientId: 'p1',
      patientName: 'Mr A',
      priorCases: [
        { id: 's1', procedureName: 'Laparotomy', status: 'SCHEDULED', scheduledDate: '2026-10-01' },
      ],
      lookupFailed: true,
      proceedAnyway: true,
    });
    expect(g.state).toBe('NEEDS_CLOSING');
    expect(isFormUsable(g)).toBe(false);
  });

  it('will not let the override stand in for choosing a patient', () => {
    const g = bookingGate({ patientId: '', priorCases: null, lookupFailed: true, proceedAnyway: true });
    expect(g.state).toBe('NEEDS_PATIENT');
  });

  it('ignores the override when nothing failed', () => {
    // Set without a failure it must do nothing at all, so it cannot become a
    // quiet way of turning the gate off.
    const g = bookingGate({ ...PATIENT, proceedAnyway: true });
    expect(g.state).toBe('CHECKING');
  });
});
