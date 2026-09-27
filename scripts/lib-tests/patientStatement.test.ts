/**
 * The three rules on a consumption statement that cost real money.
 *
 * This statement is read by two parties with opposite interests: a supplier
 * establishing what they are owed, and hospital accounts establishing what a
 * patient should be billed. An error here is not a display bug — it either
 * overcharges a patient or underpays a supplier, and in both cases every
 * figure still looks completely plausible.
 *
 * So the three rules that decide the money are pure functions, tested at the
 * boundaries:
 *
 *   what is charged        — used, never reserved or issued, never waste
 *   at what price          — the price frozen when the case was booked
 *   what cannot be explained — issued and neither used, returned nor wasted
 */
import { describe, expect, it } from 'vitest';

import {
  valueLine, unitPriceFor, unaccountedQuantity, formatKobo,
} from '../../src/lib/consumption/patientStatement';

describe('what a line is worth', () => {
  it('charges for what was used', () => {
    expect(valueLine(3, 250_00)).toBe(750_00);
  });

  it('charges nothing for a line that was reserved but never used', () => {
    // A reservation is an intention. Billing it would charge patients for
    // cases that were cancelled.
    expect(valueLine(0, 250_00)).toBe(0);
  });

  it('never returns a negative value', () => {
    // A corrected count can momentarily go negative; a negative line would
    // silently credit the patient against other items.
    expect(valueLine(-2, 250_00)).toBe(0);
  });

  it('is zero when there is no price rather than guessing one', () => {
    expect(valueLine(5, 0)).toBe(0);
    expect(valueLine(5, -100)).toBe(0);
  });

  it('does not charge for waste, because waste is not a quantity it sees', () => {
    // The rule is structural: valueLine is only ever given quantityUsed, so a
    // dropped vial cannot reach a patient's bill even by mistake. Billing a
    // patient for a breakage is the quiet error that discredits the whole
    // statement.
    const used = 2, wasted = 3;
    expect(valueLine(used, 100_00)).toBe(200_00);
    expect(valueLine(used + wasted, 100_00)).not.toBe(valueLine(used, 100_00));
  });
});

describe('which price applies', () => {
  it('uses the price frozen when the case was booked', () => {
    // The point of freezing it: a price rise three weeks later must not change
    // what a patient already owes or what a supplier is already due.
    expect(unitPriceFor(150_00, 900_00)).toBe(150_00);
  });

  it('falls back to the batch price only when nothing was frozen', () => {
    // Rows written before unitPriceAtReservation was populated.
    expect(unitPriceFor(0, 900_00)).toBe(900_00);
  });

  it('never returns a negative price', () => {
    expect(unitPriceFor(0, -500)).toBe(0);
  });

  it('treats a frozen price of zero as absent, not as free', () => {
    // Zero is the column default, so it means "not captured" rather than "this
    // item costs nothing". Reading it as free would silently zero a supplier's
    // whole statement.
    expect(unitPriceFor(0, 4_500)).toBe(4_500);
  });
});

describe('what cannot be accounted for', () => {
  const q = (issued: number, used: number, returned: number, wasted: number) => ({
    quantityIssued: issued, quantityUsed: used,
    quantityReturned: returned, quantityWasted: wasted,
  });

  it('is nothing when the line balances', () => {
    expect(unaccountedQuantity(q(10, 7, 2, 1))).toBe(0);
  });

  it('is the remainder when stock left and never came back', () => {
    // Ten issued, six used, one returned, nothing written off: three units
    // nobody can explain. This is the figure a reconciliation exists to find.
    expect(unaccountedQuantity(q(10, 6, 1, 0))).toBe(3);
  });

  it('counts waste as accounted for', () => {
    // Written off is explained. It is a loss, not a mystery, and conflating
    // the two would send somebody hunting for a vial that is already recorded
    // as broken.
    expect(unaccountedQuantity(q(10, 6, 0, 4))).toBe(0);
  });

  it('never goes negative when more is returned than was issued', () => {
    // Happens with a correction, or stock returned against the wrong line. A
    // negative here would cancel out a genuine shortfall elsewhere.
    expect(unaccountedQuantity(q(5, 0, 8, 0))).toBe(0);
  });

  it('ignores what was merely reserved', () => {
    // Reserved stock never left the shelf, so it cannot be missing.
    expect(unaccountedQuantity(q(0, 0, 0, 0))).toBe(0);
  });
});

describe('showing money to a person', () => {
  it('renders kobo as naira', () => {
    expect(formatKobo(150_000_00)).toBe('₦150,000.00');
    expect(formatKobo(0)).toBe('₦0.00');
  });

  it('keeps the kobo, rather than rounding it away', () => {
    // ₦1,234.56 — the fractional part is real money and a statement that
    // rounded it would not reconcile against a bank.
    expect(formatKobo(123_456)).toBe('₦1,234.56');
  });
});
