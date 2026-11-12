// ============================================================
// How a sent roster chase is recorded
// ------------------------------------------------------------
// Keyed on the department AND the PERIOD, so a chase about this week and one
// about next week are different messages while a second press about this week
// is not. The period arrives as the same `key` the query string carries
// ("week=2026-11-09" or "month=2026-11"), so "already chased about this" means
// the same thing on both sides; building it from a month here while the board
// asked about a week would make every chase look unsent.
// The notification row is also what a head of department reads in the app when
// they have no phone number on file.
// ============================================================

export const ROSTER_CHASE_TYPE = 'ROSTER_CHASE';

export const rosterChaseLink = (periodKey: string, slug: string) =>
  `/dashboard/roster-chase?${periodKey}&dept=${slug}`;
