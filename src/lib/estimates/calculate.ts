// ============================================================
// The estimate calculation engine
// ------------------------------------------------------------
// Pure functions. No Prisma, no session, no fetch — the caller resolves prices
// and hands them in, and this decides what the patient is charged.
//
// It is pure for one reason: this is the arithmetic a patient is quoted and a
// hospital is held to, and it has to be testable without a database. Every rule
// here is a rule somebody will one day dispute.
//
// Three invariants the rest of the module depends on:
//
//   1. Kobo integers throughout. No floats touch money — 0.1 + 0.2 reaching a
//      patient's bill is not an acceptable failure mode.
//   2. Prices are SNAPSHOTTED, never re-read. A line carries the amount it was
//      priced at, so an estimate given in August still reads the same in
//      September after prices have changed.
//   3. The backend is authoritative. A client may propose lines; it may never
//      state a total. recalculate() is what the server stores.
// ============================================================

import type { ChargeKind } from './chargeKinds';

export type EstimateSection =
  | 'PREOP_INVESTIGATION'
  | 'SURGICAL_MATERIAL'
  | 'ANAESTHESIA_MATERIAL'
  | 'SURGICAL_FEE'
  | 'ANAESTHESIA_FEE'
  | 'THEATRE'
  | 'ADMISSION'
  | 'POSTOP_MEDICATION'
  | 'POSTOP_MONITORING'
  | 'OTHER_POSTOP';

/** Display order on the printed document. Sections a patient reads first come first. */
export const SECTION_ORDER: EstimateSection[] = [
  'PREOP_INVESTIGATION',
  'SURGICAL_FEE',
  'ANAESTHESIA_FEE',
  'THEATRE',
  'SURGICAL_MATERIAL',
  'ANAESTHESIA_MATERIAL',
  'ADMISSION',
  'POSTOP_MEDICATION',
  'POSTOP_MONITORING',
  'OTHER_POSTOP',
];

export const SECTION_LABELS: Record<EstimateSection, string> = {
  PREOP_INVESTIGATION: 'Pre-operative investigations',
  SURGICAL_FEE: "Surgeon's fee",
  ANAESTHESIA_FEE: "Anaesthetist's fee",
  THEATRE: 'Theatre charges',
  SURGICAL_MATERIAL: 'Surgical materials',
  ANAESTHESIA_MATERIAL: 'Anaesthetic materials',
  ADMISSION: 'Admission / bed',
  POSTOP_MEDICATION: 'Post-operative medication',
  POSTOP_MONITORING: 'Post-operative monitoring',
  OTHER_POSTOP: 'Other post-operative care',
};

/** A line as proposed, before the engine computes its total. */
export interface DraftLine {
  section: EstimateSection;
  kind: ChargeKind;
  description: string;
  unit?: string;
  /** Explicit quantity. Ignored when frequencyPerDay and durationDays are both set. */
  quantity?: number;
  unitPriceKobo: number;

  /** Provenance. Carried through untouched — never used to re-price. */
  tariffId?: string | null;
  tariffCode?: string | null;
  inventoryItemId?: string | null;
  surgicalPackId?: string | null;
  investigationId?: string | null;
  medicationName?: string | null;
  priceEffectiveFrom?: Date | null;

  /** Derived quantity: a drug given 3x daily for 5 days is 15 doses. */
  frequencyPerDay?: number | null;
  durationDays?: number | null;

  priceOverridden?: boolean;
  originalUnitPriceKobo?: number | null;
  overrideReason?: string | null;
}

/** A line after computation. quantity and totalKobo are now definite. */
export interface CostedLine extends DraftLine {
  quantity: number;
  unit: string;
  totalKobo: number;
  sortOrder: number;
}

export interface SectionTotal {
  section: EstimateSection;
  label: string;
  lineCount: number;
  totalKobo: number;
}

export interface EstimateTotals {
  lines: CostedLine[];
  sections: SectionTotal[];
  subtotalKobo: number;
  depositKobo: number;
  totalKobo: number;
  /** Anything the caller should show a person before this is issued. */
  warnings: string[];
}

export class EstimateError extends Error {}

/**
 * How many units of this line are charged.
 *
 * A post-operative drug is prescribed as "three times daily for five days", not
 * as "15". Both the inputs and the result are kept: the result because it is
 * what was charged, the inputs because somebody will ask how 15 was arrived at.
 */
export function resolveQuantity(line: DraftLine): number {
  const freq = line.frequencyPerDay ?? null;
  const days = line.durationDays ?? null;

  if (freq !== null && days !== null) {
    if (!Number.isInteger(freq) || !Number.isInteger(days)) {
      throw new EstimateError(
        `"${line.description}": frequency and duration must be whole numbers.`);
    }
    if (freq < 1 || days < 1) {
      throw new EstimateError(
        `"${line.description}": frequency and duration must be at least 1.`);
    }
    return freq * days;
  }

  // Only one of the two given is almost certainly a half-finished entry rather
  // than an intent, and guessing the other would quietly misprice it.
  if (freq !== null || days !== null) {
    throw new EstimateError(
      `"${line.description}": give both frequency per day and duration in days, or neither.`);
  }

  const qty = line.quantity ?? 1;
  if (!Number.isInteger(qty)) {
    throw new EstimateError(`"${line.description}": quantity must be a whole number.`);
  }
  if (qty < 1) {
    throw new EstimateError(`"${line.description}": quantity must be at least 1.`);
  }
  return qty;
}

