// ============================================================
// Issuing a leaflet to a patient, and what the message may say
// ------------------------------------------------------------
// Pure. The token machinery is the same as the feedback invitation's, and
// deliberately so: random 32 bytes, SHA-256 stored, the token itself never
// written down. A database read cannot open somebody's medical information,
// and a leaked backup cannot either.
//
// WHY THE MESSAGE CARRIES A LINK AND NOT THE LEAFLET.
//
// checkSendAllowed (lib/comms/policy) refuses CLINICAL content on an external
// channel. That is not a technicality to be routed around — it is the rule
// this hospital already settled on, and it is right. A diagnosis and a list
// of surgical risks sitting in a notification shade is read by whoever is
// holding the phone: on a bus, over a shoulder, or — if one digit of the
// number was mistyped at booking — by a stranger.
//
// So the WhatsApp message names the patient and the hospital and carries one
// link. Everything clinical is behind that link, which is personal, expires,
// and can be revoked. The patient still receives their information on
// WhatsApp, which is what was asked for; what they do not receive is their
// diagnosis as a push notification.
// ============================================================

import crypto from 'crypto';
import { publicSiteUrl } from '@/lib/patients/publicLink';

/**
 * How long a link stays open.
 *
 * Longer than the feedback invitation's thirty days, because a leaflet is
 * issued when the case is booked and read again after discharge — people come
 * back to the warning signs. Ninety days covers the whole episode without
 * leaving a link live indefinitely.
 */
export const COUNSELLING_TTL_DAYS = 90;

export function newCounsellingToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashCounsellingToken(token) };
}

export function hashCounsellingToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const counsellingExpiry = (from: Date = new Date()): Date =>
  new Date(from.getTime() + COUNSELLING_TTL_DAYS * 24 * 60 * 60 * 1000);

/**
 * Where the patient goes.
 *
 * publicSiteUrl(), never request.headers.host — the theatre node's Tailscale
 * address does not resolve from mobile data, and a link that works on the
 * ward computer and not on the patient's phone is worse than no link.
 */
export function counsellingUrl(token: string): string {
  return `${publicSiteUrl()}/counselling?t=${encodeURIComponent(token)}`;
}

export const CHANNELS = ['WHATSAPP', 'PRINTED', 'LINK_COPIED'] as const;
export type IssueChannel = (typeof CHANNELS)[number];

export function isIssueChannel(v: unknown): v is IssueChannel {
  return typeof v === 'string' && (CHANNELS as readonly string[]).includes(v);
}

// ─────────────────────────────────────────────── what stops an issue ────

export interface IssueBlocker {
  field: string;
  say: string;
}

/**
 * Why this leaflet cannot be sent yet.
 *
 * Checked before anything is written, and said in words a ward clerk can act
 * on. "Cannot send" with no reason is how a feature gets abandoned.
 */
export function blockersForIssue(input: {
  patientName?: string | null;
  phone?: string | null;
  procedureName?: string | null;
  channel: IssueChannel;
  whatsappOptOut?: boolean | null;
}): IssueBlocker[] {
  const out: IssueBlocker[] = [];
  const name = (input.patientName ?? '').trim();
  const phone = (input.phone ?? '').trim();

  if (!(input.procedureName ?? '').trim()) {
    out.push({ field: 'procedureName', say: 'The case has no operation named, so there is nothing to write about.' });
  }
  if (!name) {
    out.push({ field: 'patientName', say: 'The patient has no name on the record.' });
  }
  if (input.channel === 'WHATSAPP') {
    if (!phone) {
      out.push({
        field: 'phone',
        say: 'No phone number on file for this patient. Add one on their record, or print the sheet instead.',
      });
    }
    if (input.whatsappOptOut) {
      out.push({
        field: 'whatsappOptOut',
        say: 'This patient has asked not to be written to on WhatsApp. Print the sheet and hand it over instead.',
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────── the state of a link ────

export type LinkProblem = 'NOT_FOUND' | 'EXPIRED' | 'REVOKED';

export const LINK_PROBLEM_MESSAGE: Record<LinkProblem, string> = {
  NOT_FOUND:
    'This link is not recognised. It may have been typed incompletely — try opening it again '
    + 'from the message, or ask the ward to send you a new one.',
  EXPIRED:
    'This link has expired. Your information sheet is still available: ask your ward nurse or '
    + 'the theatre office to send it again.',
  REVOKED:
    'This link has been withdrawn. Please ask your ward nurse for an up-to-date copy of your '
    + 'information sheet.',
};

/**
 * Whether this link may be opened.
 *
 * Returns a problem rather than throwing, so the page can show the refusal
 * above a still-usable page — the same shape as the feedback page, where a
 * dead end is a worse answer than an explained one.
 */
export function linkState(
  issue: { expiresAt: Date | string; revokedAt?: Date | string | null } | null | undefined,
  now: Date = new Date(),
): { ok: true } | { ok: false; problem: LinkProblem; message: string } {
  if (!issue) {
    return { ok: false, problem: 'NOT_FOUND', message: LINK_PROBLEM_MESSAGE.NOT_FOUND };
  }
  if (issue.revokedAt) {
    return { ok: false, problem: 'REVOKED', message: LINK_PROBLEM_MESSAGE.REVOKED };
  }
  const expires = issue.expiresAt instanceof Date ? issue.expiresAt : new Date(issue.expiresAt);
  if (!Number.isNaN(expires.getTime()) && expires.getTime() <= now.getTime()) {
    return { ok: false, problem: 'EXPIRED', message: LINK_PROBLEM_MESSAGE.EXPIRED };
  }
  return { ok: true };
}

// ──────────────────────────────────────────────── the message itself ────

export const COUNSELLING_TEMPLATE_CODE = 'PATIENT_OPERATION_INFORMATION';

/**
 * The variables for the approved template, in its declared order.
 *
 * NOTE WHAT IS ABSENT: the operation, the diagnosis, the date, the surgeon.
 * None of them is a variable here, and none may be added — the template is
 * registered with Meta as carrying no clinical detail, and
 * counselling.test.ts asserts the variable list stays exactly these three.
 */
export function counsellingTemplateVariables(input: {
  patientName: string;
  hospital: string;
  link: string;
}): Record<string, string> {
  return {
    name: input.patientName.trim(),
    hospital: input.hospital,
    link: input.link,
  };
}
