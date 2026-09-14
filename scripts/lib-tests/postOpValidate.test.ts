/**
 * Orders that look finished and are not.
 *
 * Every case below is one a nurse would be left to resolve alone on a ward at
 * night: a feeding time with no time, prophylaxis ordered with no drug, a
 * restart instruction attached to no medication. Each of those passes any
 * "required field" check, because the field IS filled in — what is missing is
 * the detail that makes the order actionable.
 *
 * The distinction between blocking and advisory is tested as carefully as the
 * detection itself. Blocking too much is not the safe direction: a form that
 * refuses judgement calls gets the shortest note that clears it, and then the
 * record is worse than the paragraph it replaced.
 */
import { describe, expect, it } from 'vitest';

import { resolveTemplate, matchTemplate } from '../../src/lib/postop/templates';
import { validateNote, canSign, countProblems, bySection } from '../../src/lib/postop/validate';

const CORE = resolveTemplate(null);

/** A note with everything needed to sign, to isolate one failure at a time. */
const complete = (over: Record<string, unknown> = {}) => ({
  findings: 'Appendix inflamed, removed. Peritoneal toilet performed.',
  observationFrequency: 'Quarter-hourly for one hour, then hourly',
  ...over,
});

const blocking = (p: { severity: string }[]) => p.filter((x) => x.severity === 'blocking');
const messages = (p: { message: string }[]) => p.map((x) => x.message).join(' | ');

describe('orders that name a time but do not give one', () => {
  it('catches feeds set for a specified time with no time', () => {
    const p = validateNote(CORE, complete({ feedingTiming: 'AT_TIME' }));
    expect(messages(blocking(p))).toMatch(/Feeds are to start at a specified time/);
  });

  it('is satisfied once the time is given', () => {
    const p = validateNote(CORE, complete({ feedingTiming: 'AT_TIME', feedingAt: '2026-09-14T18:00:00Z' }));
    expect(messages(blocking(p))).not.toMatch(/Feeds are to start/);
  });

  it('does not ask for a time when none was promised', () => {
    const p = validateNote(CORE, complete({ feedingTiming: 'WHEN_AWAKE' }));
    expect(messages(blocking(p))).not.toMatch(/no time is given/);
  });

  it('catches the same pattern for medications, catheter and review', () => {
    const p = validateNote(CORE, complete({
      oralMedicationTiming: 'AT_TIME',
      catheterPresent: true,
      catheterAction: 'REMOVE_AT_TIME',
      reviewTiming: 'AT_TIME',
    }));
    const m = messages(blocking(p));
    expect(m).toMatch(/Oral medications are to start/);
    expect(m).toMatch(/catheter is to be removed/);
    expect(m).toMatch(/review is set/);
  });
});

describe('VTE prophylaxis', () => {
  it('will not accept pharmacological prophylaxis with no drug', () => {
    const p = validateNote(CORE, complete({ vtePlan: 'PHARMACOLOGICAL' }));
    expect(messages(blocking(p))).toMatch(/no drug is named/);
  });

  it('will not accept it with a drug but no dose', () => {
    const p = validateNote(CORE, complete({ vtePlan: 'PHARMACOLOGICAL', vteDrug: 'Enoxaparin' }));
    expect(messages(blocking(p))).toMatch(/no dose is given/);
  });

  it('will not accept mechanical prophylaxis with no method', () => {
    const p = validateNote(CORE, complete({ vtePlan: 'MECHANICAL' }));
    expect(messages(blocking(p))).toMatch(/no method is named/);
  });

  it('accepts a complete pharmacological order', () => {
    const p = validateNote(CORE, complete({
      vtePlan: 'PHARMACOLOGICAL', vteDrug: 'Enoxaparin', vteDose: '40 mg',
    }));
    expect(blocking(p)).toHaveLength(0);
  });

  it('treats "not indicated" as a complete answer, not an omission', () => {
    // The point of the field being a class rather than a boolean. A considered
    // decision not to give prophylaxis must be recordable without a warning.
    const p = validateNote(CORE, complete({ vtePlan: 'NOT_INDICATED' }));
    expect(blocking(p)).toHaveLength(0);
    expect(messages(p)).not.toMatch(/has not been addressed/);
  });

  it('mentions it, without blocking, when nobody addressed it at all', () => {
    const p = validateNote(CORE, complete());
    const advisory = p.filter((x) => x.severity === 'advisory');
    expect(messages(advisory)).toMatch(/VTE prophylaxis has not been addressed/);
    expect(blocking(p).some((x) => x.field === 'vtePlan')).toBe(false);
  });
});

describe('half-written orders elsewhere', () => {
  it('will not accept antibiotics with no drug', () => {
    const p = validateNote(CORE, complete({ antibioticPlan: 'THERAPEUTIC' }));
    expect(messages(blocking(p))).toMatch(/no drug is named/);
  });

  it('requires a frequency once observations are ordered', () => {
    const p = validateNote(CORE, { findings: 'x', observations: ['PULSE'] });
    expect(messages(blocking(p))).toMatch(/no frequency is given/);
  });

  it('will not accept a restart instruction with no medication named', () => {
    const p = validateNote(CORE, complete(), {
      heldMedications: [{ restartInstruction: 'IMMEDIATELY' }],
    });
    expect(messages(blocking(p))).toMatch(/without naming the medication/);
  });

  it('requires the "other" to be spelled out once it is chosen', () => {
    const p = validateNote(CORE, complete({ haemostasisMethods: ['DIATHERMY_BIPOLAR', 'OTHER'] }));
    expect(messages(blocking(p))).toMatch(/what the other method of haemostasis was/);
  });

  it('does not ask for it when "other" was not chosen', () => {
    const p = validateNote(CORE, complete({ haemostasisMethods: ['DIATHERMY_BIPOLAR'] }));
    expect(messages(blocking(p))).not.toMatch(/You chose "Other"/);
  });
});

