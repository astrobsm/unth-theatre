// ============================================================
// Reaching a committee member who has never had an ORM account
// ------------------------------------------------------------
// Most of this committee are heads of department. They will not register, and a
// review that requires them to is a review that collects four responses. So the
// link that goes into the committee's WhatsApp group carries its own authority.
//
// THE TOKEN IS NEVER STORED, only its SHA-256 — exactly as
// src/lib/patients/feedbackInvite.ts does it. A database read cannot open
// somebody else's review, and a leaked backup cannot be used to answer in their
// name. That matters more here than it does for patient feedback: these
// responses are attributed, and they are quoted in a policy that goes to
// Hospital Management.
//
// WHERE THIS DELIBERATELY DIFFERS FROM THE PATIENT INVITE
//
// A feedback invite is ALREADY_USED once submitted, and single use is the point
// — nobody may submit twice in a patient's name. A policy review is the
// opposite: a member may revise their answers until the deadline, because a
// head of department who re-reads section 7 at midnight should be able to
// correct themselves. So there is no ALREADY_USED state here, and submitting
// does not close the link. What closes it is the deadline.
// ============================================================

import crypto from 'crypto';
import { publicSiteUrl } from '@/lib/patients/publicLink';

/**
 * A fresh token and the hash to store against it.
 *
 * base64url of 32 random bytes: short enough to sit in a WhatsApp message
 * without wrapping, long enough that guessing one is not something anybody will
 * do by accident or on purpose.
 */
export function newPolicyInviteToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashPolicyInviteToken(token) };
}

export function hashPolicyInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * The link a member opens.
 *
 * Built from publicSiteUrl(), NEVER from the request host. ORM answers on two
 * nodes and the theatre one is a Tailscale address that no phone on mobile data
 * can resolve — a link built from the request host reaches the committee as
 * `http://100.85.215.54:3000/...`, fails with nothing worth calling an error,
 * and looks like a hospital asking for a review it does not want. The same
 * reasoning as the patient feedback link, and the same helper.
 */
export function policyInviteUrl(token: string): string {
  return `${publicSiteUrl()}/policy-review?t=${encodeURIComponent(token)}`;
}

/**
 * The link for the committee's WhatsApp group: no token, ORM sign-in required.
 *
 * NOTE WHERE THIS DOES NOT LIVE. The obvious home is
 * /dashboard/policy-review/respond, beside the owner's screens — and that would
 * be wrong, because /dashboard/policy-review is a module path gated to the
 * Chairman and Management. canAccessPath() would refuse a surgeon the very page
 * the general link exists to give them. So both kinds of reviewer land on the
 * same page outside /dashboard, which is also where /onboarding and /feedback
 * live for the same reason: it is reachable before anybody knows who you are.
 *
 * The two query parameters are kept distinct rather than collapsed into one
 * "identity" parameter. A link that sometimes identifies you and sometimes does
 * not is how somebody ends up answering under a colleague's name on a shared
 * handset — and ten staff share eight devices here.
 */
export function policyGeneralUrl(roundId: string): string {
  return `${publicSiteUrl()}/policy-review?round=${encodeURIComponent(roundId)}`;
}

/** How long a personal link stays open after the round closes. */
export const INVITE_GRACE_HOURS = 0;

/**
 * When a personal link stops working: the moment the round closes.
 *
 * No grace period, and that is a decision rather than an omission. The analysis
 * runs on what was said by the deadline and is quoted in a recommendation to
 * Management; a response arriving afterwards would either be silently excluded
 * — the worst outcome, because the member believes they contributed — or would
 * invalidate an analysis already run.
 */
export const inviteExpiryFor = (closesAt: Date): Date =>
  new Date(closesAt.getTime() + INVITE_GRACE_HOURS * 60 * 60 * 1000);

export type InviteProblem = 'NOT_FOUND' | 'REVOKED' | 'EXPIRED' | 'ROUND_NOT_OPEN';

export const INVITE_PROBLEM_MESSAGE: Record<InviteProblem, string> = {
  NOT_FOUND:
    'This review link is not one we recognise. It may have been copied '
    + 'incompletely — the whole line, up to the end, is the link. Please ask the '
    + 'Committee Secretariat to send it again.',
  REVOKED:
    'This review link has been withdrawn. If you think that is a mistake, '
    + 'please contact the Chairman of the Theatre Users Committee.',
  EXPIRED:
    'The review has closed, so this link no longer accepts changes. Thank you '
    + 'for what you sent — your responses are included in the analysis. If you '
    + 'have something further, please raise it at the committee meeting.',
  ROUND_NOT_OPEN:
    'This review has not opened yet. The link in your message will start '
    + 'working as soon as the Chairman opens the round, so please keep it.',
};

