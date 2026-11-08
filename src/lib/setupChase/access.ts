// ============================================================
// Who may read the setup board, and who may send from it
// ------------------------------------------------------------
// THE TECHNICIANS THEMSELVES MAY READ IT. A technician who can see that
// Theatre 9 has no end-of-day check against it logs the check instead of
// receiving a message about it, and that is the whole point. A board only the
// people writing the messages can see produces messages rather than checked
// theatres.
//
// SENDING IS MANAGEMENT'S AND THE HEAD OF ANAESTHESIA'S, because the
// technicians are theirs, and because a chase one technician can send another
// ends in an argument rather than in a theatre.
//
// IN A LIB, NOT IN THE ROUTE: a Next.js route file may export only its HTTP
// handlers, and an extra named export fails the build.
// ============================================================

export const SETUP_VIEW_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC', 'HEAD_OF_ANAESTHESIA',
  'CONSULTANT_ANAESTHETIST', 'ANAESTHETIST',
  'ANAESTHETIC_TECHNICIAN', 'BIOMEDICAL_ENGINEER', 'BIOMEDICAL_TECHNICIAN',
] as const;

export const SETUP_SEND_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC', 'HEAD_OF_ANAESTHESIA',
] as const;

/**
 * The default window: the fortnight that has just gone.
 *
 * Backwards, like the recovery board and unlike case-chase. A morning setup
 * not logged on Tuesday cannot be logged on time now; what this board is for
 * is the pattern and the conversation, not the deadline.
 */
export const SETUP_WINDOW_DAYS = 14;