describe('numbers that are typos', () => {
  it('refuses a blood loss no patient could survive', () => {
    const p = validateNote(CORE, complete({ estimatedBloodLossMl: 500000 }));
    expect(messages(blocking(p))).toMatch(/looks wrong/);
  });

  it('refuses a negative one', () => {
    const p = validateNote(CORE, complete({ estimatedBloodLossMl: -50 }));
    expect(messages(blocking(p))).toMatch(/cannot be less than/);
  });

  it('accepts a large but real one', () => {
    const p = validateNote(CORE, complete({ estimatedBloodLossMl: 2500 }));
    expect(blocking(p)).toHaveLength(0);
  });

  it('treats an empty number as unanswered rather than as zero', () => {
    const p = validateNote(CORE, complete({ estimatedBloodLossMl: null }));
    expect(blocking(p)).toHaveLength(0);
  });
});

describe('orders that contradict each other', () => {
  it('notices oral medications ordered for a nil-by-mouth patient', () => {
    const p = validateNote(CORE, complete({
      feedingTiming: 'NIL_BY_MOUTH', oralMedicationTiming: 'IMMEDIATELY',
    }));
    expect(messages(p)).toMatch(/nil by mouth, but oral medications/);
  });

  it('does not block it, because the surgeon may have a reason', () => {
    const p = validateNote(CORE, complete({
      feedingTiming: 'NIL_BY_MOUTH', oralMedicationTiming: 'IMMEDIATELY',
    }));
    expect(canSign(p)).toBe(true);
  });

  it('does block a limb ordered both elevated and dependent', () => {
    // Unlike the above, this one cannot be reconciled by any reading.
    const p = validateNote(CORE, complete({
      positionRestrictions: ['LIMB_ELEVATED', 'LIMB_DEPENDENT'],
    }));
    expect(messages(blocking(p))).toMatch(/cannot be both elevated and dependent/);
    expect(canSign(p)).toBe(false);
  });
});

describe('required fields follow the template', () => {
  it('demands the findings', () => {
    const p = validateNote(CORE, { observationFrequency: 'hourly' });
    expect(messages(blocking(p))).toMatch(/Findings is needed/);
  });

  it('demands a flap monitoring frequency on a flap case, and not otherwise', () => {
    const flap = resolveTemplate(matchTemplate('Free flap reconstruction'));
    const withoutFrequency = validateNote(flap, complete({
      flapType: 'FREE', flapDonorSite: 'Left thigh', flapRecipientSite: 'Scalp',
      flapMonitoringParams: ['COLOUR'],
    }));
    expect(messages(blocking(withoutFrequency))).toMatch(/Monitoring frequency/);

    const core = validateNote(CORE, complete());
    expect(messages(blocking(core))).not.toMatch(/Monitoring frequency/);
  });

  it('does not demand a field that is not on screen', () => {
    // The complication detail is required, but only once a complication is
    // recorded. Demanding a hidden field is how a form becomes unsignable with
    // no visible reason.
    const p = validateNote(CORE, complete({ complicationOccurred: false }));
    expect(messages(blocking(p))).not.toMatch(/Complication/);

    const q = validateNote(CORE, complete({ complicationOccurred: true }));
    expect(messages(blocking(q))).toMatch(/Complication — describe/);
  });

  it('demands each required field of a repeating row, naming the row', () => {
    const p = validateNote(CORE, complete(), { drains: [{ site: 'Pelvis' }] });
    expect(messages(blocking(p))).toMatch(/entry 1/);
  });
});

describe('what the form does with the result', () => {
  it('lets a complete note be signed', () => {
    expect(canSign(validateNote(CORE, complete()))).toBe(true);
  });

  it('counts the two severities separately', () => {
    const p = validateNote(CORE, complete({ feedingTiming: 'AT_TIME' }));
    const c = countProblems(p);
    expect(c.blocking).toBeGreaterThan(0);
    // Collapsing the two into one total would make the blocking ones look
    // optional, which is the opposite of what they are.
    expect(c.blocking + c.advisory).toBe(p.length);
  });

  it('groups problems by section so each heading can show its own', () => {
    const grouped = bySection(validateNote(CORE, complete({ vtePlan: 'MECHANICAL' })));
    expect(Object.keys(grouped).length).toBeGreaterThan(0);
  });

  it('says nothing at all about an empty note beyond what is missing', () => {
    // Guards against the validator growing clinical opinions. Nothing here may
    // suggest a drug, a dose or a decision.
    const all = messages(validateNote(CORE, {}));
    expect(all).not.toMatch(/enoxaparin|heparin|should be given|recommend/i);
  });
});
