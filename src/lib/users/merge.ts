// ============================================================
// Merging one account into another -- what may be moved, and what may not
// ------------------------------------------------------------
// Deleting a duplicate registration works only while nothing points at it.
// The duplicates that actually matter are the other kind: somebody registered
// three times, worked under all three, and now has surgeries under one, a duty
// roster under another and twenty-one audit entries under the third. None of
// them can be deleted, and the screen correctly refuses -- which leaves the
// ward with three of the same person and no way to fix it.
//
// Merging is the missing act. Everything the duplicate did is reattributed to
// the account being kept, and then the duplicate -- now pointing at nothing --
// is removed. The history survives in full; it simply names one person once.
//
// TWO THINGS ARE DELIBERATELY NOT MOVED.
//
//   CREDENTIALS. A one-time code, a device credential, a push token or a
//   Wi-Fi handoff was issued TO one account. Moving it would turn a credential
//   minted for the duplicate into a working credential for the keeper, which
//   is a privilege transfer wearing a tidy-up's clothes. They are deleted; the
//   phone re-registers at the next sign-in.
//
//   AUDIT AND SYNC POINTERS. `audit_logs.recordId` says which record an action
//   was about. Rewriting it would edit the history of what happened to the old
//   account, and the audit trail exists precisely so that this kind of work
//   leaves a mark it cannot erase. The replication bookkeeping is left alone
//   for the same reason -- it describes rows that were already sent.
//
// A table this file cannot place is REFUSED, not guessed at. See
// classifyColumn: a merge that silently moved something credential-shaped
// because its name was new would be the one failure nobody would notice.
// ============================================================

export type Disposition = 'move' | 'drop' | 'freeze' | 'refuse';

export interface ColumnPlan {
  table: string;
  column: string;
  disposition: Disposition;
  why: string;
}

/**
 * Tables holding something that authenticates, addresses or identifies a
 * DEVICE rather than recording work. Their rows are deleted, never moved.
 */
export const CREDENTIAL_TABLES = new Set([
  'auth_otps',
  'device_credentials',
  'device_tokens',
  'push_subscriptions',
  'hotspot_devices',
  'hotspot_handoffs',
  // Not in this schema today. Listed so that adding NextAuth's database
  // session strategy later cannot quietly change what a merge does.
  'sessions',
  'accounts',
  'verification_tokens',
  'password_reset_tokens',
]);

/**
 * Tables whose NAME looks like a credential and which are not one.
 *
 * `ocr_tokens` is the whole reason this list exists: they are words recognised
 * out of a scanned document, and `correctedById` is the person who fixed one.
 * A name-shaped rule on its own would have deleted somebody's corrections.
 */
export const NOT_CREDENTIALS = new Set([
  'ocr_tokens',
  'staff_presence_checks',
]);

/** Anything that reads as a credential and is in neither list stops the merge. */
const CREDENTIAL_LOOKING =
  /(^|_)(session|sessions|credential|credentials|otp|otps|mfa|totp|webauthn|passkey|passkeys|token|tokens|password|passwords|handoff|handoffs|subscription|subscriptions)(_|$)/;

/** Replication bookkeeping: rows describing what was already sent elsewhere. */
const SYNC_TABLE = /(^|_)sync(_|$)/;

/** A pointer to "which record this entry was about", not to who did it. */
const RECORD_POINTER = new Set(['recordId', 'entityId', 'rowId', 'objectId', 'targetRecordId']);

const AUDIT_TABLE = /(^|_)audit(_|$)/;

/**
 * What a merge does with one column that might hold a user id.
 *
 * Order matters: a credential table is dropped whatever its columns are
 * called, and a frozen pointer is left alone even in a table that is otherwise
 * moved wholesale.
 */
export function classifyColumn(table: string, column: string): ColumnPlan {
  const base = { table, column };

  if (CREDENTIAL_TABLES.has(table)) {
    return {
      ...base,
      disposition: 'drop',
      why: 'A credential issued to that account. Deleted, never transferred.',
    };
  }

  if (SYNC_TABLE.test(table)) {
    return {
      ...base,
      disposition: 'freeze',
      why: 'Replication bookkeeping. Describes rows already sent; left as it is.',
    };
  }

  if (AUDIT_TABLE.test(table) && RECORD_POINTER.has(column)) {
    return {
      ...base,
      disposition: 'freeze',
      why: 'Says which record an entry was about. The history of the old account stands.',
    };
  }

  if (CREDENTIAL_LOOKING.test(table) && !NOT_CREDENTIALS.has(table)) {
    return {
      ...base,
      disposition: 'refuse',
      why: `I cannot tell whether ${table} holds credentials or work. Classify it in src/lib/users/merge.ts rather than guessing.`,
    };
  }

  return {
    ...base,
    disposition: 'move',
    why: 'Work recorded by that account. Reattributed to the one being kept.',
  };
}

