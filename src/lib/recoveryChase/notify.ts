// ============================================================
// How a sent recovery chase is recorded
// ------------------------------------------------------------
// The notification row IS the record that somebody was written to. It is
// written whatever WhatsApp did, because a nurse with no number on file must
// still be reachable in the app, and because the board reads these rows to
// know who is left.
//
// KEYED ON THE DAY, NOT THE WINDOW. A supervisor's accountability is for a
// shift on a date: a second press of the button about Tuesday is a duplicate,
// but a message about Wednesday is a different message. Keying on the whole
// window instead would silence every later day once one had been sent.
// ============================================================

export const RECOVERY_CHASE_TYPE = 'RECOVERY_RECORD_CHASE';

export type RecoveryChaseKind = 'supervisor' | 'recovery-nurse' | 'record-holder';

/** Where a sent chase is filed, and what makes two of them the same. */
export const recoveryChaseLink = (day: string, personId: string) =>
  `/dashboard/recovery-chase?day=${day}&person=${personId}`;
