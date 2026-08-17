import { describe, it, expect } from 'vitest';
import {
  checkPreopRequirements, outstandingLabel, MIN_OVERRIDE_REASON,
} from '../../src/lib/preopRequirements';

// The rule that decides whether a case can be booked at all. Tests focus on the
// two ways it could be wrong in opposite directions: letting an elective case
// through without consent, and blocking an emergency that needed a theatre.

const fullLabs = {
  recentHb: 11.2,
  hbSampleAt: '2026-08-12T08:00:00Z',
  potassium: 4.1,
  sodium: 138,
  creatinine: 78,
  hbsAgStatus: 'NEGATIVE',
  hcvStatus: 'NEGATIVE',
  hivStatus: 'NEGATIVE',
  bloodPressureSystolic: 124,
  bloodPressureDiastolic: 78,
};

const consented = { signedElectronically: true };

describe('complete booking', () => {
  it('passes when consent and every lab is present', () => {
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4, urgency: 'ELECTIVE', labs: fullLabs, consent: consented });
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.outstanding).toEqual([]);
  });

  it('accepts a scanned paper consent as equal to an electronic signature', () => {
    // Insisting on the app would push staff to book without consent rather than
    // to consent properly.
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      urgency: 'ELECTIVE', labs: fullLabs, consent: { hasUploadedFile: true },
    });
    expect(r.ok).toBe(true);
  });
});

describe('elective — hard block, no override', () => {
  it('blocks a missing consent', () => {
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4, urgency: 'ELECTIVE', labs: fullLabs, consent: {} });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('CONSENT');
  });

  it('blocks a missing haemoglobin', () => {
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      urgency: 'ELECTIVE', labs: { ...fullLabs, recentHb: null }, consent: consented,
    });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('HAEMOGLOBIN');
  });

  it('treats a haemoglobin with no sample time as missing', () => {
    // A figure with no date cannot be checked against the 48-hour rule, so it is
    // not usable evidence.
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      urgency: 'ELECTIVE', labs: { ...fullLabs, hbSampleAt: null }, consent: consented,
    });
    expect(r.missing).toContain('HAEMOGLOBIN');
  });

  it('blocks partial electrolytes', () => {
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      urgency: 'ELECTIVE', labs: { ...fullLabs, creatinine: null }, consent: consented,
    });
    expect(r.missing).toContain('ELECTROLYTES');
  });

  it('blocks an incomplete viral screen', () => {
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      urgency: 'ELECTIVE', labs: { ...fullLabs, hcvStatus: null }, consent: consented,
    });
    expect(r.missing).toContain('VIRAL_SCREEN');
  });

  it('accepts PENDING and NOT_DONE as recorded answers', () => {
    // The requirement is that somebody looked and recorded what they found —
    // "PENDING" is information, an empty field is not.
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      urgency: 'ELECTIVE',
      labs: { ...fullLabs, hivStatus: 'PENDING', hcvStatus: 'NOT_DONE' },
      consent: consented,
    });
    expect(r.ok).toBe(true);
  });

  it('IGNORES an override on an elective case', () => {
    // The one rule that must not bend. A requirement waivable by typing a
    // sentence eventually is waived every time.
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      urgency: 'ELECTIVE', labs: fullLabs, consent: {},
      override: { reason: 'Patient in a hurry and clinic is closing', byName: 'Dr X', byId: 'u1' },
    });
    expect(r.ok).toBe(false);
    expect(r.overrideAccepted).toBe(false);
    expect(r.overrideRequired).toBe(false);
  });

  it('defaults an unknown urgency to elective', () => {
    // Most cases are elective; treating unknown as emergency would open the
    // override to everything.
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4, urgency: null, labs: fullLabs, consent: {} });
    expect(r.ok).toBe(false);
  });
});

