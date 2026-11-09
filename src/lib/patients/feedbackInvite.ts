// ============================================================
// Inviting a patient to say how it went, without knowing who answered
// ------------------------------------------------------------
// WHY A TOKEN AT ALL, when /f already exists and is open to anyone.
//
// The open link is a suggestion box on a wall. It gets used by whoever happens
// to see it, which in practice is whoever is still in the building and still
// feels strongly. An invitation handed over at the end of care reaches the
// person whose care it was, at the moment they can still remember it — and it
// can carry which unit looked after them, so the answer goes somewhere.
//
// WHAT THE TOKEN DOES NOT DO. It does not identify the patient to the
// hospital. When the form is submitted, the stored feedback carries the unit
// and the theatre complex and nothing else; the request row that knew which
// patient it was has its patientId and surgeryId cleared in the same
// transaction. After that there is no join from an opinion back to a person,
// which is the only version of "anonymous" worth offering to somebody who
// wants to complain about their surgeon.
//
// WHAT IS STILL TRUE, AND IS SAID OUT LOUD. A unit plus a week is a small
// group of people on a quiet list. That is a real limit on anonymity and the
// patient is told it in plain words before they write anything, because a
// promise of anonymity that is bigger than the thing delivered is worse than
// no promise: it is what persuades somebody to write the thing they would
// otherwise have kept to themselves.
//
// THE TOKEN IS NEVER STORED. Only its SHA-256. A database read cannot open
// somebody's feedback form, and a leaked backup cannot be used to submit in
// their name.
// ============================================================

import crypto from 'crypto';
import { publicSiteUrl } from './publicLink';

/** How long an invitation stays open. */
export const INVITE_TTL_DAYS = 30;

/**
 * A fresh token and the hash to store against it.
 *
 * base64url of 32 random bytes: short enough to sit in a WhatsApp message
 * without wrapping, long enough that guessing one is not a thing anybody will
 * do by accident or on purpose.
 */
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const inviteExpiry = (from: Date = new Date()): Date =>
  new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

/**
 * The link the patient opens.
 *
 * ONE QUERY PARAMETER, and it is the token.
 *
 * The open feedback page accepts `?name=`, `?folder=` and `?phone=` so that
 * staff can send a pre-filled link. Letting any of those ride along here would
 * turn an anonymous invitation into a signed one without anybody deciding to —
 * the patient would see their own name in the form and reasonably assume the
 * hospital knew what they wrote. So this builds the URL itself rather than
 * taking one, and there is nowhere to put a name.
 */
export function inviteUrl(token: string): string {
  return `${publicSiteUrl()}/f?t=${encodeURIComponent(token)}`;
}

export interface CareContext {
  /** The surgical unit that looked after them. */
  unit: string | null;
  /** The theatre complex, where it is known. */
  complex: string | null;
}

/**
 * What the feedback may carry about the care, stripped of the person.
 *
 * Takes the case and returns only these two. Written as a function rather than
 * done inline at the call site so that there is one place where somebody
 * adding "and the surgeon's name, it would be useful" has to read the comment
 * above first.
 */
export function careContextOf(surgery: {
  unit?: string | null;
  location?: string | null;
}): CareContext {
  const clean = (v: string | null | undefined) => {
    const t = (v ?? '').trim();
    return t === '' ? null : t.slice(0, 120);
  };
  return { unit: clean(surgery.unit), complex: clean(surgery.location) };
}

export interface InviteMessageInput {
  patientName: string;
  url: string;
  hospitalName?: string;
}

/**
 * The message that goes with the link.
 *
 * Written for somebody who has just been through an operation and is tired.
 * Three things it has to do, in this order: thank them, make clear that
 * complaining is safe, and say what the hospital will and will not know.
 *
 * It does NOT say "we value your feedback". Everybody says that and it reads
 * as a form letter, which is what makes a tired person close it.
 */
