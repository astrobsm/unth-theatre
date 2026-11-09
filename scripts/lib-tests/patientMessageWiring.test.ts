// The wiring between a patient who cannot be reached and the screens that
// pretend otherwise.
//
// Every failure guarded here is invisible from the outside, which is why it is
// pinned to the source rather than left to be noticed:
//
//   1. The booking form blocks a case with no number, and the API does not. A
//      check that lives only in a browser is not a check — it is skipped by
//      the offline queue, by a replayed request, and by anybody who has the
//      endpoint.
//   2. The message is composed, wa.me opens, and the number resolves to
//      nobody. WhatsApp reports no error, so the nurse believes the patient
//      was told.
//   3. The feedback link is built from the host the staff member happens to be
//      on. In theatre that is the Tailscale address, and the patient receives
//      a link that cannot resolve from a phone.
//   4. The payment warning goes out on a case with no deposit, telling a
//      patient to pay an amount nobody has set.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

const route = read('src/app/api/surgeries/[id]/patient-message/route.ts');
const surgeries = read('src/app/api/surgeries/route.ts');
const patientPut = read('src/app/api/patients/[id]/route.ts');
const picker = read('src/app/api/patients/route.ts');
const bookingForm = read('src/app/dashboard/surgeries/new/page.tsx');
const list = read('src/app/dashboard/surgeries/page.tsx');
const button = read('src/components/PatientMessageButton.tsx');
const contactField = read('src/components/PatientContactRequired.tsx');
const publicLink = read('src/lib/patients/publicLink.ts');

describe('a booking the hospital could not tell the patient about', () => {
  it('is refused by the API, not only by the form', () => {
    // The decision itself lives in lib/patients/contact.ts and is exercised in
    // patientContact.test.ts. All this has to establish is that the route
    // ASKS and then HONOURS the answer — which is the part a source test can
    // actually see.
    expect(surgeries).toContain('bookingContactDecision({');
    expect(surgeries).toContain('if (!contactDecision.allow)');
    expect(surgeries).toContain("code: 'NO_PATIENT_CONTACT'");
    expect(surgeries).toContain('error: contactDecision.refusal');
    // And records the emergency override rather than discarding it.
    expect(surgeries).toContain('if (contactDecision.recorded)');
  });

  it('is refused by the form too, so nobody fills in a long page first', () => {
    expect(bookingForm).toContain('contactReachable');
    expect(bookingForm).toContain('PatientContactRequired');
    // Before the early-booking shortcut, which exists to get a case listed on
    // the bare essentials — and being able to reach the patient is one.
    const guard = bookingForm.indexOf('if (!contactReachable)');
    const early = bookingForm.indexOf('if (bookingEarly)');
    expect(guard).toBeGreaterThan(-1);
    expect(early).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(early);
  });

  it('never blocks an emergency outright', () => {
    expect(surgeries).toContain('noContactReason: body?.noContactReason');
    // And the override is recorded, so somebody can be asked for a number
    // later rather than it quietly never existing.
    expect(surgeries).toContain("action: 'BOOKED_WITHOUT_PATIENT_CONTACT'");
    expect(surgeries).toContain('contactDecision.recorded.reason');
  });

  it('saves the number onto the patient, not onto the booking', () => {
    // It is a fact about the person. The next case booked for them must not
    // have to ask again.
    expect(contactField).toContain('/api/patients/${patientId}');
    expect(contactField).toContain("method: 'PUT'");
  });

  it('validates a number before storing it', () => {
    // A number WhatsApp cannot resolve is worse than an empty box: the booking
    // passes its check, the button appears, and the message reaches nobody.
    expect(patientPut).toContain('phoneProblem(raw)');
    expect(patientPut).toContain("['phoneNumber', 'caregiverPhone']");
    // Clearing a wrong number has to stay possible.
    expect(patientPut).toContain('updateData[field] = null');
  });

  it('carries the contact fields on the picker row', () => {
    // So the form can say whether this patient is reachable the moment they
    // are chosen, rather than after a second round trip.
    expect(picker).toContain('phoneNumber: true, caregiverName: true, caregiverPhone: true');
  });

  it('accepts the next of kin as a real answer', () => {
    expect(contactField).toMatch(/next of kin/i);
    expect(bookingForm).toContain('caregiverPhone');
  });
});

