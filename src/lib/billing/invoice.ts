// ============================================================
// Building the invoice — turning a completed case into one bill
// ------------------------------------------------------------
// Everything upstream now produces exactly what this needs. A reservation
// records what was USED and, separately, what was WASTED; a tariff records what
// a fee cost on the day. So the bill is assembled rather than typed.
//
// Two rules govern what appears on it:
//
//   1. The patient is billed for what was USED, never for what was reserved,
//      issued or wasted. Stock that went to theatre and came back is not a
//      charge, and a dropped vial is the hospital's loss. Billing anything
//      other than `quantityUsed` would charge patients for the theatre's
//      breakages, which is the single worst thing this module could do.
//
//   2. The price is the one CAPTURED at reservation, not today's. The patient
//      agreed a figure when the case was booked; a price list updated between
//      booking and surgery must not move their bill.
//
// Assembly is a pure function of plain rows. The route persists what it
// returns, so what lands on an invoice can be tested without a database.
// ============================================================

import { priceForCode, TariffRow } from './pricing';

export type ChargeKindValue =
  | 'PROCEDURE' | 'THEATRE' | 'ANAESTHESIA' | 'CONSUMABLE' | 'DRUG' | 'IMPLANT'
  | 'CSSD' | 'RECOVERY' | 'LABORATORY' | 'BLOOD' | 'OXYGEN' | 'EMERGENCY' | 'OTHER';

/** A reservation, as the invoice builder needs to see it. */
export interface ReservationForBilling {
  id: string;
  quantityUsed: number;
  unitPriceAtReservation: number;
  itemName: string;
  /** Drives which charge kind the line lands under, and how it is routed. */
  chargeKind?: ChargeKindValue;
  /** Set when the stock was vendor-owned: this vendor is owed for the line. */
  vendorId?: string | null;
  batchNumber?: string | null;
}

/** A fee that is not stock — theatre, anaesthesia, recovery, CSSD. */
export interface FeeRequest {
  code: string;
  kind: ChargeKindValue;
  quantity?: number;
  /** Overrides the tariff. Used only where a fee is genuinely case-specific. */
  amountOverride?: number | null;
  description?: string;
}

export interface DraftLine {
  kind: ChargeKindValue;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sourceKind: 'STOCK_RESERVATION' | 'TARIFF' | 'MANUAL';
  sourceId: string | null;
  tariffId: string | null;
  vendorId: string | null;
}

export interface DraftInvoice {
  lines: DraftLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** Fees asked for that had no price in force — a bill must not silently omit them. */
  unpriced: string[];
}

/**
 * Lines for the stock a case actually consumed.
 *
 * Reservations with nothing used produce no line at all — a reservation that
 * was returned in full cost the patient nothing, and a zero line on a bill
 * invites the question "why am I being charged for this?".
 */
export function linesFromReservations(reservations: ReservationForBilling[]): DraftLine[] {
  return reservations
    .filter((r) => r.quantityUsed > 0)
    .map((r) => ({
      kind: r.chargeKind ?? ('CONSUMABLE' as ChargeKindValue),
      description: r.batchNumber ? `${r.itemName} (lot ${r.batchNumber})` : r.itemName,
      quantity: r.quantityUsed,
      unitPrice: r.unitPriceAtReservation,
      lineTotal: r.unitPriceAtReservation * r.quantityUsed,
      sourceKind: 'STOCK_RESERVATION' as const,
      sourceId: r.id,
      tariffId: null,
      vendorId: r.vendorId ?? null,
    }));
}

/**
 * Lines for fees, priced from the tariff catalogue as at `asOf`.
 *
 * A fee with no price in force is NOT silently dropped — it is reported in
 * `unpriced` so somebody sets a price rather than the hospital quietly not
 * charging for its theatre.
 */
export function linesFromFees(params: {
  fees: FeeRequest[];
  tariffs: TariffRow[];
  asOf: Date | string;
}): { lines: DraftLine[]; unpriced: string[] } {
  const { fees, tariffs, asOf } = params;
  const lines: DraftLine[] = [];
  const unpriced: string[] = [];

  for (const fee of fees) {
    const quantity = fee.quantity ?? 1;
    const tariff = priceForCode(tariffs, fee.code, asOf);

    const unitPrice = fee.amountOverride ?? tariff?.amount ?? null;
    if (unitPrice === null) {
      unpriced.push(fee.code);
      continue;
    }

    lines.push({
      kind: fee.kind,
      description: fee.description ?? tariff?.name ?? fee.code,
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
      sourceKind: fee.amountOverride != null ? 'MANUAL' : 'TARIFF',
      sourceId: fee.code,
      tariffId: tariff?.id ?? null,
      vendorId: null,
    });
  }

  return { lines, unpriced };
}

