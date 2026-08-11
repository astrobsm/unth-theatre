// ============================================================
// Which tables sync, and what happens when both sides changed a row
// ------------------------------------------------------------
// This file is the clinical policy, expressed as code. Everything else in the
// sync layer is mechanism; this is the part where a wrong decision corrupts a
// patient record rather than merely breaking a build.
//
// THE DEFAULT IS "DO NOT SYNC". A table with no entry here is never
// replicated, so forgetting to classify something cannot silently mangle it.
// That is deliberate and should stay that way: the failure mode of an
// unsynced table is visible divergence, which an operator notices. The failure
// mode of a wrongly-classified one is a confidently wrong record, which nobody
// notices until it matters.
// ============================================================

export type SyncClass =
  /** Insert-only event streams. Both sides' rows are unioned; no conflict exists. */
  | 'APPEND_ONLY'
  /** Administrative state where the latest intent is correct. Loser archived. */
  | 'LWW'
  /** Clinical content. Nothing is overwritten; a person resolves it. */
  | 'QUARANTINE'
  /** Identity and access. The cloud is authoritative, unconditionally. */
  | 'CLOUD_AUTHORITATIVE';

export interface TablePolicy {
  table: string;
  cls: SyncClass;
  /** Why this class. Read by whoever changes it next. */
  why: string;
}

/**
 * Preferring APPEND_ONLY is the single most effective conflict-avoidance
 * measure available, and most clinical volume in this system is already
 * event-shaped: milestones, movements, announcements, stock ledger entries.
 * Where a design choice exists, record an event rather than mutate a state.
 */
export const TABLE_POLICIES: TablePolicy[] = [
  // ---- Class 1: append-only event streams -------------------------------
  { table: 'audit_logs', cls: 'APPEND_ONLY', why: 'Immutable by definition; an edited audit log is not an audit log.' },
  { table: 'notifications', cls: 'APPEND_ONLY', why: 'Insert then read; the read flag is per-node noise, not clinical data.' },
  { table: 'patient_movements', cls: 'APPEND_ONLY', why: 'The single patient timeline, milestones included. Two nodes recording different events both happened.' },
  { table: 'radio_announcements', cls: 'APPEND_ONLY', why: 'A log of what was announced. An announcement made on one node was still made.' },
  { table: 'surgery_team_check_ins', cls: 'APPEND_ONLY', why: 'One row per person per case, uniquely keyed; union is safe.' },
  { table: 'stock_movements', cls: 'APPEND_ONLY', why: 'A ledger. Quantities are derived by summing, never by overwriting a balance.' },
  { table: 'idempotency_keys', cls: 'APPEND_ONLY', why: 'Replay protection must be shared, or a retry across nodes double-applies.' },

  // ---- Class 2: last writer wins ----------------------------------------
  { table: 'surgeries', cls: 'LWW', why: 'Scheduling fields dominate. Clinical fields on this row are covered by the quarantine list below at column level.' },
  { table: 'theatre_allocations', cls: 'LWW', why: 'Whoever allocated most recently meant it.' },
  { table: 'rosters', cls: 'LWW', why: 'Draft rosters are replaced wholesale; the previous draft has no standing.' },
  { table: 'equipment', cls: 'LWW', why: 'Current status of a device; history lives in maintenance records.' },
  { table: 'theatre_meals', cls: 'LWW', why: 'Administrative counts.' },
  { table: 'wards', cls: 'LWW', why: 'Reference data. Renaming or adding a ward has no clinical history to lose.' },

  // ---- Class 3: quarantine ----------------------------------------------
  // The parent of nearly everything else here. It was missing from this list,
  // and its absence is why cloud bookings could not land locally at all: a
  // surgery arrived referencing a patient this node had never seen, and
  // surgeries_patientId_fkey rejected it.
  //
  // Chosen for conflict-risk originally; the set must ALSO be closed under its
  // foreign keys, or a child can never be inserted anywhere.
  //
  // QUARANTINE, not LWW: this row carries blood group and allergies. A new
  // patient still inserts cleanly — only two divergent EDITS need a person.
  { table: 'patients', cls: 'QUARANTINE', why: 'Identity, blood group and allergies. Silently overwriting either is a patient-safety event.' },
  { table: 'preoperative_investigations', cls: 'QUARANTINE', why: 'A result is a claim about a patient. Two differing claims need a person.' },
  { table: 'pre_operative_visits', cls: 'QUARANTINE', why: 'Clearance decisions; silently overwriting one hides that it was ever made.' },
  { table: 'holding_area_assessments', cls: 'QUARANTINE', why: 'The last check before the theatre door; both versions must survive.' },
  { table: 'pacu_assessments', cls: 'QUARANTINE', why: 'Recovery observations and the discharge decision resting on them.' },
  { table: 'pacu_vital_signs', cls: 'QUARANTINE', why: 'Observations on a recovering patient; a differing reading was still taken.' },
  { table: 'pacu_medications', cls: 'QUARANTINE', why: 'What was given in recovery. Overwriting hides an administration.' },
  { table: 'anesthetic_prescriptions', cls: 'QUARANTINE', why: 'Drug orders. An overwritten dose is a patient-safety event.' },
  { table: 'postop_prescriptions', cls: 'QUARANTINE', why: 'Drug orders after surgery; same reasoning as the anaesthetic ones.' },
  { table: 'emergency_prescriptions', cls: 'QUARANTINE', why: 'Written under time pressure, and least safe to resolve automatically.' },
  { table: 'prescription_medication_items', cls: 'QUARANTINE', why: 'The individual drugs and doses within a prescription.' },
  { table: 'blood_requests', cls: 'QUARANTINE', why: 'Availability disagreements must surface, not resolve quietly.' },

  // ---- Class 4: cloud authoritative --------------------------------------
  { table: 'users', cls: 'CLOUD_AUTHORITATIVE', why: 'A merged or revoked account must not be resurrected by a stale local copy.' },
  { table: 'user_module_grants', cls: 'CLOUD_AUTHORITATIVE', why: 'Access control is decided centrally.' },
  { table: 'onboarding_submissions', cls: 'CLOUD_AUTHORITATIVE', why: 'Imported centrally; local copies are read-only in practice.' },
];