describe('emergency — deferrable, with a recorded reason', () => {
  const base = { urgency: 'EMERGENCY' as const, labs: { ...fullLabs, recentHb: null }, consent: {} };

  it('asks for an override rather than refusing outright', () => {
    const r = checkPreopRequirements(base);
    expect(r.ok).toBe(false);
    expect(r.overrideRequired).toBe(true);
    expect(r.missing).toContain('CONSENT');
    expect(r.missing).toContain('HAEMOGLOBIN');
  });

  it('permits submission with a reason and a named clinician', () => {
    // The case must reach theatre. A booked theatre with a team on the way is the
    // safest place for an unconsented emergency patient.
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      ...base,
      override: { reason: 'Unconscious, no next of kin present, ruptured spleen', byId: 'u1', byName: 'Dr Okafor' },
    });
    expect(r.ok).toBe(true);
    expect(r.overrideAccepted).toBe(true);
  });

  it('refuses a token reason', () => {
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      ...base, override: { reason: 'urgent', byId: 'u1', byName: 'Dr Okafor' },
    });
    expect(r.ok).toBe(false);
    expect('urgent'.length).toBeLessThan(MIN_OVERRIDE_REASON);
  });

  it('refuses an override with no one named against it', () => {
    // An unattributed deferral is not a clinical decision, it is a blank.
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      ...base, override: { reason: 'Unconscious patient, no relative available' },
    });
    expect(r.ok).toBe(false);
  });

  it('still records what was deferred, even when accepted', () => {
    // A deferral is a debt, not a discharge.
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      ...base,
      override: { reason: 'Unconscious, no next of kin present, ruptured spleen', byId: 'u1' },
    });
    expect(r.ok).toBe(true);
    expect(r.outstanding).toContain('CONSENT');
    expect(r.outstanding).toContain('HAEMOGLOBIN');
  });

  it('needs no override when the emergency is fully documented', () => {
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      urgency: 'EMERGENCY', labs: fullLabs, consent: consented,
    });
    expect(r.ok).toBe(true);
    expect(r.overrideRequired).toBe(false);
    expect(r.outstanding).toEqual([]);
  });

  it('treats URGENT the same as EMERGENCY', () => {
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      ...base, urgency: 'URGENT',
      override: { reason: 'Theatre in 20 minutes, consent being taken now', byId: 'u1' },
    });
    expect(r.ok).toBe(true);
  });

  it('accepts a lower-case urgency', () => {
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      ...base, urgency: 'emergency',
      override: { reason: 'Unconscious, no next of kin present', byId: 'u1' },
    });
    expect(r.ok).toBe(true);
  });
});

describe('labsHandledElsewhere — the emergency booking path', () => {
  it('requires consent but not labs', () => {
    // The emergency booking form does not collect labs; the emergency lab workup
    // module gathers them after booking, which is the right order for a patient
    // who needs theatre now.
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      urgency: 'EMERGENCY', labs: {}, consent: { signedElectronically: true },
      labsHandledElsewhere: true,
    });
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('still blocks a missing consent, and still allows a deferral', () => {
    const blocked = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      urgency: 'EMERGENCY', labs: {}, consent: {}, labsHandledElsewhere: true,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.missing).toEqual(['CONSENT']);
    expect(blocked.overrideRequired).toBe(true);

    const deferred = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      urgency: 'EMERGENCY', labs: {}, consent: {}, labsHandledElsewhere: true,
      override: { reason: 'Unconscious, no next of kin present', byId: 'u1' },
    });
    expect(deferred.ok).toBe(true);
    expect(deferred.outstanding).toEqual(['CONSENT']);
  });

  it('does NOT weaken the elective path', () => {
    // The flag is set by the emergency route only. If an elective caller ever set
    // it, consent would still be enforced and no override would be honoured.
    const r = checkPreopRequirements({ prescriptionItemCount: 2, consumableRequestCount: 4,
      urgency: 'ELECTIVE', labs: {}, consent: {}, labsHandledElsewhere: true,
      override: { reason: 'Trying to get around the rule', byId: 'u1' },
    });
    expect(r.ok).toBe(false);
  });
});

