// ============================================================
// The link a commendation carries
// ------------------------------------------------------------
// One function, in a file of its own, because two routes depend on the exact
// string: the commend route writes it onto the notification, and the board
// queries notifications by it to know who has already been thanked. If the
// two ever spelled it differently the board would offer to commend somebody a
// second time, and a letter of appreciation that arrives twice reads as an
// automated circular — which is the one thing a commendation must not be.
// ============================================================

/** `/dashboard/booking-performance?from=2026-10-01&to=2026-10-31` */
export function commendationLink(from: string, to: string): string {
  return `/dashboard/booking-performance?from=${from}&to=${to}`;
}
