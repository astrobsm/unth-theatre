// ============================================================
// The number the hospital can actually reach a patient on
// ------------------------------------------------------------
// Pure. No database, no network — so the rule about what counts as a reachable
// number is decided in one place and can be argued about against tests, rather
// than re-implemented slightly differently in the booking form, the API that
// refuses the booking, and the button that sends the message.
//
// WHY THIS EXISTS AT ALL. Everything else in this file follows from one fact:
// a message that is addressed to nobody still looks sent. `wa.me` with a
// malformed number opens a chat with no one and reports no error, so a nurse
// who presses "tell the patient" sees WhatsApp open, assumes it went, and stops
// worrying about a patient who was never told. The same shape of failure as a
// chase to an empty holding area, and it gets the same treatment: find out
// BEFORE the button is pressed, and refuse out loud.
//
// THE CAREGIVER COUNTS. Plenty of patients here have no phone of their own —
// an elderly man on a ward, a child, somebody who came in unconscious. The
// next-of-kin number is how that family is reached in practice, and pretending
// otherwise would just mean the field is filled with a relative's number typed
// into the patient's box, which is worse: then nobody knows whose phone it is.
// So the caregiver is a first-class answer, and WHOSE phone it is travels with
// the answer so the screen can say it and the sender can decide.
// ============================================================

import { toWhatsAppNumber } from '@/lib/comms/whatsapp';

export interface PatientContactInput {
  name?: string | null;
  phoneNumber?: string | null;
  caregiverName?: string | null;
  caregiverPhone?: string | null;
}

export type ContactOwner = 'PATIENT' | 'CAREGIVER';

export interface PatientContact {
  /** Digits only, country code first — the form wa.me and Meta both want. */
  whatsAppNumber: string;
  /** As it was typed on the record, for showing back to staff. */
  asRecorded: string;
  owner: ContactOwner;
  /** Who answers this phone, in words a screen can print. */
  ownerLabel: string;
}

/**
 * The best reachable WhatsApp number on this record, or null.
 *
 * The patient's own phone wins. A patient reading their own operation date is
 * the thing we are trying to achieve; the relative is the fallback, not the
 * default, because every hop adds a person who might not pass the message on.
 */
export function patientContact(p: PatientContactInput): PatientContact | null {
  const own = toWhatsAppNumber(p.phoneNumber ?? '');
  if (own) {
    return {
      whatsAppNumber: own,
      asRecorded: (p.phoneNumber ?? '').trim(),
      owner: 'PATIENT',
      ownerLabel: p.name?.trim() ? `${p.name.trim()} (the patient)` : 'the patient',
    };
  }

  const carer = toWhatsAppNumber(p.caregiverPhone ?? '');
  if (carer) {
    const who = p.caregiverName?.trim();
    return {
      whatsAppNumber: carer,
      asRecorded: (p.caregiverPhone ?? '').trim(),
      owner: 'CAREGIVER',
      ownerLabel: who ? `${who} (next of kin)` : 'the next of kin',
    };
  }

  return null;
}

/** Is there any number on this record a message could actually go to? */
export const isReachable = (p: PatientContactInput): boolean => patientContact(p) !== null;

/**
 * Why a number was not accepted, in words for the person who typed it.
 *
 * Separate from `patientContact` because "nothing was entered" and "what was
 * entered is not a phone number" are different mistakes with different fixes,
 * and a single "invalid" covers both badly. A booking officer who typed a
 * folder number into the phone box needs to be told that, not told it is blank.
 */
export function phoneProblem(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text) return 'No phone number has been entered.';
  if (toWhatsAppNumber(text)) return null;

  const digits = text.replace(/\D/g, '');
  if (digits.length === 0) {
    return `"${text}" has no digits in it, so it is not a phone number.`;
  }
  if (digits.length < 10) {
    return `"${text}" is only ${digits.length} digit${digits.length === 1 ? '' : 's'} long. `
      + 'A Nigerian mobile number has 11, like 0803 123 4567.';
  }
  return `"${text}" is not a number WhatsApp can reach. Enter it as 0803 123 4567 `
    + 'or +234 803 123 4567.';
}

/**
 * What to say when a case cannot be booked because nobody can be reached.
 *
 * Names the two boxes that would fix it. A refusal that says only "phone number
 * required" sends the booking officer hunting for a field, and on a form this
 * long that is a minute of somebody's day every time.
 */
export const NO_CONTACT_MESSAGE =
  'This patient has no WhatsApp number on file, so the hospital cannot tell them '
  + 'anything about this operation — not a delay, not a change of date, not the '
  + 'safety notice about people selling them lists. Add the patient\'s own number, '
  + 'or a next-of-kin number if the patient has no phone, and book again.';

export type BookingContactDecision =
  | { allow: true; recorded?: never }
  /** Booked anyway, and WHY is kept, so a number can be chased later. */
  | { allow: true; recorded: { reason: string } }
  | { allow: false; refusal: string; mayOverride: boolean };

/**
 * May this case be booked, given what is known about reaching the patient?
 *
 * PURE, AND SEPARATE FROM THE ROUTE, because a decision embedded in an `if`
 * inside a 1600-line handler can only be tested by asserting that the `if` is
 * still written the way somebody remembers. That is not a test: wrapping the
 * condition in `false &&` leaves every such assertion passing while the gate is
 * gone. This returns a value, so the gate itself can be exercised.
 *
 * THE EMERGENCY CASE IS NOT AN EXEMPTION, IT IS A DIFFERENT OBLIGATION. An
 * unidentified trauma patient has no phone and no relative on file, and a
 * booking screen that refuses to take them is a far worse failure than an
 * untold patient. So an emergency may proceed — but only when somebody writes
 * down why, and that reason is recorded against the patient so the ward can be
 * asked for a number before the operation rather than after it.
 */
export function bookingContactDecision(input: {
  patient: PatientContactInput;
  /** ELECTIVE | URGENT | EMERGENCY. */
  surgeryType: string;
  /** Supplied by the emergency path when there is genuinely nobody to record. */
  noContactReason?: unknown;
}): BookingContactDecision {
  if (isReachable(input.patient)) return { allow: true };

  const isEmergency = String(input.surgeryType ?? '').toUpperCase() === 'EMERGENCY';
  const reason = typeof input.noContactReason === 'string' ? input.noContactReason.trim() : '';

  if (isEmergency && reason) {
    return { allow: true, recorded: { reason: reason.slice(0, 300) } };
  }

  return {
    allow: false,
    refusal: NO_CONTACT_MESSAGE,
    // Offered only where it is true, so it never reads as a way round a rule
    // that has none.
    mayOverride: isEmergency,
  };
}
