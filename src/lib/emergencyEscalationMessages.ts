/**
 * What each person is actually told.
 *
 * The requirement is that the message is personalised to the user BY THEIR ROLE
 * ON THE SURGERY — not a broadcast. A scrub nurse and the operating surgeon are
 * asked different questions about the same delay, and a message that ignores
 * that gets read as spam and answered by nobody.
 *
 * Kept separate from the ladder itself so the wording can be read, corrected by
 * a clinician and tested without touching the escalation logic.
 */

import { describeLateness } from './emergencyEscalation';

export interface CasePerson {
  userId: string;
  name: string;
  /** Their part in THIS case: 'Surgeon', 'Anaesthetist', 'Scrub Nurse'… */
  roleOnCase: string;
  phoneNumber?: string | null;
}

export interface CaseFacts {
  patientName: string;
  folderNumber?: string | null;
  procedureName: string;
  theatreName?: string | null;
  /** When it was due to start. */
  dueAt: Date;
  minutesLate: number;
  /** What somebody has already given as the reason, if anything. */
  reasonGiven?: string | null;
}

const when = (d: Date) =>
  d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const caseLine = (c: CaseFacts) =>
  `${c.patientName}${c.folderNumber ? ` (${c.folderNumber})` : ''} — ${c.procedureName}` +
  `${c.theatreName ? `, ${c.theatreName}` : ''}`;

/**
 * Stage 1: asked, by name and by role, why it has not started.
 *
 * The ask is specific. "Please update the system" produces nothing; naming the
 * person, their role and the patient produces an answer.
 */
export function stage1Message(p: CasePerson, c: CaseFacts): { title: string; body: string } {
  return {
    title: `Emergency not started — ${describeLateness(c.minutesLate)}`,
    body:
      `${p.name}, you are named as ${p.roleOnCase} on this emergency:\n` +
      `${caseLine(c)}\n` +
      `It was due to start at ${when(c.dueAt)} and has not started — ${describeLateness(c.minutesLate)}.\n\n` +
      `Please record why it has not started. Open the case and report the delay. ` +
      `If it has in fact started, or was cancelled or rescheduled, record that instead so this stops.`,
  };
}

/** Stage 2: the same people again, and the CMD is now informed. */
export function stage2Message(p: CasePerson, c: CaseFacts): { title: string; body: string } {
  return {
    title: `Still not started — escalated to the CMD (${describeLateness(c.minutesLate)})`,
    body:
      `${p.name}, this emergency is now ${describeLateness(c.minutesLate)} and still has not started:\n` +
      `${caseLine(c)}\n\n` +
      (c.reasonGiven
        ? `Recorded so far: "${c.reasonGiven}".\n\n`
        : `No reason has been recorded by anyone on the case.\n\n`) +
      `The Chief Medical Director has been informed. As ${p.roleOnCase} on this case, ` +
      `please record the reason for the delay now if you have not already.`,
  };
}

/** What the CMD is sent at stage 2 — the case, not one person's part in it. */
export function cmdMessage(c: CaseFacts, team: CasePerson[]): { title: string; body: string } {
  return {
    title: `Emergency ${describeLateness(c.minutesLate)} and not started`,
    body:
      `${caseLine(c)}\n` +
      `Due to start ${when(c.dueAt)}. Still not started after two hours.\n\n` +
      (c.reasonGiven ? `Reason recorded: "${c.reasonGiven}".\n\n` : `No reason has been recorded.\n\n`) +
      `Named on the case: ${team.map((t) => `${t.name} (${t.roleOnCase})`).join(', ') || 'nobody recorded'}.`,
  };
}

/**
 * Stage 3: the invitation an administrator sends.
 *
 * `appearAt` is filled in by the administrator when they send it — the
 * committee's sitting is not something this system can know. Until then the
 * message says so plainly rather than inventing a time.
 */
export function committeeInvitation(
  p: CasePerson,
  c: CaseFacts,
  appearAt?: Date | null,
): string {
  const appointment = appearAt
    ? `You are asked to attend on ${when(appearAt)}.`
    : `A date and time will be given to you when this is sent.`;

  return (
    `Dear ${p.name},\n\n` +
    `You are named as ${p.roleOnCase} on the following emergency case, which was booked and did not start:\n\n` +
    `${caseLine(c)}\n` +
    `Due to start: ${when(c.dueAt)}\n` +
    `Delay at the time of writing: ${describeLateness(c.minutesLate)}\n` +
    (c.reasonGiven ? `Reason recorded: ${c.reasonGiven}\n` : `No reason was recorded.\n`) +
    `\nThe Theatre Audit Committee has asked to meet you about this case. ${appointment}\n\n` +
    `This is a request to discuss what happened, so that the cause is understood and recorded. ` +
    `Please bring anything relevant to your part in the case.\n\n` +
    `Theatre Audit Committee\nUNTH Ituku-Ozalla`
  );
}

/**
 * The same invitation as a single WhatsApp line.
 *
 * wa.me carries the text in a URL, so the newlines survive but the length does
 * not want to be a page. This is the short form.
 */
export function committeeInvitationWhatsApp(
  p: CasePerson,
  c: CaseFacts,
  appearAt?: Date | null,
): string {
  return (
    `Dear ${p.name}, you are named as ${p.roleOnCase} on an emergency case that was booked and did not start: ` +
    `${caseLine(c)}, due ${when(c.dueAt)} (${describeLateness(c.minutesLate)}). ` +
    `The Theatre Audit Committee asks to meet you about it` +
    (appearAt ? ` on ${when(appearAt)}.` : `.`) +
    ` — Theatre Audit Committee, UNTH Ituku-Ozalla`
  );
}
