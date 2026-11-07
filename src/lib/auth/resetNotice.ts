// ============================================================
// What the account holder is told when their password is changed
// ------------------------------------------------------------
// The Staff ID path has no one-time code in front of it, by instruction. This
// message is what replaces it: it does not stop somebody opening a colleague's
// account, but it means the colleague finds out within minutes rather than
// never. It is therefore the single most important sentence in that flow, and
// it lives here — not inside the route — because a Next.js route file may
// export nothing but its HTTP handlers, and a sentence this load-bearing
// should be testable on its own.
// ============================================================

/** One SMS segment is 160 characters. Past that the gateway bills twice. */
export const SMS_SEGMENT = 160;

/**
 * The message sent the moment a password is changed by Staff ID.
 *
 * Addressed by the last name, which in this hospital is how staff are called
 * and how the rest of the application already addresses them. It says what
 * happened, that the Staff ID was what was used, and exactly what to do if the
 * person reading it did not do it.
 */
export function passwordChangedSms(fullName: string): string {
  const lastName = String(fullName ?? '').trim().split(/\s+/).pop() || 'Staff';
  return `${lastName}: your UNTH Theatre password was just changed using your Staff ID. `
    + 'If this was NOT you, tell the Theatre Manager immediately.';
}