export interface InviteRowLike {
  revokedAt: Date | null;
  expiresAt: Date;
}

export interface RoundRowLike {
  status: string;
  opensAt: Date | null;
  closesAt: Date;
}

/**
 * May this invitation be opened now, and if not, why not?
 *
 * Pure, so the four refusals can be exercised without a database — and so that
 * they cannot quietly collapse into one message. They are different facts and a
 * committee member reacts to each differently: one means the link is wrong, one
 * means somebody withdrew it, one means they are too late, and one means they
 * are too early and should keep the message.
 */
export function policyInviteState(
  invite: InviteRowLike | null | undefined,
  round: RoundRowLike | null | undefined,
  now: Date = new Date(),
): { ok: true } | { ok: false; problem: InviteProblem; message: string } {
  const refuse = (problem: InviteProblem) => ({
    ok: false as const,
    problem,
    message: INVITE_PROBLEM_MESSAGE[problem],
  });

  if (!invite || !round) return refuse('NOT_FOUND');
  if (invite.revokedAt) return refuse('REVOKED');

  if (round.status === 'DRAFT') return refuse('ROUND_NOT_OPEN');
  if (round.opensAt && round.opensAt.getTime() > now.getTime()) {
    return refuse('ROUND_NOT_OPEN');
  }

  // Closed by the clock or closed by hand — the member is told the same thing,
  // because from where they are standing it is the same fact.
  if (invite.expiresAt.getTime() <= now.getTime()) return refuse('EXPIRED');
  if (round.closesAt.getTime() <= now.getTime()) return refuse('EXPIRED');
  if (round.status !== 'OPEN') return refuse('EXPIRED');

  return { ok: true };
}

/**
 * The closing date as the committee reads it.
 *
 * Africa/Lagos explicitly. The cloud node runs in UTC, so formatting in the
 * server's own zone would put "Thursday 19 November 2026, 22:59" in a WhatsApp
 * message whose deadline is 23:59 — an hour that members would plan around.
 */
export function formatClosing(closesAt: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Lagos',
  })
    .format(closesAt)
    .replace(/,\s*(\d{2}:\d{2})$/, ', $1');
}

export interface InviteMessageInput {
  url: string;
  closesAt: Date;
  /** Who the message is signed by. */
  signatory?: string | null;
  signatoryTitle?: string | null;
  policyTitle?: string | null;
}

/**
 * The message that carries the link.
 *
 * WHY THE SIGNATORY IS A PARAMETER. The committee's Chairman signs this, and
 * his name is on the draft policy. It is not hardcoded here: a person's name
 * baked into a library is wrong the day the committee elects somebody else, and
 * this repository keeps real officers' names in configuration rather than in
 * source. The round carries it; the default is the office, not the person.
 */
export function buildPolicyInviteMessage(input: InviteMessageInput): string {
  const title = input.policyTitle?.trim()
    || 'the consolidated draft policy on theatre booking, pre-operative '
      + 'preparation, investigations and cancellation';
  const signatory = input.signatory?.trim() || '';
  const signatoryTitle = input.signatoryTitle?.trim()
    || 'Chairman, Theatre Users Committee, UNTH';

  const lines = [
    '*THEATRE OPERATIONAL FLOW POLICY – REVIEW ON ORM*',
    '',
    'Dear Colleague,',
    '',
    `${title[0].toUpperCase()}${title.slice(1)} is now open for your review on ORM.`,
    '',
    'Please review each section relevant to your unit, respond to the proposed '
    + 'times and targets in [brackets], and add any comments or alternative wording.',
    '',
    `*Your review link:* ${input.url}`,
    `*Closing date:* ${formatClosing(input.closesAt)}`,
    '*Time needed:* about 20–30 minutes',
    '',
    'You can stop at any point and come back to the same link — it reopens '
    + 'where you left off, and nothing you have typed is lost.',
    '',
    'All responses will be analysed and harmonised into the final recommendation '
    + 'to Management. Thank you for your contribution.',
    '',
  ];

  if (signatory !== '') lines.push(`*${signatory}*`);
  lines.push(signatoryTitle);

  return lines.join('\n');
}
