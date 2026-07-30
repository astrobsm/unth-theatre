/**
 * Money handling.
 *
 * Every monetary value in this system is an **integer number of kobo**
 * (1 Naira = 100 kobo). Floating point Naira is never stored, transmitted or
 * summed — an imprest retirement that is off by a kobo is a query from the
 * Internal Auditor, so exactness is a functional requirement, not a nicety.
 *
 * The safe integer ceiling (2^53 - 1 kobo) is roughly ₦90 trillion, which is
 * several orders of magnitude above any conceivable hospital imprest, so a
 * plain `number` is a sound carrier and survives JSON round-trips unharmed.
 */

/** An integer quantity of kobo. */
export type Kobo = number;

export const KOBO_PER_NAIRA = 100;
export const MAX_SAFE_KOBO = Number.MAX_SAFE_INTEGER;
export const NAIRA_SIGN = '₦'; // ₦

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** True when `value` is a usable kobo amount: a finite, non-negative integer. */
export function isValidKobo(value: unknown): value is Kobo {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_SAFE_KOBO
  );
}

/** Throws unless `value` is a valid kobo amount. Used at trust boundaries. */
export function assertKobo(value: unknown, field = 'amount'): asserts value is Kobo {
  if (!isValidKobo(value)) {
    throw new MoneyError(
      `${field} must be a non-negative integer number of kobo, received: ${String(value)}`,
    );
  }
}

/**
 * Converts a Naira quantity to kobo, rounding half-up at the kobo boundary.
 *
 * Half-up (rather than JavaScript's banker-ish `Math.round` on negatives) is
 * what a cashier does by hand, which keeps the printed schedule and the
 * system in agreement.
 */
export function nairaToKobo(naira: number): Kobo {
  if (!Number.isFinite(naira)) {
    throw new MoneyError(`Cannot convert non-finite value to kobo: ${String(naira)}`);
  }
  const scaled = naira * KOBO_PER_NAIRA;
  // Correct for binary representation drift (e.g. 1.005 * 100 === 100.49999…).
  const rounded = Math.round(Number(scaled.toFixed(6)));
  if (!Number.isSafeInteger(rounded)) {
    throw new MoneyError(`Amount out of safe range: ${String(naira)}`);
  }
  return rounded;
}

/** Converts kobo to a Naira `number`. For display and export only — never sum these. */
export function koboToNaira(kobo: Kobo): number {
  assertKobo(kobo);
  return kobo / KOBO_PER_NAIRA;
}

/**
 * Parses operator input into kobo.
 *
 * Accepts the shapes people actually type into a cash book: `1,250.75`,
 * `₦1250.75`, `N1,250`, `1250`. Rejects anything else rather than guessing.
 */
export function parseAmount(input: string | number): Kobo {
  if (typeof input === 'number') return nairaToKobo(input);

  const cleaned = input
    .trim()
    .replace(/^[₦N]/i, '')
    .replace(/,/g, '')
    .replace(/\s/g, '');

  if (cleaned === '') throw new MoneyError('Amount is required');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new MoneyError(`"${input}" is not a valid Naira amount`);
  }
  return nairaToKobo(Number(cleaned));
}

/** Formats kobo as `₦1,250.75`. Set `withSymbol: false` for table columns. */
export function formatNaira(
  kobo: Kobo,
  options: { withSymbol?: boolean; decimals?: boolean } = {},
): string {
  const { withSymbol = true, decimals = true } = options;
  assertKobo(kobo);

  const naira = Math.floor(kobo / KOBO_PER_NAIRA);
  const remainder = kobo % KOBO_PER_NAIRA;
  const whole = naira.toLocaleString('en-NG');
  const body = decimals ? `${whole}.${String(remainder).padStart(2, '0')}` : whole;

  return withSymbol ? `${NAIRA_SIGN}${body}` : body;
}

/** Compact form for dashboard tiles: `₦1.25m`, `₦850.00k`. */
export function formatNairaCompact(kobo: Kobo): string {
  assertKobo(kobo);
  const naira = kobo / KOBO_PER_NAIRA;
  if (naira >= 1_000_000_000) return `${NAIRA_SIGN}${(naira / 1_000_000_000).toFixed(2)}b`;
  if (naira >= 1_000_000) return `${NAIRA_SIGN}${(naira / 1_000_000).toFixed(2)}m`;
  if (naira >= 1_000) return `${NAIRA_SIGN}${(naira / 1_000).toFixed(2)}k`;
  return formatNaira(kobo);
}

