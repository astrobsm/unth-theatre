/**
 * The refusals that keep a theatre safe. Each of these exists because the
 * alternative is a real harm: expired stock on a trolley, a controlled drug
 * leaving a safe unwitnessed, an elective list emptying the emergency store.
 */
import { describe, expect, it } from 'vitest';

import {
  canAccountFor,
  canIssue,
  canReserve,
  daysUntilExpiry,
  expiresWithin,
  isExpired,
  transfersOwnershipOnConsumption,
} from './rules';
import { ZERO_QUANTITIES } from './quantities';

const NOW = new Date('2026-08-01T09:00:00Z');

const batch = (o: Record<string, unknown> = {}) => ({
  ...ZERO_QUANTITIES,
  id: 'b1',
  batchNumber: 'LOT-001',
  status: 'AVAILABLE',
  expiryDate: '2027-01-31',
  quantityReceived: 100,
  ...o,
});

describe('expiry', () => {
  it('stock is good through the whole of its expiry date', () => {
    // The printed date on the box is inclusive — this is how it is read at the
    // bench, and treating it as exclusive would throw away usable stock.
    expect(isExpired('2026-08-01', NOW)).toBe(false);
  });

  it('is expired the day after', () => {
    expect(isExpired('2026-07-31', NOW)).toBe(true);
  });

  it('an item with no expiry date never expires', () => {
    expect(isExpired(null, NOW)).toBe(false);
    expect(daysUntilExpiry(null, NOW)).toBeNull();
  });

  it('counts the days left', () => {
    expect(daysUntilExpiry('2026-08-11', NOW)).toBe(10);
    expect(daysUntilExpiry('2026-07-25', NOW)).toBe(-7);
  });

  it('flags stock nearing expiry', () => {
    expect(expiresWithin('2026-08-20', 30, NOW)).toBe(true);
    expect(expiresWithin('2026-12-20', 30, NOW)).toBe(false);
  });
});

describe('reserving stock for a case', () => {
  it('allows a reservation within what is available', () => {
    expect(canReserve({ batch: batch(), quantity: 10, asOf: NOW }).allowed).toBe(true);
  });

  it('refuses more than is available', () => {
    const r = canReserve({ batch: batch({ quantityReserved: 95 }), quantity: 10, asOf: NOW });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('INSUFFICIENT_STOCK');
    expect(r.message).toContain('5');
  });

  it('refuses expired stock outright', () => {
    const r = canReserve({ batch: batch({ expiryDate: '2026-07-01' }), quantity: 1, asOf: NOW });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('BATCH_EXPIRED');
  });

  it('refuses quarantined stock', () => {
    const r = canReserve({ batch: batch({ status: 'QUARANTINED' }), quantity: 1, asOf: NOW });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('BATCH_NOT_RESERVABLE');
  });

  it('refuses a zero or fractional quantity', () => {
    expect(canReserve({ batch: batch(), quantity: 0, asOf: NOW }).allowed).toBe(false);
    expect(canReserve({ batch: batch(), quantity: 1.5, asOf: NOW }).allowed).toBe(false);
  });

  describe('the emergency store', () => {
    const emergency = { name: 'Emergency Store', isEmergency: true };

    it('refuses an elective case without authorisation', () => {
      const r = canReserve({ batch: batch(), quantity: 1, location: emergency, isElective: true, asOf: NOW });
      expect(r.allowed).toBe(false);
      expect(r.code).toBe('EMERGENCY_STOCK_NOT_AUTHORISED');
    });

    it('allows it once authorised', () => {
      const r = canReserve({
        batch: batch(), quantity: 1, location: emergency, isElective: true,
        emergencyAuthorisedBy: 'user-1', asOf: NOW,
      });
      expect(r.allowed).toBe(true);
    });

    it('never stands in the way of an actual emergency', () => {
      const r = canReserve({ batch: batch(), quantity: 1, location: emergency, isElective: false, asOf: NOW });
      expect(r.allowed).toBe(true);
    });
  });
});

describe('issuing stock to theatre', () => {
  const reserved = batch({ quantityReserved: 10 });

  it('allows issuing what the case has reserved', () => {
    expect(canIssue({ batch: reserved, quantity: 10, reservedForCase: 10 }).allowed).toBe(true);
  });

  it('refuses issuing more than the case reserved', () => {
    const r = canIssue({ batch: reserved, quantity: 12, reservedForCase: 10 });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('EXCEEDS_RESERVATION');
  });

  it('refuses expired stock even when it was reserved earlier', () => {
    // Stock can expire between booking and the day of surgery.
    const r = canIssue({
      batch: batch({ quantityReserved: 10, expiryDate: '2026-07-01' }),
      quantity: 1, reservedForCase: 10, asOf: NOW,
    });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('BATCH_EXPIRED');
  });

  it('refuses quarantined stock', () => {
    const r = canIssue({
      batch: batch({ quantityReserved: 10, status: 'QUARANTINED' }),
      quantity: 1, reservedForCase: 10, asOf: NOW,
    });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('BATCH_QUARANTINED');
  });

  describe('controlled drugs', () => {
    const safe = { name: 'Controlled Drug Safe', isControlled: true };

    it('will not leave the safe without a witness', () => {
      const r = canIssue({ batch: reserved, quantity: 2, reservedForCase: 10, location: safe });
      expect(r.allowed).toBe(false);
      expect(r.code).toBe('WITNESS_REQUIRED');
    });

    it('goes out once a second officer witnesses it', () => {
      const r = canIssue({ batch: reserved, quantity: 2, reservedForCase: 10, location: safe, witnessId: 'u2' });
      expect(r.allowed).toBe(true);
    });
  });
});

describe('accounting for what went to theatre', () => {
  it('allows a return within what is outstanding', () => {
    expect(canAccountFor({ kind: 'RETURN', quantity: 2, outstanding: 10 }).allowed).toBe(true);
  });

  it('refuses recording more used than was ever issued', () => {
    const r = canAccountFor({ kind: 'CONSUME', quantity: 8, outstanding: 5 });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('EXCEEDS_OUTSTANDING');
  });

  it('discarding a controlled drug needs a witness', () => {
    const safe = { name: 'Controlled Drug Safe', isControlled: true };
    expect(canAccountFor({ kind: 'WASTE', quantity: 1, outstanding: 5, location: safe }).allowed).toBe(false);
    expect(
      canAccountFor({ kind: 'WASTE', quantity: 1, outstanding: 5, location: safe, witnessId: 'u2' }).allowed
    ).toBe(true);
  });

  it('an ordinary return needs no witness', () => {
    const store = { name: 'Consumables Store' };
    expect(canAccountFor({ kind: 'RETURN', quantity: 1, outstanding: 5, location: store }).allowed).toBe(true);
  });
});

describe('consignment ownership', () => {
  it('vendor stock changes hands when it is consumed', () => {
    expect(transfersOwnershipOnConsumption('VENDOR')).toBe(true);
  });

  it('hospital stock is already the hospital’s', () => {
    expect(transfersOwnershipOnConsumption('HOSPITAL')).toBe(false);
    expect(transfersOwnershipOnConsumption('CSSD')).toBe(false);
  });
});
