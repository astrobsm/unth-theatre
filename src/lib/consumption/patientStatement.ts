// ============================================================
// What was actually used for one patient
// ------------------------------------------------------------
// Two people need this and they need it for different reasons, so it is built
// once here and presented twice.
//
//   THE CONSUMABLE PROVIDER reconciles what they supplied against what was
//   used. They see their OWN lines only, valued at the price agreed with them,
//   and nothing clinical beyond the procedure the items went into.
//
//   HOSPITAL ACCOUNTS reconciles against the deposits and payments they hold.
//   They see every line, valued at what the patient should be billed, keyed on
//   the PT number they already use.
//
// ORM DOES NOT COLLECT MONEY, and this file is the sharp end of that. It
// produces a statement of what was consumed and what it is worth. It does not
// hold a balance, does not know what the patient has paid, and must never
// appear to. Accounts owns the money; ORM owns the record of what happened in
// the theatre. Blurring that would make ORM an unauthorised ledger of hospital
// funds, which it has no mandate to be.
//
// ── WHY THE FIGURES ARE WHAT THEY ARE ───────────────────────────────────────
//
// USED, not issued and not reserved. A reservation is an intention; an issue
// is a trolley leaving a store. Only quantityUsed went into the patient, and
// only that is chargeable. quantityWasted is kept visible and NOT charged —
// a dropped vial is the hospital's loss, and billing a patient for a breakage
// is the kind of quiet error that destroys trust in the whole statement.
//
// PRICED AT RESERVATION. StockReservation.unitPriceAtReservation freezes what
// was agreed when the case was booked. A price change three weeks later must
// not alter what a patient already owes, nor what a supplier is already due.
//
// TWO PRICES, DELIBERATELY. sellingPrice is what the patient is billed;
// vendorPrice is what the supplier is owed. They are not the same number and
// merging them would either underpay a supplier or overcharge a patient.
// ============================================================

import prisma from '@/lib/prisma';

/** One item, on one case. */
export interface ConsumptionLine {
  itemId: string;
  itemName: string;
  category: string;
  batchNumber: string;
  expiryDate: string | null;

  /** The bill of materials, in full, so the provider can see the whole life of the line. */
  quantityReserved: number;
  quantityIssued: number;
  quantityUsed: number;
  quantityReturned: number;
  quantityWasted: number;

  /** Kobo, frozen when the case was booked. */
  unitPriceAtReservation: number;
  /** quantityUsed × unitPriceAtReservation. The only chargeable figure. */
  lineValue: number;

  /** Who supplied it, when it is consignment stock. */
  owner: string;
  vendorId: string | null;
  vendorName: string | null;

  /** Where the line came from — a pack template, a prescription, added by hand. */
  sourceKind: string | null;
  status: string;
}

export interface CaseConsumption {
  surgeryId: string;
  procedureName: string | null;
  scheduledDate: string | null;
  status: string;
  lines: ConsumptionLine[];
  /** Kobo. Sum of lineValue across the lines shown. */
  caseValue: number;
}

export interface PatientStatement {
  patient: {
    id: string;
    ptNumber: string | null;
    folderNumber: string;
    name: string;
  };
  /** Set when the statement was filtered to one supplier. */
  scopedToVendorId: string | null;
  cases: CaseConsumption[];
  /** Kobo. Sum across every case shown. */
  totalValue: number;
  /** Items issued and neither used nor returned — a real reconciliation question. */
  unaccountedLines: number;
  generatedAt: string;
  /**
   * Said out loud on every statement, because the number looks like a bill and
   * is not one.
   */
  note: string;
}

export type Valuation = 'PATIENT' | 'VENDOR';

export interface StatementOptions {
  /** Limit to one supplier's lines. Required for a provider; omitted for accounts. */
  vendorId?: string | null;
  /**
   * Which price to apply. Accounts bills the patient; a supplier is owed their
   * own agreed price. Using one number for both would either underpay the
   * supplier or overcharge the patient.
   */
  valuation?: Valuation;
}

/** Only these have actually consumed anything. */
const CONSUMING_STATUSES = ['ISSUED', 'PARTIALLY_ISSUED', 'CONSUMED'];

/**
 * The unit price to apply to a line.
 *
 * unitPriceAtReservation is what was agreed when the case was booked and wins
 * whenever it was captured — a price change three weeks later must not alter
 * what a patient already owes or what a supplier is already due. The batch
 * price is the fallback for rows written before that column was populated.
 *
 * Pure, and separated from the query, because getting it wrong overcharges a
 * patient or underpays a supplier and neither is visible by reading the JSON.
 */
export function unitPriceFor(
  frozenAtReservation: number,
  batchFallback: number,
): number {
  return frozenAtReservation > 0 ? frozenAtReservation : Math.max(0, batchFallback);
}

/**
 * What a line is worth.
 *
 * USED only. A reservation is an intention and an issue is a trolley leaving
 * a store; neither went into the patient. Waste is deliberately absent: a
 * dropped vial is the hospital's loss, and billing a patient for a breakage
 * is the quiet kind of error that discredits the whole statement.
 */
export function valueLine(quantityUsed: number, unitPrice: number): number {
  if (quantityUsed <= 0 || unitPrice <= 0) return 0;
  return quantityUsed * unitPrice;
}

/**
 * Stock that left the store and cannot be accounted for.
 *
 * Issued, then neither used, nor returned, nor written off as waste. This is
 * the precise question a reconciliation exists to ask, and it is the one
 * figure on the statement that should prompt somebody to go and look.
 */