/**
 * Assemble the whole bill.
 *
 * Discount is applied to the subtotal and tax computed on what remains, which
 * is the ordinary reading of a discounted bill. Both are integers; the total is
 * never a rounded float.
 */
export function buildInvoice(params: {
  reservations: ReservationForBilling[];
  fees?: FeeRequest[];
  tariffs?: TariffRow[];
  asOf?: Date | string;
  discount?: number;
  /** Basis points, e.g. 750 for 7.5% VAT. Zero when the service is exempt. */
  taxBasisPoints?: number;
}): DraftInvoice {
  const {
    reservations,
    fees = [],
    tariffs = [],
    asOf = new Date(),
    discount = 0,
    taxBasisPoints = 0,
  } = params;

  const stockLines = linesFromReservations(reservations);
  const { lines: feeLines, unpriced } = linesFromFees({ fees, tariffs, asOf });

  // Fees first: a patient reading their bill expects the procedure at the top,
  // not the fourteenth packet of gauze.
  const lines = [...feeLines, ...stockLines];

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const cappedDiscount = Math.min(Math.max(0, discount), subtotal);
  const taxable = subtotal - cappedDiscount;
  const tax = Math.round((taxable * taxBasisPoints) / 10_000);

  return {
    lines,
    subtotal,
    discount: cappedDiscount,
    tax,
    total: taxable + tax,
    unpriced,
  };
}

// ---------------------------------------------------------------------------
// Payment state
// ---------------------------------------------------------------------------

export type InvoiceStatusValue =
  | 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED' | 'REFUNDED';

/** What is still owed. Never negative — an overpayment is a credit, not a debt. */
export function balanceOf(invoice: { total: number; amountPaid: number }): number {
  return Math.max(0, invoice.total - invoice.amountPaid);
}

/** Paid more than the bill. Worth naming so it can be refunded rather than hidden. */
export function overpayment(invoice: { total: number; amountPaid: number }): number {
  return Math.max(0, invoice.amountPaid - invoice.total);
}

/**
 * The status a payment leaves an invoice in.
 *
 * A cancelled invoice stays cancelled: taking money against a cancelled bill is
 * a mistake to be corrected, not a state change to be recorded silently.
 */
export function statusAfterPayment(params: {
  current: InvoiceStatusValue;
  total: number;
  amountPaid: number;
}): InvoiceStatusValue {
  const { current, total, amountPaid } = params;
  if (current === 'CANCELLED' || current === 'REFUNDED') return current;
  if (amountPaid <= 0) return current === 'DRAFT' ? 'DRAFT' : 'ISSUED';
  if (amountPaid >= total) return 'PAID';
  return 'PARTIALLY_PAID';
}

export interface PaymentCheck {
  allowed: boolean;
  code?: string;
  message?: string;
}

/**
 * May this payment be taken?
 *
 * Overpayment is refused rather than accepted and refunded later: at a hospital
 * cash desk the commonest cause is keying the wrong invoice, and taking the
 * money makes that far harder to unpick than declining it does.
 */
export function canAcceptPayment(params: {
  status: InvoiceStatusValue;
  total: number;
  amountPaid: number;
  payment: number;
}): PaymentCheck {
  const { status, total, amountPaid, payment } = params;

  if (!Number.isInteger(payment) || payment <= 0) {
    return { allowed: false, code: 'INVALID_AMOUNT', message: 'The payment must be a whole number of kobo greater than zero.' };
  }
  if (status === 'CANCELLED') {
    return { allowed: false, code: 'INVOICE_CANCELLED', message: 'This invoice has been cancelled. No payment can be taken against it.' };
  }
  if (status === 'DRAFT') {
    return { allowed: false, code: 'INVOICE_NOT_ISSUED', message: 'This invoice is still a draft. Issue it before taking payment.' };
  }
  if (status === 'PAID') {
    return { allowed: false, code: 'ALREADY_PAID', message: 'This invoice is already paid in full.' };
  }

  const outstanding = total - amountPaid;
  if (payment > outstanding) {
    return {
      allowed: false,
      code: 'EXCEEDS_BALANCE',
      message: `Only ${formatKobo(outstanding)} is outstanding on this invoice; ${formatKobo(payment)} was tendered. Check the invoice number.`,
    };
  }

  return { allowed: true };
}

/** Naira for a message. Display formatting elsewhere is the UI's business. */
function formatKobo(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * An invoice becomes read-only once it is paid or cancelled. Correcting one
 * after that is a credit note, not an edit — the same principle the imprest
 * retirement follows.
 */
export function isInvoiceLocked(status: InvoiceStatusValue): boolean {
  return status === 'PAID' || status === 'CANCELLED' || status === 'REFUNDED';
}
