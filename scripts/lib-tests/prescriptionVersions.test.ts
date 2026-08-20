/**
 * Amending an anaesthetic prescription.
 *
 * Two rules carry the clinical weight, and both are tested from the direction
 * that would actually go wrong: an amendment must not destroy what pharmacy
 * was originally asked for, and it must not carry a consultant's approval onto
 * drugs the consultant never saw.
 */
import { describe, expect, it } from 'vitest';

import {
  MIN_AMENDMENT_REASON,
  canAmend,
  checkAmendment,
  currentVersion,
  statusForAmendedVersion,
  versionLabel,
} from '../../src/lib/anaesthesia/prescriptionVersions';

const REASON = 'Rocuronium reduced to 30mg after the weight was corrected.';
const BY = { byId: 'anaes-1', byRole: 'ANAESTHETIST' };

describe('who may amend, and when', () => {
  it('allows an anaesthetist to amend an approved prescription', () => {
    const r = checkAmendment({ currentStatus: 'APPROVED', reason: REASON, ...BY });
    expect(r.ok).toBe(true);
  });

  it('refuses everybody outside the anaesthetic service', () => {
    // Including the pharmacist who has to pack it: spotting a problem is not
    // the same as being able to change the prescription.
    for (const role of ['PHARMACIST', 'SURGEON', 'THEATRE_MANAGER', 'ADMIN', 'SCRUB_NURSE']) {
      expect(canAmend(role), role).toBe(false);
      expect(checkAmendment({ currentStatus: 'APPROVED', reason: REASON, byId: 'u', byRole: role }).ok).toBe(false);
    }
  });

  it('refuses an amendment with no identified clinician', () => {
    expect(checkAmendment({ currentStatus: 'APPROVED', reason: REASON, byId: null, byRole: 'ANAESTHETIST' }).ok).toBe(false);
  });

  it('refuses a reason too short to tell pharmacy anything', () => {
    const r = checkAmendment({ currentStatus: 'APPROVED', reason: 'changed', ...BY });
    expect(r.ok).toBe(false);
    expect(r.problem).toContain(String(MIN_AMENDMENT_REASON));
  });
});

describe('prescriptions that cannot be amended', () => {
  it('refuses a settled prescription', () => {
    for (const s of ['REJECTED', 'CANCELLED', 'RECONCILED', 'RETURNED']) {
      expect(checkAmendment({ currentStatus: s, reason: REASON, ...BY }).ok, s).toBe(false);
    }
  });

  it('refuses amending one that has already been replaced', () => {
    // Amending a superseded row would fork the chain, leaving two live
    // versions and no way to say which pharmacy should pack.
    const r = checkAmendment({ currentStatus: 'SUPERSEDED', reason: REASON, ...BY });
    expect(r.ok).toBe(false);
    expect(r.problem).toContain('already been replaced');
  });
});

describe('when the drugs have already left the pharmacy', () => {
  it('still allows the amendment but flags that somebody must be told', () => {
    // A plan changes mid-list. The amendment is legitimate; discovering it
    // from a status badge is not good enough.
    for (const s of ['DISPENSED', 'COLLECTED', 'IN_USE']) {
      const r = checkAmendment({ currentStatus: s, reason: REASON, ...BY });
      expect(r.ok, s).toBe(true);
      expect(r.requiresPharmacyNotice, s).toBe(true);
    }
  });

  it('does not raise the notice for a prescription still on paper', () => {
    expect(checkAmendment({ currentStatus: 'PENDING_APPROVAL', reason: REASON, ...BY }).requiresPharmacyNotice).toBe(false);
  });
});

describe('an amendment never inherits approval', () => {
  it('sends a previously approved prescription back for approval', () => {
    // THE rule. A consultant approved a particular set of drugs and doses;
    // carrying that across to a changed set records a decision they never made
    // and is exactly the change nobody would notice.
    expect(statusForAmendedVersion('APPROVED')).toBe('PENDING_APPROVAL');
  });

  it('sends a packed or dispensed prescription back for approval too', () => {
    for (const s of ['PACKED', 'PARTIALLY_PACKED', 'DISPENSED', 'COLLECTED', 'IN_USE']) {
      expect(statusForAmendedVersion(s), s).toBe('PENDING_APPROVAL');
    }
  });

  it('leaves a draft as a draft', () => {
    // Nothing has been approved yet, so there is nothing to re-approve.
    expect(statusForAmendedVersion('DRAFT')).toBe('DRAFT');
  });
});

describe('which version is in force', () => {
  const chain = [
    { id: 'p1', version: 1, status: 'SUPERSEDED' },
    { id: 'p2', version: 2, status: 'SUPERSEDED' },
    { id: 'p3', version: 3, status: 'PENDING_APPROVAL' },
  ];

  it('is the highest version still standing', () => {
    expect(currentVersion(chain)?.id).toBe('p3');
  });

  it('resolves by status rather than by taking the largest number', () => {
    // A chain interrupted by a cancelled amendment must still resolve to
    // something true. Version 3 was replaced; 4 was then cancelled, so the
    // prescription in force is neither the newest row nor the highest number.
    const interrupted = [
      { id: 'p1', version: 1, status: 'SUPERSEDED' },
      { id: 'p2', version: 2, status: 'APPROVED' },
    ];
    expect(currentVersion(interrupted)?.id).toBe('p2');
  });

  it('has no answer when every version has been replaced', () => {
    expect(currentVersion([{ id: 'p1', version: 1, status: 'SUPERSEDED' }])).toBe(null);
  });

  it('tells pharmacy plainly not to pack a superseded one', () => {
    expect(versionLabel({ id: 'p1', version: 1, status: 'SUPERSEDED' }, 3))
      .toContain('no longer to be packed');
    expect(versionLabel({ id: 'p3', version: 3, status: 'APPROVED' }, 3))
      .toBe('Version 3 of 3 — current');
  });
});
