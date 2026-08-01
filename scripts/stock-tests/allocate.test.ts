/**
 * FEFO allocation. The rule is first EXPIRED first out, not first in first out
 * — stock that expires on a shelf is money already spent and thrown away.
 */
import { describe, expect, it } from 'vitest';

import { allocateFefo, summariseAvailability } from './allocate';
import { ZERO_QUANTITIES } from './quantities';

const NOW = new Date('2026-08-01T09:00:00Z');

const b = (id: string, o: Record<string, unknown> = {}) => ({
  ...ZERO_QUANTITIES,
  id,
  batchNumber: id.toUpperCase(),
  status: 'AVAILABLE',
  quantityReceived: 10,
  sellingPrice: 100_00,
  ...o,
});

describe('choosing batches', () => {
  it('draws from the batch that expires soonest', () => {
    const r = allocateFefo({
      batches: [b('late', { expiryDate: '2027-06-30' }), b('soon', { expiryDate: '2026-09-30' })],
      quantity: 5,
      asOf: NOW,
    });
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0].batchId).toBe('soon');
    expect(r.satisfied).toBe(true);
  });

  it('is FEFO, not FIFO — a newer box that expires first goes first', () => {
    const older = b('received-first', { expiryDate: '2028-01-31' });
    const newer = b('received-later', { expiryDate: '2026-10-31' });
    const r = allocateFefo({ batches: [older, newer], quantity: 3, asOf: NOW });
    expect(r.allocations[0].batchId).toBe('received-later');
  });

  it('spills into the next batch when the first cannot cover it', () => {
    const r = allocateFefo({
      batches: [b('soon', { expiryDate: '2026-09-30', quantityReceived: 4 }), b('late', { expiryDate: '2027-06-30' })],
      quantity: 9,
      asOf: NOW,
    });
    expect(r.allocations.map((a) => [a.batchId, a.quantity])).toEqual([
      ['soon', 4],
      ['late', 5],
    ]);
    expect(r.satisfied).toBe(true);
  });

  it('reports a shortfall rather than over-allocating', () => {
    const r = allocateFefo({ batches: [b('only', { quantityReceived: 3 })], quantity: 10, asOf: NOW });
    expect(r.allocations[0].quantity).toBe(3);
    expect(r.shortfall).toBe(7);
    expect(r.satisfied).toBe(false);
  });

  it('skips expired batches entirely', () => {
    const r = allocateFefo({
      batches: [b('expired', { expiryDate: '2026-06-30' }), b('good', { expiryDate: '2027-01-31' })],
      quantity: 5,
      asOf: NOW,
    });
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0].batchId).toBe('good');
  });

  it('skips quarantined batches', () => {
    const r = allocateFefo({ batches: [b('q', { status: 'QUARANTINED' })], quantity: 1, asOf: NOW });
    expect(r.satisfied).toBe(false);
    expect(r.allocations).toHaveLength(0);
  });

  it('ignores stock that is already fully reserved', () => {
    const r = allocateFefo({
      batches: [b('taken', { quantityReserved: 10 }), b('free', {})],
      quantity: 4,
      asOf: NOW,
    });
    expect(r.allocations[0].batchId).toBe('free');
  });

  it('holds back undated stock while something perishable exists', () => {
    const r = allocateFefo({
      batches: [b('undated', { expiryDate: null }), b('dated', { expiryDate: '2027-01-31' })],
      quantity: 4,
      asOf: NOW,
    });
    expect(r.allocations[0].batchId).toBe('dated');
  });

  it('is deterministic when two batches share an expiry date', () => {
    // A reservation and the picking list it printed must not disagree.
    const batches = [b('bbb', { expiryDate: '2027-01-31' }), b('aaa', { expiryDate: '2027-01-31' })];
    const first = allocateFefo({ batches, quantity: 3, asOf: NOW });
    const second = allocateFefo({ batches: [...batches].reverse(), quantity: 3, asOf: NOW });
    expect(first.allocations[0].batchId).toBe(second.allocations[0].batchId);
    expect(first.allocations[0].batchId).toBe('aaa');
  });

  it('prices what it allocated, in kobo', () => {
    const r = allocateFefo({
      batches: [b('a', { expiryDate: '2026-09-30', quantityReceived: 2, sellingPrice: 250_00 }), b('b', { expiryDate: '2027-01-31', sellingPrice: 100_00 })],
      quantity: 5,
      asOf: NOW,
    });
    // 2 × ₦250 + 3 × ₦100 = ₦800
    expect(r.totalPrice).toBe(80_000);
  });

  it('asking for nothing allocates nothing and is not a failure', () => {
    const r = allocateFefo({ batches: [b('a')], quantity: 0, asOf: NOW });
    expect(r.allocations).toHaveLength(0);
    expect(r.satisfied).toBe(true);
  });
});

