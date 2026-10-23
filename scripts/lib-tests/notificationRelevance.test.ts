import { describe, it, expect } from 'vitest';
import {
  relevantCaseFilter,
  withRelevance,
  hasOversight,
  OVERSIGHT_ROLES,
} from '../../src/lib/notifications/relevance';

// The bug this guards: the alert panel showed every case in the hospital to
// every member of staff — 23 items, none of them theirs. The danger in
// fixing it is the opposite error, hiding a case from someone who IS on it,
// which is silent and clinical rather than merely annoying.

const scrub = { id: 'u1', role: 'SCRUB_NURSE', department: 'Orthopaedics' };

describe('who sees everything', () => {
  it('does not narrow for the theatre manager', () => {
    expect(relevantCaseFilter({ id: 'm1', role: 'THEATRE_MANAGER' })).toBeNull();
  });

  it('keeps the oversight list short', () => {
    // Every role added here gets the 23-item panel back for that group.
    expect(OVERSIGHT_ROLES.length).toBeLessThanOrEqual(6);
  });

  it('does not treat a head of department as oversight', () => {
    // They are on their own unit's cases via `department`; that is enough.
    expect(hasOversight('HEAD_OF_SURGERY')).toBe(false);
    expect(hasOversight('CONSULTANT_SURGEON')).toBe(false);
  });

  it('treats an unknown or missing role as ordinary staff', () => {
    // Failing open here would restore the bug for anyone whose role was
    // renamed, and do it silently.
    expect(hasOversight(null)).toBe(false);
    expect(hasOversight(undefined)).toBe(false);
    expect(hasOversight('')).toBe(false);
    expect(hasOversight('SOME_NEW_ROLE')).toBe(false);
  });
});

describe('what counts as my case', () => {
  const branches = (v: Parameters<typeof relevantCaseFilter>[0]) =>
    JSON.stringify(relevantCaseFilter(v));

  it('includes every way a person can be named on a case', () => {
    const f = branches(scrub);
    for (const field of [
      'surgeonId',
      'assistantSurgeonId',
      'anesthetistId',
      'scrubNurseId',
      'theatreTechnicianId',
      'teamMembers',
    ]) {
      expect(f, `${field} is not covered`).toContain(field);
    }
  });

  it('includes the rest of my own unit', () => {
    expect(branches(scrub)).toContain('Orthopaedics');
  });

  it('ignores a blank department rather than matching every blank case', () => {
    for (const department of [undefined, null, '', '   ']) {
      const f = relevantCaseFilter({ id: 'u1', role: 'PORTER', department }) as any;
      expect(f.OR.some((c: any) => 'unit' in c), `department ${JSON.stringify(department)} leaked`).toBe(false);
    }
  });
});

describe('merging into an existing query', () => {
  it('ANDs rather than spreading, so an existing OR is not replaced', () => {
    // A second OR key would silently overwrite the first and WIDEN the query —
    // which looks exactly like the bug being fixed, so it would not be noticed.
    const where = { OR: [{ status: 'SCHEDULED' }, { status: 'READY_FOR_THEATRE' }] };
    const merged = withRelevance(where, scrub) as any;
    expect(merged.AND).toHaveLength(2);
    expect(merged.AND[0]).toEqual(where);
    expect(merged.OR).toBeUndefined();
  });

  it('leaves the query untouched for oversight roles', () => {
    const where = { status: 'SCHEDULED' };
    expect(withRelevance(where, { id: 'm1', role: 'ADMIN' })).toBe(where);
  });

  it('never returns a filter that matches nothing', () => {
    // Returning {} or { OR: [] } would show an empty panel, and an empty
    // panel reads as "no alerts" rather than as a bug.
    const f = relevantCaseFilter({ id: 'u1', role: 'PORTER' }) as any;
    expect(Array.isArray(f.OR)).toBe(true);
    expect(f.OR.length).toBeGreaterThan(0);
  });
});