/** One line's money. Separate so a single figure can be checked in isolation. */
export function costLine(line: DraftLine): { quantity: number; totalKobo: number } {
  const price = line.unitPriceKobo;

  if (!Number.isInteger(price)) {
    // A fractional kobo means someone divided somewhere upstream. Rounding here
    // would hide it; the price master is where it must be fixed.
    throw new EstimateError(
      `"${line.description}": price must be a whole number of kobo, got ${price}.`);
  }
  if (price < 0) {
    throw new EstimateError(`"${line.description}": price cannot be negative.`);
  }

  const quantity = resolveQuantity(line);
  return { quantity, totalKobo: price * quantity };
}

export interface RecalculateInput {
  lines: DraftLine[];
  /** Nights charged. Only used to expand an ADMISSION line priced per day. */
  expectedStayDays?: number;
  admissionType?: 'DAY_CASE' | 'INPATIENT';
  /**
   * Deposit as a percentage of the subtotal, 0–100. Hospital policy, so it
   * arrives from configuration rather than being fixed here.
   */
  depositPercent?: number;
  /** Fixed deposit in kobo. Takes precedence over depositPercent when given. */
  depositKobo?: number;
}

/**
 * The whole estimate. This is the only place a total is produced.
 *
 * Deliberately tolerant of an empty line list — a DRAFT is created at booking
 * before anyone has costed anything, and that is a valid state, not an error.
 */
export function recalculate(input: RecalculateInput): EstimateTotals {
  const warnings: string[] = [];
  const stayDays = input.expectedStayDays ?? 0;

  if (input.admissionType === 'INPATIENT' && stayDays < 1) {
    warnings.push('Inpatient admission with no expected length of stay — admission charges will read as zero.');
  }
  if (input.admissionType === 'DAY_CASE' && stayDays > 0) {
    warnings.push('Day case with an expected stay entered; check whether admission should be charged.');
  }

  const costed: CostedLine[] = [];

  // Grouped by section for the document, but ordered within a section as the
  // caller supplied, so a clinician's ordering of a drug list is preserved.
  for (const section of SECTION_ORDER) {
    for (const line of input.lines.filter((l) => l.section === section)) {
      // An admission line priced per day is expanded here rather than by the
      // caller, so "3 nights" cannot disagree with the header on the document.
      const isPerDayAdmission =
        line.section === 'ADMISSION' &&
        line.frequencyPerDay == null &&
        line.durationDays == null &&
        line.quantity == null;

      const effective: DraftLine = isPerDayAdmission
        ? { ...line, quantity: Math.max(stayDays, 0) || 1 }
        : line;

      const { quantity, totalKobo } = costLine(effective);

      costed.push({
        ...effective,
        unit: effective.unit ?? 'each',
        quantity,
        totalKobo,
        sortOrder: costed.length,
      });
    }
  }

  // A section the caller invented that is not in SECTION_ORDER would be dropped
  // silently by the loop above, so refuse instead. Losing a charge is worse than
  // failing loudly.
  const known = new Set(SECTION_ORDER);
  const unknown = input.lines.filter((l) => !known.has(l.section));
  if (unknown.length) {
    throw new EstimateError(
      `Unknown estimate section(s): ${Array.from(new Set(unknown.map((l) => String(l.section)))).join(', ')}`);
  }

  const sections: SectionTotal[] = SECTION_ORDER.map((section) => {
    const inSection = costed.filter((l) => l.section === section);
    return {
      section,
      label: SECTION_LABELS[section],
      lineCount: inSection.length,
      totalKobo: inSection.reduce((sum, l) => sum + l.totalKobo, 0),
    };
  }).filter((s) => s.lineCount > 0);

  const subtotalKobo = costed.reduce((sum, l) => sum + l.totalKobo, 0);

  // Deposit: an explicit amount wins over a percentage, because a person who
  // typed a figure meant that figure.
  let depositKobo = 0;
  if (input.depositKobo != null) {
    if (!Number.isInteger(input.depositKobo) || input.depositKobo < 0) {
      throw new EstimateError('Deposit must be a whole, non-negative number of kobo.');
    }
    depositKobo = Math.min(input.depositKobo, subtotalKobo);
    if (input.depositKobo > subtotalKobo) {
      warnings.push('Deposit exceeded the total and was capped at the total.');
    }
  } else if (input.depositPercent != null) {
    const pct = input.depositPercent;
    if (!(pct >= 0 && pct <= 100)) {
      throw new EstimateError('Deposit percentage must be between 0 and 100.');
    }
    // Floor, so a deposit is never a kobo more than the stated percentage.
    depositKobo = Math.floor((subtotalKobo * pct) / 100);
  }

  const overridden = costed.filter((l) => l.priceOverridden);
  if (overridden.length) {
    warnings.push(
      `${overridden.length} line(s) have a price overridden by hand — each needs a reason before the estimate is issued.`);
  }
  const missingReason = overridden.filter((l) => !(l.overrideReason ?? '').trim());
  if (missingReason.length) {
    warnings.push(
      `Override without a reason: ${missingReason.map((l) => l.description).join(', ')}`);
  }
  const free = costed.filter((l) => l.unitPriceKobo === 0);
  if (free.length) {
    warnings.push(
      `${free.length} line(s) priced at zero — usually a charge missing from the price master.`);
  }

  return {
    lines: costed,
    sections,
    subtotalKobo,
    depositKobo,
    // subtotal is what is owed; the deposit is what is asked for up front. The
    // two are reported separately and the total is NOT reduced by the deposit.
    totalKobo: subtotalKobo,
    warnings,
  };
}

/** Kobo to naira for display. Never used in arithmetic. */
export function formatNaira(kobo: number): string {
  const naira = Math.trunc(kobo / 100);
  const k = Math.abs(kobo % 100);
  return `₦${naira.toLocaleString('en-NG')}.${String(k).padStart(2, '0')}`;
}
