// The message a theatre nurse sends to the holding area when the patient they
// called for has not arrived.
//
// The thing to get right is what it ASKS. A chase that only says "send the
// patient" gets a patient sent who is not ready — no consent, no blood, no
// porter — and the case stops again at the door instead of in the holding
// area, having wasted the trip. The holding-area nurse can see the patient
// and usually knows precisely what is missing, so the message has to invite
// that answer.
import { describe, it, expect } from 'vitest';
import {
  buildHoldingAreaChase, chaseNotificationLine, patientLabel, waitedFor,
  nobodyOnDutyMessage, type HoldingAreaChaseFacts,
} from '../../src/lib/holdingArea/chase';

const facts = (over: Partial<HoldingAreaChaseFacts> = {}): HoldingAreaChaseFacts => ({
  complex: 'Eye Theatre',
  theatreName: 'Eye Theatre',
  patientName: 'PATIENT A',
  folderNumber: 'UNTH/00001',
  ward: 'Ward 3',
  procedureName: 'Cataract extraction',
  minutesSinceCallUp: 22,
  calledByName: 'Nurse B',
  calledByRole: 'Perioperative Nurse',
  note: null,
  ...over,
});

describe('how long they have waited', () => {
  it('reads in the units a person uses', () => {
    expect(waitedFor(0)).toBe('just now');
    expect(waitedFor(1)).toBe('1 minute ago');
    expect(waitedFor(22)).toBe('22 minutes ago');
    expect(waitedFor(60)).toBe('1 hour ago');
    expect(waitedFor(95)).toBe('1 hour 35 min ago');
    expect(waitedFor(180)).toBe('3 hours ago');
  });

  it('says nothing rather than something wrong', () => {
    // A negative gap means the clocks disagree, and "called for -4 minutes
    // ago" in a chase destroys the authority of the whole message.
    expect(waitedFor(null)).toBe(null);
    expect(waitedFor(-4)).toBe(null);
    expect(waitedFor(Number.NaN)).toBe(null);
  });
});

describe('the patient', () => {
  it('is named with the folder number, as the other chases name them', () => {
    expect(patientLabel({ patientName: 'PATIENT A', folderNumber: 'UNTH/1' }))
      .toBe('PATIENT A (UNTH/1)');
  });

  it('is still identifiable when the folder number is missing', () => {
    expect(patientLabel({ patientName: 'PATIENT A', folderNumber: null })).toBe('PATIENT A');
  });

  it('never prints an empty bracket or a bare "null"', () => {
    const s = patientLabel({ patientName: null, folderNumber: null });
    expect(s).toBe('the patient');
    expect(s).not.toContain('null');
    expect(s).not.toContain('()');
  });
});

describe('the chase message', () => {
  it('leads with the theatre waiting and names the patient', () => {
    const m = buildHoldingAreaChase(facts());
    expect(m).toContain('Eye Theatre is waiting for a patient');
    expect(m).toContain('PATIENT A (UNTH/00001)');
    expect(m).toContain('Ward 3');
    expect(m).toContain('Cataract extraction');
    expect(m).toContain('22 minutes ago');
  });

  it('asks what is holding the patient, not only for the patient', () => {
    // THE TEST THAT MATTERS MOST. Ask only for the patient and you get one
    // sent unready; the case then stops at the theatre door instead.
    const m = buildHoldingAreaChase(facts());
    expect(m).toContain('what is holding them');
    expect(m).toMatch(/consent, blood, a porter/);
    expect(m).toContain('rather than the patient being sent unready');
  });

  it('says who is asking, and from where', () => {
    const m = buildHoldingAreaChase(facts());
    expect(m).toContain('Nurse B (Perioperative Nurse)');
    // Without a role it must still read as a person, not "Nurse B (null)".
    const noRole = buildHoldingAreaChase(facts({ calledByRole: null }));
    expect(noRole).toContain('Nurse B is asking');
    expect(noRole).not.toContain('(null)');
  });

  it('names the complex it came from, so a reply goes to the right room', () => {
    expect(buildHoldingAreaChase(facts())).toContain('Eye Theatre holding area');
    expect(buildHoldingAreaChase(facts({ complex: 'A&E', theatreName: 'A&E North Wing Suite' })))
      .toContain('A&E holding area');
  });

  it('carries the caller\'s own note when there is one', () => {
    const m = buildHoldingAreaChase(facts({ note: 'Surgeon is scrubbed and waiting.' }));
    expect(m).toContain('Surgeon is scrubbed and waiting.');
    expect(m).toContain('Note from Nurse B');
  });

  it('holds together when almost nothing is known', () => {
    const m = buildHoldingAreaChase(facts({
      theatreName: null, patientName: null, folderNumber: null, ward: null,
      procedureName: null, minutesSinceCallUp: null,
    }));
    expect(m).not.toContain('null');
    expect(m).not.toContain('undefined');
    expect(m).toContain('the patient');
    // No call-up time must not read as "called for 0 minutes ago".
    expect(m).toContain('the call-up note has been raised');
  });

  it('invents no sanction', () => {
    const m = buildHoldingAreaChase(facts());
    expect(m).not.toMatch(/disciplin|sanction|report(ed)? to|query|warning/i);
  });

  it('is short enough to read standing up', () => {
    // It is read on a phone, in a room with a patient in it.
    expect(buildHoldingAreaChase(facts()).length).toBeLessThan(700);
  });
});

describe('the in-app line', () => {
  it('says the theatre, the patient and how long, in one sentence', () => {
    const l = chaseNotificationLine(facts());
    expect(l).toContain('Eye Theatre');
    expect(l).toContain('PATIENT A');
    expect(l).toContain('22 minutes ago');
    expect(l).toContain('Nurse B');
  });

  it('drops the waiting time rather than printing a wrong one', () => {
    const l = chaseNotificationLine(facts({ minutesSinceCallUp: null }));
    expect(l).not.toContain('called for');
    expect(l).not.toContain('null');
  });
});

describe('when that holding area has nobody on it', () => {
  it('names the complex and the shift, because that is what gets acted on', () => {
    const m = nobodyOnDutyMessage('Eye Theatre', 'Morning');
    expect(m).toContain('Eye Theatre holding area');
    expect(m).toContain('Morning shift');
    // And says plainly that nothing was sent.
    expect(m).toContain('would reach no one');
    expect(m).toContain('Theatre staffing');
  });
});