/**
 * Columns that could hold a user id.
 *
 * Shape only -- every candidate is then tested for an EXACT match on the
 * duplicate's id, and an id is a uuid. So a column called `staffId` that holds
 * "SRG233", or `patientId`, simply never matches and costs one count. That is
 * what makes a wide net safe here: the database decides, not the name.
 */
export function looksLikeUserColumn(column: string): boolean {
  return /(Id|By)$/.test(column);
}

// ---------------------------------------------------------------------------
// Which pair may be merged
// ---------------------------------------------------------------------------

export interface MergeSides {
  keepId: string;
  loseId: string;
  /** The administrator asking. */
  adminId: string;
}

/**
 * Why this pair may not be merged, or null.
 *
 * The self-merge check is the one that matters. An administrator folding their
 * OWN account into another would move their session's identity out from under
 * them mid-request and leave no signed-in administrator holding the result.
 */
export function refuseMerge({ keepId, loseId, adminId }: MergeSides): string | null {
  if (!keepId || !loseId) return 'Choose the account to keep and the one to fold into it.';
  if (keepId === loseId) return 'That is the same account twice.';
  if (loseId === adminId) return 'You cannot fold away the account you are signed in with.';
  return null;
}

// ---------------------------------------------------------------------------
// The keeper's own fields
// ---------------------------------------------------------------------------

export interface MergeableFields {
  email?: string | null;
  phoneNumber?: string | null;
  staffCode?: string | null;
  staffId?: string | null;
  department?: string | null;
  extension?: string | null;
  wardAssignment?: string | null;
}

const FILLABLE: (keyof MergeableFields)[] = [
  'email',
  'phoneNumber',
  'staffCode',
  'staffId',
  'department',
  'extension',
  'wardAssignment',
];

const blank = (v: string | null | undefined) => !v || !v.trim();

/**
 * What the keeper gains from the account being folded in.
 *
 * ONLY blanks are filled. The keeper is the account somebody decided to keep,
 * and a merge that overwrote its email with the duplicate's would be a quiet
 * change of who gets the hospital's mail. A duplicate holding the only phone
 * number on file, though, is the common case and the reason this exists.
 */
export function blanksFilledFrom(
  keeper: MergeableFields,
  loser: MergeableFields,
): Partial<MergeableFields> {
  const out: Partial<MergeableFields> = {};
  for (const field of FILLABLE) {
    if (blank(keeper[field]) && !blank(loser[field])) {
      out[field] = (loser[field] as string).trim();
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Saying what will happen, before it happens
// ---------------------------------------------------------------------------

export interface MergeCount {
  table: string;
  column: string;
  rows: number;
  disposition: Disposition;
  why: string;
}

/** One sentence for the confirmation screen. */
export function describeMergeCounts(counts: readonly MergeCount[]): string {
  const total = (d: Disposition) =>
    counts.filter((c) => c.disposition === d).reduce((n, c) => n + c.rows, 0);
  const moved = total('move');
  const dropped = total('drop');
  const frozen = total('freeze');

  if (moved === 0 && dropped === 0 && frozen === 0) {
    return 'Nothing points at that account. Merging it is the same as deleting it.';
  }
  const parts = [`${moved} record${moved === 1 ? '' : 's'} moved to the account you are keeping`];
  if (dropped > 0) parts.push(`${dropped} device credential${dropped === 1 ? '' : 's'} deleted`);
  if (frozen > 0) parts.push(`${frozen} audit pointer${frozen === 1 ? '' : 's'} left untouched`);
  return `${parts.join(', ')}.`;
}

/**
 * The tables a merge refuses to proceed through, if any.
 *
 * A count of -1 means the column could not be read. That blocks too: a merge
 * that skipped what it could not see would leave rows pointing at an account
 * it had just deleted, and nobody would know which.
 */
export function blockingTables(counts: readonly MergeCount[]): MergeCount[] {
  return counts.filter((c) => c.disposition === 'refuse' && c.rows !== 0);
}

/** Said to the administrator when one of those is in the way. */
export function blockedMessage(blocked: readonly MergeCount[]): string {
  const names = Array.from(new Set(blocked.map((b) => b.table))).join(', ');
  return `This merge was stopped before anything changed: ${names} holds rows for that account and is not classified. Nothing was moved.`;
}
