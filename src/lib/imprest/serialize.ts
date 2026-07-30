/**
 * Wire serialisation.
 *
 * Prisma hands back `BigInt` for kobo columns and `Date` for timestamps;
 * neither survives `JSON.stringify` in the shape the client contract expects.
 * Everything leaving the API passes through here, which converts:
 *
 *   BigInt  → number  (kobo; safe to ~₦90tn, well beyond any hospital imprest)
 *   Date    → ISO 8601 string
 *   Decimal → number
 *
 * `quantityMilli` is the one field that is *not* money: it is a quantity
 * scaled by 1000 so 2.5 litres stays exact in an integer column, and it is
 * unscaled here so the client always sees `quantity: 2.5`.
 */

import type { IsoDate, IsoDateTime } from './index';

/** Kobo columns can exceed Number.MAX_SAFE_INTEGER only through corruption. */
export function bigIntToKobo(value: bigint): number {
  const asNumber = Number(value);
  if (!Number.isSafeInteger(asNumber)) {
    throw new RangeError(`Monetary value ${value.toString()} exceeds the safe integer range.`);
  }
  return asNumber;
}

export function koboToBigInt(value: number): bigint {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Monetary value ${value} must be an integer number of kobo.`);
  }
  return BigInt(value);
}

/** Scaled-integer quantities: 2.5 → 2500 in the column, and back again. */
export function quantityToMilli(quantity: number): bigint {
  return BigInt(Math.round(quantity * 1000));
}

export function milliToQuantity(milli: bigint): number {
  return Number(milli) / 1000;
}

export function toIsoDateTime(value: Date | null | undefined): IsoDateTime | null {
  return value ? value.toISOString() : null;
}

export function toIsoDate(value: Date | null | undefined): IsoDate | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Parses an ISO calendar date into the UTC midnight a `@db.Date` column expects. */
export function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

const KEYS_LEFT_AS_DATE_ONLY = new Set([
  'date',
  'dateApproved',
  'dateReceived',
  'receiptDate',
  'retirementDate',
  'expectedRetirementDate',
  'startDate',
  'endDate',
]);

/**
 * Recursively converts a Prisma result into its wire shape.
 *
 * Deliberately structural rather than per-model: a new column added to the
 * schema serialises correctly without anyone remembering to update a mapper.
 */
export function serialize<T>(value: T): unknown {
  return convert(value, null);
}

function convert(value: unknown, key: string | null): unknown {
  if (value === null || value === undefined) return value ?? null;

  if (typeof value === 'bigint') {
    return key === 'quantityMilli' ? milliToQuantity(value) : bigIntToKobo(value);
  }

  if (value instanceof Date) {
    return key && KEYS_LEFT_AS_DATE_ONLY.has(key)
      ? value.toISOString().slice(0, 10)
      : value.toISOString();
  }

  if (Array.isArray(value)) return value.map((entry) => convert(entry, key));

  if (typeof value === 'object') {
    // Prisma Decimal exposes toNumber(); anything else object-shaped is a record.
    const maybeDecimal = value as { toNumber?: () => number; constructor?: { name?: string } };
    if (typeof maybeDecimal.toNumber === 'function' && maybeDecimal.constructor?.name === 'Decimal') {
      return maybeDecimal.toNumber();
    }
    if (Buffer.isBuffer(value)) return value.toString('base64');

    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      // `quantityMilli` is presented to the client as `quantity`.
      if (childKey === 'quantityMilli') {
        output.quantity = milliToQuantity(childValue as bigint);
        continue;
      }
      output[childKey] = convert(childValue, childKey);
    }
    return output;
  }

  return value;
}

/**
 * Strips columns that must never leave the server. Applied to user records
 * wherever they are embedded, including inside relations.
 */
const SENSITIVE_KEYS = new Set([
  'passwordHash',
  'twoFactorSecret',
  'twoFactorRecovery',
  'refreshTokenHash',
]);

/**
 * True only for `{}` and `Object.create(null)` — not for `Date`, `Buffer`,
 * `Decimal`, or any other class instance.
 *
 * This distinction is load-bearing. Recursing into a `Date` with
 * `Object.entries` yields `[]`, which would rebuild it as an empty object and
 * silently destroy every timestamp in the response before the serialiser ever
 * saw it.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function stripSensitive<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripSensitive) as unknown as T;

  // Dates, Buffers and Decimals pass through untouched for `serialize` to convert.
  if (!isPlainObject(value)) return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    output[key] = stripSensitive(child);
  }
  return output as T;
}

/** The standard outbound transform: strip secrets, then convert types. */
export function present<T>(value: T): unknown {
  return serialize(stripSensitive(value));
}
