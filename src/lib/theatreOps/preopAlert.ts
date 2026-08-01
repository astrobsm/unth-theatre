// ============================================================
// The 60-minute preoperative alert
// ------------------------------------------------------------
// An hour before a case is due, everyone assigned to it is told, and the
// theatre is prompted over the radio to send for the patient.
//
// This is the forward-looking half of the operations module. Everything built
// so far watches a case AFTER its time has passed — the delay detector, the
// escalations, the unexplained queue. All of that is downstream of a case
// starting late. This is the part that tries to stop it happening.
//
// Nothing here touches the database or sends anything. It decides WHETHER a
// case is due for an alert, WHO should get it, and WHAT it says. The route
// does the rest, and the tests exercise these functions directly.
// ============================================================

/** How far ahead of the scheduled time the team is told. */
export const ALERT_LEAD_MINUTES = 60;

/** Minutes from `now` until `scheduledStart`. Negative once the time passes. */
export function minutesUntil(scheduledStart: Date | null, now: Date): number | null {
  if (!scheduledStart) return null;
  return Math.round((scheduledStart.getTime() - now.getTime()) / 60_000);
}

/** Statuses for which an alert would be pointless or wrong. */
const NOT_ALERTABLE = ['CANCELLED', 'COMPLETED', 'IN_PROGRESS', 'POSTPONED'];

export interface AlertCandidate {
  /** Scheduled start as an instant. Null when the booking has no readable time. */
  scheduledStart: Date | null;
  status: string;
  /** True once an alert row exists for this case. */
  alreadyAlerted: boolean;
  /** True once the patient has been moved, anaesthetised or cut. */
  started: boolean;
}

export interface AlertDecision {
  send: boolean;
  minutesBefore: number | null;
  reason: string;
}

/**
 * Whether a case is due for its preoperative alert right now.
 *
 * The window is (0, 60]. A case 61 minutes away is not yet due; a case whose
 * time has already passed is NOT alerted at all — being late is the delay
 * detector's business, and firing "your case starts in -20 minutes" would be
 * both useless and slightly insulting. The two halves of the module meet at
 * the scheduled time and neither crosses it.
 *
 * A case booked with less than an hour's notice fires on the next run, which
 * is the correct behaviour: the team is told as soon as the system knows.
 */
export function dueForAlert(candidate: AlertCandidate, now: Date): AlertDecision {
  const mins = minutesUntil(candidate.scheduledStart, now);

  if (mins === null) return { send: false, minutesBefore: null, reason: 'no readable scheduled time' };
  if (candidate.alreadyAlerted) return { send: false, minutesBefore: mins, reason: 'already alerted' };
  if (candidate.started) return { send: false, minutesBefore: mins, reason: 'case already under way' };
  if (NOT_ALERTABLE.includes(candidate.status)) {
    return { send: false, minutesBefore: mins, reason: `status ${candidate.status}` };
  }
  if (mins > ALERT_LEAD_MINUTES) return { send: false, minutesBefore: mins, reason: 'too early' };
  if (mins <= 0) return { send: false, minutesBefore: mins, reason: 'scheduled time has passed' };

  return { send: true, minutesBefore: mins, reason: 'due' };
}

// ---------------------------------------------------------------------------
// Who is told
// ---------------------------------------------------------------------------

export interface TeamSlot {
  userId: string | null;
  name: string | null;
  /** What they are on this case — "Surgeon", "Anaesthetist", "Scrub Nurse". */
  role: string;
}

/**
 * The named people on a case, de-duplicated by user id.
 *
 * A consultant who is both the surgeon and the supervising consultant is one
 * person and gets one alert, listing both roles. Sending the same person the
 * same notification twice teaches them to ignore it.
 */
export function recipientsOf(slots: TeamSlot[]): { userId: string; roles: string[]; name: string | null }[] {
  const byUser = new Map<string, { userId: string; roles: string[]; name: string | null }>();
  for (const s of slots) {
    if (!s.userId) continue;
    const existing = byUser.get(s.userId);
    if (existing) {
      if (!existing.roles.includes(s.role)) existing.roles.push(s.role);
      if (!existing.name && s.name) existing.name = s.name;
    } else {
      byUser.set(s.userId, { userId: s.userId, roles: [s.role], name: s.name ?? null });
    }
  }
  return Array.from(byUser.values());
}

/**
 * Roles told about every case regardless of who is named on it.
 *
 * These are the people who run the floor rather than the case — they need to
 * know a list is about to start whether or not anyone put their name on it.
 */
export const COORDINATION_ROLES = [
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'THEATRE_STORE_KEEPER',
];

/** The ward is prompted to prepare and send the patient. */
export const WARD_ROLES = ['WARD_NURSE', 'NURSE'];

