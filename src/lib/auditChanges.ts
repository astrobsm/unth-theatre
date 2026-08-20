// ============================================================
// What an audit log should record, and what it must not carry
// ------------------------------------------------------------
// Audit rows are written as JSON.stringify(validatedData) — the whole request
// body. For a booking that body contains the informed-consent scan, base64
// encoded, and the result is measurable:
//
//     audit_logs.changes   43 MB across 6,051 rows
//     average per row      24 kB
//     largest single row   8.1 MB
//
// So a consent scan is stored TWICE: once in surgeries.consentFileData, where
// it belongs about as much as it belongs anywhere, and once again in the audit
// record of the request that created it.
//
// That is not merely wasteful. audit_logs is APPEND_ONLY in the sync policy and
// surgeries is LWW, so BOTH copies cross the uplink, and the uplink is a
// hospital's spare bandwidth. It is why a push manages six to thirteen entries
// a cycle, and why there is already a commit called "The push was too big to
// ever succeed".
//
// An audit log answers "who changed what, when". It does not need the bytes of
// the scan to do that — it needs to record that a scan was attached, how big it
// was, and what it was called. That is what a reviewer actually asks.
//
// lib/documents/store.ts states the principle plainly: documents are kept out
// of Postgres because "sending multi-megabyte scans through the row journal
// would be the end of sync working at all". This applies it to the audit trail.
// ============================================================

/** Fields that carry file bytes rather than facts. Replaced by a description. */
const BLOB_FIELDS = new Set([
  'consentFile',
  'consentFileData',
  'consentFormData',
  'base64',
  'fileData',
  'signatureData',
  'photoData',
  'attachment',
]);

/**
 * Anything longer than this is a payload, not a value. Chosen well above any
 * legitimate clinical free-text field — an indication or a set of post-op notes
 * is hundreds of characters, not thousands.
 */
const MAX_STRING = 4_000;

const describeBlob = (v: unknown): string => {
  if (typeof v === 'string') {
    // A data URI or raw base64. Report its size rather than its contents.
    const bytes = Math.round((v.length * 3) / 4);
    return `[file omitted: ~${bytes >= 1024 ? `${Math.round(bytes / 1024)} kB` : `${bytes} bytes`}]`;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name : 'file';
    const b64 = typeof o.base64 === 'string' ? o.base64 : '';
    const bytes = Math.round((b64.length * 3) / 4);
    return `[file omitted: ${name}, ~${Math.round(bytes / 1024)} kB]`;
  }
  return '[file omitted]';
};

/**
 * Strip file payloads out of a request body so it can be stored as an audit
 * record. Structure, field names and every ordinary value are preserved — only
 * the bytes go, and they are replaced by a note saying what was there.
 *
 * Depth-limited: a cyclic or pathologically nested body must not be able to
 * hang the request it is auditing. Auditing is a side effect, and a side effect
 * that can fail a booking is a bug — see /api/surgeries, where exactly that
 * happened.
 */
export function auditChanges(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[too deeply nested to record]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.length > MAX_STRING
      ? `${value.slice(0, 200)}… [truncated, ${value.length} characters]`
      : value;
  }

  if (Array.isArray(value)) {
    // A long array is summarised rather than dropped: "how many" is usually the
    // auditable fact, and 300 pack lines are not.
    if (value.length > 200) {
      return [...value.slice(0, 20).map((v) => auditChanges(v, depth + 1)),
        `… ${value.length - 20} more items omitted`];
    }
    return value.map((v) => auditChanges(v, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = BLOB_FIELDS.has(k) && v ? describeBlob(v) : auditChanges(v, depth + 1);
    }
    return out;
  }

  return value;
}

/** Ready to store: stripped, and serialised. */
export function auditChangesJson(value: unknown): string {
  try {
    return JSON.stringify(auditChanges(value));
  } catch {
    // Never let the audit record be the thing that fails the operation.
    return JSON.stringify({ note: 'changes could not be serialised for audit' });
  }
}
