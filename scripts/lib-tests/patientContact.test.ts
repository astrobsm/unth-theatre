// Can the hospital actually reach this patient?
//
// The failure being guarded is silent and complete. wa.me with a number it
// cannot resolve opens a chat with nobody and reports no error: WhatsApp comes
// up, the nurse sees it, and everyone involved believes a patient was told
// their operation moved. Nobody finds out until the patient does not arrive.
//
// So "reachable" has to mean the same thing in the booking form that blocks the
// case, in the API that refuses it, and in the button that sends the message —
// which is why it is decided once, here.
import { describe, it, expect } from 'vitest';
import {
  patientContact, isReachable, phoneProblem, NO_CONTACT_MESSAGE,
  bookingContactDecision,
} from '../../src/lib/patients/contact';

describe('finding a number to reach a patient on', () => {
  it('prefers the patient\'s own phone', () => {
    const c = patientContact({
      name: 'Adaeze Okafor',
      phoneNumber: '08031234567',
      caregiverName: 'Chidi Okafor',
      caregiverPhone: '08037654321',
    });
    expect(c?.owner).toBe('PATIENT');
    expect(c?.whatsAppNumber).toBe('2348031234567');
    expect(c?.ownerLabel).toContain('Adaeze Okafor');
  });

  it('falls back to the next of kin, and says that is what it did', () => {
    // Plenty of patients here have no phone — a child, somebody elderly,
    // somebody admitted unconscious. The relative's number is the real answer,
    // not a lesser one. But WHOSE phone it is has to travel with the answer, or
    // a nurse sends "Dear Adaeze" to a number without knowing a son will read
    // it.
    const c = patientContact({
      name: 'Adaeze Okafor',
      phoneNumber: null,
      caregiverName: 'Chidi Okafor',
      caregiverPhone: '0803 765 4321',
    });
    expect(c?.owner).toBe('CAREGIVER');
    expect(c?.whatsAppNumber).toBe('2348037654321');
    expect(c?.ownerLabel).toBe('Chidi Okafor (next of kin)');
  });

  it('is null when neither number is usable', () => {
    expect(patientContact({ name: 'A', phoneNumber: null, caregiverPhone: null })).toBeNull();
    expect(isReachable({ phoneNumber: '', caregiverPhone: '   ' })).toBe(false);
  });

  it('treats a number that is not a number as no number at all', () => {
    // THE ONE THAT MATTERS. A folder number typed into the phone box must not
    // count as reachable, or the booking passes, the button appears, and the
    // message goes nowhere while reporting success.
    expect(isReachable({ phoneNumber: '565979' })).toBe(false);
    expect(isReachable({ phoneNumber: 'no phone' })).toBe(false);
    expect(isReachable({ phoneNumber: '0803' })).toBe(false);
  });

  it('accepts the shapes staff actually type', () => {
    for (const typed of [
      '08031234567', '0803 123 4567', '+2348031234567',
      '234 803 123 4567', '8031234567', '+234-803-123-4567',
    ]) {
      expect(isReachable({ phoneNumber: typed }), typed).toBe(true);
    }
  });

  it('skips an unusable patient number rather than failing outright', () => {
    // A wrong number in the patient's box should not hide a good one in the
    // relative's. The message still gets somewhere.
    const c = patientContact({ phoneNumber: 'none given', caregiverPhone: '08031234567' });
    expect(c?.owner).toBe('CAREGIVER');
  });
});

describe('telling somebody what is wrong with what they typed', () => {
  it('distinguishes blank from wrong', () => {
    // "Invalid" covers both badly. A booking officer who typed a folder number
    // into the phone box needs to be told that, not told the box is empty.
    expect(phoneProblem('')).toMatch(/No phone number/i);
    expect(phoneProblem(null)).toMatch(/No phone number/i);
    expect(phoneProblem('565979')).toMatch(/only 6 digits/i);
    expect(phoneProblem('no phone')).toMatch(/no digits/i);
  });

  it('says nothing when the number is fine', () => {
    expect(phoneProblem('08031234567')).toBeNull();
    expect(phoneProblem('+234 803 123 4567')).toBeNull();
  });

  it('shows the person what they typed, so they can see the typo', () => {
    expect(phoneProblem('0803123456')).toContain('0803123456');
  });
});