// ---------------------------------------------------------------------------
// Arithmetic — total/subtract go through here so overflow is caught centrally
// ---------------------------------------------------------------------------

export function addKobo(...values: Kobo[]): Kobo {
  let total = 0;
  for (const value of values) {
    assertKobo(value);
    total += value;
  }
  if (!Number.isSafeInteger(total)) throw new MoneyError('Sum exceeds safe range');
  return total;
}

/** Difference in kobo. May be negative — callers decide whether that is legal. */
export function subtractKobo(minuend: Kobo, subtrahend: Kobo): number {
  assertKobo(minuend, 'minuend');
  assertKobo(subtrahend, 'subtrahend');
  return minuend - subtrahend;
}

/** `quantity` may carry up to three decimals (e.g. 2.5 litres of fuel). */
export function multiplyKobo(unitCost: Kobo, quantity: number): Kobo {
  assertKobo(unitCost, 'unitCost');
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new MoneyError(`Quantity must be a non-negative number, received: ${String(quantity)}`);
  }
  const product = Math.round(unitCost * quantity);
  if (!Number.isSafeInteger(product)) throw new MoneyError('Product exceeds safe range');
  return product;
}

/** Applies a percentage (e.g. 7.5 for VAT) to a kobo base, rounded half-up. */
export function percentageOf(base: Kobo, percent: number): Kobo {
  assertKobo(base, 'base');
  if (!Number.isFinite(percent) || percent < 0) {
    throw new MoneyError(`Percentage must be non-negative, received: ${String(percent)}`);
  }
  return Math.round((base * percent) / 100);
}

/** `part` as a percentage of `whole`, capped at 0 when `whole` is zero. */
export function percentageRatio(part: Kobo, whole: Kobo): number {
  assertKobo(part, 'part');
  assertKobo(whole, 'whole');
  if (whole === 0) return 0;
  return Number(((part / whole) * 100).toFixed(2));
}

export function sumBy<T>(items: readonly T[], selector: (item: T) => Kobo): Kobo {
  return addKobo(...items.map(selector));
}

// ---------------------------------------------------------------------------
// Amount in words — required on Nigerian payment vouchers and retirements
// ---------------------------------------------------------------------------

const UNITS = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];
const SCALES: Array<{ value: number; name: string }> = [
  { value: 1_000_000_000_000, name: 'Trillion' },
  { value: 1_000_000_000, name: 'Billion' },
  { value: 1_000_000, name: 'Million' },
  { value: 1_000, name: 'Thousand' },
];

function belowThousandToWords(n: number): string {
  if (n === 0) return '';
  const parts: string[] = [];

  const hundreds = Math.floor(n / 100);
  const rest = n % 100;

  if (hundreds > 0) parts.push(`${UNITS[hundreds]} Hundred`);
  if (rest > 0) {
    if (hundreds > 0) parts.push('and');
    if (rest < 20) {
      parts.push(UNITS[rest] as string);
    } else {
      const ten = TENS[Math.floor(rest / 10)] as string;
      const unit = rest % 10;
      parts.push(unit > 0 ? `${ten}-${UNITS[unit]}` : ten);
    }
  }
  return parts.join(' ');
}

function integerToWords(value: number): string {
  if (value === 0) return 'Zero';
  const segments: string[] = [];
  let remaining = value;

  for (const scale of SCALES) {
    if (remaining >= scale.value) {
      const count = Math.floor(remaining / scale.value);
      segments.push(`${integerToWords(count)} ${scale.name}`);
      remaining %= scale.value;
    }
  }
  if (remaining > 0) segments.push(belowThousandToWords(remaining));
  return segments.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Renders kobo as the words printed on a voucher, e.g.
 * `One Million, Two Hundred and Fifty Thousand Naira, Seventy-Five Kobo Only`.
 */
export function amountInWords(kobo: Kobo): string {
  assertKobo(kobo);
  const naira = Math.floor(kobo / KOBO_PER_NAIRA);
  const remainder = kobo % KOBO_PER_NAIRA;

  const nairaWords = `${integerToWords(naira)} Naira`;
  if (remainder === 0) return `${nairaWords} Only`;
  return `${nairaWords}, ${integerToWords(remainder)} Kobo Only`;
}
