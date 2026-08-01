/**
 * Assembling the bill.
 *
 * The rule this suite exists to protect: a patient is billed for what was
 * USED, at the price captured when the case was booked. Not what was reserved,
 * not what was issued, not what was wasted, and not at today's price.
 */
import { describe, expect, it } from 'vitest';

import {
  balanceOf,
  buildInvoice,
  canAcceptPayment,
  isInvoiceLocked,
  linesFromFees,
  linesFromReservations,
  overpayment,
  statusAfterPayment,
} from './invoice';

const res = (o: Record<string, unknown> = {}) => ({
  id: 'r1',
  itemName: 'Vicryl 2/0',
  quantityUsed: 3,
  unitPriceAtReservation: 250_00,
  ...o,
}) as never;

const tariff = (o: Record<string, unknown> = {}) => ({
  id: 't1',
  code: 'THEATRE-MAJOR',
  name: 'Major theatre fee',
  kind: 'THEATRE',
  amount: 150_000_00,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  ...o,
}) as never;

describe('what the patient is billed for', () => {
  it('bills what was used', () => {
    const lines = linesFromReservations([res({ quantityUsed: 3, unitPriceAtReservation: 250_00 })]);
    expect(lines[0].quantity).toBe(3);
    expect(lines[0].lineTotal).toBe(750_00);
  });

  it('does NOT bill what was merely reserved or issued', () => {
    // Ten issued, three used, seven came back. The patient pays for three.
    const lines = linesFromReservations([
      res({ quantityUsed: 3, unitPriceAtReservation: 100_00 }),
    ]);
    expect(lines[0].lineTotal).toBe(300_00);
  });

  it('does NOT bill for waste — a dropped vial is the hospital’s loss', () => {
    // quantityWasted is deliberately absent from this interface; only used
    // reaches the invoice. This is the single most important line in the suite.
    const lines = linesFromReservations([res({ quantityUsed: 0 })]);
    expect(lines).toHaveLength(0);
  });

  it('omits a reservation that was returned in full rather than billing zero', () => {
    const lines = linesFromReservations([res({ quantityUsed: 0 }), res({ id: 'r2', quantityUsed: 2 })]);
    expect(lines).toHaveLength(1);
    expect(lines[0].sourceId).toBe('r2');
  });

  it('uses the price captured at reservation, not a later one', () => {
    // The catalogue may have risen since booking; the bill must not.
    const lines = linesFromReservations([res({ unitPriceAtReservation: 100_00, quantityUsed: 1 })]);
    expect(lines[0].unitPrice).toBe(100_00);
  });

  it('names the lot, so a charge can be traced to the box it came from', () => {
    const lines = linesFromReservations([res({ batchNumber: 'LOT-42' })]);
    expect(lines[0].description).toContain('LOT-42');
  });

  it('carries the vendor through for consignment stock', () => {
    const lines = linesFromReservations([res({ vendorId: 'vendor-1' })]);
    expect(lines[0].vendorId).toBe('vendor-1');
  });
});

describe('fees priced from the catalogue', () => {
  it('prices a fee from the tariff in force', () => {
    const { lines } = linesFromFees({
      fees: [{ code: 'THEATRE-MAJOR', kind: 'THEATRE' }],
      tariffs: [tariff()],
      asOf: '2026-06-01',
    });
    expect(lines[0].unitPrice).toBe(150_000_00);
    expect(lines[0].sourceKind).toBe('TARIFF');
  });

  it('prices to the date of the case, not to today', () => {
    const old = tariff({ id: 'old', amount: 100_000_00, effectiveFrom: '2026-01-01', effectiveTo: '2026-05-01' });
    const now = tariff({ id: 'now', amount: 150_000_00, effectiveFrom: '2026-05-01' });
    const { lines } = linesFromFees({
      fees: [{ code: 'THEATRE-MAJOR', kind: 'THEATRE' }],
      tariffs: [old, now],
      asOf: '2026-03-15',
    });
    expect(lines[0].unitPrice).toBe(100_000_00);
  });

  it('reports an unpriced fee instead of silently dropping it', () => {
    // Otherwise the hospital quietly stops charging for something.
    const { lines, unpriced } = linesFromFees({
      fees: [{ code: 'NOT-IN-CATALOGUE', kind: 'THEATRE' }],
      tariffs: [tariff()],
      asOf: '2026-06-01',
    });
    expect(lines).toHaveLength(0);
    expect(unpriced).toEqual(['NOT-IN-CATALOGUE']);
  });

  it('an override wins over the catalogue and is marked as manual', () => {
    const { lines } = linesFromFees({
      fees: [{ code: 'THEATRE-MAJOR', kind: 'THEATRE', amountOverride: 90_000_00 }],
      tariffs: [tariff()],
      asOf: '2026-06-01',
    });
    expect(lines[0].unitPrice).toBe(90_000_00);
    expect(lines[0].sourceKind).toBe('MANUAL');
  });

  it('multiplies by quantity', () => {
    const { lines } = linesFromFees({
      fees: [{ code: 'THEATRE-MAJOR', kind: 'THEATRE', quantity: 2 }],
      tariffs: [tariff()],
      asOf: '2026-06-01',
    });
    expect(lines[0].lineTotal).toBe(300_000_00);
  });
});