describe('whether a case may be booked at all', () => {
  const reachable = { phoneNumber: '08031234567' };
  const unreachable = { phoneNumber: null, caregiverPhone: null };

  it('allows a booking when the patient can be reached', () => {
    const d = bookingContactDecision({ patient: reachable, surgeryType: 'ELECTIVE' });
    expect(d.allow).toBe(true);
    if (d.allow) expect(d.recorded).toBeUndefined();
  });

  it('refuses an elective booking when nobody can be reached', () => {
    const d = bookingContactDecision({ patient: unreachable, surgeryType: 'ELECTIVE' });
    expect(d.allow).toBe(false);
    if (!d.allow) {
      expect(d.refusal).toBe(NO_CONTACT_MESSAGE);
      // No way round is offered, because there is none.
      expect(d.mayOverride).toBe(false);
    }
  });

  it('refuses an urgent booking the same way', () => {
    expect(bookingContactDecision({ patient: unreachable, surgeryType: 'URGENT' }).allow)
      .toBe(false);
  });

  it('refuses an emergency that gives no reason', () => {
    // The emergency path is not a free pass. It is a different obligation:
    // say why, so the ward can be asked for a number before the operation.
    const d = bookingContactDecision({ patient: unreachable, surgeryType: 'EMERGENCY' });
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.mayOverride).toBe(true);
  });

  it('refuses an emergency whose reason is only whitespace', () => {
    const d = bookingContactDecision({
      patient: unreachable, surgeryType: 'EMERGENCY', noContactReason: '   ',
    });
    expect(d.allow).toBe(false);
  });

  it('lets an emergency through on a recorded reason, and keeps it', () => {
    // An unidentified trauma patient has no phone and no relative on file. A
    // booking screen that refuses to take them is a far worse failure than an
    // untold patient.
    const d = bookingContactDecision({
      patient: unreachable,
      surgeryType: 'EMERGENCY',
      noContactReason: 'Unaccompanied RTA patient, unconscious, no relative yet',
    });
    expect(d.allow).toBe(true);
    if (d.allow) expect(d.recorded?.reason).toMatch(/Unaccompanied RTA/);
  });

  it('does not let a non-emergency buy its way past with a reason', () => {
    // THE PLANT THAT WOULD OTHERWISE SLIP THROUGH. If the reason alone were
    // enough, every elective booking would carry one within a fortnight and
    // the rule would be decoration.
    const d = bookingContactDecision({
      patient: unreachable, surgeryType: 'ELECTIVE', noContactReason: 'no phone',
    });
    expect(d.allow).toBe(false);
  });

  it('is not fooled by a reason that is not a string', () => {
    for (const bad of [true, 1, {}, ['x'], null]) {
      expect(bookingContactDecision({
        patient: unreachable, surgeryType: 'EMERGENCY', noContactReason: bad,
      }).allow, String(bad)).toBe(false);
    }
  });

  it('accepts a next-of-kin number as reaching the patient', () => {
    const d = bookingContactDecision({
      patient: { phoneNumber: null, caregiverPhone: '08037654321' },
      surgeryType: 'ELECTIVE',
    });
    expect(d.allow).toBe(true);
  });

  it('does not accept a number that is not a number', () => {
    const d = bookingContactDecision({
      patient: { phoneNumber: '565979' }, surgeryType: 'ELECTIVE',
    });
    expect(d.allow).toBe(false);
  });
});

describe('the refusal', () => {
  it('names both boxes that would fix it', () => {
    expect(NO_CONTACT_MESSAGE).toMatch(/next-of-kin|next of kin/i);
    expect(NO_CONTACT_MESSAGE).toMatch(/WhatsApp number/i);
  });

  it('says what is lost, not just that a field is required', () => {
    // "Phone number required" gets worked around. "The hospital cannot tell
    // them their operation moved" does not.
    expect(NO_CONTACT_MESSAGE).toMatch(/delay/i);
    expect(NO_CONTACT_MESSAGE).toMatch(/change of date|new date/i);
  });
});