export function buildInviteMessage(input: InviteMessageInput): string {
  const hospital = input.hospitalName?.trim() || 'UNTH Ituku-Ozalla, Theatre Complex';
  const name = input.patientName.trim();

  return [
    `Dear ${name}, from all of us at ${hospital} — we hope your recovery goes well.`,
    '',
    'Would you tell us how your care actually was? It takes about two minutes, and '
    + 'it is anonymous: your name, your file number and your phone number are not '
    + 'recorded with what you write, and nobody who looked after you can be told it '
    + 'came from you.',
    '',
    'So please say what really happened — including anything that was wrong, or '
    + 'anyone who treated you badly, or asked you for money. That is the part we '
    + 'most need to hear and the part we can do something about.',
    '',
    input.url,
    '',
    'The hospital does record which unit cared for you, so that what you say reaches '
    + 'the right team. On a quiet week that is a small group of patients, so if you '
    + 'would rather not be guessed at, please leave out anything that would point to '
    + 'you. The link works for the next 30 days.',
    '',
    'Thank you for trusting us with your care.',
  ].join('\n');
}

/**
 * What the patient is told before they write anything.
 *
 * Kept in this file, beside inviteState and the token handling, so that the
 * promise and the behaviour have to be changed in the same commit. A promise
 * of anonymity that has outgrown what the code actually does is not a harmless
 * exaggeration: it is the thing that persuades somebody to write the complaint
 * they would otherwise have swallowed.
 *
 * The caution is not an afterthought either. A unit plus a week is a small
 * group of people on a quiet list, and a patient who would rather not be
 * guessed at is entitled to know that before they describe the one thing that
 * would identify them.
 */
export const ANONYMITY_NOTICE = {
  kept: [
    'What you write, and your star ratings.',
    'Which unit cared for you, so the right team sees it.',
  ],
  notKept: [
    'Your name, your file number and your phone number.',
    'Which operation you had, and who performed it.',
    'Any link back to you — once you send this, the hospital cannot tell which '
    + 'patient wrote it, and neither can the people who looked after you.',
  ],
  caution:
    'One thing to know: on a quiet week a unit cares for only a few patients, so '
    + 'please leave out anything that would point to you if you would rather not be '
    + 'guessed at.',
};

/** Why an invitation could not be opened, in words for the patient. */
export type InviteProblem = 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED';

export const INVITE_PROBLEM_MESSAGE: Record<InviteProblem, string> = {
  NOT_FOUND:
    'This feedback link is not one we recognise. It may have been copied '
    + 'incompletely — the whole line, up to the end, is the link. You can still '
    + 'tell us anything you want to, using the ordinary feedback form.',
  EXPIRED:
    'This feedback link has expired. We are sorry — we would still like to hear '
    + 'from you, and the ordinary feedback form below is open to anyone.',
  ALREADY_USED:
    'This feedback link has already been used, and it only works once so that '
    + 'nobody can submit twice in your name. Thank you for what you sent. If there '
    + 'is more you want to say, the ordinary feedback form below is open to anyone.',
};

/**
 * Is this invitation usable, and if not, why not?
 *
 * Pure, so the three refusals can be exercised without a database — and so
 * that "expired" and "already used" cannot quietly collapse into one message.
 * They are different facts and a patient reacts to them differently: one is
 * the hospital's fault, the other means their words already arrived.
 */
export function inviteState(
  row: { expiresAt: Date; submittedAt: Date | null } | null,
  now: Date = new Date(),
): { ok: true } | { ok: false; problem: InviteProblem; message: string } {
  if (!row) {
    return { ok: false, problem: 'NOT_FOUND', message: INVITE_PROBLEM_MESSAGE.NOT_FOUND };
  }
  if (row.submittedAt) {
    return { ok: false, problem: 'ALREADY_USED', message: INVITE_PROBLEM_MESSAGE.ALREADY_USED };
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, problem: 'EXPIRED', message: INVITE_PROBLEM_MESSAGE.EXPIRED };
  }
  return { ok: true };
}
