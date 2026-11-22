/**
 * Getting a member's review link back when it has been lost.
 *
 * The link is shown once. Only its SHA-256 is stored, so no query can produce
 * it again — not for the Chairman and not for anybody holding a database
 * backup, which is the whole point of hashing it (src/lib/policy/invite.ts).
 * The consequence is that a lost link is not *recovered*, it is REISSUED: a new
 * token is written and the old one stops working the same instant.
 *
 * The API has always supported that. The screen did not, while telling the
 * owner in as many words to "reissue it from the list below" — a list whose
 * three columns were Member, Unit and State, with no control of any kind. So
 * the Chairman who closed the amber panel without copying eleven links had no
 * way back to them, and the instruction on screen pointed at something that was
 * never built.
 *
 * THE PART THAT NEEDS CARE. Reissuing is not free. A member who has already
 * opened their link is holding a working one; replacing it breaks the link in
 * their WhatsApp thread, and they find that out by tapping it and being told it
 * is not recognised. So this module decides, per member, whether a reissue is
 * safe or needs saying out loud first — and the bulk action deliberately covers
 * only the members who have never opened theirs.
 *
 * It is pure so the decision can be tested without a round, a token or a
 * database.
 */

/** What reissuing this member's link would cost. */
export type ReissueRisk = 'NEVER_OPENED' | 'OPENED' | 'SUBMITTED' | 'REVOKED';

export interface InviteStateLike {
  openedAt?: Date | string | null;
  submittedAt?: Date | string | null;
  revokedAt?: Date | string | null;
}

/** A timestamp column counts as set when it holds anything at all. */
const isSet = (v: Date | string | null | undefined): boolean =>
  v !== null && v !== undefined && v !== '';

/**
 * Order matters, and this is the order.
 *
 * Withdrawn first: it is a decision somebody took, and it outranks what the
 * member did before it. Then submitted, because an answered review is the state
 * with the most to lose. Opened last of the three, being the weakest claim that
 * they actually hold the link.
 */
export function reissueRisk(invite: InviteStateLike): ReissueRisk {
  if (isSet(invite.revokedAt)) return 'REVOKED';
  if (isSet(invite.submittedAt)) return 'SUBMITTED';
  if (isSet(invite.openedAt)) return 'OPENED';
  return 'NEVER_OPENED';
}

/**
 * What to say before replacing this link, or null when there is nothing to say.
 *
 * Written for the Chairman, naming the consequence rather than the mechanism.
 * "The token is rotated" means nothing to him; "the link in their WhatsApp
 * stops working" is the thing he needs to weigh.
 */
export function reissueWarning(risk: ReissueRisk): string | null {
  switch (risk) {
    case 'NEVER_OPENED':
      return null;
    case 'OPENED':
      return 'This member has already opened their link, so they have it. '
        + 'A new link stops the old one working — send them the new one.';
    case 'SUBMITTED':
      return 'This member has already submitted. Their answers are kept either way, '
        + 'but the link they hold stops working, so they could not go back and revise '
        + 'before the deadline unless you send them the new one.';
    case 'REVOKED':
      return 'This invitation was withdrawn. Issuing a new link puts them back into '
        + 'the round.';
    default:
      return null;
  }
}

/** Whether to make the owner confirm before this one is replaced. */
export function needsConfirmation(risk: ReissueRisk): boolean {
  return risk !== 'NEVER_OPENED';
}

/**
 * Who the bulk action covers: everybody who has never opened their link.
 *
 * Deliberately the safe set only. The Chairman's problem is almost always the
 * whole batch at once — he pasted eleven names, the panel listed eleven links
 * and he closed it — and for those eleven nobody has anything to break. Anyone
 * who HAS opened theirs is left out and reissued one at a time, with the
 * warning shown, because that is a judgement per person and not a batch.
 */
export function bulkReissueTargets<T extends InviteStateLike & { id: string }>(
  invites: T[],
): T[] {
  return invites.filter((i) => reissueRisk(i) === 'NEVER_OPENED');
}

/**
 * The sentence on the bulk button's panel.
 *
 * Says what will happen AND what is being left alone, because "issue fresh
 * links" over a roster of eleven, four of whom are mid-review, reads as if it
 * will disturb all eleven.
 */
export function bulkReissueSentence(invites: InviteStateLike[]): string {
  const safe = invites.filter((i) => reissueRisk(i) === 'NEVER_OPENED').length;
  const held = invites.length - safe;

  if (invites.length === 0) return 'Nobody is invited to this round yet.';
  if (safe === 0) {
    return 'Everybody invited has already opened their link, so there is nothing to '
      + 'issue in bulk. Use the button beside a name to replace one link.';
  }

  const one = safe === 1;
  const head = `Issues a fresh link for the ${one ? 'one member' : `${safe} members`} `
    + `who ${one ? 'has' : 'have'} not opened theirs yet.`;
  if (held === 0) return `${head} Nothing anybody is already using is touched.`;

  return `${head} The ${held === 1 ? 'one who has' : `${held} who have`} already opened `
    + `theirs ${held === 1 ? 'is' : 'are'} left alone — replace those one at a time.`;
}
