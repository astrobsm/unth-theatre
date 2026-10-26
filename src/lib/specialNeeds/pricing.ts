// ============================================================
// What the patient is asked to deposit
// ------------------------------------------------------------
// The deposit is no longer a flat tariff by magnitude. It is the sum of
// what this case will actually consume: the bundle its size carries, plus
// whatever the surgeon added, priced line by line. Two major cases needing
// different meshes cost different amounts, and a flat figure makes one
// patient subsidise the other.
//
// TWO RULES THAT THE REST OF THIS FILE EXISTS TO ENFORCE.
//
//   AN UNPRICED LINE IS NOT A FREE LINE. A null price means nobody has
//   priced that item yet. Treating it as zero produces a confident, wrong,
//   too-small number that a patient pays and is then asked to top up at the
//   theatre door. Unpriced lines are counted and reported, and the quote
//   says plainly that it is incomplete.
//
//   MONEY IS COUNTED IN KOBO, as integers. Naira amounts held as floats
//   accumulate rounding error across thirty lines, and the figure on the
//   receipt stops matching the figure in the record — which is the kind of
//   discrepancy that is noticed by an auditor rather than by us.
// ============================================================

export type Magnitude = 'MINOR' | 'INTERMEDIATE' | 'MAJOR' | 'SUPER_MAJOR';

export const MAGNITUDES: Magnitude[] = ['MINOR', 'INTERMEDIATE', 'MAJOR', 'SUPER_MAJOR'];

export const MAGNITUDE_LABELS: Record<Magnitude, string> = {
  MINOR: 'Minor',
  INTERMEDIATE: 'Intermediate',
  MAJOR: 'Major',
  SUPER_MAJOR: 'Super major',
};

/**
 * The refundable float on the consumable side.
 *
 * Theatre asks for things mid-case that nobody could have listed at
 * booking. Without a float, somebody's relative is sent to a cashier while
 * the abdomen is open.
 */
export const CONTINGENCY_RATE = 0.1;

export interface PriceableLine {
  /** Naira, as a string or number. Null/undefined means NOT PRICED. */
  unitPrice?: string | number | null;
  quantity: number;
  dispensedByPharmacy: boolean;
  name?: string;
}

export interface Quote {
  /** Kobo. Integers throughout — see the note above. */
  consumableSubtotalKobo: number;
  pharmacySubtotalKobo: number;
  consumableContingencyKobo: number;
  totalKobo: number;
  /** Lines that had no price. The quote is incomplete by exactly these. */
  unpricedLines: string[];
  complete: boolean;
}

/** Naira (string or number) to whole kobo. Returns null when unpriced. */
export function toKobo(price: string | number | null | undefined): number | null {
  if (price === null || price === undefined || price === '') return null;
  const n = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(n) || n < 0) return null;
  // Rounded once, here, rather than after multiplying by a quantity.
  return Math.round(n * 100);
}

/** Kobo back to naira, for display. Never used to compute anything. */
export function koboToNaira(kobo: number): number {
  return kobo / 100;
}

/** "₦12,450.00" */
export function formatNaira(kobo: number): string {
  const naira = koboToNaira(kobo);
  return `₦${naira.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Price a case.
 *
 * The contingency applies to the CONSUMABLE side only. Drugs are dispensed
 * against a prescription and a surgeon does not call for an extra ampoule
 * of something nobody listed in the way they call for another suture.
 */
export function quoteFor(lines: PriceableLine[]): Quote {
  let consumable = 0;
  let pharmacy = 0;
  const unpriced: string[] = [];

  for (const line of lines) {
    const qty = Math.max(0, Math.floor(line.quantity || 0));
    if (qty === 0) continue;

    const unit = toKobo(line.unitPrice);
    if (unit === null) {
      // Counted, never guessed at. See the note at the top.
      unpriced.push(line.name ?? 'Unnamed item');
      continue;
    }

    const amount = unit * qty;
    if (line.dispensedByPharmacy) pharmacy += amount;
    else consumable += amount;
  }

  // Rounded up to the whole kobo: a contingency short by a fraction is a
  // contingency that fails on the one line it was held for.
  const contingency = Math.ceil(consumable * CONTINGENCY_RATE);

  return {
    consumableSubtotalKobo: consumable,
    pharmacySubtotalKobo: pharmacy,
    consumableContingencyKobo: contingency,
    totalKobo: consumable + contingency + pharmacy,
    unpricedLines: unpriced,
    complete: unpriced.length === 0,
  };
}

/** What a patient should be shown, in the order they would ask it. */
export function quoteBreakdown(q: Quote): { label: string; amount: string; note?: string }[] {
  return [
    { label: 'Consumables', amount: formatNaira(q.consumableSubtotalKobo) },
    {
      label: 'Theatre contingency (10%)',
      amount: formatNaira(q.consumableContingencyKobo),
      note: 'Refunded if it is not used during the operation.',
    },
    { label: 'Drugs', amount: formatNaira(q.pharmacySubtotalKobo) },
    { label: 'Total deposit', amount: formatNaira(q.totalKobo) },
  ];
}

/** Is this a magnitude the system knows? */
export function isMagnitude(v: string | null | undefined): v is Magnitude {
  return !!v && (MAGNITUDES as string[]).includes(v);
}
