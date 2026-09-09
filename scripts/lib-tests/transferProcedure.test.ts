import { describe, it, expect } from 'vitest';
import { transferProcedure, escortLabel, type TransferInputs } from '../../src/lib/pacu/transferProcedure';

const base = (over: Partial<TransferInputs> = {}): TransferInputs => ({
  redAlertEverTriggered: false,
  redAlertStillOpen: false,
  aldreteTotalScore: 10,
  oxygenTherapy: false,
  airwayStatus: 'PATENT',
  consciousnessLevel: 'AWAKE',
  drainsPresent: false,
  catheterInSitu: false,
  destination: 'Surgical ward 3',
  ...over,
});

describe('the ordinary patient', () => {
  it('goes with porters and needs no named nurse', () => {
    const p = transferProcedure(base());
    expect(p.escort).toBe('PORTERS');
    expect(p.requiresNamedNurse).toBe(false);
    expect(p.blocked).toBe(false);
  });

  it('still takes the notes and the slip', () => {
    expect(transferProcedure(base()).takeWith.join(' ')).toMatch(/transfer slip/i);
  });

  it('is still checked by name and folder number before moving', () => {
    expect(transferProcedure(base()).before.join(' ')).toMatch(/folder number/i);
  });
});

describe('a patient who set off a red alert', () => {
  it('travels with a nurse, not porters alone', () => {
    // The whole point of this module. They ARE fit to leave — the criteria and
    // the latest observations say so — and they are also the patient most
    // likely to deteriorate again in a lift.
    const p = transferProcedure(base({ redAlertEverTriggered: true }));
    expect(p.escort).toBe('NURSE_ESCORT');
    expect(p.requiresNamedNurse).toBe(true);
  });

  it('says why, in words a nurse would actually use', () => {
    const p = transferProcedure(base({ redAlertEverTriggered: true }));
    expect(p.reasons.join(' ')).toMatch(/deteriorate again/i);
  });

  it('sends the stabilisation note with the patient', () => {
    const p = transferProcedure(base({ redAlertEverTriggered: true }));
    expect(p.takeWith.join(' ')).toMatch(/stabilisation note/i);
  });

  it('has the ward telephoned before the patient leaves', () => {
    const p = transferProcedure(base({ redAlertEverTriggered: true }));
    expect(p.before.join(' ')).toMatch(/telephone the receiving ward/i);
  });
});

describe('a red alert nobody closed', () => {
  it('blocks the transfer outright', () => {
    // An open alert means nobody recorded how the patient was stabilised. That
    // is not a transfer decision, it is a reason not to go.
    const p = transferProcedure(base({ redAlertEverTriggered: true, redAlertStillOpen: true }));
    expect(p.blocked).toBe(true);
    expect(p.blockedReason).toMatch(/still open/i);
  });

  it('says what would unblock it', () => {
    const p = transferProcedure(base({ redAlertStillOpen: true }));
    expect(p.blockedReason).toMatch(/stabilised|resolve/i);
  });
});

describe('conditions that raise the escort on their own', () => {
  it('raises it for a low Aldrete score', () => {
    expect(transferProcedure(base({ aldreteTotalScore: 7 })).escort).toBe('NURSE_ESCORT');
    expect(transferProcedure(base({ aldreteTotalScore: 9 })).escort).toBe('PORTERS');
  });

  it('raises it for oxygen, and sends a checked cylinder', () => {
    const p = transferProcedure(base({ oxygenTherapy: true }));
    expect(p.escort).toBe('NURSE_ESCORT');
    expect(p.takeWith.join(' ')).toMatch(/portable oxygen/i);
    expect(p.before.join(' ')).toMatch(/cylinder/i);
  });

  it('raises it to a clinical escort for an unprotected airway', () => {
    const p = transferProcedure(base({ airwayStatus: 'OBSTRUCTED' }));
    expect(p.escort).toBe('CLINICAL_ESCORT');
    expect(p.takeWith.join(' ')).toMatch(/self-inflating bag/i);
  });

  it('raises it for a patient who is not fully awake', () => {
    expect(transferProcedure(base({ consciousnessLevel: 'DROWSY' })).escort).toBe('NURSE_ESCORT');
  });

  it('raises it to a clinical escort when the destination is critical care', () => {
    expect(transferProcedure(base({ destination: 'ICU' })).escort).toBe('CLINICAL_ESCORT');
    expect(transferProcedure(base({ destination: 'HDU bed 2' })).escort).toBe('CLINICAL_ESCORT');
  });

  it('does not raise it for an ordinary ward name that merely contains letters', () => {
    expect(transferProcedure(base({ destination: 'Surgical ward 3' })).escort).toBe('PORTERS');
  });
});

describe('conditions combining', () => {
  it('takes the highest escort any single condition demands', () => {
    // A patient can be both on oxygen and post-red-alert. A rule that picked
    // one reason would hand the nurse half the picture.
    const p = transferProcedure(base({
      redAlertEverTriggered: true, oxygenTherapy: true, airwayStatus: 'PARTIAL',
    }));
    expect(p.escort).toBe('CLINICAL_ESCORT');
  });

  it('keeps every reason, not just the one that won', () => {
    const p = transferProcedure(base({
      redAlertEverTriggered: true, oxygenTherapy: true, aldreteTotalScore: 6,
    }));
    expect(p.reasons.length).toBeGreaterThanOrEqual(3);
    expect(p.reasons.join(' ')).toMatch(/oxygen/i);
    expect(p.reasons.join(' ')).toMatch(/Aldrete/i);
  });

  it('adds drain and catheter steps without changing the escort', () => {
    const p = transferProcedure(base({ drainsPresent: true, catheterInSitu: true }));
    expect(p.escort).toBe('PORTERS');
    expect(p.takeWith.join(' ')).toMatch(/drain secured/i);
    expect(p.takeWith.join(' ')).toMatch(/catheter bag/i);
  });
});

describe('missing data', () => {
  it('does not invent a reason from an absent Aldrete score', () => {
    expect(transferProcedure(base({ aldreteTotalScore: null })).escort).toBe('PORTERS');
  });

  it('tolerates absent airway and consciousness', () => {
    const p = transferProcedure(base({ airwayStatus: null, consciousnessLevel: null }));
    expect(p.escort).toBe('PORTERS');
    expect(p.blocked).toBe(false);
  });
});

describe('how the level reads', () => {
  it('is stated in full on the slip', () => {
    expect(escortLabel('PORTERS')).toMatch(/porter/i);
    expect(escortLabel('NURSE_ESCORT')).toMatch(/nurse/i);
    expect(escortLabel('CLINICAL_ESCORT')).toMatch(/anaesthetist/i);
  });
});
