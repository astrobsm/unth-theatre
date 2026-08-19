import { describe, it, expect } from 'vitest';
import { resolveBooker, NOT_RECORDED } from '../../src/lib/surgery/booker';

// The bug these guard: the booker was read from the surgery's consumable
// request rows, so a case with no consumable pack reported no booker — on a
// card whose entire purpose is naming somebody who can fix a missing pack.
// 266 of 592 cases on the theatre server read "Booked by: Unknown", and the
// cases most in need of the name were exactly the ones that never had it.

const user = { fullName: 'Dr Chidi Okeke', phoneNumber: '08030000001' };

describe('resolveBooker — the case that used to fail', () => {
  it('names the booker when the case has NO consumable rows at all', () => {
    // The screenshot: "Consumable: Not prescribed" beside "Booked by: Unknown".
    const r = resolveBooker({ bookedById: 'u1', bookedByName: 'Dr Chidi Okeke', user, packRow: null });
    expect(r.name).toBe('Dr Chidi Okeke');
    expect(r.phone).toBe('08030000001');
    expect(r.source).toBe('user');
  });

  it('still names the booker when the user row is absent on this node', () => {
    // The cloud holding a surgery whose booker account has not replicated.
    // Before, this produced "Unknown"; the stored name has to carry it.
    const r = resolveBooker({ bookedById: 'u1', bookedByName: 'Dr Chidi Okeke', user: null, packRow: null });
    expect(r.name).toBe('Dr Chidi Okeke');
    expect(r.phone).toBeNull();
    expect(r.source).toBe('snapshot');
  });
});

describe('resolveBooker — order of preference', () => {
  it('prefers the live user record over the snapshot, so a renamed account is current', () => {
    const r = resolveBooker({ bookedById: 'u1', bookedByName: 'Dr C. Okeke (old)', user, packRow: null });
    expect(r.name).toBe('Dr Chidi Okeke');
  });

  it('prefers the surgery over the pack rows', () => {
    const r = resolveBooker({
      bookedById: 'u1', bookedByName: 'Dr Chidi Okeke', user: null,
      packRow: { requestedBy: { fullName: 'Someone Else', phoneNumber: '08030000009' }, requestedByName: null },
    });
    expect(r.name).toBe('Dr Chidi Okeke');
    expect(r.source).toBe('snapshot');
  });

  it('falls back to the pack rows for a case booked before the column existed', () => {
    const r = resolveBooker({
      bookedById: null, bookedByName: null, user: null,
      packRow: { requestedBy: { fullName: 'Dr Ada Nwosu', phoneNumber: '08030000002' }, requestedByName: null },
    });
    expect(r.name).toBe('Dr Ada Nwosu');
    expect(r.phone).toBe('08030000002');
    expect(r.source).toBe('pack-rows');
  });

  it('uses the pack row free-text name when its user row is gone', () => {
    const r = resolveBooker({
      bookedById: null, bookedByName: null, user: null,
      packRow: { requestedBy: null, requestedByName: 'Dr Ada Nwosu' },
    });
    expect(r.name).toBe('Dr Ada Nwosu');
    expect(r.phone).toBeNull();
    expect(r.source).toBe('pack-rows');
  });
});

describe('resolveBooker — saying nothing is recorded', () => {
  it('reports NOT RECORDED rather than Unknown when every source is empty', () => {
    // 29 cases from June/July 2026, mostly emergencies, predating both the
    // audit log and the pack-row requester. "Unknown" implies the person cannot
    // be identified; the truth is that nobody wrote it down.
    const r = resolveBooker({ bookedById: null, bookedByName: null, user: null, packRow: null });
    expect(r.name).toBe(NOT_RECORDED);
    expect(r.phone).toBeNull();
    expect(r.source).toBe('none');
  });

  it('treats a blank or whitespace-only name as absent', () => {
    // requestedByName is nullable and was written as `fullName || name || null`,
    // so an account with an empty full name stored '' rather than NULL.
    const r = resolveBooker({ bookedById: null, bookedByName: '   ', user: null, packRow: { requestedBy: null, requestedByName: '' } });
    expect(r.name).toBe(NOT_RECORDED);
    expect(r.source).toBe('none');
  });

  it('does not discard a usable phone number when the user row has no name', () => {
    const r = resolveBooker({
      bookedById: 'u1', bookedByName: 'Dr Chidi Okeke',
      user: { fullName: null, phoneNumber: '08030000001' }, packRow: null,
    });
    expect(r.name).toBe('Dr Chidi Okeke');
    expect(r.phone).toBe('08030000001');
    expect(r.source).toBe('user');
  });

  it('never returns an empty name, whatever it is given', () => {
    const r = resolveBooker({
      bookedById: 'u1', bookedByName: '  ',
      user: { fullName: '  ', phoneNumber: '  ' }, packRow: null,
    });
    expect(r.name).toBe(NOT_RECORDED);
  });
});
