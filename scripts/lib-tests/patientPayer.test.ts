/**
 * Who pays, asked when the patient is registered.
 *
 * On instruction, 25 November 2026: "ensure the (private, NHIA, etc) can be
 * set during patient, add the field with drop down to select, private is the
 * default."
 *
 * WHY IT BELONGS ON THE PATIENT. It is a fact about the person, not about an
 * operation: a man enrolled with the NHIA is enrolled for his hernia in March
 * and his cholecystectomy in August. Asked once at the desk and carried onto
 * every booking, there is one answer; asked again each time, there are
 * eventually two that disagree.
 *
 * WHY THE BOOKING STILL KEEPS ITS OWN COPY. A scheme lapses and a card
 * expires, so the booking is the last moment anybody checks — and a pack list
 * already sent to a counter must not move because somebody corrected a
 * patient record months later.
 */
import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { BOOKABLE_PAYER_CATEGORIES } from '../../src/lib/payer/categories';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('the patient record carries it', () => {
  it('defaults to PRIVATE, in the schema and in the migration', () => {
    // On instruction. It is also what every patient already on file was in
    // practice: before any of this existed every case was packed and billed
    // as self-paying, so the default states what the records already say.
    const model = read('prisma/schema.prisma');
    const patient = model.slice(model.indexOf('model Patient {'), model.indexOf('@@map("patients")'));
    expect(patient).toContain('payerCategory    PayerCategory @default(PRIVATE)');
    expect(patient).toContain('payerSchemeId    String?');
    expect(patient).toContain('payerIsNyscCorps Boolean       @default(false)');

    const migration = read('prisma/migrations/20261125210000_patient_payer_category/migration.sql');
    expect(migration).toContain('"payerCategory"    "PayerCategory" NOT NULL DEFAULT \'PRIVATE\'');
    expect(migration).toContain('ALTER TABLE "patients"');
  });

  it('never refuses a registration for want of it', () => {
    // The clerk at the desk either has the card in front of them or does
    // not. Sending a patient away over a dropdown is a worse failure than
    // the default being wrong once.
    const api = read('src/app/api/patients/route.ts');
    expect(api).toContain(
      "payerCategory: z.enum(['NHIA', 'NHIS', 'CEmONC', 'PRIVATE']).optional().default('PRIVATE')",
    );
    expect(api).toContain('payerSchemeId: z.string().max(60).optional().nullable()');
    expect(api).toContain('payerIsNyscCorps: z.boolean().optional().default(false)');
  });

  it('is on the wire the moment a patient is chosen', () => {
    // The booking form fills itself in from this. A second round trip to
    // find out is a second of somebody staring at a form that has not yet
    // answered itself.
    const api = read('src/app/api/patients/route.ts');
    expect(api).toContain('payerCategory: true, payerSchemeId: true, payerIsNyscCorps: true');
  });

  it('can be corrected later, but not back to UNSPECIFIED', () => {
    const put = read('src/app/api/patients/[id]/route.ts');
    expect(put).toContain('if (body.payerCategory !== undefined)');
    expect(put).toContain("next === 'UNSPECIFIED'");
    expect(put).toContain('PAYER_REQUIRED_MESSAGE');
  });

  it('does not re-route a case that was already booked', () => {
    // The booking carries its own copy, taken when it was made. A pack list
    // already at a counter must not move because a patient record was
    // corrected months later; that correction belongs on the booking, where
    // the person doing it can see the re-routing happen.
    const put = read('src/app/api/patients/[id]/route.ts');
    expect(put).not.toContain('applyRoutingToSurgery');
    expect(put).toContain('DOES NOT RE-ROUTE ANY EXISTING CASE');
  });
});

describe('the registration form', () => {
  const form = read('src/app/dashboard/patients/new/page.tsx');

  it('offers the four as a dropdown', () => {
    expect(form).toContain('name="payerCategory"');
    expect(form).toContain('BOOKABLE_PAYER_CATEGORIES.map');
    // Four, and never UNSPECIFIED: a value that exists only for history is
    // not a thing anybody chooses.
    expect(BOOKABLE_PAYER_CATEGORIES).toHaveLength(4);
    expect(BOOKABLE_PAYER_CATEGORIES).not.toContain('UNSPECIFIED');
  });

  it('starts on Private', () => {
    expect(form).toContain("useState<string>('PRIVATE')");
    expect(form).toContain("payerCategory: (formData.get('payerCategory') as string) || 'PRIVATE'");
  });

  it('asks for the enrolee number only where there is a scheme to enrol in', () => {
    // A private patient has no enrolee number, and a box for one is a box
    // somebody types a dash into.
    expect(form).toContain('isInsuredPayer(payerCategory as never) && (');
    expect(form).toContain('name="payerSchemeId"');
    expect(form).toContain('name="payerIsNyscCorps"');
  });

  it('reads the tick as present-or-absent, not as a string', () => {
    // An unticked checkbox is ABSENT from FormData. Comparing it to 'true'
    // or coercing the value would make every patient a corps member or
    // none of them.
    expect(form).toContain("payerIsNyscCorps: formData.get('payerIsNyscCorps') !== null");
  });
});

describe('the booking form takes it from the patient', () => {
  const booking = read('src/app/dashboard/surgeries/new/page.tsx');

  it('fills itself in when a patient is chosen', () => {
    expect(booking).toContain('const fromPatient = (p as { payerCategory?: string | null }).payerCategory');
    expect(booking).toContain("setPayerCategory(fromPatient && fromPatient !== 'UNSPECIFIED' ? fromPatient : 'PRIVATE')");
    expect(booking).toContain('setPayerSchemeId(');
    expect(booking).toContain('setPayerIsNyscCorps(');
  });

  it('replaces whatever was in the box, rather than keeping it', () => {
    // Changing the patient changes whose cover this is. A half-chosen
    // category must never carry to another person, exactly as a half-typed
    // ward must not — which is the rule the surrounding effect already
    // enforces for the details.
    const effect = booking.slice(
      booking.indexOf('const fromPatient ='),
      booking.indexOf('}, [selectedPatientId, patients]);'),
    );
    expect(effect).not.toContain('payerCategory ||');
    expect(effect).not.toContain('if (!payerCategory)');
  });

  it('leaves it editable, because a scheme can lapse', () => {
    // The booking is the last moment anybody checks, and it keeps its own
    // copy for exactly that reason.
    expect(booking).toContain('onChange={(e) => setPayerCategory(e.target.value)}');
  });

  it('still refuses to submit without one', () => {
    // Pre-filled is not the same as answered-for. The guard stays.
    expect(booking).toContain('if (!payerCategory) {');
    expect(booking).toContain('setError(PAYER_REQUIRED_MESSAGE)');
  });
});