const BY_TABLE = new Map(TABLE_POLICIES.map((p) => [p.table, p]));

export const policyFor = (table: string): TablePolicy | null => BY_TABLE.get(table) ?? null;
export const isSynced = (table: string): boolean => BY_TABLE.has(table);
export const syncedTables = (): string[] => TABLE_POLICIES.map((p) => p.table);

/**
 * Columns on `surgeries` that are clinical rather than administrative.
 *
 * The surgeries row is LWW because scheduling churn dominates it, but these
 * particular columns carry clinical claims and must not be silently
 * overwritten by an older node. A change touching any of them is quarantined
 * even though the table as a whole is LWW.
 *
 * This column-level exception exists because splitting the table would be a
 * far larger change to a 184-model schema than the problem warrants.
 */
export const SURGERY_CLINICAL_COLUMNS = new Set([
  'recentHb', 'hbSampleAt', 'potassium', 'sodium', 'creatinine',
  'hbsAgStatus', 'hcvStatus', 'hivStatus',
  'bloodPressureSystolic', 'bloodPressureDiastolic',
  'bleedingRiskLevel', 'nutritionalStatusAtBooking', 'pressureSoreRiskAtBooking',
  'consentSignedElectronically', 'consentFileData', 'consentFormData', 'consentCompletedAt',
  'complexityData', 'postOpNotes',
]);

export type Decision =
  | { action: 'APPLY'; reason: string }
  | { action: 'IGNORE'; reason: string }
  | { action: 'QUARANTINE'; reason: string };

export interface IncomingChange {
  table: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  /** Version the sender derived this change from. */
  baseVersion: number;
  /** HLC stamp of the sender's write, already serialised. */
  hlc: string;
  originNode: string;
  changedColumns?: string[];
}

export interface LocalRowState {
  exists: boolean;
  version: number;
  hlc: string;
}

/**
 * Decide what to do with one incoming change.
 *
 * Pure, so the policy can be exercised exhaustively without a database. The
 * conflict test is exact rather than heuristic: a change conflicts if and only
 * if the version it was derived from is no longer the version we hold.
 */
export function decide(
  change: IncomingChange,
  local: LocalRowState | null,
  opts: { thisNode: string; cloudNode: string }
): Decision {
  const policy = policyFor(change.table);
  if (!policy) {
    return { action: 'IGNORE', reason: `Table "${change.table}" has no sync policy; not replicated.` };
  }

  // Nothing here yet: every class simply accepts the row.
  if (!local || !local.exists) {
    return change.op === 'DELETE'
      ? { action: 'IGNORE', reason: 'Delete for a row we do not have.' }
      : { action: 'APPLY', reason: 'New row.' };
  }

  // Not a conflict: the sender was working from what we currently hold.
  if (change.baseVersion === local.version) {
    return { action: 'APPLY', reason: 'In sequence; sender had our current version.' };
  }

  // From here the change is CONCURRENT: the sender was working from a version
  // we no longer hold. What that means depends entirely on the class, so there
  // is deliberately no shortcut above this point. An earlier version of this
  // function discarded any change that looked "already superseded" before
  // consulting the class, which silently threw away concurrent clinical edits
  // — precisely what quarantine exists to prevent.
  switch (policy.cls) {
    case 'APPEND_ONLY':
      // Concurrent inserts of distinct rows are the normal case and are not a
      // conflict at all. An UPDATE here means the table is not actually
      // append-only and the classification is wrong — say so rather than guess.
      return change.op === 'INSERT'
        ? { action: 'APPLY', reason: 'Append-only; union of both sides.' }
        : { action: 'QUARANTINE', reason: `Update on append-only table "${change.table}" — classification looks wrong.` };

    case 'CLOUD_AUTHORITATIVE':
      return change.originNode === opts.cloudNode
        ? { action: 'APPLY', reason: 'Cloud is authoritative for this table.' }
        : { action: 'IGNORE', reason: 'Local change to a cloud-authoritative table; cloud state stands.' };

    case 'LWW': {
      // Clinical columns are exempt even on an LWW table.
      const clinical = change.table === 'surgeries'
        && (change.changedColumns ?? []).some((c) => SURGERY_CLINICAL_COLUMNS.has(c));
      if (clinical) {
        return { action: 'QUARANTINE', reason: 'Clinical column on an administrative row; not overwritten automatically.' };
      }
      return change.hlc > local.hlc
        ? { action: 'APPLY', reason: 'Later by hybrid logical clock.' }
        : { action: 'IGNORE', reason: 'Earlier by hybrid logical clock; local value stands.' };
    }

    case 'QUARANTINE':
      return { action: 'QUARANTINE', reason: 'Concurrent edit to clinical content; both versions preserved.' };
  }
}
