/**
 * Inviting the committee from the ORM directory.
 *
 * The invite box took a pasted list, which is still right for somebody with no
 * ORM account — but most of this committee have one, and retyping eleven people
 * out of a system that already holds them costs a typo in a phone number. That
 * is not cosmetic: a wrong digit means the invitation never arrives, every
 * reminder goes to a stranger, and the participation figures record the member
 * as simply not responding.
 *
 * The property that matters most below is `userId`. Without it the same head of
 * department invited by name and then arriving through the general link becomes
 * two rows, and every participation figure counts them twice.
 */
import { describe, expect, it } from 'vitest';
import {
  inviteeFromUser,
  invitedUserIds,
  describeDirectory,
  selectableEntries,
  selectionProblem,
  describeSelection,
  filterEntries,
  type DirectoryUser,
} from '../../src/lib/policy/directory';

const user = (over: Partial<DirectoryUser> = {}): DirectoryUser => ({
  id: 'u1',
  fullName: 'Dr A. Consultant',
  role: 'CONSULTANT_SURGEON',
  department: 'Surgery',
  phoneNumber: '08030000001',
  ...over,
});

describe('turning a directory entry into an invitee', () => {
  it('carries the account id, which is the whole point', () => {
    // Without userId the unique index on (roundId, userId) cannot do its job,
    // and the same person invited by name then arriving via the group link is
    // two invitations and two counts.
    expect(inviteeFromUser(user()).userId).toBe('u1');
  });

  it('copies the name, role and unit across', () => {
    const d = inviteeFromUser(user());
    expect(d.inviteeName).toBe('Dr A. Consultant');
    expect(d.inviteeUnit).toBe('Surgery');
  });

  it('writes the role in words rather than as an enum', () => {
    // "CONSULTANT_SURGEON" appears on the invitation, in the exports, and in
    // the paper that goes to Management.
    expect(inviteeFromUser(user()).inviteeRole).toBe('CONSULTANT SURGEON');
  });

  it('takes a copy rather than a live reference', () => {
    // A consultant who moves firm next month must still appear in THIS round's
    // record as the unit they reviewed for. Re-reading it live would silently
    // rewrite attribution on a document already sent to Management.
    const d = inviteeFromUser(user({ department: 'O&G' }));
    expect(d.inviteeUnit).toBe('O&G');
  });

  it('turns blanks into nulls rather than empty strings', () => {
    const d = inviteeFromUser(user({ department: '   ', phoneNumber: '', role: null }));
    expect(d.inviteeUnit).toBeNull();
    expect(d.phone).toBeNull();
    expect(d.inviteeRole).toBeNull();
  });
});

describe('who is already in', () => {
  it('collects the account ids already invited', () => {
    const ids = invitedUserIds([
      { userId: 'u1' }, { userId: null }, { userId: 'u2' }, { userId: '  ' },
    ]);
    expect(ids.has('u1')).toBe(true);
    expect(ids.has('u2')).toBe(true);
    expect(ids.size).toBe(2);
  });

  it('copes with a round where nobody was invited by account', () => {
    // Everybody pasted in by name: no userId on any row.
    expect(invitedUserIds([{ inviteeName: 'Pasted Person' }]).size).toBe(0);
  });
});

describe('the directory as the picker shows it', () => {
  const invitations = [{ userId: 'u2' }];
  const entries = describeDirectory([
    user({ id: 'u1' }),
    user({ id: 'u2', fullName: 'Dr B. Already' }),
    user({ id: 'u3', fullName: 'Dr C. NoPhone', phoneNumber: null }),
  ], invitations);

  it('marks somebody already invited, and does not offer them again', () => {
    const already = entries.find((e) => e.id === 'u2')!;
    expect(already.state).toBe('ALREADY_INVITED');
    expect(already.note).toContain('Already invited');
    expect(selectableEntries(entries).map((e) => e.id)).toEqual(['u1', 'u3']);
  });

  it('warns about a missing phone WITHOUT refusing them', () => {
    // A member with no number can still be invited -- plenty of heads of
    // department are reached through a secretary. What must not happen is
    // inviting them believing a reminder will chase them, when the reminder
    // job counts them as skipped and tells nobody.
    const noPhone = entries.find((e) => e.id === 'u3')!;
    expect(noPhone.state).toBe('NO_PHONE');
    expect(noPhone.reachable).toBe(false);
    expect(noPhone.alreadyInvited).toBe(false);
    expect(noPhone.note).toContain('reminders cannot reach them');
    expect(selectableEntries(entries).some((e) => e.id === 'u3')).toBe(true);
  });

  it('leaves an ordinary entry selectable and unannotated', () => {
    const plain = entries.find((e) => e.id === 'u1')!;
    expect(plain.state).toBe('SELECTABLE');
    expect(plain.note).toBeNull();
  });

  it('treats an already-invited member with no phone as already invited', () => {
    // Precedence: the fact that stops you clicking outranks the warning.
    const e = describeDirectory(
      [user({ id: 'x', phoneNumber: null })], [{ userId: 'x' }],
    )[0];
    expect(e.state).toBe('ALREADY_INVITED');
  });
});

describe('refusing a selection', () => {
  it('refuses an empty one, and says what to do', () => {
    expect(selectionProblem([])).toContain('Tick the members');
  });

  it('refuses an absurd one', () => {
    const many = Array.from({ length: 101 }, (_, i) => user({ id: `u${i}` }));
    expect(selectionProblem(many)).toContain('at most 100');
  });

  it('accepts an ordinary committee', () => {
    expect(selectionProblem([user(), user({ id: 'u2' })])).toBeNull();
  });
});

describe('the line under the Invite button', () => {
  it('says how many, and that the links are shown once', () => {
    const s = describeSelection([user(), user({ id: 'u2' })]);
    expect(s).toContain('Invites 2 members');
    expect(s).toContain('shown once');
  });

  it('counts one member as one', () => {
    const one = describeSelection([user()]);
    expect(one).toContain('Invites 1 member from');
    expect(one).not.toContain('1 members');
  });

  it('calls out those who cannot be reached, and says the link is still made', () => {
    const s = describeSelection([user(), user({ id: 'u2', phoneNumber: null })]);
    expect(s).toContain('One has no phone number');
    expect(s).toContain('reminders will not reach');
    expect(s).toContain('The link is still created');
  });

  it('says plainly when nothing is selected', () => {
    expect(describeSelection([])).toContain('Nobody selected');
  });
});

describe('narrowing what came back', () => {
  const entries = describeDirectory([
    user({ id: 'u1' }),
    user({ id: 'u2' }),
    user({ id: 'u3', phoneNumber: null }),
  ], [{ userId: 'u2' }]);

  it('hides those already invited on request', () => {
    expect(filterEntries(entries, { hideInvited: true }).map((e) => e.id))
      .toEqual(['u1', 'u3']);
  });

  it('hides those with no number on request', () => {
    expect(filterEntries(entries, { onlyReachable: true }).map((e) => e.id))
      .toEqual(['u1', 'u2']);
  });

  it('returns everything when nothing is asked for', () => {
    expect(filterEntries(entries, {})).toHaveLength(3);
  });
});