describe('the whole bill', () => {
  const inputs = {
    reservations: [
      res({ id: 'r1', itemName: 'Vicryl 2/0', quantityUsed: 3, unitPriceAtReservation: 250_00 }),
      res({ id: 'r2', itemName: 'Propofol', quantityUsed: 2, unitPriceAtReservation: 1_200_00, chargeKind: 'DRUG' }),
    ],
    fees: [{ code: 'THEATRE-MAJOR', kind: 'THEATRE' as const }],
    tariffs: [tariff()],
    asOf: '2026-06-01',
  };

  it('totals fees and stock together', () => {
    const inv = buildInvoice(inputs);
    // 150,000 theatre + 750 sutures + 2,400 propofol
    expect(inv.subtotal).toBe(150_000_00 + 750_00 + 2_400_00);
    expect(inv.total).toBe(inv.subtotal);
  });

  it('puts the procedure at the top, not the fourteenth packet of gauze', () => {
    const inv = buildInvoice(inputs);
    expect(inv.lines[0].kind).toBe('THEATRE');
  });

  it('applies a discount to the subtotal', () => {
    const inv = buildInvoice({ ...inputs, discount: 10_000_00 });
    expect(inv.total).toBe(inv.subtotal - 10_000_00);
  });

  it('never discounts below zero', () => {
    const inv = buildInvoice({ reservations: [res({ quantityUsed: 1, unitPriceAtReservation: 100 })], discount: 999_999 });
    expect(inv.discount).toBe(100);
    expect(inv.total).toBe(0);
  });

  it('taxes what remains after the discount, as an integer', () => {
    const inv = buildInvoice({
      reservations: [res({ quantityUsed: 1, unitPriceAtReservation: 10_000 })],
      discount: 0,
      taxBasisPoints: 750, // 7.5%
    });
    expect(inv.tax).toBe(750);
    expect(inv.total).toBe(10_750);
    expect(Number.isInteger(inv.total)).toBe(true);
  });

  it('an empty case produces an empty bill, not an error', () => {
    const inv = buildInvoice({ reservations: [] });
    expect(inv.lines).toHaveLength(0);
    expect(inv.total).toBe(0);
  });
});

describe('taking payment', () => {
  const issued = { status: 'ISSUED' as const, total: 100_00, amountPaid: 0 };

  it('accepts a payment within the balance', () => {
    expect(canAcceptPayment({ ...issued, payment: 40_00 }).allowed).toBe(true);
  });

  it('accepts settling the balance exactly', () => {
    expect(canAcceptPayment({ ...issued, payment: 100_00 }).allowed).toBe(true);
  });

  it('refuses an overpayment rather than refunding later', () => {
    // At a cash desk the commonest cause is the wrong invoice number.
    const r = canAcceptPayment({ ...issued, payment: 150_00 });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('EXCEEDS_BALANCE');
    expect(r.message).toContain('₦100.00');
  });

  it('refuses payment against a draft', () => {
    expect(canAcceptPayment({ ...issued, status: 'DRAFT', payment: 10 }).code).toBe('INVOICE_NOT_ISSUED');
  });

  it('refuses payment against a cancelled invoice', () => {
    expect(canAcceptPayment({ ...issued, status: 'CANCELLED', payment: 10 }).code).toBe('INVOICE_CANCELLED');
  });

  it('refuses a second payment once paid in full', () => {
    expect(canAcceptPayment({ status: 'PAID', total: 100_00, amountPaid: 100_00, payment: 10 }).code).toBe('ALREADY_PAID');
  });

  it('refuses zero, negative and fractional amounts', () => {
    expect(canAcceptPayment({ ...issued, payment: 0 }).allowed).toBe(false);
    expect(canAcceptPayment({ ...issued, payment: -5 }).allowed).toBe(false);
    expect(canAcceptPayment({ ...issued, payment: 10.5 }).allowed).toBe(false);
  });
});

describe('invoice state', () => {
  it('part payment leaves it partially paid', () => {
    expect(statusAfterPayment({ current: 'ISSUED', total: 100_00, amountPaid: 40_00 })).toBe('PARTIALLY_PAID');
  });

  it('settling it in full marks it paid', () => {
    expect(statusAfterPayment({ current: 'PARTIALLY_PAID', total: 100_00, amountPaid: 100_00 })).toBe('PAID');
  });

  it('a cancelled invoice stays cancelled', () => {
    expect(statusAfterPayment({ current: 'CANCELLED', total: 100_00, amountPaid: 100_00 })).toBe('CANCELLED');
  });

  it('balance never goes negative', () => {
    expect(balanceOf({ total: 100_00, amountPaid: 150_00 })).toBe(0);
  });

  it('but an overpayment is named so it can be refunded', () => {
    expect(overpayment({ total: 100_00, amountPaid: 150_00 })).toBe(50_00);
  });

  it('a paid or cancelled invoice is read-only', () => {
    expect(isInvoiceLocked('PAID')).toBe(true);
    expect(isInvoiceLocked('CANCELLED')).toBe(true);
    expect(isInvoiceLocked('ISSUED')).toBe(false);
    expect(isInvoiceLocked('DRAFT')).toBe(false);
  });
});
