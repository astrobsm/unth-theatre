// ============================================================
// Imprest audit trail
// ------------------------------------------------------------
// Financial Regulations require that a change to a money record can be traced
// to a person, a moment, a machine and — where it alters a figure — to what the
// figure used to be. The ImprestAuditLog table has always had columns for all
// of that; nothing was filling them, so every row recorded only "somebody did
// something".
//
// This helper exists so a route cannot write half an audit entry by accident:
// pass the request and the helper takes the network detail off it, rather than
// each route remembering to.
// ============================================================

import type { NextRequest } from 'next/server';
import type {
  AuditAction as PrismaAuditAction,
  AuditEntity as PrismaAuditEntity,
  ImprestRole,
  Prisma,
} from '@prisma/client';

/**
 * Caller's address, honouring the proxy headers this app is deployed behind.
 * `x-forwarded-for` is a list; the client is the first entry — later ones are
 * the proxies it passed through, and recording those would name the wrong
 * machine.
 */
export function clientIp(request: NextRequest): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim() || undefined;
  return request.headers.get('x-real-ip') ?? undefined;
}

export interface AuditContext {
  userId: string;
  fullName?: string | null;
  role?: string | null;
}

export interface AuditEntry {
  action: PrismaAuditAction;
  entity: PrismaAuditEntity;
  entityId?: string | null;
  entityLabel?: string | null;
  /** Free-text note — a reviewer's comment, say. */
  notes?: string | null;
  /** Why an override was performed. Distinct from `notes` so it can be queried. */
  reason?: string | null;
  /** Field-level before/after. Only differences are stored. */
  changes?: Prisma.InputJsonValue | null;
}

/**
 * The subset of the Prisma client this needs, taken from Prisma's own types
 * rather than described by hand — a hand-written shape looked equivalent but
 * the full client would not satisfy it. Accepts both `prisma` and a `tx`.
 */
type AuditClient = Pick<Prisma.TransactionClient, 'imprestAuditLog'>;

/**
 * Writes one audit row. Deliberately not wrapped in try/catch: inside a
 * transaction an audit failure should roll the change back with it. A financial
 * change that succeeded while its audit entry silently failed is worse than a
 * change that did not happen.
 */
export async function writeAudit(
  db: AuditClient,
  request: NextRequest | null,
  actor: AuditContext,
  entry: AuditEntry
): Promise<void> {
  await db.imprestAuditLog.create({
    data: {
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      entityLabel: entry.entityLabel ?? null,
      actorId: actor.userId,
      actorName: actor.fullName ?? null,
      actorRole: (actor.role as ImprestRole | null) ?? null,
      notes: entry.notes ?? null,
      reason: entry.reason ?? null,
      changes: entry.changes ?? undefined,
      ipAddress: request ? clientIp(request) ?? null : null,
      userAgent: request?.headers.get('user-agent') ?? null,
    },
  });
}

/**
 * Field-level difference between two versions of a record, as
 * `{ field: { from, to } }`.
 *
 * Only changed fields appear — an audit entry listing forty unchanged columns
 * buries the one that moved. BigInt is stringified because JSON cannot carry
 * it, and Date is reduced to an ISO string so two equal dates compare equal
 * rather than differing by object identity.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[]
): Prisma.InputJsonValue | null {
  const changes: Prisma.JsonObject = {};
  for (const field of fields) {
    const from = normalise(before[field]);
    const to = normalise(after[field]);
    if (from !== to) changes[field] = { from, to };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

function normalise(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  // Anything else — a relation object, say — is not a field-level value worth
  // recording. Stringifying keeps the entry readable rather than "[object Object]".
  return JSON.stringify(value);
}
