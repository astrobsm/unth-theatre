// ============================================================
// When two records claim one identity, the first one stands
// ------------------------------------------------------------
// THE RULE, as the hospital set it on 19 November: whenever there is a
// conflict in the records, choose the record that occurred first.
//
// WHY A RULE AT ALL, when this used to be quarantined for a person to settle.
// Because nobody settled them. One pair sat at the head of the outbound queue
// from 25 August to 19 November — retried 12,488 times — and because the push
// drains oldest-first it was loaded into every batch, timed the cloud out, and
// took that morning's theatre list down with it. A decision nobody makes is
// not a safe default; it is an outage with a long fuse.
//
// WHY "FIRST" IS THE RIGHT TEST HERE, and not "latest wins". These collisions
// are duplicates, not disagreements: a backfill re-created bookings the other
// side already held, seconds or days after the original. The first record is
// the one made by the person who was actually there — it carries the alert
// that was raised, the roles that were notified, the anaesthetist who was
// assigned. The later one is the copy.
//
// NOTHING IS DESTROYED. The loser is written to sync_conflicts before it is
// displaced, with both versions kept, so a decision made by clock can always
// be read back and reversed by a person. That is the condition on which an
// automatic rule is acceptable at all.
//
// WHERE IT DOES NOT APPLY. If neither row carries a creation time there is
// nothing to compare, and the pair is quarantined exactly as before. A rule
// that guessed in that case would be worse than one that stops.
// ============================================================

/** Timestamps that mean "when this record came into being", best first. */
const CREATION_FIELDS = ['createdAt', 'requestedAt', 'bookedAt', 'recordedAt'] as const;

export interface RecordTimes {
  /** The value of whichever creation field was found. */
  at: Date;
  /** Which field it came from, for the explanation. */
  field: string;
}

const asDate = (v: unknown): Date | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

/**
 * When this record came into being, by the first creation field it carries.
 *
 * Deliberately NOT updatedAt or a sync clock. updatedAt moves every time
 * anybody touches the row, and the hybrid logical clock describes when the
 * change was journalled, not when the thing happened. Both would have made
 * the August duplicate — written to the database a day and a half later —
 * look like the original.
 */
export function creationTime(row: Record<string, unknown> | null | undefined): RecordTimes | null {
  if (!row) return null;
  for (const field of CREATION_FIELDS) {
    const at = asDate(row[field]);
    if (at) return { at, field };
  }
  return null;
}

export type EarliestVerdict =
  | { decided: false; reason: string }
  | { decided: true; winner: 'incoming' | 'existing'; reason: string };

/**
 * Which of two rival records stands.
 *
 * Ties go to the EXISTING row. Two records created in the same millisecond is
 * a duplicate by any reading, and leaving the row that is already in place
 * changes nothing and breaks nothing — whereas replacing it would churn a
 * live record for no gain.
 */
export function earliestWins(
  incoming: Record<string, unknown> | null | undefined,
  existing: Record<string, unknown> | null | undefined,
): EarliestVerdict {
  const a = creationTime(incoming);
  const b = creationTime(existing);

  if (!a || !b) {
    return {
      decided: false,
      reason: 'Neither record carries a creation time that can be compared, so the first of '
        + 'them cannot be identified. A person must decide.',
    };
  }

  const gap = Math.abs(a.at.getTime() - b.at.getTime());
  const how = gap < 60_000
    ? `${(gap / 1000).toFixed(1)} seconds apart`
    : `${Math.round(gap / 60_000)} minutes apart`;

  if (b.at.getTime() <= a.at.getTime()) {
    return {
      decided: true,
      winner: 'existing',
      reason: `The record already here was created first (${b.field} ${b.at.toISOString()}), `
        + `${how} before the incoming one. The earlier record stands; the later copy is kept `
        + 'in sync_conflicts.',
    };
  }
  return {
    decided: true,
    winner: 'incoming',
    reason: `The incoming record was created first (${a.field} ${a.at.toISOString()}), `
      + `${how} before the one already here. The earlier record stands; the later copy is `
      + 'kept in sync_conflicts before it is replaced.',
  };
}
