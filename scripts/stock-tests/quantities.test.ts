/**
 * The stock arithmetic. If any of this is wrong the store reports holding
 * things it does not, so it is tested against the two identities the module
 * header states rather than against whatever the code happens to do.
 */
import { describe, expect, it } from 'vitest';

import {
  applyMovement,
  available,
  isOversubscribed,
  isReconciled,
  onHand,
  unreconciled,
  utilisationPercent,
  withMovement,
  writtenOff,
  ZERO_QUANTITIES,
} from '../../src/lib/stock/quantities';

const q = (o: Partial<typeof ZERO_QUANTITIES> = {}) => ({ ...ZERO_QUANTITIES, ...o });

describe('what is physically in the store', () => {
  it('counts what was received', () => {
    expect(onHand(q({ quantityReceived: 100 }))).toBe(100);
  });

  it('issuing takes it out of the store', () => {
    expect(onHand(q({ quantityReceived: 100, quantityIssued: 30 }))).toBe(70);
  });

  it('returning puts it back', () => {
    expect(onHand(q({ quantityReceived: 100, quantityIssued: 30, quantityReturned: 10 }))).toBe(80);
  });

  it('does NOT subtract used a second time', () => {
    // The seven that were used had already left the store as part of the ten
    // issued. Subtracting again is the classic double-count.
    const withUse = q({ quantityReceived: 100, quantityIssued: 10, quantityUsed: 7 });
    const withoutUse = q({ quantityReceived: 100, quantityIssued: 10 });
    expect(onHand(withUse)).toBe(onHand(withoutUse));
    expect(onHand(withUse)).toBe(90);
  });

  it('write-offs come off the store', () => {
    expect(onHand(q({ quantityReceived: 100, quantityExpired: 5, quantityDisposed: 2 }))).toBe(93);
  });
});

describe('what may still be committed to a case', () => {
  it('is what is on hand less what is spoken for', () => {
    expect(available(q({ quantityReceived: 100, quantityReserved: 40 }))).toBe(60);
  });

  it('reserved stock is still physically present', () => {
    const b = q({ quantityReceived: 100, quantityReserved: 40 });
    expect(onHand(b)).toBe(100);
    expect(available(b)).toBe(60);
  });

  it('never reports a negative availability', () => {
    expect(available(q({ quantityReceived: 10, quantityReserved: 25 }))).toBe(0);
  });

  it('but says plainly when more is reserved than exists', () => {
    expect(isOversubscribed(q({ quantityReceived: 10, quantityReserved: 25 }))).toBe(true);
    expect(isOversubscribed(q({ quantityReceived: 10, quantityReserved: 10 }))).toBe(false);
  });
});

describe('the reconciliation identity: issued = returned + used + damaged', () => {
  it('the anaesthetic register example balances', () => {
    // Ten vials dispensed, seven used, two returned, one broken.
    const vials = q({ quantityReceived: 20, quantityIssued: 10, quantityUsed: 7, quantityReturned: 2, quantityDamaged: 1 });
    expect(unreconciled(vials)).toBe(0);
    expect(isReconciled(vials)).toBe(true);
  });

  it('flags vials that left and were never accounted for', () => {
    const vials = q({ quantityReceived: 20, quantityIssued: 10, quantityUsed: 7 });
    expect(unreconciled(vials)).toBe(3);
    expect(isReconciled(vials)).toBe(false);
  });

  it('a batch nobody has touched is trivially reconciled', () => {
    expect(isReconciled(q({ quantityReceived: 50 }))).toBe(true);
  });
});

describe('derived figures', () => {
  it('totals the write-offs', () => {
    expect(writtenOff(q({ quantityDamaged: 1, quantityExpired: 2, quantityDisposed: 3 }))).toBe(6);
  });

  it('reports utilisation as a percentage', () => {
    expect(utilisationPercent(q({ quantityReceived: 200, quantityUsed: 50 }))).toBe(25);
  });

  it('does not divide by zero on a batch nobody stocked', () => {
    expect(utilisationPercent(q())).toBe(0);
  });
});

describe('applying a movement', () => {
  it('receiving adds to received', () => {
    expect(applyMovement('RECEIVE', 10)).toEqual({ quantityReceived: 10 });
  });

  it('releasing a reservation gives the stock back', () => {
    expect(applyMovement('RELEASE_RESERVATION', 4)).toEqual({ quantityReserved: -4 });
  });

  it('issuing consumes the reservation that authorised it', () => {
    // Otherwise the stock would be counted as both reserved AND gone.
    expect(applyMovement('ISSUE', 6)).toEqual({ quantityIssued: 6, quantityReserved: -6 });
  });

  it('transferring between stores does not change how much there is', () => {
    expect(applyMovement('TRANSFER', 10)).toEqual({});
    expect(applyMovement('QUARANTINE', 10)).toEqual({});
    expect(applyMovement('OWNERSHIP_TRANSFER', 10)).toEqual({});
  });

  it('refuses a zero, negative or fractional movement', () => {
    expect(() => applyMovement('RECEIVE', 0)).toThrow();
    expect(() => applyMovement('RECEIVE', -5)).toThrow();
    expect(() => applyMovement('RECEIVE', 2.5)).toThrow();
  });
});

describe('a batch through its whole life', () => {
  it('receive, reserve, issue, use, return — and it balances', () => {
    let b = ZERO_QUANTITIES;
    b = withMovement(b, 'RECEIVE', 100);
    expect(available(b)).toBe(100);

    b = withMovement(b, 'RESERVE', 30);
    expect(available(b)).toBe(70);
    expect(onHand(b)).toBe(100); // still on the shelf

    b = withMovement(b, 'ISSUE', 30);
    expect(onHand(b)).toBe(70); // now it has gone to theatre
    expect(available(b)).toBe(70); // and the reservation went with it
    expect(b.quantityReserved).toBe(0);

    b = withMovement(b, 'CONSUME', 25);
    b = withMovement(b, 'RETURN', 5);
    expect(onHand(b)).toBe(75); // the five came back
    expect(isReconciled(b)).toBe(true); // 30 issued = 25 used + 5 returned
  });

  it('an expiry sweep removes stock from the store for good', () => {
    let b = withMovement(ZERO_QUANTITIES, 'RECEIVE', 40);
    b = withMovement(b, 'EXPIRE', 40);
    expect(onHand(b)).toBe(0);
    expect(available(b)).toBe(0);
  });
});