// ---------------------------------------------------------------------------
// What it says
// ---------------------------------------------------------------------------

export interface AlertSubject {
  patientName: string;
  hospitalNumber: string | null;
  procedureName: string;
  theatre: string | null;
  scheduledTime: string;
  unit: string | null;
  /** The ward holding the patient. The reminder goes to every ward nurse, so
   *  naming the ward is what makes it possible to ignore the ones that are
   *  not yours. */
  ward: string | null;
  team: { role: string; name: string }[];
  packs: string[];
  bloodRequired: boolean;
  bloodDetail: string | null;
  equipment: string[];
  specialInstructions: string | null;
}

/** "Theatre Three" reads better aloud than "THEATRE_3". Falls back gracefully. */
export function theatrePhrase(theatre: string | null): string {
  if (!theatre || !theatre.trim()) return 'the theatre';
  return theatre.trim();
}

/**
 * The in-app / push notification. Private to the recipient, so it carries the
 * full working detail the spec asks for — including the hospital number.
 */
export function alertNotification(subject: AlertSubject, minutesBefore: number): { title: string; message: string } {
  const lines: string[] = [];
  lines.push(`${subject.patientName}${subject.hospitalNumber ? ` (${subject.hospitalNumber})` : ''}`);
  lines.push(subject.procedureName);
  lines.push(`${theatrePhrase(subject.theatre)} at ${subject.scheduledTime}${subject.unit ? ` — ${subject.unit}` : ''}`);

  if (subject.team.length) {
    lines.push(`Team: ${subject.team.map((t) => `${t.name} (${t.role})`).join(', ')}`);
  }
  if (subject.packs.length) lines.push(`Packs: ${subject.packs.join(', ')}`);
  if (subject.bloodRequired) lines.push(`Blood required${subject.bloodDetail ? `: ${subject.bloodDetail}` : ''}`);
  if (subject.equipment.length) lines.push(`Equipment: ${subject.equipment.join(', ')}`);
  if (subject.specialInstructions) lines.push(`Note: ${subject.specialInstructions}`);

  return {
    title: `Surgery in ${minutesBefore} minutes — ${theatrePhrase(subject.theatre)}`,
    message: lines.join('\n'),
  };
}

/**
 * The radio call. Spoken aloud in a corridor, so it carries the name, the
 * procedure, the theatre and the time — and deliberately NOT the hospital
 * number. The number is the thing that turns a name overheard in a corridor
 * into a retrievable record, and it adds nothing to an instruction to send for
 * a patient.
 */
export function alertAnnouncement(subject: AlertSubject): string {
  return (
    `Attention ${theatrePhrase(subject.theatre)}. ` +
    `Kindly send for ${subject.patientName}, ` +
    `scheduled for ${subject.procedureName} at ${subject.scheduledTime} hours.`
  );
}

/** What the ward is asked to do. The checklist is the point, not the prose. */
export function wardReminder(subject: AlertSubject, minutesBefore: number): { title: string; message: string } {
  return {
    title: `${subject.ward ? `${subject.ward}: ` : ''}prepare ${subject.patientName} — theatre in ${minutesBefore} minutes`,
    message:
      `${subject.patientName}${subject.hospitalNumber ? ` (${subject.hospitalNumber})` : ''} is due in ` +
      `${theatrePhrase(subject.theatre)} at ${subject.scheduledTime} for ${subject.procedureName}.\n` +
      'Before the porter arrives: confirm identity, verify consent is signed, ' +
      'complete the ward documentation, and prepare the patient for transfer.',
  };
}

/**
 * Order announcements by when the case is due, soonest first, with emergencies
 * ahead of elective cases at the same time.
 *
 * When four theatres start at 08:00 the calls go out one after another rather
 * than on top of each other, and the queue decides the order rather than
 * whichever database row happened to be read first.
 */
export function announcementOrder<T extends { scheduledStart: Date | null; isEmergency: boolean }>(
  cases: T[]
): T[] {
  return [...cases].sort((a, b) => {
    if (a.isEmergency !== b.isEmergency) return a.isEmergency ? -1 : 1;
    const at = a.scheduledStart?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bt = b.scheduledStart?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return at - bt;
  });
}

/**
 * Radio priority. Emergencies sit above elective calls, and an elective call
 * rises as its time approaches, so a case due in ten minutes is spoken before
 * one due in fifty.
 */
export function announcementPriority(minutesBefore: number, isEmergency: boolean): number {
  if (isEmergency) return 95;
  // 60 minutes out -> 60; 5 minutes out -> 85. Never reaches emergency level.
  const urgency = Math.max(0, Math.min(ALERT_LEAD_MINUTES, ALERT_LEAD_MINUTES - minutesBefore));
  return 60 + Math.round((urgency / ALERT_LEAD_MINUTES) * 25);
}
