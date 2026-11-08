// ============================================================
// How a sent setup chase is recorded
// ------------------------------------------------------------
// Keyed on the technician and the WINDOW, because this is one message about
// several theatre-days. Filing it against one of them would make the rest
// untraceable, and a second press of the button about the same fortnight is a
// duplicate rather than a second message.
// ============================================================

export const SETUP_CHASE_TYPE = 'THEATRE_SETUP_CHASE';

export const setupChaseLink = (from: string, to: string, personId: string) =>
  `/dashboard/setup-chase?from=${from}&to=${to}&person=${personId}`;