describe('outstandingLabel', () => {
  it('names consent alone', () => {
    expect(outstandingLabel(['CONSENT'])).toBe('CONSENT OUTSTANDING');
  });

  it('leads with consent when several things are missing', () => {
    // Consent is the one a nurse at the theatre door must see first.
    expect(outstandingLabel(['CONSENT', 'HAEMOGLOBIN'])).toBe('CONSENT + 1 PRE-OP ITEM OUTSTANDING');
    expect(outstandingLabel(['CONSENT', 'HAEMOGLOBIN', 'VIRAL_SCREEN']))
      .toBe('CONSENT + 2 PRE-OP ITEMS OUTSTANDING');
  });

  it('counts non-consent items', () => {
    expect(outstandingLabel(['HAEMOGLOBIN'])).toBe('1 PRE-OP ITEM OUTSTANDING');
    expect(outstandingLabel(['HAEMOGLOBIN', 'ELECTROLYTES'])).toBe('2 PRE-OP ITEMS OUTSTANDING');
  });

  it('says nothing when nothing is outstanding', () => {
    expect(outstandingLabel([])).toBeNull();
    expect(outstandingLabel(null)).toBeNull();
  });
});

describe('the pharmacy prescription and the consumables pack', () => {
  // Both were optional. Cases arrived with nothing prepared and nothing
  // picked, discovered at the theatre door — the most expensive possible
  // moment to discover it.
  const base = { urgency: 'ELECTIVE' as const, labs: fullLabs, consent: consented };

  it('refuses an elective booking that sends Pharmacy nothing', () => {
    const r = checkPreopRequirements({ ...base, prescriptionItemCount: 0, consumableRequestCount: 4 });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('PRESCRIPTION');
  });

  it('refuses an elective booking with no consumables requested', () => {
    const r = checkPreopRequirements({ ...base, prescriptionItemCount: 2, consumableRequestCount: 0 });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('CONSUMABLES');
  });

  it('treats an empty prescription as no prescription', () => {
    // Sending a prescription with no drugs on it and sending none at all are
    // the same event to Pharmacy.
    const r = checkPreopRequirements({ ...base, prescriptionItemCount: 0, consumableRequestCount: 0 });
    expect(r.missing).toContain('PRESCRIPTION');
    expect(r.missing).toContain('CONSUMABLES');
  });

  it('treats an absent count as nothing sent, never as satisfied', () => {
    // A caller that has not been taught about these must fail closed. The
    // opposite default would make the requirement disappear silently the first
    // time somebody adds a new booking route.
    const r = checkPreopRequirements(base);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('PRESCRIPTION');
    expect(r.missing).toContain('CONSUMABLES');
  });

  it('requires them on an emergency too, where the labs are excused', () => {
    // labsHandledElsewhere exists because the emergency lab workup collects
    // labs afterwards. Nothing collects the drugs and the pack afterwards, and
    // an emergency needs them picked more urgently, not less.
    const r = checkPreopRequirements({
      urgency: 'EMERGENCY', labsHandledElsewhere: true, labs: {}, consent: consented,
      prescriptionItemCount: 0, consumableRequestCount: 0,
    });
    expect(r.missing).toContain('PRESCRIPTION');
    expect(r.missing).toContain('CONSUMABLES');
    expect(r.overrideRequired).toBe(true);
  });

  it('lets an emergency defer them with a named reason', () => {
    const r = checkPreopRequirements({
      urgency: 'EMERGENCY', labsHandledElsewhere: true, labs: {}, consent: consented,
      prescriptionItemCount: 0, consumableRequestCount: 0,
      override: {
        reason: 'Theatre already open for a ruptured ectopic; pack and drugs drawn from the emergency trolley.',
        byId: 'u1', byName: 'Dr Okafor',
      },
    });
    expect(r.ok).toBe(true);
    expect(r.overrideAccepted).toBe(true);
    // A deferral is a debt, not a discharge.
    expect(r.outstanding).toContain('PRESCRIPTION');
    expect(r.outstanding).toContain('CONSUMABLES');
  });

  it('still refuses an emergency deferral that names no one', () => {
    // WHO is taken from the session, never from the body. Without it there is
    // nobody to ask about the decision afterwards.
    const r = checkPreopRequirements({
      urgency: 'EMERGENCY', labsHandledElsewhere: true, labs: {}, consent: consented,
      prescriptionItemCount: 0, consumableRequestCount: 0,
      override: { reason: 'No time, patient exsanguinating in reception.', byId: null, byName: null },
    });
    expect(r.ok).toBe(false);
  });
});
