// ============================================================
// Emergency response monitoring
// ------------------------------------------------------------
// An emergency is booked. From that moment a clock runs, and the question the
// theatre needs answered is not "who is available?" but "who has not answered
// yet, and how long have we been waiting?".
//
// That distinction is the whole module. A board listing everyone who said yes
// looks reassuring and tells you nothing — the case is held up by the four
// people who said nothing at all. So silence is what this ranks first, and it
// gets louder as the clock runs.
//
// The acknowledgement mechanics already existed (EmergencyTeamAvailability,
// with position, ETA and distance, wired into the emergency booking page).
// What was missing was the timer and somewhere to watch it. This is that.
// ============================================================

/**
 * How long a department has to acknowledge before the wait is worth noticing.
 * Not a target anyone is judged against — a threshold at which a coordinator
 * should pick up a phone.
 */
export const RESPONSE_TARGET_MINUTES = 10;

/** Beyond this, nobody is coming because they saw a notification. Ring them. */
export const RESPONSE_OVERDUE_MINUTES = 20;

/**
 * The roles an emergency laparotomy cannot start without.
 *
 * Kept deliberately short. A longer list would turn every board red and train
 * people to ignore the colour; these three are the ones whose absence stops
 * the case rather than complicating it.
 */
export const CORE_ROLES = ['SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'] as const;

/**
 * Everyone an emergency asks. Ordered as a coordinator would work down a list:
 * the people who cannot be replaced first.
 */
export const REQUIRED_ROLES = [
  'SURGEON',
  'ANAESTHETIST',
  'SCRUB_NURSE',
  'CIRCULATING_NURSE',
  'ANAESTHETIC_TECHNICIAN',
  'RECOVERY_ROOM_NURSE',
  'PORTER',
  'THEATRE_STORE_KEEPER',
  'BLOODBANK_STAFF',
  'PHARMACIST',
  'CLEANER',
  'BIOMEDICAL_ENGINEER',
] as const;

export type RequiredRole = (typeof REQUIRED_ROLES)[number];

export const ROLE_LABEL: Record<string, string> = {
  SURGEON: 'Surgeon',
  ANAESTHETIST: 'Anaesthetist',
  SCRUB_NURSE: 'Scrub Nurse',
  CIRCULATING_NURSE: 'Circulating Nurse',
  ANAESTHETIC_TECHNICIAN: 'Anaesthetic Technician',
  RECOVERY_ROOM_NURSE: 'Recovery Nurse',
  PORTER: 'Porter',
  THEATRE_STORE_KEEPER: 'Theatre Store',
  BLOODBANK_STAFF: 'Blood Bank',
  PHARMACIST: 'Pharmacy',
  CLEANER: 'Cleaner',
  BIOMEDICAL_ENGINEER: 'Biomedical Engineering',
};

/**
 * The answers a person may give, as the specification words them, mapped onto
 * the statuses the database has recorded since before this module existed.
 * Reusing them rather than adding a parallel set keeps one history.
 */
export const ANSWER_LABEL: Record<string, string> = {
  AVAILABLE: 'Available',
  ARRIVED: 'Already in theatre',
  EN_ROUTE: 'En route',
  ON_ANOTHER_CASE: 'On another case',
  UNAVAILABLE: 'Unable to attend',
};

/** Answers that mean this person is coming, or is already here. */
const COMING = ['AVAILABLE', 'ARRIVED', 'EN_ROUTE'];

export function isComing(status: string | null | undefined): boolean {
  return !!status && COMING.includes(status);
}

/** Whole minutes between two instants, floored, never negative. */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
}

/** How long a person took to answer. Null while they still have not. */
export function responseMinutes(requestedAt: Date, respondedAt: Date | null | undefined): number | null {
  if (!respondedAt) return null;
  return minutesBetween(requestedAt, respondedAt);
}

export type RoleState = 'RESPONDED' | 'AWAITING' | 'OVERDUE';

/**
 * Where one role stands.
 *
 * A role that has answered is settled whatever it answered — "unable to
 * attend" is an answer, and a useful one. It is silence that escalates.
 */
export function roleState(params: {
  respondedAt: Date | null | undefined;
  requestedAt: Date;
  now: Date;
}): RoleState {
  if (params.respondedAt) return 'RESPONDED';
  return minutesBetween(params.requestedAt, params.now) >= RESPONSE_OVERDUE_MINUTES
    ? 'OVERDUE'
    : 'AWAITING';
}

export interface ResponseRow {
  role: string;
  userId: string | null;
  userName: string | null;
  status: string | null;
  respondedAt: Date | null;
  etaMinutes: number | null;
  distanceKm: number | null;
}

export interface RoleOutcome {
  role: string;
  label: string;
  state: RoleState;
  answer: string | null;
  answerLabel: string | null;
  userName: string | null;
  minutesToRespond: number | null;
  etaMinutes: number | null;
  distanceKm: number | null;
  coming: boolean;
  core: boolean;
}

