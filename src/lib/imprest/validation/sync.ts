import { z } from 'zod';
import { AuditEntity, ConflictResolution, SyncOperation } from '../enums';
import { ExportFormat, ReportType } from '../types';
import { isoDateSchema, optionalText, uuidSchema } from './common';

// ---------------------------------------------------------------------------
// Offline synchronisation
// ---------------------------------------------------------------------------

export const syncMutationSchema = z.object({
  /** Client-generated; doubles as the idempotency key for replay. */
  id: uuidSchema,
  entity: z.nativeEnum(AuditEntity),
  entityId: uuidSchema,
  operation: z.nativeEnum(SyncOperation),
  payload: z.record(z.unknown()),
  baseVersion: z.number().int().min(0),
  createdAt: z.string().datetime(),
  deviceLabel: z.string().trim().max(120).nullish().transform((v) => v ?? null),
});

export const syncPushSchema = z.object({
  deviceId: z.string().trim().min(8).max(128),
  deviceLabel: z.string().trim().max(120).default('Unknown device'),
  /**
   * Batched to bound both the transaction size and the blast radius of a
   * failed replay — the client sends further batches until its queue drains.
   */
  mutations: z.array(syncMutationSchema).min(1).max(200),
});

export const syncPullSchema = z.object({
  since: z.string().datetime().optional(),
  entities: z.array(z.nativeEnum(AuditEntity)).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export const resolveConflictSchema = z.object({
  resolution: z.nativeEnum(ConflictResolution),
  /** Required when resolving MANUAL — the merged record to persist. */
  mergedPayload: z.record(z.unknown()).optional(),
  notes: optionalText(1000),
});

// ---------------------------------------------------------------------------
// Reports and exports
// ---------------------------------------------------------------------------

export const reportRequestSchema = z
  .object({
    type: z.nativeEnum(ReportType),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    financialYearId: uuidSchema.optional(),
    departmentId: uuidSchema.optional(),
    officerId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
    vendorId: uuidSchema.optional(),
    budgetHeadId: uuidSchema.optional(),
    imprestId: uuidSchema.optional(),
    format: z.nativeEnum(ExportFormat).default(ExportFormat.JSON),
  })
  .superRefine((value, ctx) => {
    if (value.type === ReportType.CUSTOM_RANGE && (!value.from || !value.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'A custom range report needs both a start and an end date.',
      });
    }
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'The end date must not precede the start date.',
      });
    }
  });

export const documentRequestSchema = z.object({
  entityId: uuidSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  financialYearId: uuidSchema.optional(),
  imprestId: uuidSchema.optional(),
  /** Attaches scanned receipts after the schedule as a numbered appendix. */
  includeReceiptAppendix: z.coerce.boolean().default(true),
  watermark: z.string().trim().max(40).optional(),
});

// ---------------------------------------------------------------------------
// Audit trail queries
// ---------------------------------------------------------------------------

export const auditQuerySchema = z.object({
  entity: z.nativeEnum(AuditEntity).optional(),
  entityId: uuidSchema.optional(),
  actorId: uuidSchema.optional(),
  action: z.string().trim().max(40).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export type SyncPushInput = z.infer<typeof syncPushSchema>;
export type SyncPullInput = z.infer<typeof syncPullSchema>;
export type ReportRequestInput = z.infer<typeof reportRequestSchema>;
export type AuditQueryInput = z.infer<typeof auditQuerySchema>;