export function unaccountedQuantity(q: {
  quantityIssued: number; quantityUsed: number;
  quantityReturned: number; quantityWasted: number;
}): number {
  const left = q.quantityIssued - q.quantityUsed - q.quantityReturned - q.quantityWasted;
  return left > 0 ? left : 0;
}

/**
 * Build the consumption statement for one patient.
 *
 * Looks the patient up by PT number or by internal id — accounts works in PT
 * numbers, the app works in ids, and requiring either to translate would put
 * the mapping in two places.
 *
 * Returns null when no such patient exists, so a caller can answer 404 rather
 * than an empty statement. An empty statement for a patient who does not exist
 * reads as "this patient consumed nothing", which is a different and wrong
 * answer.
 */
export async function buildPatientStatement(
  key: { ptNumber?: string | null; patientId?: string | null },
  opts: StatementOptions = {},
): Promise<PatientStatement | null> {
  const { vendorId = null, valuation = 'PATIENT' } = opts;

  const pt = key.ptNumber?.trim();
  const patient = await prisma.patient.findFirst({
    where: pt ? { ptNumber: pt } : { id: key.patientId ?? '__none__' },
    select: { id: true, ptNumber: true, folderNumber: true, name: true },
  });
  if (!patient) return null;

  const reservations = await prisma.stockReservation.findMany({
    where: {
      status: { in: CONSUMING_STATUSES as never },
      surgery: { patientId: patient.id },
      // Scoped to one supplier's stock when a provider is asking.
      ...(vendorId ? { batch: { vendorId } } : {}),
    },
    select: {
      id: true,
      status: true,
      sourceKind: true,
      quantityReserved: true,
      quantityIssued: true,
      quantityUsed: true,
      quantityReturned: true,
      quantityWasted: true,
      unitPriceAtReservation: true,
      surgery: {
        select: { id: true, procedureName: true, scheduledDate: true, status: true },
      },
      batch: {
        select: {
          batchNumber: true, expiryDate: true, owner: true, vendorId: true,
          sellingPrice: true, vendorPrice: true,
          vendor: { select: { name: true } },
          item: { select: { id: true, name: true, category: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const byCase = new Map<string, CaseConsumption>();
  let unaccountedLines = 0;

  for (const r of reservations) {
    const s = r.surgery;
    if (!s) continue;

    // The price to apply. unitPriceAtReservation is what was agreed at booking
    // and wins whenever it was captured; the batch prices are the fallback for
    // older rows written before that column was populated.
    const fallback = valuation === 'VENDOR'
      ? (r.batch?.vendorPrice ?? 0)
      : (r.batch?.sellingPrice ?? 0);
    const unit = unitPriceFor(r.unitPriceAtReservation, fallback);
    const lineValue = valueLine(r.quantityUsed, unit);

    if (unaccountedQuantity(r) > 0) unaccountedLines += 1;

    const line: ConsumptionLine = {
      itemId: r.batch?.item?.id ?? '',
      itemName: r.batch?.item?.name ?? 'Unknown item',
      category: String(r.batch?.item?.category ?? 'OTHER'),
      batchNumber: r.batch?.batchNumber ?? '',
      expiryDate: r.batch?.expiryDate ? r.batch.expiryDate.toISOString().slice(0, 10) : null,
      quantityReserved: r.quantityReserved,
      quantityIssued: r.quantityIssued,
      quantityUsed: r.quantityUsed,
      quantityReturned: r.quantityReturned,
      quantityWasted: r.quantityWasted,
      unitPriceAtReservation: unit,
      lineValue,
      owner: String(r.batch?.owner ?? 'HOSPITAL'),
      vendorId: r.batch?.vendorId ?? null,
      vendorName: r.batch?.vendor?.name ?? null,
      sourceKind: r.sourceKind,
      status: String(r.status),
    };

    let c = byCase.get(s.id);
    if (!c) {
      c = {
        surgeryId: s.id,
        procedureName: s.procedureName ?? null,
        scheduledDate: s.scheduledDate ? s.scheduledDate.toISOString() : null,
        status: String(s.status),
        lines: [],
        caseValue: 0,
      };
      byCase.set(s.id, c);
    }
    c.lines.push(line);
    c.caseValue += lineValue;
  }

  const cases = Array.from(byCase.values())
    .sort((a, b) => (b.scheduledDate ?? '').localeCompare(a.scheduledDate ?? ''));

  return {
    patient: {
      id: patient.id,
      ptNumber: patient.ptNumber,
      folderNumber: patient.folderNumber,
      name: patient.name,
    },
    scopedToVendorId: vendorId,
    cases,
    totalValue: cases.reduce((sum, c) => sum + c.caseValue, 0),
    unaccountedLines,
    generatedAt: new Date().toISOString(),
    note: valuation === 'VENDOR'
      ? 'Valued at the price agreed with this supplier, for items consumed. Waste is '
        + 'shown but not valued. This is a record of consumption, not an invoice, and '
        + 'ORM holds no record of what has been paid.'
      : 'Valued at patient billing prices, for items consumed. Waste is shown but not '
        + 'charged. This is a statement of what was used in theatre — it is not a bill, '
        + 'and ORM holds no record of deposits or payments.',
  };
}

/** Naira, for a screen. Kobo is the stored unit and stays that way in the API. */
export function formatKobo(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
