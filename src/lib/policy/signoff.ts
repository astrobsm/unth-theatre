/**
 * Collecting signatures on the reviewed policy.
 *
 * After the analysis, the revised document goes back to the people who
 * reviewed it and each of them signs it. Until now the round ended at a
 * recommendation nobody had endorsed, and the endorsement happened in a
 * WhatsApp thread — which is exactly the thing this module was built to stop
 * being the record.
 *
 * WHO IS ASKED. Only members who SUBMITTED a review. Somebody who never opened
 * the draft has nothing to endorse, and a signature list padded with people who
 * did not read it is worse than a short one: it tells Management the committee
 * agreed when most of it never looked.
 *
 * WHAT A SIGNATURE IS BOUND TO, and this is the part that makes it mean
 * anything. Each signature records the fingerprint of the exact document text
 * that was on screen when it was given. Edit the final proposal afterwards and
 * the fingerprints no longer match, so the signatures are reported as STALE
 * rather than silently carried onto a document nobody signed. Without that, a
 * signature page is an assertion that a document existed in some form at some
 * point, which is not what anybody signs for.
 *
 * THE TOKEN IS NEVER STORED, only its SHA-256, exactly as the review invitation
 * does it (src/lib/policy/invite.ts). And the reissue path exists from the
 * first commit this time: the review links shipped without one, the screen told
 * the Chairman to use a control that was never built, and the whole committee
 * became unreachable. Not twice.
 */

import crypto from 'crypto';
import { publicSiteUrl } from '@/lib/patients/publicLink';
import { salutationFor } from './messages';

export function newSignoffToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSignoffToken(token) };
}

export function hashSignoffToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * The link a member opens to sign.
 *
 * publicSiteUrl(), never the request host: the theatre node answers on a
 * Tailscale address that no phone on mobile data can resolve, so a link built
 * from the request host reaches the committee as http://100.85.215.54:3000/…
 * and fails with nothing worth calling an error. Same helper, same reason, as
 * the review link.
 */
export function policySignUrl(token: string): string {
  return `${publicSiteUrl()}/policy-sign?t=${encodeURIComponent(token)}`;
}

/**
 * The fingerprint of the document being signed.
 *
 * Normalised on whitespace first, so re-wrapping a paragraph or a change of
 * line endings between the two nodes does not invalidate a signature that was
 * given on the same words. Anything that changes the words does invalidate it,
 * which is the point.
 */
export function outcomeFingerprint(body: string): string {
  const normalised = (body ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalised).digest('hex');
}

export type SignoffProblem =
  | 'NOT_FOUND'
  | 'REVOKED'
  | 'ALREADY_SIGNED'
  | 'NO_OUTCOME';

export const SIGNOFF_PROBLEM_MESSAGE: Record<SignoffProblem, string> = {
  NOT_FOUND:
    'This signing link is not one we recognise. It may have been copied '
    + 'incompletely — the whole line, up to the end, is the link. Please ask the '
    + 'Committee Secretariat to send it again.',
  REVOKED:
    'This signing link has been withdrawn. If you think that is a mistake, '
    + 'please contact the Chairman of the Theatre Users Committee.',
  ALREADY_SIGNED:
    'You have already signed this document, and your signature is on the '
    + 'record. Thank you. If you need to change anything, please contact the '
    + 'Chairman — a signature is not withdrawn from a screen.',
  NO_OUTCOME:
    'The revised policy is not ready for signature yet. Your link will start '
    + 'working as soon as the Chairman publishes it, so please keep it.',
};

export interface SignoffRowLike {
  revokedAt: Date | string | null;
  signedAt: Date | string | null;
}

const isSet = (v: Date | string | null | undefined): boolean =>
  v !== null && v !== undefined && v !== '';

/**
 * Why this link cannot be used right now, or null when it can.
 *
 * NOTE WHAT IS ABSENT: there is no expiry. A review link closes with the round
 * because the analysis runs on what was said by the deadline. A signature has
 * no such cut-off — a head of department returning from leave should still be
 * able to endorse the document, and a signature arriving late is still a
 * signature. The Chairman withdraws a link if he needs to stop one.
 */
export function signoffState(input: {
  row: SignoffRowLike | null;
  hasOutcome: boolean;
}): SignoffProblem | null {
  if (!input.row) return 'NOT_FOUND';
  if (isSet(input.row.revokedAt)) return 'REVOKED';
  if (!input.hasOutcome) return 'NO_OUTCOME';
  if (isSet(input.row.signedAt)) return 'ALREADY_SIGNED';
  return null;
}

export interface EligibleLike {
  id: string;
  submittedAt?: Date | string | null;
  revokedAt?: Date | string | null;
}

/**
 * Who gets a signing link: the members who submitted a review, and not the
 * withdrawn.
 *
 * A withdrawn invitation that had already submitted is excluded deliberately —
 * withdrawing somebody is a decision, and handing them a signing link would
 * quietly reverse it.
 */
export function eligibleForSignoff<T extends EligibleLike>(invitations: T[]): T[] {
  return invitations.filter((i) => isSet(i.submittedAt) && !isSet(i.revokedAt));
}

