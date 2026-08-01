// ============================================================
// Multidisciplinary team check-in
// ------------------------------------------------------------
// Before a case starts, everyone assigned to it says whether they are coming.
// The point is not attendance-taking. It is that a coordinator at 07:40 should
// learn the anaesthetist is stuck in Enugu traffic while there is still time
// to find another one — rather than at 09:15, from an empty theatre.
//
// Which is why "Delayed" and "Unavailable" are first-class answers with a
// reason attached, not failures to respond. A system that only records
// "present" teaches people to tick present and sort it out later.
// ============================================================

export const CHECK_IN_STATUSES = [
  'PRESENT',
  'EN_ROUTE',
  'DELAYED',
  'UNAVAILABLE',
  'REPLACED',
] as const;

export type CheckInStatus = (typeof CHECK_IN_STATUSES)[number];

export interface CheckInMeta {
  label: string;
  /** The dashboard indicator the specification asks for. */
  indicator: '🟢' | '🟡' | '🟠' | '🔴' | '⚪';
  chip: string;
  dot: string;
  /** Is this person expected in theatre? */
  counted: boolean;
}

export const CHECK_IN_META: Record<CheckInStatus, CheckInMeta> = {
  PRESENT: {
    label: 'Present',
    indicator: '🟢',
    chip: 'bg-green-100 text-green-800 border-green-200',
    dot: 'bg-green-500',
    counted: true,
  },
  EN_ROUTE: {
    label: 'En route',
    indicator: '🟡',
    chip: 'bg-amber-100 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    counted: true,
  },
  DELAYED: {
    label: 'Delayed',
    indicator: '🟠',
    chip: 'bg-orange-100 text-orange-800 border-orange-200',
    dot: 'bg-orange-500',
    counted: true,
  },
  UNAVAILABLE: {
    label: 'Unavailable',
    indicator: '🔴',
    chip: 'bg-red-100 text-red-800 border-red-200',
    dot: 'bg-red-500',
    counted: false,
  },
  REPLACED: {
    label: 'Replaced',
    indicator: '⚪',
    chip: 'bg-gray-100 text-gray-700 border-gray-200',
    dot: 'bg-gray-400',
    counted: false,
  },
};

export const isCheckInStatus = (s: unknown): s is CheckInStatus =>
  typeof s === 'string' && (CHECK_IN_STATUSES as readonly string[]).includes(s);

export const checkInMeta = (s: string | null | undefined): CheckInMeta =>
  (isCheckInStatus(s) && CHECK_IN_META[s]) || {
    label: 'No response',
    indicator: '⚪',
    chip: 'bg-gray-50 text-gray-400 border-gray-200',
    dot: 'bg-gray-300',
    counted: false,
  };

/**
 * Statuses that must carry a reason.
 *
 * "Delayed" with no explanation is the same as silence for anyone trying to
 * plan around it — the coordinator still has to ring and ask. Requiring a
 * sentence is what turns the status into information.
 */
export function requiresReason(status: CheckInStatus): boolean {
  return status === 'DELAYED' || status === 'UNAVAILABLE' || status === 'REPLACED';
}

/** A replacement is only useful if it names who is coming instead. */
export function requiresReplacement(status: CheckInStatus): boolean {
  return status === 'REPLACED';
}

// ---------------------------------------------------------------------------
// Reading a team at a glance
// ---------------------------------------------------------------------------

export interface TeamMemberState {
  userId: string;
  name: string | null;
  roleOnCase: string;
  status: CheckInStatus | null;
}

export interface TeamReadiness {
  assigned: number;
  responded: number;
  present: number;
  enRoute: number;
  delayed: number;
  unavailable: number;
  replaced: number;
  /** Assigned people who have said nothing at all. */
  silent: number;
  /** Everyone assigned has answered, and nobody is unavailable without cover. */
  ready: boolean;
  /** Roles with nobody expected in theatre — what a coordinator must fix. */
  gaps: string[];
}

/**
 * Summarise a case's team.
 *
 * `ready` is deliberately strict: silence counts against it. A team is not
 * ready because nobody said otherwise.
 */
export function readiness(members: TeamMemberState[]): TeamReadiness {
  const counts = { PRESENT: 0, EN_ROUTE: 0, DELAYED: 0, UNAVAILABLE: 0, REPLACED: 0 };
  let silent = 0;
  const gaps: string[] = [];

  for (const m of members) {
    if (!m.status) {
      silent++;
      if (!gaps.includes(m.roleOnCase)) gaps.push(m.roleOnCase);
      continue;
    }
    counts[m.status]++;
    if (!CHECK_IN_META[m.status].counted && !gaps.includes(m.roleOnCase)) {
      gaps.push(m.roleOnCase);
    }
  }

  const assigned = members.length;
  const responded = assigned - silent;

  return {
    assigned,
    responded,
    present: counts.PRESENT,
    enRoute: counts.EN_ROUTE,
    delayed: counts.DELAYED,
    unavailable: counts.UNAVAILABLE,
    replaced: counts.REPLACED,
    silent,
    ready: assigned > 0 && silent === 0 && gaps.length === 0,
    gaps,
  };
}

/**
 * A one-line summary for a board. Says the worst thing first, because that is
 * what a coordinator scanning twenty cases needs to see.
 */
export function summarise(r: TeamReadiness): string {
  if (r.assigned === 0) return 'No team assigned';
  if (r.unavailable) return `${r.unavailable} unavailable — cover needed`;
  if (r.silent) return `${r.silent} of ${r.assigned} yet to respond`;
  if (r.delayed) return `${r.delayed} delayed`;
  if (r.enRoute) return `${r.enRoute} still on the way`;
  return `All ${r.assigned} present`;
}
