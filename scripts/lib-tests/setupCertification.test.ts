/**
 * Certifying a theatre ready.
 *
 * The assertion "this theatre is ready" is made to a surgical team who will
 * act on it without going to look. These tests guard the two directions that
 * matter: it must not be possible to certify a theatre without genuinely
 * asserting it, and it must not be harder to say a theatre is NOT ready than
 * to say it is — because if it is, the only route that works is the false one.
 */
import { describe, expect, it } from 'vitest';

import {
  MIN_DEFICIENCY_LENGTH,
  SETUP_CHECKS,
  SETUP_DECLARATION_BODY,
  SETUP_DECLARATION_VERSION,
  canCertifyReady,
  canDeclareNotReady,
  outstandingChecks,
  setupProgress,
  type SetupChecks,
} from '../../src/lib/theatreOps/setupCertification';

const allChecked = (): SetupChecks =>
  Object.fromEntries(SETUP_CHECKS.map((c) => [c.key, true])) as SetupChecks;

const CERTIFYING = {
  technicianId: 'tech-1',
  declarationAcknowledged: true,
  declarationVersion: SETUP_DECLARATION_VERSION,
};

describe('certifying a theatre ready', () => {
  it('accepts a complete, acknowledged, attributed certification', () => {
    const r = canCertifyReady({ checks: allChecked(), ...CERTIFYING });
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
  });

  it('refuses while any check is outstanding, and names them', () => {
    const checks = allChecked();
    delete checks.suctionChecked;
    delete checks.monitorsChecked;
    const r = canCertifyReady({ checks, ...CERTIFYING });
    expect(r.ok).toBe(false);
    expect(r.outstanding).toEqual(['Suction', 'Monitoring equipment']);
    expect(r.problems[0]).toContain('Suction');
  });

  it('reports everything wrong at once', () => {
    // A form that reveals one problem at a time is how certification takes
    // four attempts at seven in the morning.
    const r = canCertifyReady({ checks: {}, technicianId: null, declarationAcknowledged: false });
    expect(r.problems.length).toBeGreaterThan(2);
  });
});

describe('the declaration is evidence, not decoration', () => {
  it('refuses certification when it was not acknowledged', () => {
    const r = canCertifyReady({ checks: allChecked(), technicianId: 'tech-1', declarationAcknowledged: false });
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain('compliance declaration');
  });

  it('refuses an acknowledgement that records no wording', () => {
    // An acknowledgement with no version attached proves nothing later, which
    // is the entire reason for recording it. If the text is revised there is
    // otherwise no way to say what the person agreed to.
    const r = canCertifyReady({
      checks: allChecked(), technicianId: 'tech-1',
      declarationAcknowledged: true, declarationVersion: null,
    });
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain('which declaration');
  });

  it('refuses certification by nobody', () => {
    const r = canCertifyReady({ checks: allChecked(), technicianId: null, declarationAcknowledged: true, declarationVersion: SETUP_DECLARATION_VERSION });
    expect(r.ok).toBe(false);
  });

  it('does not claim a statutory basis it has not established', () => {
    // Section 20: firm and professional, but an overstated legal claim is one
    // a person dismisses entirely the moment they notice it is wrong.
    const text = SETUP_DECLARATION_BODY.join(' ');
    expect(text).toContain('applicable hospital policy and applicable law');
    expect(text.toLowerCase()).not.toContain('criminal offence');
    expect(text.toLowerCase()).not.toContain('prosecut');
  });
});

describe('saying a theatre is NOT ready', () => {
  it('does not require the checklist to be finished first', () => {
    // THE rule. Requiring the checks to be complete before somebody may admit
    // they cannot be completed would leave only the false answer working.
    const r = canDeclareNotReady({
      technicianId: 'tech-1',
      deficiency: 'Ventilator fails self-test; biomedical engineering called at 06:40.',
    });
    expect(r.ok).toBe(true);
  });

  it('requires a specific deficiency, not just "not ready"', () => {
    // The anaesthetist needs to know whether the case can move to another room
    // or must wait for an engineer.
    const r = canDeclareNotReady({ technicianId: 'tech-1', deficiency: 'not ready' });
    expect(r.ok).toBe(false);
    expect(r.problem).toContain(String(MIN_DEFICIENCY_LENGTH));
  });

  it('requires the reporting technician to be identified', () => {
    const r = canDeclareNotReady({
      technicianId: null,
      deficiency: 'Ventilator fails self-test; biomedical engineering called.',
    });
    expect(r.ok).toBe(false);
  });
});

describe('the status table', () => {
  it('counts progress through the checklist', () => {
    const checks: SetupChecks = { anesthesiaMachineChecked: true, suctionChecked: true };
    const p = setupProgress(checks);
    expect(p.done).toBe(2);
    expect(p.total).toBe(SETUP_CHECKS.length);
    expect(p.percent).toBe(Math.round((2 / SETUP_CHECKS.length) * 100));
  });

  it('lists nothing outstanding once everything is ticked', () => {
    expect(outstandingChecks(allChecked())).toEqual([]);
  });
});
