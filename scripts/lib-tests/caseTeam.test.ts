import { describe, it, expect } from 'vitest';

import { caseTeamSlots, type CaseTeamSource } from '../../src/lib/theatreOps/caseTeam';

// This decides who the theatre expects and therefore who is chased when a case
// is late. It is shared by the check-in board and Theatre Readiness, so a
// change here moves both — which is the point of it being one function.

const base: CaseTeamSource = {
  surgeonId: null, surgeonName: null, surgeon: null,
  assistantSurgeonId: null, assistantSurgeon: null,
  anesthetistId: null, anesthetist: null,
  scrubNurseId: null, theatreTechnicianId: null,
  supervisingConsultantId: null, supervisingConsultantName: null,
  teamMembers: [],
};

describe('who is on the case', () => {
  it('reads the named slots in theatre order', () => {
    const slots = caseTeamSlots({
      ...base,
      surgeonId: 'u1', surgeon: { fullName: 'Dr Okafor' },
      anesthetistId: 'u2', anesthetist: { fullName: 'Dr Eze' },
      scrubNurseId: 'u3',
    });
    expect(slots.map((s) => s.roleOnCase)).toEqual(['Surgeon', 'Anaesthetist', 'Scrub Nurse']);
    expect(slots[0].name).toBe('Dr Okafor');
  });

  it('falls back to the free-text surgeon name when there is no user record', () => {
    const slots = caseTeamSlots({ ...base, surgeonId: 'u1', surgeonName: 'Dr Visiting' });
    expect(slots[0].name).toBe('Dr Visiting');
  });

  it('humanises team member roles', () => {
    const slots = caseTeamSlots({
      ...base,
      teamMembers: [{ userId: 'u9', memberName: 'N. Adaeze', role: 'CIRCULATING_NURSE' }],
    });
    expect(slots[0].roleOnCase).toBe('Circulating Nurse');
  });
});

describe('one person is one person', () => {
  it('counts a surgeon who is also the supervising consultant once', () => {
    // Counting them twice makes a fully-present team read as half-answered.
    const slots = caseTeamSlots({
      ...base,
      surgeonId: 'u1', surgeon: { fullName: 'Dr Okafor' },
      supervisingConsultantId: 'u1', supervisingConsultantName: 'Dr Okafor',
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].roleOnCase).toBe('Surgeon');
  });

  it('keeps the FIRST role, which is the more senior reading', () => {
    const slots = caseTeamSlots({
      ...base,
      surgeonId: 'u1',
      teamMembers: [{ userId: 'u1', memberName: 'Dr Okafor', role: 'ASSISTANT' }],
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].roleOnCase).toBe('Surgeon');
  });

  it('deduplicates repeated team member rows', () => {
    const slots = caseTeamSlots({
      ...base,
      teamMembers: [
        { userId: 'u5', memberName: 'N. Chidi', role: 'SCRUB_NURSE' },
        { userId: 'u5', memberName: 'N. Chidi', role: 'CIRCULATING_NURSE' },
      ],
    });
    expect(slots).toHaveLength(1);
  });
});

describe('people with nobody to ask are left out', () => {
  it('drops slots with no userId', () => {
    // A name typed as free text cannot check in, and counting them as
    // "not responded" would make the case permanently incomplete.
    const slots = caseTeamSlots({
      ...base,
      surgeonName: 'Dr Nobody',
      teamMembers: [{ userId: null, memberName: 'Someone', role: 'OBSERVER' }],
    });
    expect(slots).toEqual([]);
  });

  it('an empty case has an empty team, not a crash', () => {
    expect(caseTeamSlots(base)).toEqual([]);
  });
});
