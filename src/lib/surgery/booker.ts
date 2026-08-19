// ============================================================
// Who booked a case, and how to say so when nobody recorded it
// ------------------------------------------------------------
// Pure, so the fallback order can be exercised without a database. It is worth
// isolating because the bug it replaces was not in any single line — it was in
// where the answer was looked for.
//
// The case-readiness card read the booker off the surgery's CONSUMABLE REQUEST
// rows. A case with no consumable pack therefore had no booker, which is the
// exact inversion of what the card is for: it names the booker so somebody can
// chase a pack that has not been prescribed. On the theatre server that was
// 266 of 592 cases reading "Booked by: Unknown", every one of them a case where
// the name mattered most.
//
// It also made the answer depend on which database was asked. The pack rows
// replicate separately from the surgery, so a case booked in theatre read
// correctly there and as booked-by-nobody on the cloud until they caught up.
//
// THE ORDER BELOW IS THE POINT.
//
//   1. the user record   the only source with a PHONE NUMBER, which is what
//                        makes the contact button do anything
//   2. the stored name   survives on a node that has never seen that account,
//                        which is the failure the id alone cannot cover
//   3. the pack rows     the old source, kept for cases booked before the
//                        column existed and not attributable from the audit log
//   4. not recorded      said plainly, rather than guessed
// ============================================================

export interface BookerContact {
  name: string;
  phone: string | null;
  /** Which step above answered. Lets a caller tell "no phone" from "no record". */
  source: 'user' | 'snapshot' | 'pack-rows' | 'none';
}

export interface BookerInputs {
  /** surgeries.bookedById — a soft reference; the row may be absent on this node. */
  bookedById?: string | null;
  /** surgeries.bookedByName — snapshotted at booking. */
  bookedByName?: string | null;
  /** The user row for bookedById, if this node holds it. */
  user?: { fullName?: string | null; phoneNumber?: string | null } | null;
  /** Legacy fallback: the first consumable request row carrying a requester. */
  packRow?: {
    requestedBy?: { fullName?: string | null; phoneNumber?: string | null } | null;
    requestedByName?: string | null;
  } | null;
}

/** Blank and whitespace-only are the same as absent. A name of " " is not a name. */
const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

export const NOT_RECORDED = 'Not recorded';

export function resolveBooker(input: BookerInputs): BookerContact {
  // 1. The live user record. Preferred even when a snapshot exists, because it
  //    is the only source of a phone number and because a person who has since
  //    changed their name should be contacted under the current one.
  const userName = clean(input.user?.fullName);
  if (input.user && (userName || input.user.phoneNumber)) {
    return {
      // A user row with a phone but no name still beats nothing: fall through
      // to the snapshot for the name rather than discarding a usable number.
      name: userName ?? clean(input.bookedByName) ?? NOT_RECORDED,
      phone: clean(input.user.phoneNumber),
      source: 'user',
    };
  }

  // 2. The name stored on the surgery at booking. No phone — the account is not
  //    on this node — but naming the booker is most of the value.
  const snapshot = clean(input.bookedByName);
  if (snapshot) return { name: snapshot, phone: null, source: 'snapshot' };

  // 3. The old source. Only reached for cases booked before the column existed.
  const packUserName = clean(input.packRow?.requestedBy?.fullName);
  if (packUserName) {
    return {
      name: packUserName,
      phone: clean(input.packRow?.requestedBy?.phoneNumber),
      source: 'pack-rows',
    };
  }
  const packName = clean(input.packRow?.requestedByName);
  if (packName) return { name: packName, phone: null, source: 'pack-rows' };

  // 4. Genuinely not recorded. Deliberately NOT "Unknown": these are old cases
  //    booked before any of this was captured. "Unknown" implies the person
  //    cannot be identified, which reads as a fault in the record of a case
  //    somebody is standing in front of. The record is simply absent, and there
  //    is no honest way to fill it in now.
  return { name: NOT_RECORDED, phone: null, source: 'none' };
}
