import { z } from 'zod';
import { ApprovalDecision, RetirementStatus, SignatureKind, WorkflowStage } from '../enums';
import {
  dataUrlSchema,
  isoDateSchema,
  koboSchema,
  optionalText,
  requiredText,
  uuidSchema,
} from './common';

export const signatureInputSchema = z.object({
  kind: z.nativeEnum(SignatureKind),
  imageData: dataUrlSchema,
  signedByName: requiredText('Name', 160),
  signedByDesignation: requiredText('Designation', 120),
  /** Client clock; the server records its own authoritative timestamp too. */
  signedAt: z.string().datetime().optional(),
});

export const createRetirementSchema = z.object({
  imprestId: uuidSchema,
  /** Blank on create — the server allocates the next number in the series. */
  retirementNumber: z.string().trim().max(64).optional(),
  retirementDate: isoDateSchema,
  /**
   * Omit to compile every posted expenditure on the imprest, which is the
   * normal case. Supply ids only for a partial retirement.
   */
  expenditureIds: z.array(uuidSchema).max(5000).optional(),
  balanceReturned: koboSchema.optional(),
  certificationText: optionalText(2000),
  remarks: optionalText(1000),
  preparerSignature: signatureInputSchema.optional(),
});

export const updateRetirementSchema = z.object({
  retirementDate: isoDateSchema.optional(),
  balanceReturned: koboSchema.optional(),
  certificationText: optionalText(2000),
  remarks: optionalText(1000),
  version: z.number().int().min(0),
});

export const submitRetirementSchema = z.object({
  /** A retirement enters the chain over the preparer's signature. */
  signature: signatureInputSchema,
  comments: optionalText(1000),
  version: z.number().int().min(0),
});

/**
 * A decision at a review stage. REJECT and QUERY both demand comments — an
 * unexplained rejection is useless to the officer who must correct the packet,
 * and the audit trail is expected to carry the reason.
 */
export const approvalDecisionSchema = z
  .object({
    decision: z.nativeEnum(ApprovalDecision),
    comments: optionalText(2000),
    signature: signatureInputSchema.optional(),
    version: z.number().int().min(0),
  })
  .superRefine((value, ctx) => {
    if (value.decision !== ApprovalDecision.APPROVE && !value.comments) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comments'],
        message: 'State the reason for the rejection or query.',
      });
    }
    if (value.decision === ApprovalDecision.APPROVE && !value.signature) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signature'],
        message: 'An approval must be signed.',
      });
    }
  });

export const closeRetirementSchema = z.object({
  balanceReturned: koboSchema,
  /** Treasury receipt evidencing the unspent cash returned. */
  returnReceiptNumber: optionalText(64),
  comments: optionalText(1000),
  signature: signatureInputSchema.optional(),
  version: z.number().int().min(0),
});

export const retirementFilterSchema = z.object({
  imprestId: uuidSchema.optional(),
  status: z.nativeEnum(RetirementStatus).optional(),
  stage: z.nativeEnum(WorkflowStage).optional(),
  preparedById: uuidSchema.optional(),
  awaitingMyAction: z.coerce.boolean().default(false),
});

export type CreateRetirementInput = z.infer<typeof createRetirementSchema>;
export type SubmitRetirementInput = z.infer<typeof submitRetirementSchema>;
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
export type SignatureInput = z.infer<typeof signatureInputSchema>;
