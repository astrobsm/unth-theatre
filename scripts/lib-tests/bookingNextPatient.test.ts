import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// "Book the next patient on this list" keeps the team and clears the
// patient. The dangerous half is the clearing: a leftover consent
// photograph or a leftover procedure attached to the NEXT patient is a
// clinical error, not an inconvenience.
//
// These read source rather than behaviour, which is weaker than I would
// like for a 3,700-line form — but the failure being guarded is a specific
// field someone forgets to reset when they add one, and that is exactly
// what a list like this catches.

const page = readFileSync(
  join(__dirname, '..', '..', 'src', 'app', 'dashboard', 'surgeries', 'new', 'page.tsx'),
  'utf8',
);

const handler = (() => {
  const at = page.indexOf('onNextPatient={() => {');
  if (at === -1) throw new Error('the next-patient handler is gone');
  return page.slice(at, page.indexOf('          }}', at));
})();

describe('everything belonging to the PATIENT is cleared', () => {
  it.each([
    ["setSelectedPatientId('')", 'the patient'],
    ["setProcedureName('')", 'the procedure'],
    ['setConsentFile(null)', 'the consent photograph'],
    ["setMagnitude('')", 'the operative magnitude'],
    ["setAnesthesiaType('')", 'the anaesthesia type'],
    ["setLocalAnaestheticId('')", 'the local anaesthetic agent'],
    ['setNeedBloodTransfusion(false)', 'the transfusion flag'],
    ['setSpecialNeeds([])', 'the special requirements'],
    ["setEstimatedDuration('')", 'the duration'],
  ])('clears %s — %s', (call) => {
    expect(handler, `${call} is not cleared for the next patient`).toContain(call);
  });

  it('clears the consent photograph specifically', () => {
    // The one that would be a clinical error rather than a nuisance:
    // the next patient would be booked carrying somebody else's signed
    // consent form.
    expect(handler).toContain('setConsentFile(null)');
  });

  it('forgets which bundled lines the previous surgeon removed', () => {
    // Otherwise the next patient's standard pack silently omits whatever
    // the last one did not want.
    expect(handler).toMatch(/removedBundleIdsRef\.current = \[\]/);
  });
});

describe('everything belonging to the LIST is kept', () => {
  it.each([
    ['setUnit', 'the unit'],
    ['setSelectedSurgeonId', 'the surgeon'],
    ['setAssistantIds', 'the assistant'],
    ['setSupervisingConsultantIds', 'the supervising consultants'],
    ['setTeamMembers', 'the unit team'],
    ['setScheduledDate', 'the date'],
  ])('does NOT reset %s — %s', (call) => {
    // The whole point: a Wednesday plastics list is the same firm all
    // morning, and retyping twelve fields per patient is where wrong team
    // members come from.
    expect(handler, `${call} should survive to the next patient`).not.toContain(call);
  });
});

describe('the surgeon is put back at the start', () => {
  it('returns to the first step', () => {
    expect(handler).toContain('setStep(0)');
  });

  it('scrolls to the top', () => {
    // On a phone the form is several screens long; leaving it at the
    // consent section looks like nothing happened.
    expect(handler).toMatch(/scrollTo/);
  });

  it('clears any error left from the previous booking', () => {
    expect(handler).toContain("setError('')");
  });

  it('closes the success modal', () => {
    expect(handler).toContain('setBookedCodes(null)');
  });
});
