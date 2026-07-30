import { z } from 'zod';
import { WorkflowStage } from '../enums';
import {
  codeSchema,
  emailSchema,
  isoDateSchema,
  koboSchema,
  optionalText,
  percentageSchema,
  phoneSchema,
  requiredText,
  tinSchema,
  uuidSchema,
} from './common';

// ---------------------------------------------------------------------------
// Organisation structure
// ---------------------------------------------------------------------------

export const departmentSchema = z.object({
  code: codeSchema,
  name: requiredText('Department name', 160),
  office: optionalText(160),
  isActive: z.boolean().default(true),
});

export const budgetHeadSchema = z.object({
  code: codeSchema,
  name: requiredText('Budget head', 200),
  description: optionalText(500),
  isActive: z.boolean().default(true),
});

export const voteCodeSchema = z.object({
  code: codeSchema,
  name: requiredText('Vote code description', 200),
  budgetHeadId: uuidSchema.nullish().transform((v) => v ?? null),
  isActive: z.boolean().default(true),
});

export const costCentreSchema = z.object({
  code: codeSchema,
  name: requiredText('Cost centre', 160),
  isActive: z.boolean().default(true),
});

export const expenseCategorySchema = z.object({
  name: requiredText('Category name', 120),
  parentId: uuidSchema.nullish().transform((v) => v ?? null),
  defaultBudgetHeadId: uuidSchema.nullish().transform((v) => v ?? null),
  sortOrder: z.number().int().min(0).max(9999).default(100),
  isActive: z.boolean().default(true),
});

export const financialYearSchema = z
  .object({
    label: requiredText('Financial year label', 32),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    isCurrent: z.boolean().default(false),
    isClosed: z.boolean().default(false),
  })
  .refine((v) => v.startDate < v.endDate, {
    message: 'The financial year must end after it begins.',
    path: ['endDate'],
  });

export const vendorSchema = z.object({
  name: requiredText('Vendor name', 200),
  phone: phoneSchema.nullish().transform((v) => v ?? null),
  address: optionalText(300),
  tin: tinSchema.nullish().transform((v) => v ?? null),
  bankName: optionalText(120),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'A Nigerian account number is 10 digits')
    .nullish()
    .transform((v) => v ?? null),
  isActive: z.boolean().default(true),
});

/** Reference records take an optimistic-concurrency version on update. */
export const withVersion = <T extends z.ZodObject<z.ZodRawShape>>(schema: T) =>
  schema.extend({ version: z.number().int().min(0) });

// ---------------------------------------------------------------------------
// Organisation-wide settings
// ---------------------------------------------------------------------------

export const organisationSettingsSchema = z.object({
  institutionName: requiredText('Institution name', 200),
  officeName: requiredText('Office name', 200),
  unitName: requiredText('Unit name', 200),
  address: requiredText('Address', 300),
  logoAttachmentId: uuidSchema.nullish().transform((v) => v ?? null),
  currentFinancialYearId: uuidSchema.nullish().transform((v) => v ?? null),

  defaultRetirementDays: z.number().int().min(1).max(365).default(30),
  enforceOverspendBlock: z.boolean().default(true),
  budgetWarningThreshold: percentageSchema.default(90),
  /** Expenditure above this amount cannot be posted without supporting evidence. */
  requireReceiptAbove: koboSchema.default(0),
  vatRate: percentageSchema.default(7.5),
  withholdingTaxRate: percentageSchema.default(5),
  sessionIdleTimeoutMinutes: z.number().int().min(5).max(240).default(20),
  certificationText: requiredText('Certification text', 2000),

  /**
   * The chain may be shortened for a small unit, but it must begin at PREPARED
   * and finish at CLOSED or the state machine has nowhere to go.
   */
  approvalChain: z
    .array(z.nativeEnum(WorkflowStage))
    .min(3, 'The approval chain needs at least three stages')
    .refine((chain) => chain[0] === WorkflowStage.PREPARED, {
      message: 'The chain must begin at PREPARED.',
    })
    .refine((chain) => chain[chain.length - 1] === WorkflowStage.CLOSED, {
      message: 'The chain must end at CLOSED.',
    })
    .refine((chain) => new Set(chain).size === chain.length, {
      message: 'A stage may appear only once in the chain.',
    }),
});

export const updateSettingsSchema = organisationSettingsSchema.partial().extend({
  version: z.number().int().min(0).optional(),
});

export const signatorySchema = z.object({
  userId: uuidSchema,
  stage: z.nativeEnum(WorkflowStage),
  /** Ordering when several officers may act at the same stage. */
  priority: z.number().int().min(1).max(99).default(1),
  isActive: z.boolean().default(true),
});

export const notificationPreferenceSchema = z.object({
  email: emailSchema.optional(),
  inApp: z.boolean().default(true),
  pushEnabled: z.boolean().default(false),
  digestHourUtc: z.number().int().min(0).max(23).default(6),
});

export type DepartmentInput = z.infer<typeof departmentSchema>;
export type BudgetHeadInput = z.infer<typeof budgetHeadSchema>;
export type ExpenseCategoryInput = z.infer<typeof expenseCategorySchema>;
export type VendorInput = z.infer<typeof vendorSchema>;
export type OrganisationSettingsInput = z.infer<typeof organisationSettingsSchema>;