export interface ResponseBoard {
  /** True once the case is over. A finished emergency is a record, not a board. */
  closed: boolean;
  elapsedMinutes: number;
  rows: RoleOutcome[];
  responded: number;
  awaiting: number;
  overdue: number;
  coming: number;
  /** Core roles with nobody coming. Empty means the case can proceed. */
  blocking: string[];
  /** True when every core role has somebody coming. */
  canProceed: boolean;
  /** Slowest answer so far, for the record afterwards. */
  slowestMinutes: number | null;
}

/**
 * Build the board for one emergency.
 *
 * Roles nobody has responded for still appear — that is the point. A board
 * built only from the rows that exist would show a tidy list of five people
 * and hide the seven departments that never replied.
 */
export function responseBoard(params: {
  requestedAt: Date;
  responses: ResponseRow[];
  now: Date;
  roles?: readonly string[];
  /**
   * The case is finished or cancelled.
   *
   * Without this a completed emergency reads "Cannot start — no surgeon",
   * which is both false and alarming: the case ran hours ago and nobody
   * acknowledged through the app. A closed case is history, and history does
   * not need a phone call.
   */
  closed?: boolean;
}): ResponseBoard {
  const roles = params.roles ?? REQUIRED_ROLES;
  const byRole = new Map<string, ResponseRow>();
  for (const r of params.responses) {
    const existing = byRole.get(r.role);
    // If two people answer for one role, keep whoever is coming; failing that,
    // whoever answered first. A porter who said yes outranks one who said no.
    if (!existing) {
      byRole.set(r.role, r);
      continue;
    }
    if (isComing(r.status) && !isComing(existing.status)) byRole.set(r.role, r);
  }

  const rows: RoleOutcome[] = roles.map((role) => {
    const r = byRole.get(role);
    const state = roleState({ respondedAt: r?.respondedAt, requestedAt: params.requestedAt, now: params.now });
    return {
      role,
      label: ROLE_LABEL[role] ?? role,
      state,
      answer: r?.status ?? null,
      answerLabel: r?.status ? ANSWER_LABEL[r.status] ?? r.status : null,
      userName: r?.userName ?? null,
      minutesToRespond: responseMinutes(params.requestedAt, r?.respondedAt),
      etaMinutes: r?.etaMinutes ?? null,
      distanceKm: r?.distanceKm ?? null,
      coming: isComing(r?.status),
      core: (CORE_ROLES as readonly string[]).includes(role),
    };
  });

  const blocking = rows.filter((r) => r.core && !r.coming).map((r) => r.label);
  const times = rows.map((r) => r.minutesToRespond).filter((n): n is number => n !== null);

  return {
    closed: !!params.closed,
    elapsedMinutes: minutesBetween(params.requestedAt, params.now),
    rows,
    responded: rows.filter((r) => r.state === 'RESPONDED').length,
    awaiting: rows.filter((r) => r.state === 'AWAITING').length,
    overdue: rows.filter((r) => r.state === 'OVERDUE').length,
    coming: rows.filter((r) => r.coming).length,
    blocking,
    canProceed: blocking.length === 0,
    slowestMinutes: times.length ? Math.max(...times) : null,
  };
}

/**
 * The line a coordinator reads first. Worst thing first, and it names the
 * missing role rather than counting it — "waiting on the anaesthetist" is
 * actionable, "3 outstanding" is not.
 */
export function summarise(board: ResponseBoard): string {
  if (board.closed) {
    return board.responded === 0
      ? 'Closed — nobody acknowledged through the app'
      : `Closed — ${board.responded} of ${board.rows.length} departments acknowledged`;
  }
  if (board.blocking.length) {
    return `Cannot start — no ${board.blocking.map((b) => b.toLowerCase()).join(' or ')}`;
  }
  if (board.overdue) return `${board.overdue} department${board.overdue > 1 ? 's' : ''} have not answered`;
  if (board.awaiting) return `${board.awaiting} still to answer`;
  return `All ${board.responded} answered — ${board.coming} coming`;
}

/**
 * Sort emergencies so the one most in need of a phone call is on top.
 *
 * Blocked cases first, then by how long the clock has been running. A case
 * that is fully staffed drops to the bottom however old it is, because nobody
 * needs to do anything about it.
 */
export function urgencyOrder<T extends { board: ResponseBoard }>(cases: T[]): T[] {
  return [...cases].sort((a, b) => {
    // A finished case never needs a phone call, however it ended.
    if (a.board.closed !== b.board.closed) return a.board.closed ? 1 : -1;
    if (a.board.canProceed !== b.board.canProceed) return a.board.canProceed ? 1 : -1;
    return b.board.elapsedMinutes - a.board.elapsedMinutes;
  });
}
