/**
 * Chasing the holding area for a patient who was called for.
 *
 * The theatre nurse calls a patient up, and then waits. The call-up note is
 * printed, the porter goes, and somewhere between the ward and the table the
 * patient stops moving. Until now the only way to find out why was to leave
 * the theatre and walk to the holding area, or to ring round. This is the
 * button that asks the person who can actually see the patient.
 *
 * IT GOES TO THE HOLDING AREA FOR THAT COMPLEX. Not to "the holding area" —
 * see complexes.ts. A patient waiting outside the Eye Theatre is not visible
 * to anybody standing in Professor Ojukwu.
 *
 * IT ASKS A QUESTION, IT DOES NOT ISSUE AN ORDER. The holding-area nurse
 * usually knows exactly why the patient has not moved — no consent, no blood,
 * no porter, a ward that has not finished — and the fastest route to the
 * patient being in theatre is for them to say so. A message that only says
 * "send the patient" gets a patient sent who is not ready.
 *
 * IT NEVER CLAIMS TO HAVE REACHED SOMEBODY IT DID NOT. Where no nurse is
 * named to that holding area for the shift, the chase refuses and says so.
 * A role-targeted send that matches no rows returns success, and the screen
 * then says the message went while nothing was addressed.
 */

export interface HoldingAreaChaseFacts {
  /** Canonical complex label, e.g. 'Eye Theatre'. */
  complex: string;
  /** The theatre the patient is wanted in. */
  theatreName: string | null;
  patientName: string | null;
  folderNumber: string | null;
  ward: string | null;
  procedureName: string | null;
  /** Minutes since the call-up note was raised, where there is one. */
  minutesSinceCallUp: number | null;
  /** Who is asking, and from where. */
  calledByName: string;
  calledByRole: string | null;
  /** Anything the caller typed. */
  note: string | null;
}

/** "ADA OKEKE (UNTH/12345)" — the same form the other chases use. */
export function patientLabel(f: {
  patientName: string | null; folderNumber: string | null;
}): string {
  if (!f.patientName) return 'the patient';
  return f.folderNumber ? `${f.patientName} (${f.folderNumber})` : f.patientName;
}

/** "22 minutes ago", or null where no call-up time is known. */
export function waitedFor(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${Math.round(minutes)} minutes ago`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const hours = h === 1 ? '1 hour' : `${h} hours`;
  return m === 0 ? `${hours} ago` : `${hours} ${m} min ago`;
}

/**
 * The message the holding-area nurse receives.
 *
 * Deliberately short. It is read on a phone, standing up, in a room with a
 * patient in it.
 */
export function buildHoldingAreaChase(f: HoldingAreaChaseFacts): string {
  const lines: string[] = [];
  const who = f.calledByRole ? `${f.calledByName} (${f.calledByRole})` : f.calledByName;
  const theatre = f.theatreName ?? 'theatre';

  lines.push(`🔔 ${theatre} is waiting for a patient.`);
  lines.push('');
  lines.push(`Patient: ${patientLabel(f)}`);
  if (f.ward) lines.push(`From: ${f.ward}`);
  if (f.procedureName) lines.push(`For: ${f.procedureName}`);

  const waited = waitedFor(f.minutesSinceCallUp);
  lines.push(waited
    ? `Called for: ${waited}.`
    : 'Called for: the call-up note has been raised.');

  lines.push('');
  lines.push(
    `${who} is asking from ${theatre}: is this patient with you, and what is `
    + 'holding them?',
  );
  lines.push(
    'If something is missing — consent, blood, a porter, the ward not finished '
    + '— reply with that, so it can be sorted from this end rather than the '
    + 'patient being sent unready.',
  );

  if (f.note) {
    lines.push('');
    lines.push(`Note from ${f.calledByName}: ${f.note}`);
  }

  lines.push('');
  lines.push(`— ${f.complex} holding area · UNTH Operative Resource Manager`);
  return lines.join('\n');
}

/** The one-line version for the in-app notification. */
export function chaseNotificationLine(f: HoldingAreaChaseFacts): string {
  const waited = waitedFor(f.minutesSinceCallUp);
  const theatre = f.theatreName ?? 'Theatre';
  return `${theatre} is waiting for ${patientLabel(f)}`
    + `${waited ? `, called for ${waited}` : ''}. ${f.calledByName} is asking what is holding them.`;
}

/**
 * What the caller is told when that holding area has nobody named to it.
 *
 * It names the complex and the shift, because "nobody is on the holding area"
 * is acted on differently from "nobody is on the Eye Theatre holding area this
 * morning" — and it is the second that is true.
 */
export function nobodyOnDutyMessage(complex: string, shiftLabel: string): string {
  return `Nobody is named to the ${complex} holding area for the ${shiftLabel} shift, `
    + 'so this chase would reach no one. Put somebody on it from Theatre staffing, '
    + 'or ring the holding area directly.';
}
