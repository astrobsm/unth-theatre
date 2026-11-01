// ============================================================
// How a sent roster chase is recorded
// ------------------------------------------------------------
// Keyed on the department AND the month, so a chase about November and one
// about December are different messages while a second press about November is
// not. The notification row is also what a head of department reads in the app
// when they have no phone number on file.
// ============================================================

export const ROSTER_CHASE_TYPE = 'ROSTER_CHASE';

export const rosterChaseLink = (month: string, slug: string) =>
  `/dashboard/roster-chase?month=${month}&dept=${slug}`;