export function signoffEligibilitySentence(invitations: EligibleLike[]): string {
  const eligible = eligibleForSignoff(invitations).length;
  const submitted = invitations.filter((i) => isSet(i.submittedAt)).length;
  const withdrawn = submitted - eligible;

  if (invitations.length === 0) return 'Nobody is invited to this round yet.';
  if (eligible === 0) {
    return 'Nobody has submitted a review yet, so there is nobody to send the '
      + 'document to for signature.';
  }

  const base = `Sends the revised policy to the ${eligible === 1 ? 'one member' : `${eligible} members`} `
    + `who submitted a review, each with their own signing link.`;
  if (withdrawn > 0) {
    return `${base} ${withdrawn === 1 ? 'One member who submitted has' : `${withdrawn} members who submitted have`} `
      + 'since been withdrawn and will not be asked.';
  }
  return base;
}

/** Where a signature stands against the document as it is now. */
export type SignatureStanding = 'SIGNED' | 'STALE' | 'AWAITING' | 'WITHDRAWN';

export function signatureStanding(input: {
  revokedAt: Date | string | null;
  signedAt: Date | string | null;
  signedFingerprint: string | null;
  currentFingerprint: string | null;
}): SignatureStanding {
  if (isSet(input.revokedAt)) return 'WITHDRAWN';
  if (!isSet(input.signedAt)) return 'AWAITING';
  // A signature given on text that has since been edited is not a signature on
  // the current document, and saying so is the whole reason the fingerprint is
  // stored.
  if (
    input.currentFingerprint
    && input.signedFingerprint
    && input.signedFingerprint !== input.currentFingerprint
  ) return 'STALE';
  return 'SIGNED';
}

export function standingLabel(s: SignatureStanding): string {
  switch (s) {
    case 'SIGNED': return 'Signed';
    case 'STALE': return 'Signed an earlier version';
    case 'AWAITING': return 'Not yet signed';
    case 'WITHDRAWN': return 'Withdrawn';
    default: return 'Unknown';
  }
}

export interface SignoffSummary {
  asked: number;
  signed: number;
  stale: number;
  awaiting: number;
  withdrawn: number;
  percentSigned: number;
}

export function signoffSummary(
  standings: SignatureStanding[],
): SignoffSummary {
  const n = (s: SignatureStanding) => standings.filter((x) => x === s).length;
  const withdrawn = n('WITHDRAWN');
  const asked = standings.length - withdrawn;
  const signed = n('SIGNED');
  return {
    asked,
    signed,
    stale: n('STALE'),
    awaiting: n('AWAITING'),
    withdrawn,
    percentSigned: asked === 0 ? 0 : Math.round((signed / asked) * 100),
  };
}

/**
 * The line the Chairman reads, and the one that goes under the signature page.
 *
 * A stale signature is called out separately rather than folded into "signed",
 * because it is the one state that looks like agreement and is not.
 */
export function signoffSentence(s: SignoffSummary): string {
  if (s.asked === 0) return 'Nobody has been asked to sign this document yet.';

  const parts = [
    `${s.signed} of ${s.asked} ${s.asked === 1 ? 'participant has' : 'participants have'} `
    + `signed the current version (${s.percentSigned}%).`,
  ];
  if (s.stale > 0) {
    parts.push(
      `${s.stale} signed an earlier version of the text and ${s.stale === 1 ? 'needs' : 'need'} `
      + 'to sign again — the document has been edited since.',
    );
  }
  if (s.awaiting > 0) {
    parts.push(`${s.awaiting} ${s.awaiting === 1 ? 'has' : 'have'} not signed yet.`);
  }
  if (s.withdrawn > 0) {
    parts.push(`${s.withdrawn} signing ${s.withdrawn === 1 ? 'link was' : 'links were'} withdrawn.`);
  }
  return parts.join(' ');
}

/**
 * The WhatsApp message that carries a signing link.
 *
 * Addressed by name, through the same salutationFor() the invitation and the
 * reminder use. A member who has just been written to twice as “Prof. Okeke”
 * and is then asked to sign a policy by a message opening with no name at all
 * reads the third one as an automated circular -- which is the last thing a
 * request for a signature should look like.
 */
export function buildSignoffMessage(opts: {
  url: string;
  policyTitle: string | null;
  version: string;
  /** The participant, as the invitation recorded them. */
  signerName?: string | null;
  signatory?: string | null;
  signatoryTitle?: string | null;
}): string {
  const lines = [
    '*THEATRE POLICY — FOR YOUR SIGNATURE*',
    '',
    `Dear ${salutationFor(opts.signerName)},`,
    '',
    `The review of ${opts.policyTitle ?? 'the theatre policy'} is complete, and the `
    + `revised document (version ${opts.version}) is ready for your signature.`,
    '',
    'You reviewed this draft, so your endorsement is being sought. The link below '
    + 'opens the revised policy and the record of what the committee changed and '
    + 'why. You can read it in full before signing.',
    '',
    `*Your personal signing link:* ${opts.url}`,
    '',
    '*This link is individual to you.* Please do not forward it — a colleague '
    + 'signing from your link would be recorded as you.',
  ];

  if (opts.signatory) {
    lines.push('', opts.signatory + (opts.signatoryTitle ? `\n${opts.signatoryTitle}` : ''));
  }
  return lines.join('\n');
}
