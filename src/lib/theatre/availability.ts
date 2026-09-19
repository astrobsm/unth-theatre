// ============================================================
// "Am I coming?" — one tap, seen by the whole team
// ------------------------------------------------------------
// A case has a surgeon, an anaesthetist, a scrub nurse and a technician, and
// on the morning of the list none of them knows whether the others are coming.
// That is chased by phone, one person at a time, usually by whoever is already
// in the theatre. The whole cost of a missing answer falls on the person least
// able to do anything about it.
//
// So each member says once, on their own dashboard, whether they are coming —
// and everybody on that case sees every answer. No message goes out, nobody is
// rung, and the person who would have done the ringing can see at a glance who
// is still unaccounted for.
//
// WHAT "NO ANSWER" MEANS. Nothing. It is not a refusal and it must never be
// displayed as one: people are operating, teaching, asleep after a night on
// call, or out of signal. "Not yet said" is the honest reading and it is the
// one this file produces.
// ============================================================

export type AvailabilityStatus =
  /** Coming, and expecting to be there for the start. */
  | 'AVAILABLE'
  /** Coming, but late. An ETA is expected with it. */
  | 'DELAYED'
  /** Not coming. The team needs to find somebody else, and now knows to. */
  | 'UNAVAILABLE';

export const AVAILABILITY_STATUSES: AvailabilityStatus[] =
  ['AVAILABLE', 'DELAYED', 'UNAVAILABLE'];

export function isAvailabilityStatus(v: unknown): v is AvailabilityStatus {
  return typeof v === 'string' && (AVAILABILITY_STATUSES as string[]).includes(v);
}

export interface TeamMemberAvailability {
  userId: string;
  name: string;
  /** Their part in this case: "Surgeon", "Anaesthetist", "Scrub nurse". */
  role: string;
  phone?: string | null;
  /** Null until they answer. Null is not a "no". */
  status: AvailabilityStatus | null;
  /** Minutes away, where they said they would be late. */
  etaMinutes?: number | null;
  note?: string | null;
  respondedAt?: string | Date | null;
}

/** How a status reads on screen. Neutral words: nobody is being accused. */
export function statusLabel(status: AvailabilityStatus | null): string {
  switch (status) {
    case 'AVAILABLE': return 'Available';
    case 'DELAYED': return 'On the way, delayed';
    case 'UNAVAILABLE': return 'Not available';
    default: return 'Not yet said';
  }
}

/** With the ETA folded in, where there is one. */
export function statusLine(m: TeamMemberAvailability): string {
  if (m.status === 'DELAYED' && m.etaMinutes && m.etaMinutes > 0) {
    return `On the way — about ${m.etaMinutes} min`;
  }
  return statusLabel(m.status);
}

export interface TeamAvailabilitySummary {
  total: number;
  available: number;
  delayed: number;
  unavailable: number;
  /** Has not answered. Counted, never characterised. */
  silent: number;
  /** Everybody has answered, one way or another. */
  allAnswered: boolean;
  /** Everybody who answered is coming, and everybody has answered. */
  allAvailable: boolean;
  /** Who the team still needs an answer from. */
  awaiting: TeamMemberAvailability[];
  /** Who has said they are not coming. The gap the team must fill. */
  missing: TeamMemberAvailability[];
}

export function summarise(members: TeamMemberAvailability[]): TeamAvailabilitySummary {
  const available = members.filter((m) => m.status === 'AVAILABLE');
  const delayed = members.filter((m) => m.status === 'DELAYED');
  const unavailable = members.filter((m) => m.status === 'UNAVAILABLE');
  const awaiting = members.filter((m) => !m.status);

  return {
    total: members.length,
    available: available.length,
    delayed: delayed.length,
    unavailable: unavailable.length,
    silent: awaiting.length,
    allAnswered: members.length > 0 && awaiting.length === 0,
    // Delayed counts as coming. A case whose surgeon is twenty minutes away is
    // not a case in trouble, and colouring it as one teaches people to ignore
    // the colour.
    allAvailable:
      members.length > 0 && awaiting.length === 0 && unavailable.length === 0,
    awaiting,
    missing: unavailable,
  };
}

/**
 * One line summing up a case's team, for a list where a grid will not fit.
 *
 * Reads as a count and never as a verdict: "3 of 5 confirmed" is a fact, "team
 * incomplete" is a judgement about people who may simply not have looked at
 * their phone yet.
 */
export function summaryLine(s: TeamAvailabilitySummary): string {
  if (s.total === 0) return 'No team assigned yet';
  const parts = [`${s.available + s.delayed} of ${s.total} confirmed`];
  if (s.delayed) parts.push(`${s.delayed} delayed`);
  if (s.unavailable) parts.push(`${s.unavailable} not available`);
  if (s.silent) parts.push(`${s.silent} not yet said`);
  return parts.join(' · ');
}

/**
 * Whether this person may answer for this case.
 *
 * Availability is a personal statement, so it is made by the person and by
 * nobody else. The list of who is on a case is assembled on the server; this
 * only enforces that the answerer is in it.
 */
export function mayAnswerFor(
  userId: string,
  teamUserIds: Array<string | null | undefined>,
): boolean {
  return teamUserIds.some((id) => !!id && id === userId);
}
