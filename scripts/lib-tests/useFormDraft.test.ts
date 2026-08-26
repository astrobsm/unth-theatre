import { describe, it, expect } from 'vitest';

import { isRestorable } from '../../src/lib/useFormDraft';

const NOW = new Date('2026-08-27T10:00:00Z').getTime();
const at = (iso: string) => ({ userId: 'nurse-a', savedAt: iso });

describe('whose draft is it', () => {
  it('gives a person back their own work', () => {
    expect(isRestorable(at('2026-08-27T09:55:00Z'), { userId: 'nurse-a', now: NOW })).toBe('restore');
  });

  it('NEVER hands one nurse another nurse\'s draft', () => {
    // Ten staff share eight handsets here — measured, not assumed. Somebody
    // else's half-finished assessment appearing under your name is not a
    // convenience, it is a patient-safety problem.
    expect(isRestorable(at('2026-08-27T09:55:00Z'), { userId: 'nurse-b', now: NOW })).toBe('wrong-user');
  });

  it('treats a signed-out draft and a signed-in user as different people', () => {
    expect(isRestorable({ userId: null, savedAt: '2026-08-27T09:55:00Z' }, { userId: 'nurse-a', now: NOW }))
      .toBe('wrong-user');
  });
});

describe('how old is too old', () => {
  it('resumes work from earlier in the same shift', () => {
    expect(isRestorable(at('2026-08-27T03:30:00Z'), { userId: 'nurse-a', now: NOW })).toBe('restore');
  });

  it('does not resurrect yesterday on a shared handset', () => {
    expect(isRestorable(at('2026-08-26T10:00:00Z'), { userId: 'nurse-a', now: NOW })).toBe('too-old');
  });

  it('honours a custom window', () => {
    const tenMinutesAgo = '2026-08-27T09:50:00Z';
    expect(isRestorable(at(tenMinutesAgo), { userId: 'nurse-a', now: NOW, maxAgeMs: 5 * 60_000 }))
      .toBe('too-old');
    expect(isRestorable(at(tenMinutesAgo), { userId: 'nurse-a', now: NOW, maxAgeMs: 30 * 60_000 }))
      .toBe('restore');
  });
});

describe('nothing to restore', () => {
  it('reports none rather than throwing', () => {
    expect(isRestorable(null, { userId: 'nurse-a', now: NOW })).toBe('none');
    expect(isRestorable(undefined, { userId: 'nurse-a', now: NOW })).toBe('none');
  });

  it('discards an unreadable timestamp instead of trusting it', () => {
    expect(isRestorable({ userId: 'nurse-a', savedAt: 'not-a-date' }, { userId: 'nurse-a', now: NOW }))
      .toBe('too-old');
  });
});
