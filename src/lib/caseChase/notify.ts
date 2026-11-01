// ============================================================
// How a sent chase is recorded
// ------------------------------------------------------------
// The notification row IS the record that somebody was written to: it is
// written whatever WhatsApp did, because a surgeon with no number on file must
// still be reachable, and because the board reads these rows to know who is
// left. Kept in its own module so the board and the send route agree on the
// type and the link — the two halves of "already sent".
// ============================================================

export const SURGEON_TYPE = 'CASE_CHASE_SURGEON';
export const CONSULTANT_TYPE = 'CASE_CHASE_CONSULTANT';

export type ChaseKind = 'surgeon' | 'consultant';

/**
 * Where a sent chase is filed.
 *
 * Keyed on the WINDOW as well as the kind, so a chase about this week and one
 * about next week are different messages — but a second press of the button
 * about the same week is not.
 */
export const chaseLink = (kind: ChaseKind, from: string, to: string) =>
  `/dashboard/case-chase?from=${from}&to=${to}&kind=${kind}`;

export const chaseType = (kind: ChaseKind) =>
  (kind === 'surgeon' ? SURGEON_TYPE : CONSULTANT_TYPE);
