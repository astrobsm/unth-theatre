import { describe, it, expect } from 'vitest';
import {
  checkSendAllowed, renderTemplate, idempotencyKeyFor, defaultChannelsFor, isExternal,
} from '../../src/lib/comms/policy';

// These rules decide what leaves the hospital and reaches a personal phone, so
// the tests are mostly about the ways something could escape that should not.

const base = {
  channel: 'IN_APP' as const,
  sensitivity: 'OPERATIONAL' as const,
  recipientIsStaff: true,
};

describe('kill switch', () => {
  it('stops everything, before any other rule is considered', () => {
    const r = checkSendAllowed({ ...base, killSwitch: { all: true } });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/disabled/i);
  });

  it('stops one channel and leaves the others', () => {
    expect(checkSendAllowed({
      ...base, channel: 'WHATSAPP', recipientAddress: '2348012345678',
      killSwitch: { channels: ['WHATSAPP'] },
    }).allowed).toBe(false);

    expect(checkSendAllowed({ ...base, killSwitch: { channels: ['WHATSAPP'] } }).allowed).toBe(true);
  });

  it('outranks an otherwise perfectly valid message', () => {
    // The switch exists to stop a runaway loop; anything evaluated ahead of it
    // is a way for the loop to continue.
    const r = checkSendAllowed({
      ...base, channel: 'EMAIL', recipientAddress: 'a@b.com', killSwitch: { all: true },
    });
    expect(r.allowed).toBe(false);
  });
});

