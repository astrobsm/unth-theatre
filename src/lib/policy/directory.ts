/**
 * Inviting the committee from the ORM directory instead of retyping it.
 *
 * The invite box took a pasted list: "Name | Role | Unit | Phone", one per
 * line. That was built for a roster that arrives as a WhatsApp message, and it
 * still is the right answer for somebody who has no ORM account. But most of
 * this committee DO have accounts, and retyping eleven people out of a system
 * that already holds them costs a typo in a phone number — which is not a
 * cosmetic error here. A wrong digit means the invitation is never delivered,
 * every reminder goes to a stranger, and the participation figures record the
 * member as simply not responding.
 *
 * WHAT PICKING FROM THE DIRECTORY ACTUALLY BUYS, beyond saving typing:
 *
 * The invitation carries `userId`. That is what lets the member open the
 * general link, sign in with the account they already have, and be recognised
 * as the same person rather than creating a second invitation — the unique
 * index on (roundId, userId) enforces it. A pasted invitee has no userId, so
 * the same head of department invited by name and then arriving via the group
 * link counts twice in every participation figure.
 *
 * The phone number comes from the record the hospital already maintains, and
 * when it changes it changes in one place.
 *
 * APPROVED ACCOUNTS ONLY, by default. A PENDING account's phone number is one
 * nobody has verified, and an unverified number is worse than no number at all
 * when it is carrying a personal link that records answers under somebody's
 * name. Same reasoning as the oxygen room lookup.
 *
 * Pure: the rules about who may be offered and what a selection becomes are
 * decided here, not inside a component.
 */

export interface DirectoryUser {
  id: string;
  fullName: string;
  role?: string | null;
  department?: string | null;
  phoneNumber?: string | null;
  staffCode?: string | null;
}

export interface InviteeDraft {
  userId: string;
  inviteeName: string;
  inviteeRole: string | null;
  inviteeUnit: string | null;
  phone: string | null;
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

/**
 * One directory entry as an invitee.
 *
 * Role and unit are copied ONTO the invitation rather than read through the
 * account each time. A consultant who moves firm next month should still appear
 * in this round's record as the unit they reviewed for; re-reading it live
 * would silently rewrite the attribution on a document that has already gone to
 * Management.
 */
export function inviteeFromUser(u: DirectoryUser): InviteeDraft {
  return {
    userId: u.id,
    inviteeName: u.fullName.trim(),
    inviteeRole: clean(u.role)?.replace(/_/g, ' ') ?? null,
    inviteeUnit: clean(u.department),
    phone: clean(u.phoneNumber),
  };
}

export interface InvitedLike {
  userId?: string | null;
  inviteeName?: string | null;
}

/** Account ids already invited to this round. */
export function invitedUserIds(invitations: InvitedLike[]): Set<string> {
  const ids = new Set<string>();
  for (const i of invitations) {
    const id = clean(i.userId ?? null);
    if (id) ids.add(id);
  }
  return ids;
}

export type DirectoryEntryState = 'SELECTABLE' | 'ALREADY_INVITED' | 'NO_PHONE';

export interface DirectoryEntry extends DirectoryUser {
  state: DirectoryEntryState;
  alreadyInvited: boolean;
  reachable: boolean;
  note: string | null;
}

/**
 * The directory as the picker shows it.
 *
 * NO_PHONE is a warning, never a refusal. A member with no number on file can
 * still be invited — their link can be copied and given to them another way,
 * and plenty of heads of department are reached through a secretary. What must
 * not happen is inviting them in the belief that a reminder will chase them,
 * when the reminder job will count them as skipped and say so to nobody.
 */
export function describeDirectory(
  users: DirectoryUser[],
  invitations: InvitedLike[],
): DirectoryEntry[] {
  const invited = invitedUserIds(invitations);

  return users.map((u) => {
    const alreadyInvited = invited.has(u.id);
    const reachable = clean(u.phoneNumber) !== null;

    let state: DirectoryEntryState = 'SELECTABLE';
    if (alreadyInvited) state = 'ALREADY_INVITED';
    else if (!reachable) state = 'NO_PHONE';

    return {
      ...u,
      state,
      alreadyInvited,
      reachable,
      note: alreadyInvited
        ? 'Already invited to this round'
        : reachable
          ? null
          : 'No phone number on file — you will have to give them the link yourself, '
            + 'and reminders cannot reach them',
    };
  });
}

/** Entries a click may actually select. */
export function selectableEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  return entries.filter((e) => !e.alreadyInvited);
}

/** Why this selection cannot be invited yet, or null. */
export function selectionProblem(selected: DirectoryUser[]): string | null {
  if (selected.length === 0) {
    return 'Nobody is selected. Tick the members you want to invite.';
  }
  if (selected.length > 100) {
    return `${selected.length} selected. Invite at most 100 at a time.`;
  }
  return null;
}

/** The line under the Invite button, so the owner knows what is about to happen. */
export function describeSelection(selected: DirectoryUser[]): string {
  if (selected.length === 0) return 'Nobody selected yet.';

  const noPhone = selected.filter((u) => clean(u.phoneNumber) === null).length;
  const head = selected.length === 1
    ? 'Invites 1 member from the ORM directory.'
    : `Invites ${selected.length} members from the ORM directory.`;

  if (noPhone === 0) {
    return `${head} Each gets their own link, shown once — send them straight away.`;
  }
  return `${head} ${noPhone === 1 ? 'One has' : `${noPhone} have`} no phone number on `
    + 'file, so their link cannot be sent from here and reminders will not reach '
    + `${noPhone === 1 ? 'them' : 'them'}. The link is still created.`;
}

/**
 * Narrowing the directory in the browser.
 *
 * The server already filters by role and by a search term; this is the
 * second pass over what came back, so that ticking "hide those already
 * invited" does not cost a round trip on a theatre connection.
 */
export function filterEntries(
  entries: DirectoryEntry[],
  opts: { hideInvited?: boolean; onlyReachable?: boolean },
): DirectoryEntry[] {
  return entries.filter((e) => {
    if (opts.hideInvited && e.alreadyInvited) return false;
    if (opts.onlyReachable && !e.reachable) return false;
    return true;
  });
}
