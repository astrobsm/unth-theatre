/**
 * Telling the patient there is a pack waiting to be paid for.
 *
 * The readiness board showed "Consumable: Prescribed, not packed (0/30)" and
 * gave the pack provider a row of WhatsApp buttons — every one of them to a
 * member of staff. The one person who could actually move the 0/30, the patient
 * who had not yet paid, was the only one on the card nobody could reach. So the
 * pack sat untouched until the morning and the case was turned away at the door.
 *
 * The safety half of this message matters more than the payment half. Patients
 * here are routinely told by relatives to buy drugs and consumables cheaply
 * outside and bring them in. The theatre cannot use those, and a refusal given
 * without a reason reads as the hospital protecting its own sales — so it gets
 * ignored, and the items arrive anyway on the morning of surgery.
 */
import { describe, expect, it } from 'vitest';
import {
  canNotifyPatientAboutPacks,
  outstandingPayPoints,
  payNoticeProblem,
  buildPatientPayMessage,
  buildShortPayMessage,
  PATIENT_CONTACT_ROLES,
  PAY_POINT_LABEL,
} from '../../src/lib/packs/patientPayNotice';

const base = {
  patientName: 'A. Patient',
  outstanding: { consumable: 30, pharmacy: 6 },
  owner: 'PATIENT' as const,
  procedureName: 'Abdominal myomectomy',
  scheduledAt: new Date(2026, 10, 24, 9, 0),
};

describe('who may look up the number', () => {
  it('covers the two offices the money is actually paid at', () => {
    expect(canNotifyPatientAboutPacks('CONSUMABLE_PACK_PROVIDER')).toBe(true);
    expect(canNotifyPatientAboutPacks('PHARMACIST')).toBe(true);
    expect(canNotifyPatientAboutPacks('THEATRE_STORE_KEEPER')).toBe(true);
  });

  it('does NOT cover everybody who can see the readiness board', () => {
    // Knowing a case is not ready is operational and the board is open wide.
    // A patient's personal phone number is not the same thing.
    expect(canNotifyPatientAboutPacks('SCRUB_NURSE')).toBe(false);
    expect(canNotifyPatientAboutPacks('HOUSE_OFFICER')).toBe(false);
    expect(canNotifyPatientAboutPacks('PORTER')).toBe(false);
    expect(canNotifyPatientAboutPacks(null)).toBe(false);
    expect(canNotifyPatientAboutPacks('')).toBe(false);
  });

  it('includes theatre management, and nothing by accident', () => {
    expect(PATIENT_CONTACT_ROLES).toContain('THEATRE_MANAGER');
    expect(PATIENT_CONTACT_ROLES).toHaveLength(6);
  });
});

describe('which office to send them to', () => {
  it('names the consumable office for consumables only', () => {
    expect(outstandingPayPoints({ consumable: 30, pharmacy: 0 }))
      .toEqual(['CONSUMABLE_OFFICE']);
  });

  it('names the pharmacy for medicines only', () => {
    expect(outstandingPayPoints({ consumable: 0, pharmacy: 6 }))
      .toEqual(['THEATRE_PHARMACY']);
  });

  it('names both when both are outstanding', () => {
    expect(outstandingPayPoints({ consumable: 30, pharmacy: 6 })).toHaveLength(2);
  });

  it('names neither when nothing is outstanding', () => {
    expect(outstandingPayPoints({ consumable: 0, pharmacy: 0 })).toEqual([]);
  });
});

describe('refusing to send', () => {
  it('refuses when both packs are accounted for', () => {
    // Messaging somebody about a bill they have already settled is how a
    // hospital teaches patients to ignore its messages.
    const p = payNoticeProblem({
      outstanding: { consumable: 0, pharmacy: 0 }, hasContact: true,
    });
    expect(p).toContain('Nothing is outstanding');
  });

  it('refuses when there is no number, and says what would fix it', () => {
    const p = payNoticeProblem({
      outstanding: { consumable: 30, pharmacy: 0 }, hasContact: false,
    });
    expect(p).toContain('no phone number and no next-of-kin number');
    expect(p).toContain('Add a number on the patient record');
  });

  it('allows it when there is something to pay and somebody to tell', () => {
    expect(payNoticeProblem({
      outstanding: { consumable: 30, pharmacy: 6 }, hasContact: true,
    })).toBeNull();
  });
});

