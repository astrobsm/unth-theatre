/**
 * Reusable validation primitives.
 *
 * Every schema in this package is built from these, so a rule such as "a TIN
 * is 8–20 alphanumerics with optional dashes" is stated once and enforced
 * identically at the API boundary and in the offline form.
 */

import { z } from 'zod';
import { isValidKobo, parseAmount } from '../money';

export const uuidSchema = z.string().uuid('Must be a valid identifier');

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Not a real date');

export const isoDateTimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a valid timestamp');

/**
 * A monetary field. Accepts kobo integers from the API and the typed forms a
 * cashier uses (`1,250.75`, `₦1250.75`), always normalising to kobo.
 */
export const koboSchema = z
  .union([z.number(), z.string()])
  .transform((value, ctx) => {
    try {
      return typeof value === 'number' && isValidKobo(value) ? value : parseAmount(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'Not a valid amount',
      });
      return z.NEVER;
    }
  });

/** A monetary field that must be greater than zero. */
export const positiveKoboSchema = koboSchema.refine((v) => v > 0, 'Amount must be greater than zero');

export const quantitySchema = z
  .number()
  .positive('Quantity must be greater than zero')
  .max(1_000_000, 'Quantity is implausibly large')
  .refine(
    (v) => Number.isInteger(v * 1000),
    'Quantity may carry at most three decimal places',
  );

export const percentageSchema = z.number().min(0).max(100);

/** Nigerian mobile/landline in local or +234 form. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+?234|0)[0-9\s-]{7,14}$/, 'Enter a valid Nigerian phone number')
  .transform((value) => value.replace(/[\s-]/g, ''));

export const tinSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{8,20}$/, 'A TIN is 8–20 letters, digits or dashes')
  .transform((value) => value.toUpperCase());

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254);

export const staffNumberSchema = z
  .string()
  .trim()
  .min(3, 'Staff number is too short')
  .max(32)
  .regex(/^[A-Za-z0-9/-]+$/, 'Staff number may contain letters, digits, slashes and dashes')
  .transform((value) => value.toUpperCase());

/** Free text that must not be blank once trimmed. */
export const requiredText = (label: string, max = 500) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`);

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullish()
    .transform((value) => value ?? null);

export const codeSchema = z
  .string()
  .trim()
  .min(1, 'Code is required')
  .max(32)
  .regex(/^[A-Za-z0-9./-]+$/, 'Codes may contain letters, digits, dots, slashes and dashes')
  .transform((value) => value.toUpperCase());

/** A base64 PNG data URL, as produced by the signature pad and camera. */
export const dataUrlSchema = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Expected a PNG, JPEG or WebP data URL')
  .max(4_000_000, 'Image is too large — compress before submitting');

export const gpsSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().nonnegative().max(100_000).optional(),
  })
  .nullish();

// ---------------------------------------------------------------------------
// Pagination, sorting and search
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sortBy: z.string().trim().max(64).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const searchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  vendor: z.string().trim().max(200).optional(),
  receiptNumber: z.string().trim().max(64).optional(),
  voucherNumber: z.string().trim().max(64).optional(),
  imprestNumber: z.string().trim().max(64).optional(),
  officerId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  budgetHeadId: uuidSchema.optional(),
  departmentId: uuidSchema.optional(),
  financialYearId: uuidSchema.optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Use the format YYYY-MM').optional(),
  status: z.string().trim().max(32).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  minAmount: koboSchema.optional(),
  maxAmount: koboSchema.optional(),
  hasReceipt: z.coerce.boolean().optional(),
  includeDeleted: z.coerce.boolean().default(false),
});

export const listQuerySchema = paginationSchema.merge(searchSchema).refine(
  (value) => !value.from || !value.to || value.from <= value.to,
  { message: 'The start date must not be after the end date', path: ['from'] },
);

/** Guards write endpoints against lost updates. */
export const versionedUpdateSchema = z.object({
  version: z.number().int().min(0, 'A record version is required for updates'),
});

/** Soft delete always demands a reason — the audit trail records why. */
export const softDeleteSchema = z.object({
  reason: requiredText('Reason for removal', 500),
  version: z.number().int().min(0),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
export type ListQueryInput = z.infer<typeof listQuerySchema>;