describe('sensitivity', () => {
  it('never lets clinical detail onto an external channel', () => {
    for (const channel of ['EMAIL', 'WHATSAPP', 'SMS'] as const) {
      const r = checkSendAllowed({
        ...base, channel, sensitivity: 'CLINICAL', recipientAddress: 'x@y.com',
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(/Clinical detail/);
    }
  });

  it('allows clinical detail in-app, where it sits behind authentication', () => {
    expect(checkSendAllowed({ ...base, sensitivity: 'CLINICAL' }).allowed).toBe(true);
  });

  it('lets a patient name reach staff externally', () => {
    // A surgeon on WhatsApp already knows whose case it is.
    expect(checkSendAllowed({
      ...base, channel: 'WHATSAPP', sensitivity: 'PATIENT_IDENTIFIED',
      recipientIsStaff: true, recipientAddress: '2348012345678',
    }).allowed).toBe(true);
  });

  it('refuses a patient name to a non-staff recipient', () => {
    // A vendor chasing a consumable delivery has no reason to know who the
    // operation is for.
    const r = checkSendAllowed({
      ...base, channel: 'WHATSAPP', sensitivity: 'PATIENT_IDENTIFIED',
      recipientIsStaff: false, recipientAddress: '2348012345678',
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/not staff/);
  });

  it('lets operational messages go anywhere', () => {
    expect(checkSendAllowed({
      ...base, channel: 'WHATSAPP', recipientIsStaff: false, recipientAddress: '2348012345678',
    }).allowed).toBe(true);
  });
});

describe('expiry', () => {
  const now = new Date('2026-08-13T10:00:00Z');

  it('refuses a message whose moment has passed, and marks it expired', () => {
    // A reminder for a case that already started erodes trust in every other
    // alert, so it is withheld rather than sent late.
    const r = checkSendAllowed({
      ...base, expiresAt: new Date('2026-08-13T09:00:00Z'), now,
    });
    expect(r.allowed).toBe(false);
    expect(r.expired).toBe(true);
  });

  it('allows one that has not expired', () => {
    expect(checkSendAllowed({
      ...base, expiresAt: new Date('2026-08-13T11:00:00Z'), now,
    }).allowed).toBe(true);
  });

  it('treats the exact expiry moment as expired', () => {
    expect(checkSendAllowed({ ...base, expiresAt: now, now }).expired).toBe(true);
  });
});

describe('addresses and provider approval', () => {
  it('refuses an external channel with no address', () => {
    expect(checkSendAllowed({ ...base, channel: 'EMAIL' }).allowed).toBe(false);
    expect(checkSendAllowed({ ...base, channel: 'EMAIL', recipientAddress: '   ' }).allowed).toBe(false);
  });

  it('does not require an address for in-app', () => {
    expect(checkSendAllowed({ ...base, channel: 'IN_APP' }).allowed).toBe(true);
  });

  it('refuses an unapproved WhatsApp template with a reason a person can act on', () => {
    // The provider would refuse it anyway; this turns a provider error nobody
    // reads into a sentence somebody can fix.
    const r = checkSendAllowed({
      ...base, channel: 'WHATSAPP', recipientAddress: '2348012345678', providerApproved: false,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/not been approved/);
  });
});

describe('isExternal', () => {
  it('counts email, WhatsApp and SMS as leaving the hospital', () => {
    expect(isExternal('EMAIL')).toBe(true);
    expect(isExternal('WHATSAPP')).toBe(true);
    expect(isExternal('SMS')).toBe(true);
  });

  it('counts in-app, push and radio as internal', () => {
    expect(isExternal('IN_APP')).toBe(false);
    expect(isExternal('PUSH')).toBe(false);
    expect(isExternal('RADIO')).toBe(false);
  });
});

describe('renderTemplate', () => {
  it('fills variables', () => {
    const r = renderTemplate('Theatre {{theatreName}} at {{time}}.', { theatreName: '2', time: '08:00' });
    expect(r.body).toBe('Theatre 2 at 08:00.');
    expect(r.missing).toEqual([]);
  });

  it('leaves a missing variable VISIBLE rather than blank', () => {
    // "Theatre  is not ready" reads as a system fault and gets ignored;
    // "Theatre {{theatreName}} is not ready" is obviously broken and gets fixed.
    const r = renderTemplate('Theatre {{theatreName}} is not ready.', {});
    expect(r.body).toContain('{{theatreName}}');
    expect(r.missing).toEqual(['theatreName']);
  });

  it('treats an empty string as missing', () => {
    expect(renderTemplate('Hello {{name}}', { name: '' }).missing).toEqual(['name']);
  });

  it('reports each missing variable once', () => {
    const r = renderTemplate('{{a}} then {{a}} then {{b}}', {});
    expect(r.missing).toEqual(['a', 'b']);
  });

  it('tolerates whitespace inside the braces', () => {
    expect(renderTemplate('Hi {{ name }}', { name: 'Ada' }).body).toBe('Hi Ada');
  });

  it('accepts numbers', () => {
    expect(renderTemplate('{{n}} cases', { n: 3 }).body).toBe('3 cases');
  });
});

describe('idempotencyKeyFor', () => {
  const parts = {
    trigger: 'THEATRE_SETUP_OVERDUE', ruleId: 'r1',
    recipient: 'u1', channel: 'IN_APP' as const, scope: '2026-08-13:theatre-2',
  };

  it('is the same for the same message', () => {
    // An offline replay, a cron re-run and a sync must all produce one key, so
    // the unique index can do the rest.
    expect(idempotencyKeyFor(parts)).toBe(idempotencyKeyFor({ ...parts }));
  });

  it('differs by recipient, channel and day', () => {
    expect(idempotencyKeyFor({ ...parts, recipient: 'u2' })).not.toBe(idempotencyKeyFor(parts));
    expect(idempotencyKeyFor({ ...parts, channel: 'PUSH' })).not.toBe(idempotencyKeyFor(parts));
    expect(idempotencyKeyFor({ ...parts, scope: '2026-08-14:theatre-2' })).not.toBe(idempotencyKeyFor(parts));
  });

  it('differs by escalation level', () => {
    // The level-3 escalation is a different message from the level-1 reminder,
    // even for the same case and person.
    expect(idempotencyKeyFor({ ...parts, escalationLevel: 3 }))
      .not.toBe(idempotencyKeyFor({ ...parts, escalationLevel: 1 }));
  });

  it('distinguishes a manual send from a rule', () => {
    expect(idempotencyKeyFor({ ...parts, ruleId: null })).toContain('manual');
  });
});

describe('defaultChannelsFor', () => {
  it('puts critical on the radio as well as the screen', () => {
    // The radio reaches people who are not holding a phone, which is the point.
    expect(defaultChannelsFor('CRITICAL')).toContain('RADIO');
  });

  it('keeps routine messages in-app only', () => {
    expect(defaultChannelsFor('LOW')).toEqual(['IN_APP']);
    expect(defaultChannelsFor('NORMAL')).toEqual(['IN_APP']);
  });

  it('never defaults to an external channel', () => {
    // Cost and privacy are decisions for a rule to make explicitly, never a
    // fallback.
    for (const p of ['LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL'] as const) {
      for (const c of defaultChannelsFor(p)) expect(isExternal(c)).toBe(false);
    }
  });
});
