import { describe, it, expect } from 'vitest';

import { resolveAllowedModuleIds, isFullAccessRole, canAccessPath } from '../../src/lib/modules';
import { ONBOARDING_ROLES } from '../../src/lib/onboarding-roles';

// The clerical role, and the reason it exists.
//
// For two months the surgical residents did the booking, and said so at
// length. The cause turned out not to be policy: there was no clerical role in
// the system at all — no ward clerk, no departmental secretary, no booking
// officer — against 194 surgeon and 55 house-officer accounts. The people who
// had always done the booking had no way in, so it fell to the residents by
// default.
//
// These tests hold the two things that make the role useful: that it can reach
// the two screens the job needs, and that it cannot reach anything else.

const ROLE = 'BOOKING_OFFICER';

describe('BOOKING_OFFICER — what the clerical role can reach', () => {
  const modules = resolveAllowedModuleIds(ROLE);

  it('can register a patient and book a case', () => {
    expect(modules.has('patients')).toBe(true);
    expect(modules.has('surgeries')).toBe(true);
  });

  it('can actually open the pages the job is done on', () => {
    // Module ids are not enough on their own: the layout gates by PATH, and a
    // role that owns the 'surgeries' module but is refused
    // /dashboard/surgeries/new can see the list and not add to it.
    for (const path of [
      '/dashboard/patients',
      '/dashboard/patients/new',
      '/dashboard/surgeries',
      '/dashboard/surgeries/new',
    ]) {
      expect(canAccessPath(ROLE, [], path), path).toBe(true);
    }
  });

  it('can be chosen when signing up, with its own staff-code prefix', () => {
    const def = ONBOARDING_ROLES.find((r) => r.value === ROLE);
    expect(def, 'the role must appear in the onboarding dropdown').toBeTruthy();
    expect(def!.prefix).toBe('BKO');
    // Distinct prefixes are what keep generated staff codes from colliding.
    const prefixes = ONBOARDING_ROLES.map((r) => r.prefix);
    expect(prefixes.filter((p) => p === 'BKO')).toHaveLength(1);
  });
});

describe('BOOKING_OFFICER — what it must NOT reach', () => {
  const modules = resolveAllowedModuleIds(ROLE);

  it('is not a full-access role', () => {
    expect(isFullAccessRole(ROLE)).toBe(false);
  });

  it('is refused the pages it has no business on', () => {
    for (const path of ['/dashboard/pacu', '/dashboard/holding-area', '/dashboard/inventory']) {
      expect(canAccessPath(ROLE, [], path), path).toBe(false);
    }
  });

  it('cannot open the clinical and administrative modules', () => {
    // The point of a narrow role is that it can be handed out freely. The
    // moment it can reach everything, it stops being safe to give to a
    // department and becomes a general account by another name.
    for (const id of ['pacu', 'holding-area', 'inventory', 'imprest', 'users']) {
      expect(modules.has(id), `${id} must stay closed to a clerical account`).toBe(false);
    }
  });

  it('reaches fewer modules than a surgeon does', () => {
    const surgeon = resolveAllowedModuleIds('SURGEON');
    expect(modules.size).toBeLessThan(surgeon.size);
  });
});