describe('the emergency store in allocation', () => {
  const emergency = { name: 'Emergency Store', isEmergency: true };

  it('is not offered to an elective case', () => {
    const r = allocateFefo({
      batches: [b('emerg', { location: emergency })],
      quantity: 2,
      isElective: true,
      asOf: NOW,
    });
    expect(r.satisfied).toBe(false);
  });

  it('is offered once authorised', () => {
    const r = allocateFefo({
      batches: [b('emerg', { location: emergency })],
      quantity: 2,
      isElective: true,
      emergencyAuthorisedBy: 'u1',
      asOf: NOW,
    });
    expect(r.satisfied).toBe(true);
  });

  it('is always offered to an emergency case', () => {
    const r = allocateFefo({
      batches: [b('emerg', { location: emergency })],
      quantity: 2,
      isElective: false,
      asOf: NOW,
    });
    expect(r.satisfied).toBe(true);
  });
});

describe('what a surgeon sees before booking', () => {
  it('totals availability across batches', () => {
    const s = summariseAvailability(
      [b('a', { quantityReceived: 10, quantityReserved: 4 }), b('b', { quantityReceived: 5 })],
      { asOf: NOW }
    );
    expect(s.available).toBe(11);
    expect(s.reserved).toBe(4);
    expect(s.onHand).toBe(15);
    expect(s.batches).toBe(2);
  });

  it('excludes expired stock from the figure', () => {
    const s = summariseAvailability(
      [b('good', { quantityReceived: 5, expiryDate: '2027-01-31' }), b('gone', { quantityReceived: 99, expiryDate: '2026-01-31' })],
      { asOf: NOW }
    );
    expect(s.available).toBe(5);
    expect(s.batches).toBe(1);
  });

  it('names the soonest expiry and what is about to lapse', () => {
    const s = summariseAvailability(
      [b('soon', { quantityReceived: 3, expiryDate: '2026-08-20' }), b('later', { quantityReceived: 7, expiryDate: '2027-05-31' })],
      { asOf: NOW }
    );
    expect(new Date(s.nextExpiry as Date).toISOString().slice(0, 10)).toBe('2026-08-20');
    expect(s.expiringSoon).toBe(3);
  });

  it('warns when the item has fallen to its reorder level', () => {
    const s = summariseAvailability([b('a', { quantityReceived: 4 })], { reorderLevel: 5, asOf: NOW });
    expect(s.belowReorderLevel).toBe(true);
  });

  it('says nothing about reorder level when none is set', () => {
    const s = summariseAvailability([b('a', { quantityReceived: 4 })], { asOf: NOW });
    expect(s.belowReorderLevel).toBe(false);
  });

  it('an item with no stock at all reads as zero, not as an error', () => {
    const s = summariseAvailability([], { asOf: NOW });
    expect(s.available).toBe(0);
    expect(s.batches).toBe(0);
    expect(s.nextExpiry).toBeNull();
  });
});
