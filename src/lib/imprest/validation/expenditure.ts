import { z } from 'zod';
import { AttachmentKind, ExpenditureStatus, PaymentMethod } from '../enums';
import {
  dataUrlSchema,
  isoDateSchema,
  koboSchema,
  optionalText,
  phoneSchema,
  positiveKoboSchema,
  quantitySchema,
  requiredText,
  tinSchema,
  uuidSchema,
} from './common';

const expenditureCore = z.object({
  /**
   * Client-minted identity. An offline device generates the UUID so its local
   * record and the server record are the same row — without this the device
   * could never reconcile what it created while disconnected. Omitted on an
   * ordinary online create, where the server allocates it.
   */
  id: uuidSchema.optional(),
  /** Allocated by the server on create; supplied on offline replay. */
  expenseNumber: z.string().trim().max(64).optional(),
  imprestId: uuidSchema,

  date: isoDateSchema,

  vendorId: uuidSchema.nullish().transform((v) => v ?? null),
  vendorName: requiredText('Vendor name', 200),
  vendorPhone: phoneSchema.nullish().transform((v) => v ?? null),
  vendorAddress: optionalText(300),
  vendorTin: tinSchema.nullish().transform((v) => v ?? null),

  description: requiredText('Description', 1000),
  purpose: optionalText(1000),
  categoryId: uuidSchema,
  subcategoryId: uuidSchema.nullish().transform((v) => v ?? null),

  quantity: quantitySchema.default(1),
  unitOfMeasure: optionalText(32),
  unitCost: positiveKoboSchema,
  /** Optional override when the invoice total differs from quantity × unit cost. */
  totalCost: koboSchema.optional(),

  paymentMethod: z.nativeEnum(PaymentMethod),
  voucherNumber: optionalText(64),
  /** The payment voucher the expenditure was charged on. */
  paymentVoucherNumber: optionalText(64),
  receiptNumber: optionalText(64),
  invoiceNumber: optionalText(64),
  /** Set when payment was by cheque or transfer rather than cash. */
  chequeNumber: optionalText(64),
  bankReference: optionalText(64),
  receiptDate: isoDateSchema.nullish().transform((v) => v ?? null),

  vat: koboSchema.default(0),
  withholdingTax: koboSchema.default(0),

  budgetHeadId: uuidSchema.nullish().transform((v) => v ?? null),
  voteCodeId: uuidSchema.nullish().transform((v) => v ?? null),

  remarks: optionalText(1000),
  officerResponsibleId: uuidSchema,
  witnessName: optionalText(160),
  witnessDesignation: optionalText(120),

  gpsLatitude: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
  gpsLongitude: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
  gpsAccuracy: z.number().nonnegative().max(100_000).nullish().transform((v) => v ?? null),

  /** Captured at the point of entry and bound to the line's content hash. */
  signature: dataUrlSchema.nullish().transform((v) => v ?? null),
});

/**
 * A receipt dated after the payment, or tax exceeding the invoice, both point
 * at a mis-keyed figure. Catching them here keeps the cash book internally
 * consistent before anything reaches the ledger.
 */
function checkExpenditureConsistency(
  value: {
    date: string;
    receiptDate: string | null;
    quantity: number;
    unitCost: number;
    totalCost?: number;
    vat: number;
    withholdingTax: number;
  },
  ctx: z.RefinementCtx,
): void {
  const effectiveTotal = value.totalCost ?? Math.round(value.unitCost * value.quantity);

  if (value.receiptDate && value.receiptDate < value.date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['receiptDate'],
      message: 'The receipt cannot be dated before the payment.',
    });
  }
  if (value.withholdingTax > effectiveTotal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['withholdingTax'],
      message: 'Withholding tax cannot exceed the total cost.',
    });
  }
  if (value.vat > effectiveTotal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['vat'],
      message: 'VAT cannot exceed the total cost.',
    });
  }
  if (effectiveTotal <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unitCost'],
      message: 'The expenditure total must be greater than zero.',
    });
  }
}

export const createExpenditureSchema = expenditureCore.superRefine(checkExpenditureConsistency);

export const updateExpenditureSchema = expenditureCore
  .omit({ imprestId: true, id: true })
  .extend({ version: z.number().int().min(0) })
  .superRefine(checkExpenditureConsistency);

export const queryExpenditureSchema = z.object({
  reason: requiredText('Reason for the query', 1000),
  version: z.number().int().min(0),
});

export const voidExpenditureSchema = z.object({
  reason: requiredText('Reason for voiding', 1000),
  version: z.number().int().min(0),
});

export const expenditureFilterSchema = z.object({
  imprestId: uuidSchema.optional(),
  status: z.nativeEnum(ExpenditureStatus).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  missingReceiptOnly: z.coerce.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export const attachmentMetaSchema = z.object({
  kind: z.nativeEnum(AttachmentKind).default(AttachmentKind.RECEIPT),
  expenditureId: uuidSchema.nullish().transform((v) => v ?? null),
  imprestId: uuidSchema.nullish().transform((v) => v ?? null),
  retirementId: uuidSchema.nullish().transform((v) => v ?? null),
  caption: optionalText(240),
  rotation: z.number().int().refine((v) => [0, 90, 180, 270].includes(v), 'Rotation must be 0, 90, 180 or 270').default(0),
  capturedAt: z.string().datetime().nullish().transform((v) => v ?? null),
  /** Client-computed SHA-256; the server recomputes and rejects a mismatch. */
  checksum: z.string().regex(/^[a-f0-9]{64}$/, 'Expected a SHA-256 hex digest').optional(),
});

/** Direct base64 upload — the path the offline client uses when replaying a queued capture. */
export const base64UploadSchema = attachmentMetaSchema.extend({
  fileName: requiredText('File name', 255),
  mimeType: z
    .string()
    .regex(/^(image\/(png|jpeg|webp)|application\/pdf)$/, 'Only PNG, JPEG, WebP and PDF are accepted'),
  data: z.string().min(1, 'File data is required').max(15_000_000, 'File is too large'),
});

export const updateAttachmentSchema = z.object({
  caption: optionalText(240),
  kind: z.nativeEnum(AttachmentKind).optional(),
  rotation: z.number().int().refine((v) => [0, 90, 180, 270].includes(v)).optional(),
  version: z.number().int().min(0),
});

export type CreateExpenditureInput = z.infer<typeof createExpenditureSchema>;
export type UpdateExpenditureInput = z.infer<typeof updateExpenditureSchema>;
export type Base64UploadInput = z.infer<typeof base64UploadSchema>;
