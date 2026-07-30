import { z } from 'zod';
import { ImprestStatus } from '../enums';
import {
  isoDateSchema,
  koboSchema,
  optionalText,
  positiveKoboSchema,
  requiredText,
  uuidSchema,
} from './common';

const imprestCore = z.object({
  /**
   * Client-minted identity, so an imprest raised offline keeps one identity
   * across the device and the server. Omitted on an ordinary online create.
   */
  id: uuidSchema.optional(),
  /** Left blank on create — the server allocates the next number in the series. */
  imprestNumber: z.string().trim().max(64).optional(),
  voucherNumber: optionalText(64),
  approvalNumber: optionalText(64),

  financialYearId: uuidSchema,
  departmentId: uuidSchema,
  office: optionalText(160),

  dateApproved: isoDateSchema,
  dateReceived: isoDateSchema.nullish().transform((v) => v ?? null),

  amountApproved: positiveKoboSchema,
  amountReceived: koboSchema.default(0),

  receivingOfficerId: uuidSchema,
  purpose: requiredText('Purpose', 1000),
  fundingSource: optionalText(160),

  budgetHeadId: uuidSchema.nullish().transform((v) => v ?? null),
  voteCodeId: uuidSchema.nullish().transform((v) => v ?? null),
  costCentreId: uuidSchema.nullish().transform((v) => v ?? null),

  expectedRetirementDate: isoDateSchema,
  remarks: optionalText(1000),
});

/**
 * Cross-field rules applied to both create and update. Chronology matters
 * here: an imprest received before it was approved, or due for retirement
 * before it was approved, is a data-entry slip that would otherwise poison
 * every ageing report downstream.
 */
function checkImprestConsistency(
  value: {
    amountApproved: number;
    amountReceived: number;
    dateApproved: string;
    dateReceived: string | null;
    expectedRetirementDate: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (value.amountReceived > value.amountApproved) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['amountReceived'],
      message: 'The amount received cannot exceed the amount approved.',
    });
  }
  if (value.dateReceived && value.dateReceived < value.dateApproved) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dateReceived'],
      message: 'The imprest cannot be received before it was approved.',
    });
  }
  if (value.expectedRetirementDate < value.dateApproved) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedRetirementDate'],
      message: 'The retirement date cannot precede the approval date.',
    });
  }
}

export const createImprestSchema = imprestCore.superRefine(checkImprestConsistency);

export const updateImprestSchema = imprestCore
  .omit({ id: true })
  .extend({ version: z.number().int().min(0) })
  .superRefine(checkImprestConsistency);

/** Recording receipt of funds against an approved imprest activates it. */
export const receiveImprestSchema = z.object({
  amountReceived: positiveKoboSchema,
  dateReceived: isoDateSchema,
  voucherNumber: optionalText(64),
  remarks: optionalText(1000),
  version: z.number().int().min(0),
});

export const closeImprestSchema = z.object({
  /** Unspent cash physically returned to the cashier. */
  balanceReturned: koboSchema.default(0),
  closingRemarks: requiredText('Closing remarks', 1000),
  version: z.number().int().min(0),
});

export const cancelImprestSchema = z.object({
  reason: requiredText('Reason for cancellation', 1000),
  version: z.number().int().min(0),
});

export const imprestFilterSchema = z.object({
  status: z.nativeEnum(ImprestStatus).optional(),
  financialYearId: uuidSchema.optional(),
  departmentId: uuidSchema.optional(),
  receivingOfficerId: uuidSchema.optional(),
  overdueOnly: z.coerce.boolean().default(false),
});

export type CreateImprestInput = z.infer<typeof createImprestSchema>;
export type UpdateImprestInput = z.infer<typeof updateImprestSchema>;
export type ReceiveImprestInput = z.infer<typeof receiveImprestSchema>;
export type CloseImprestInput = z.infer<typeof closeImprestSchema>;
