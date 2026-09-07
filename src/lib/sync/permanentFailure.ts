// ============================================================
// Will this entry fail the same way forever?
// ------------------------------------------------------------
// The push endpoint applies each entry inside its own savepoint, and an entry
// that throws simply gets no result. The sender then re-sends it, which is the
// no-loss rule and is right for almost everything: a foreign key that is not
// there yet arrives in a later batch, a deadlock clears, a connection drops.
//
// It is wrong for exactly one class. A UNIQUE violation means the peer already
// holds a different row under that key, and no amount of retrying changes that.
// On 7 September 33 such entries — 32 emergency bookings and one team check-in,
// created by a backfill on 2 September — had each been retried 248 times. They
// were not merely stuck: every batch that contained one spent its savepoint,
// its rollback and its error handling on them, and the batch transaction then
// exceeded its 110-second budget and returned 500. Eight hundred and sixty-one
// perfectly applicable changes sat behind them for five days, and the cloud's
// single database connection was held for a hundred seconds at a time while it
// happened, so the live app's own requests timed out too.
//
// So this names the one class that must stop being retried. Everything else
// keeps the benefit of the doubt, because "retry" is the safe default and
// "give up" is the one that can lose a change.
// ============================================================

/**
 * Postgres SQLSTATE codes that describe the DATA rather than the moment.
 *
 * Deliberately just the two.
 *
 * 23505 unique_violation — the peer holds another row under this key.
 * 23514 check_violation  — the value breaks a constraint it will always break.
 *
 * NOT 23503 foreign_key_violation, which is the common transient case in a
 * sync: the parent row is in a later batch, or in the other direction's pull,
 * and the child applies perfectly well once it lands. Quarantining those would
 * discard ordinary traffic on a timing accident.
 *
 * NOT 40001 / 40P01 (serialisation failure, deadlock) — those are the moment,
 * not the data, and clear on their own.
 */
const PERMANENT_SQLSTATES = new Set(['23505', '23514']);

/** Dig a Postgres SQLSTATE out of whatever wrapper Prisma put around it. */
export function sqlStateOf(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, unknown>;

  // Prisma surfaces a raw-query failure as P2010 with the driver's code in meta.
  const meta = e.meta as Record<string, unknown> | undefined;
  if (meta && typeof meta.code === 'string') return meta.code;

  // node-postgres and some Prisma paths put it on the error itself.
  if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;

  // Last resort: the message. Prisma's raw errors read
  // 'Raw query failed. Code: `23505`. Message: ...'
  const message = typeof e.message === 'string' ? e.message : '';
  const m = message.match(/Code:\s*`?([0-9A-Z]{5})`?/);
  return m ? m[1] : null;
}

/**
 * Would re-sending this entry produce the identical failure?
 *
 * A false answer costs one more retry. A true answer settles the entry without
 * writing it, so it is deliberately narrow.
 */
export function isPermanentApplyFailure(err: unknown): boolean {
  const state = sqlStateOf(err);
  return state !== null && PERMANENT_SQLSTATES.has(state);
}

/** A short reason to record against the quarantined entry. */
export function permanentFailureReason(err: unknown): string {
  const state = sqlStateOf(err) ?? 'unknown';
  const raw = err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string'
    ? (err as { message: string }).message
    : String(err);
  // The constraint detail is the useful half; the stack is not.
  const detail = raw.match(/Message:\s*`?([^`\n]+)`?/)?.[1] ?? raw.split('\n')[0];
  return `permanent apply failure (SQLSTATE ${state}): ${detail.trim().slice(0, 200)}`;
}
