// ============================================================
// Two lanes, because volume and urgency are unrelated
// ------------------------------------------------------------
// WHAT HAPPENED ON 13 OCTOBER. The theatre server came back after three weeks
// on a stale build and had 4,787 entries to pull down. Ten of them were the
// cases booked for that morning. A surgeon stood at the console looking at
// "No cases booked for this date" while the queue delivered, ahead of them:
//
//   surgery_consumable_requests   2319
//   radio_announcements            547
//   audit_logs                     431
//   surgery_drafts                 363
//   rosters                        199
//
// Nothing was broken. The queue is ordered strictly by hybrid logical clock,
// so today's bookings — being the NEWEST entries — sat at the very back,
// behind three weeks of bulk. Twenty minutes of a theatre not knowing its own
// list, because the design knows about time and nothing else.
//
// This is the third time the same shape has cost this hospital a morning: an
// announcement's audio wedged the push queue for three days, a sweep
// timestamp produced 74% of the pull stream, and now bulk chatter has buried
// a theatre list. In each case the volume had no relationship to the urgency.
//
// ── THE FIX, AND ITS LIMITS ─────────────────────────────────────────────────
//
// A second cursor over the same journal. The priority lane is drained first
// each cycle; the bulk lane gets what time remains. Nothing is dropped,
// reordered within a lane, or delivered twice — each lane is an independent
// watermark over one append-only log, which is the same mechanism that
// already works, applied twice.
//
// THE LANE IS DELIBERATELY SHORT. Every table added to it dilutes it, and a
// priority lane containing everything is just the old queue with extra steps.
// The test for inclusion is not "is this clinically important" — almost
// everything here is — but "does a theatre need this to run the list in front
// of it right now".
//
// PARENTS MUST TRAVEL WITH CHILDREN. patients is in the lane because surgeries
// has a foreign key to it, and a surgery arriving before its patient fails and
// parks in sync_deferred. That recovers — deferral exists for exactly this —
// but it turns a fast lane into a slow one, which defeats the purpose.
// ============================================================

export type Lane = 'priority' | 'bulk';

export interface LaneEntry {
  table: string;
  why: string;
}

/**
 * What a theatre needs to run the list standing in front of it.
 *
 * Adding to this list is not free: every table here is one more thing ahead
 * of the cases. If you are tempted to add one, ask whether a theatre is
 * blocked without it in the next hour.
 */
export const PRIORITY_TABLES: LaneEntry[] = [
  {
    table: 'patients',
    why: 'The parent of surgeries. Not here for its own urgency but because a '
      + 'surgery whose patient has not arrived fails its foreign key and parks in '
      + 'sync_deferred — which recovers, but a lane that parks is not a fast lane.',
  },
  {
    table: 'surgeries',
    why: 'The list itself. This is the table that was twenty minutes late behind three '
      + 'weeks of consumable requests, and the reason the lane exists.',
  },
  {
    table: 'emergency_surgery_bookings',
    why: 'An emergency that has not reached the other node is an emergency nobody there '
      + 'can see. Of everything ORM replicates, this is the one with minutes on it.',
  },
  {
    table: 'emergency_team_availability',
    why: 'Who answered the emergency call-out. Useless after the fact and decisive '
      + 'during it: it is how the theatre knows whether a team is coming.',
  },
  {
    table: 'theatre_allocations',
    why: 'Which case is in which theatre. A list that arrives without its allocations '
      + 'tells a nurse what is happening but not where.',
  },
];

const PRIORITY_SET = new Set(PRIORITY_TABLES.map((t) => t.table));

export const PRIORITY_TABLE_NAMES: string[] = PRIORITY_TABLES.map((t) => t.table);

export function laneOf(table: string): Lane {
  return PRIORITY_SET.has(table) ? 'priority' : 'bulk';
}

export function isPriorityTable(table: string): boolean {
  return PRIORITY_SET.has(table);
}

/**
 * How much of a cycle's budget each lane gets.
 *
 * The priority lane is drained FIRST and in full where it can be: it is short,
 * so in steady state it is almost always empty and costs nothing. The split
 * only matters after an outage, which is exactly when it matters.
 *
 * Bulk still gets the majority, because bulk is where the volume is and
 * starving it would simply move the backlog rather than clear it. The point
 * is not that chatter is unimportant — it is that a theatre list should not
 * wait behind three weeks of it.
 */
export const PRIORITY_BATCH = 200;
export const BULK_BATCH = 200;

/**
 * Is a lane value one we recognise?
 *
 * Validated at the boundary rather than trusted: an unrecognised lane that
 * silently fell through to "bulk" would quietly disable the priority pull and
 * look exactly like it working.
 */
export function parseLane(value: unknown): Lane | null {
  return value === 'priority' || value === 'bulk' ? value : null;
}
