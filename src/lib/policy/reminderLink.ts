/**
 * Putting a working review link into a reminder.
 *
 * THE PROBLEM THIS SOLVES. A reminder is far more use with the member's link in
 * it than without — "use the one I sent you on Tuesday" asks a consultant to go
 * and find a message. But the link cannot be read back: only the SHA-256 of
 * each token is stored (src/lib/policy/invite.ts), on purpose, so that neither
 * a query nor a stolen backup can answer in somebody's name. So a reminder that
 * carries a link has to MINT one.
 *
 * AND MINTING USED TO BREAK THINGS. Replacing tokenHash is what the "New link"
 * button does, and it stops the old link working the same instant — a member
 * holding the original invitation in their WhatsApp finds out by tapping it and
 * being told the link is not recognised. That is not hypothetical; it is why
 * src/lib/policy/reissue.ts opens with a warning about it.
 *
 * SO THE PREVIOUS HASH IS KEPT. PolicyInvitation.priorTokenHash holds the link
 * being replaced, resolveReviewer() accepts either, and both messages work. Two
 * live links at a time, never three: a third reminder drops the oldest, which
 * keeps the window bounded without ever being the reason somebody is locked
 * out mid-review.
 *
 * NOTHING HERE WEAKENS WITHDRAWAL. revokedAt belongs to the invitation, not to
 * a token, so policyInviteState() refuses every link for a withdrawn member at
 * once. And the explicit reissue clears priorTokenHash, because killing the old
 * link is exactly what that action is for.
 *
 * ROLLBACK EXISTS BECAUSE QUEUEING CAN BE REFUSED. queueMessage() consults the
 * send policy — the kill switch, quiet hours, a duplicate within the window —
 * and may decline. Minting before knowing that would leave the member's set of
 * links rotated for a message that was never sent. It is harmless here because
 * the old one still works, but "harmless" is not a reason to leave the record
 * wrong, and the caller can put it back exactly as it was.
 */
import prisma from '@/lib/prisma';
import { newPolicyInviteToken, policyInviteUrl } from '@/lib/policy/invite';

export interface MintedReminderLink {
  /** The link to put in the message. Shown once; only its hash is kept. */
  url: string;
  /** Restore the invitation's token columns exactly as they were. */
  rollback: () => Promise<void>;
}

/**
 * A fresh link for this member, with the one it replaces left working.
 *
 * Returns null when there is no such invitation, rather than throwing: the
 * callers are chasing a list, and one missing row must not abandon the rest.
 */
export async function mintReminderLink(
  invitationId: string,
): Promise<MintedReminderLink | null> {
  const before = await prisma.policyInvitation.findUnique({
    where: { id: invitationId },
    select: { tokenHash: true, priorTokenHash: true },
  });
  if (!before) return null;

  const { token, tokenHash } = newPolicyInviteToken();
  await prisma.policyInvitation.update({
    where: { id: invitationId },
    data: { tokenHash, priorTokenHash: before.tokenHash },
  });

  return {
    url: policyInviteUrl(token),
    rollback: async () => {
      await prisma.policyInvitation.update({
        where: { id: invitationId },
        data: { tokenHash: before.tokenHash, priorTokenHash: before.priorTokenHash },
      });
    },
  };
}