describe('the message to the patient', () => {
  const m = buildPatientPayMessage(base);

  it('says what is owed and exactly where each part is paid', () => {
    expect(m).toContain('30 items');
    expect(m).toContain(PAY_POINT_LABEL.CONSUMABLE_OFFICE);
    expect(m).toContain('6 items');
    expect(m).toContain(PAY_POINT_LABEL.THEATRE_PHARMACY);
  });

  it('gives the operation and the date so it is clearly about them', () => {
    expect(m).toContain('Abdominal myomectomy');
    expect(m).toContain('Tuesday 24 November');
  });

  it('states the rule about materials bought outside', () => {
    expect(m).toContain('cannot be used in the theatre unless it was supplied by the '
      + 'theatre pharmacy');
  });

  it('says plainly that it is not about money', () => {
    // THE SENTENCE THAT DECIDES WHETHER THE REST IS BELIEVED. Without it the
    // refusal reads as the hospital protecting its own sales.
    expect(m).toContain('This is not about money');
  });

  it('gives the actual reasons, not just the rule', () => {
    expect(m).toContain('counterfeit');
    expect(m).toContain('relabelled');
    expect(m).toContain('stored at the right temperature');
    expect(m).toContain('no longer sterile');
    expect(m).toContain('which batch it came from');
  });

  it('explains what goes wrong in an operation, in concrete terms', () => {
    // "Unverified products are dangerous" persuades nobody. An anaesthetic
    // wearing off at the wrong moment does.
    expect(m).toContain('wear off at the wrong moment');
    expect(m).toContain('does not prevent the infection');
    expect(m).toContain('introduces infection directly into a clean wound');
  });

  it('tells them what to do with something already bought', () => {
    // Without this the message reads as "you have wasted your money", and the
    // item quietly turns up in a bag on the morning of surgery instead.
    expect(m).toContain('do not throw it away');
    expect(m).toContain('Bring it to the theatre pharmacy before the day of surgery');
  });

  it('offers help rather than only a threat of cancellation', () => {
    expect(m).toContain('If paying is difficult');
    expect(m).toContain('rather help you sort it out');
  });

  it('is signed by an office, so it is not an anonymous demand for money', () => {
    expect(m).toContain('UNTH Ituku-Ozalla Theatre Complex');
  });
});

describe('when the phone belongs to the next of kin', () => {
  const m = buildPatientPayMessage({ ...base, owner: 'CAREGIVER' });

  it('writes about the patient instead of addressing them as the patient', () => {
    // patientContact() falls back to the next of kin, which is common here.
    // "You are on the theatre list for surgery" sent to somebody's son is wrong
    // in a way that makes the hospital look careless.
    expect(m).toContain('A. Patient is on the theatre list');
    expect(m).not.toContain('You are on the theatre list');
  });

  it('says why they in particular are receiving it', () => {
    expect(m).toContain('This message is for you as the person we can reach');
  });

  it('puts the risk on the patient, not on the reader', () => {
    expect(m).toContain('the risk of the alternative falls on A. Patient');
  });
});

describe('one pack only', () => {
  it('mentions just the pharmacy when only medicines are outstanding', () => {
    const m = buildPatientPayMessage({
      ...base, outstanding: { consumable: 0, pharmacy: 6 },
    });
    expect(m).toContain(PAY_POINT_LABEL.THEATRE_PHARMACY);
    expect(m).not.toContain('Theatre consumables —');
    expect(m).toContain('Please settle this before');
  });

  it('asks for both to be settled when both are outstanding', () => {
    expect(buildPatientPayMessage(base)).toContain('Please settle both before');
  });

  it('says one item, not "1 items"', () => {
    const m = buildPatientPayMessage({
      ...base, outstanding: { consumable: 1, pharmacy: 0 },
    });
    expect(m).toContain('1 item.');
    expect(m).not.toContain('1 items');
  });
});

describe('the short version', () => {
  const s = buildShortPayMessage(base);

  it('keeps the one sentence that changes behaviour', () => {
    expect(s).toContain('cannot be used in theatre');
    expect(s).toContain('bring anything already bought to the pharmacy');
  });

  it('names both amounts and the date', () => {
    expect(s).toContain('30 consumable items');
    expect(s).toContain('6 medicines');
    expect(s).toContain('Tuesday 24 November');
  });

  it('is short enough to be read on a feature phone', () => {
    expect(s.length).toBeLessThan(500);
  });

  it('switches to the third person for a next of kin', () => {
    expect(buildShortPayMessage({ ...base, owner: 'CAREGIVER' }))
      .toContain('A. Patient has');
  });

  it('copes with no scheduled date', () => {
    const s2 = buildShortPayMessage({ ...base, scheduledAt: null });
    expect(s2).toContain('before the day of surgery');
  });
});

describe('dates', () => {
  it('composes from local parts, never the machine locale', () => {
    // Both nodes are WAT but print differently, and a surgery date that reads
    // one way on the board and another in the patient's WhatsApp is the thing
    // an argument at the theatre door turns on.
    expect(buildPatientPayMessage({ ...base, scheduledAt: new Date(2026, 0, 5, 8, 0) }))
      .toContain('Monday 5 January');
  });

  it('leaves the date out rather than printing nonsense', () => {
    const m = buildPatientPayMessage({ ...base, scheduledAt: new Date('rubbish') });
    expect(m).not.toContain('NaN');
    expect(m).not.toContain('Invalid');
  });
});
