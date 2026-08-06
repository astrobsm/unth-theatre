// ============================================================
// Deleting a user account, safely
// ------------------------------------------------------------
// 151 foreign keys in this database reference `users`:
//
//   61 RESTRICT  — Postgres refuses the delete outright. A surgeon with
//                  surgeries cannot be removed; the database stops it, and
//                  that guarantee holds no matter what this file does.
//   75 SET NULL  — the record survives with its attribution cleared. A
//                  milestone stays; it just no longer names who recorded it.
//   15 CASCADE   — DESTROYED SILENTLY. Mostly auth plumbing (sessions, MFA,
//                  WebAuthn, tokens), but also duty ROSTERS and IMPREST role
//                  assignments, approval signatories and attachments.
//
// That last group is the whole reason this module exists. Postgres will not
// stop a cascade, so something has to look first. Deleting a staff member who
// happens to appear on a roster would quietly remove them from it, and nobody
// would find out until a shift was uncovered.
//
// The rule enforced here: an account may be deleted only when nothing of
// consequence points at it. In practice that means exactly what it should —
// registrations that were never used.
// ============================================================

import prisma from '@/lib/prisma';

/**
 * Child tables that a delete would CASCADE away, and which carry meaning worth
 * keeping. Auth plumbing is deliberately absent: a session, an MFA factor or a
 * WebAuthn credential has no value once the account is gone, and refusing to
 * delete an account because it once logged in would defeat the feature.
 */
const MEANINGFUL_CASCADES = new Set([
  'rosters',
  'imprest_role_assignments',
  'imprest_approval_signatories',
  'imprest_attachments',
  'imprest_notifications',
  'user_module_grants',
  'staff_location_pings',
]);

export interface Blocker {
  table: string;
  column: string;
  rows: number;
  /** CASCADE rows would be destroyed; RESTRICT rows make the delete impossible. */
  effect: 'destroyed' | 'blocked';
}

export interface DeletionCheck {
  userId: string;
  deletable: boolean;
  blockers: Blocker[];
  /** A sentence an administrator can act on. */
  reason: string;
}

interface ForeignKey {
  child_table: string;
  child_column: string;
  on_delete: string;
}

let fkCache: ForeignKey[] | null = null;

/**
 * Every foreign key pointing at `users`, read from the database rather than
 * hardcoded — a schema change must not silently widen what deletion destroys.
 */
async function foreignKeys(): Promise<ForeignKey[]> {
  if (fkCache) return fkCache;
  const rows = await prisma.$queryRawUnsafe<ForeignKey[]>(`
    select src.relname as child_table,
           att.attname as child_column,
           case con.confdeltype
             when 'c' then 'CASCADE' when 'n' then 'SET NULL'
             when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
             when 'd' then 'SET DEFAULT' end as on_delete
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class tgt on tgt.oid = con.confrelid
    join unnest(con.conkey) with ordinality as k(attnum, ord) on true
    join pg_attribute att on att.attrelid = src.oid and att.attnum = k.attnum
    where con.contype = 'f' and tgt.relname = 'users'
  `);
  fkCache = rows;
  return rows;
}

/** Postgres identifier quoting — these names come from the catalogue, but still. */
const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

/**
 * What would happen if this account were deleted.
 *
 * Checks the CASCADE tables that carry meaning and every RESTRICT table. The
 * RESTRICT ones are checked even though Postgres would refuse anyway, so an
 * administrator is told WHY in advance instead of meeting a raw database
 * error after clicking delete.
 */
export async function checkUserDeletable(userId: string): Promise<DeletionCheck> {
  const fks = await foreignKeys();
  const relevant = fks.filter(
    (f) => f.on_delete === 'RESTRICT' || f.on_delete === 'NO ACTION' || MEANINGFUL_CASCADES.has(f.child_table)
  );

  const blockers: Blocker[] = [];
  for (const fk of relevant) {
    try {
      const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `select count(*)::int as n from ${q(fk.child_table)} where ${q(fk.child_column)} = $1`,
        userId
      );
      const n = rows[0]?.n ?? 0;
      if (n > 0) {
        blockers.push({
          table: fk.child_table,
          column: fk.child_column,
          rows: n,
          effect: MEANINGFUL_CASCADES.has(fk.child_table) ? 'destroyed' : 'blocked',
        });
      }
    } catch {
      // A table we cannot inspect is treated as a blocker. Refusing to delete
      // is always recoverable; deleting something we could not see is not.
      blockers.push({ table: fk.child_table, column: fk.child_column, rows: -1, effect: 'blocked' });
    }
  }

  const deletable = blockers.length === 0;
  return {
    userId,
    deletable,
    blockers,
    reason: deletable
      ? 'Nothing references this account.'
      : describeBlockers(blockers),
  };
}

