import { describe, it, expect } from 'vitest';
import {
  classifyAnaesthetistAssignment,
  assignmentWarning,
  isOnCallRow,
} from '../../src/lib/anaesthetistAssignment';

// The 27 August case: the next day's elective anaesthetic roster had not been
// published, so every one of fifteen cases fell through to the single person
// rostered — the emergency on-call consultant — and was displayed exactly like
// a real assignment.

const CALL = { userId: 'oncall', shift: 'CALL', subRole: 'ALL EMERGENCIES (on-call)' };
const EYE = { userId: 'eye-cons', shift: 'MORNING', subRole: 'Ophthalmology' };
const GS = { userId: 'gs-cons', shift: 'MORNING', subRole: 'General Surgery' };

describe('isOnCallRow', () => {
  it('recognises a CALL shift', () => {
    expect(isOnCallRow({ userId: 'x', shift: 'CALL', subRole: 'Orthopaedics' })).toBe(true);
  });

  it('recognises the wording the rosters actually use', () => {
    expect(isOnCallRow({ userId: 'x', shift: 'MORNING', subRole: 'ALL EMERGENCIES (on-call)' })).toBe(true);
    expect(isOnCallRow({ userId: 'x', shift: 'MORNING', subRole: 'on call' })).toBe(true);
    expect(isOnCallRow({ userId: 'x', shift: 'MORNING', subRole: 'On-Call cover' })).toBe(true);
  });

  it('does not mistake an ordinary specialty for on-call', () => {
    expect(isOnCallRow(EYE)).toBe(false);
    expect(isOnCallRow(GS)).toBe(false);
  });
});

describe('classifyAnaesthetistAssignment', () => {
  it('reports none when nobody is on the case', () => {
    expect(classifyAnaesthetistAssignment({
      anaesthetistId: null, subspecialty: 'Ophthalmology', rosterRows: [CALL, EYE],
    })).toBe('none');
  });

  it('recognises a proper subspecialty assignment', () => {
    expect(classifyAnaesthetistAssignment({
      anaesthetistId: 'eye-cons', subspecialty: 'Ophthalmology', rosterRows: [CALL, EYE],
    })).toBe('subspecialty');
  });

  it('matches the specialty case-insensitively and ignoring stray spacing', () => {
    expect(classifyAnaesthetistAssignment({
      anaesthetistId: 'eye-cons', subspecialty: '  ophthalmology ', rosterRows: [EYE],
    })).toBe('subspecialty');
  });

  // The exact shape of the 27 August fault.
  it('calls out the on-call consultant standing in for an elective specialty', () => {
    expect(classifyAnaesthetistAssignment({
      anaesthetistId: 'oncall', subspecialty: 'Ophthalmology', rosterRows: [CALL],
    })).toBe('on-call');
  });

  it('distinguishes somebody rostered to a different specialty', () => {
    expect(classifyAnaesthetistAssignment({
      anaesthetistId: 'gs-cons', subspecialty: 'Ophthalmology', rosterRows: [GS, EYE],
    })).toBe('other-specialty');
  });

  it('flags a name that is not on the published roster at all', () => {
    expect(classifyAnaesthetistAssignment({
      anaesthetistId: 'stranger', subspecialty: 'Ophthalmology', rosterRows: [CALL, EYE],
    })).toBe('unrostered');
  });

  // Muoghalu was rostered MORNING consultant for Paediatric Surgery AND was the
  // day's on-call consultant. On the paediatric case his name was correct, and
  // must not be reported as a fallback just because he also holds the bleep.
  it('prefers the specialty match when the same person is also on call', () => {
    const rows = [
      { userId: 'dual', shift: 'CALL', subRole: 'ALL EMERGENCIES (on-call)' },
      { userId: 'dual', shift: 'MORNING', subRole: 'Paediatric Surgery' },
    ];
    expect(classifyAnaesthetistAssignment({
      anaesthetistId: 'dual', subspecialty: 'Paediatric Surgery', rosterRows: rows,
    })).toBe('subspecialty');
    // ...and is still only on-call cover for a specialty he does not hold.
    expect(classifyAnaesthetistAssignment({
      anaesthetistId: 'dual', subspecialty: 'Ophthalmology', rosterRows: rows,
    })).toBe('on-call');
  });

  it('treats a case with no specialty recorded as unmatched', () => {
    expect(classifyAnaesthetistAssignment({
      anaesthetistId: 'oncall', subspecialty: null, rosterRows: [CALL],
    })).toBe('on-call');
  });
});

describe('assignmentWarning', () => {
  it('names the specialty that is uncovered, so it can be fixed', () => {
    expect(assignmentWarning('on-call', 'Ophthalmology'))
      .toBe('On-call cover — no anaesthetist rostered for Ophthalmology');
  });

  it('says nothing when the assignment is genuine', () => {
    expect(assignmentWarning('subspecialty', 'Ophthalmology')).toBeNull();
    expect(assignmentWarning('none', 'Ophthalmology')).toBeNull();
  });

  it('warns about the other two mismatches', () => {
    expect(assignmentWarning('other-specialty', 'Ophthalmology')).toMatch(/not covering/);
    expect(assignmentWarning('unrostered', 'Ophthalmology')).toMatch(/not on the published roster/i);
  });

  it('copes with no specialty recorded', () => {
    expect(assignmentWarning('on-call', null)).toBe('On-call cover — no anaesthetist rostered');
  });
});