describe('the message never claims to have reached nobody', () => {
  it('refuses with 409 when there is no usable number', () => {
    expect(route).toContain('if (!contact)');
    expect(route).toContain("code: 'NO_PATIENT_NUMBER'");
    expect(route).toContain('{ status: 409 }');
    expect(route).toContain('sent: 0');
  });

  it('checks before the message is built, not after', () => {
    const check = route.indexOf("code: 'NO_PATIENT_NUMBER'");
    const build = route.indexOf('buildPatientNotice({');
    expect(check).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(-1);
    expect(check).toBeLessThan(build);
  });

  it('says whose phone it is before anything is sent', () => {
    // "the patient" and "the patient's son" are different decisions, and the
    // person pressing send is the one who should make it.
    expect(route).toContain('ownerLabel');
    expect(button).toContain('options.contact.ownerLabel');
    expect(button).toContain("owner === 'CAREGIVER'");
  });

  it('tells the truth about what the queue did', () => {
    // Until Meta approves the templates, queueMessage records each one as
    // refused and delivers nothing. The screen must say so and offer the
    // hand-off, rather than showing a tick.
    expect(route).toContain('queued: q.queued');
    expect(route).toContain('queueNote');
    expect(button).toContain('sent.queued');
    expect(button).toContain('not sent automatically');
    expect(route).toContain('https://wa.me/');
  });

  it('sends the same words it records', () => {
    // The hand-off text and the queued record both come from one template
    // render. They used to be able to differ, and a record of what the
    // hospital told a patient is worth nothing if it is only roughly that.
    expect(route).toContain('variables: notice.variables');
    expect(route).toContain('templateCode: notice.templateCode');
    expect(route).toContain('encodeURIComponent(notice.text)');
  });

  it('distinguishes a failed lookup from an empty record', () => {
    // Otherwise the screen says the patient has no number, and somebody types
    // one in over the one already on file.
    expect(button).toContain('setLoadFailed(true)');
    expect(button).toMatch(/not a sign that there is no number/i);
  });

  it('marks the recipient as the patient, which is what lets it go at all', () => {
    expect(route).toContain('recipientIsPatient: true');
    expect(route).toContain('recipientIsStaff: false');
  });
});

describe('the payment warning', () => {
  it('is offered only once a deposit exists', () => {
    expect(route).toContain('depositActive');
    expect(button).toContain('!options.depositActive');
    expect(button).toContain('disabled={blocked}');
  });

  it('takes the figure from the deposit row, never from the request', () => {
    // It tells a patient how much money to carry to a cashier. A figure a
    // caller could post is a figure a caller could get wrong.
    expect(route).toContain('await depositFor(surgery.id)');
    expect(route).toContain('prisma.caseDepositStatus.findUnique');
    expect(route).not.toMatch(/deposit:\s*body\./);
  });
});

describe('the feedback link reaches a phone', () => {
  it('is never built from the request host', () => {
    // THE ONE THAT WOULD NOT BE NOTICED. A nurse in theatre is on the Tailscale
    // address, and a link to 100.x from a patient's phone on mobile data fails
    // silently — it just looks like a hospital that asked for feedback it did
    // not want.
    expect(publicLink).not.toContain('headers.get');
    expect(publicLink).not.toContain('NextRequest');
    expect(route).toContain('patientFeedbackLink()');
  });

  it('rejects an address that only works inside the hospital', () => {
    expect(publicLink).toContain('isUnreachableFromAPhone');
    // Tailscale's range is the one that bites: it looks public and is not.
    expect(publicLink).toContain('100.64');
    expect(publicLink).toContain('PUBLIC_SITE_FALLBACK');
  });

  it('is in every message, not only the safety one', () => {
    expect(route).toContain('feedbackLink: patientFeedbackLink()');
  });
});

describe('the button', () => {
  it('is on the list, where a slipped case is discovered', () => {
    expect(list).toContain('PatientMessageButton');
    expect(list).toContain('surgeryId={surgery.id}');
  });

  it('is not offered on a finished case', () => {
    expect(button).toContain("status === 'COMPLETED'");
  });

  it('shows the exact words before they are sent', () => {
    expect(button).toContain('sent.text');
    expect(button).toMatch(/will read/i);
  });

  it('offers no box to type a reason into', () => {
    // The guard against a diagnosis reaching a phone. The only free text is
    // the delay horizon and the new date — neither of which is about the
    // patient's body.
    const typed = button.match(/<textarea/g) ?? [];
    expect(typed).toHaveLength(0);
    expect(button).toContain('name="notice-reason"');
    expect(button).toContain('type="radio"');
  });
});