function describeBlockers(blockers: Blocker[]): string {
  const worst = [...blockers].sort((a, b) => b.rows - a.rows).slice(0, 3);
  const parts = worst.map((b) => `${b.rows < 0 ? 'some' : b.rows} in ${friendly(b.table)}`);
  const more = blockers.length > worst.length ? `, and ${blockers.length - worst.length} more` : '';
  return `This account has records against it — ${parts.join(', ')}${more}. Reject it instead of deleting, so the history stays intact.`;
}

/** Table names a person can read. */
const FRIENDLY: Record<string, string> = {
  rosters: 'the duty roster',
  surgeries: 'surgeries',
  imprest_role_assignments: 'imprest duties',
  imprest_approval_signatories: 'imprest approvals',
  imprest_attachments: 'imprest attachments',
  imprest_notifications: 'imprest notifications',
  user_module_grants: 'module grants',
  staff_location_pings: 'location history',
  audit_logs: 'the audit log',
  notifications: 'notifications',
  case_cancellations: 'cancellations',
  patient_movements: 'recorded milestones',
  emergency_surgery_bookings: 'emergency bookings',
};

function friendly(table: string): string {
  return FRIENDLY[table] ?? table.replace(/_/g, ' ');
}

/**
 * Statuses an account may be deleted in.
 *
 * APPROVED is absent on purpose. An approved account belongs to somebody who
 * works here; removing it is a leavers process, not a tidy-up, and it should
 * go through rejection or suspension where the record survives. This feature
 * exists to clear registrations that were never used.
 */
export const DELETABLE_STATUSES = ['PENDING', 'REJECTED'] as const;

export function statusAllowsDeletion(status: string): boolean {
  return (DELETABLE_STATUSES as readonly string[]).includes(status);
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

export interface DuplicateCandidate {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  staffCode: string | null;
  role: string;
  status: string;
  createdAt: Date;
}

export interface DuplicateGroup {
  /** What they share — an email, a staff code, or a name. */
  key: string;
  kind: 'email' | 'staffCode' | 'name';
  members: DuplicateCandidate[];
  /** The one to keep: approved beats pending, then oldest. */
  keepId: string;
}

/** Normalise for comparison — case and spacing are not differences. */
const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Group accounts that look like the same person registered twice.
 *
 * Three signals, strongest first. A shared email or staff code is close to
 * proof; a shared name is a hint only — Nigeria has plenty of people who
 * genuinely share one — so a name match is reported and never acted on
 * automatically.
 */
export function findDuplicates(users: DuplicateCandidate[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const seen = new Set<string>();

  const build = (kind: DuplicateGroup['kind'], keyOf: (u: DuplicateCandidate) => string) => {
    const byKey = new Map<string, DuplicateCandidate[]>();
    for (const u of users) {
      const k = keyOf(u);
      if (!k) continue;
      const list = byKey.get(k);
      if (list) list.push(u);
      else byKey.set(k, [u]);
    }
    for (const [key, members] of Array.from(byKey.entries())) {
      if (members.length < 2) continue;
      // Do not report the same pair twice under a weaker signal.
      const sig = members.map((m) => m.id).sort().join('|');
      if (seen.has(sig)) continue;
      seen.add(sig);
      groups.push({ key, kind, members, keepId: pickKeeper(members).id });
    }
  };

  build('email', (u) => norm(u.email));
  build('staffCode', (u) => norm(u.staffCode));
  build('name', (u) => norm(u.fullName));

  return groups;
}

/**
 * Which of a duplicate set to keep.
 *
 * An approved account outranks a pending one — somebody has already decided it
 * is real. Failing that, the oldest, because it is the one other records are
 * most likely to point at.
 */
export function pickKeeper(members: DuplicateCandidate[]): DuplicateCandidate {
  return [...members].sort((a, b) => {
    const rank = (s: string) => (s === 'APPROVED' ? 0 : s === 'PENDING' ? 1 : 2);
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0];
}
