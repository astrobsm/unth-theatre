// ============================================================
// Changing what a case is packed with, after it was booked
// ------------------------------------------------------------
// The consumables and the pharmacy pack are chosen at booking, and until now
// that was the only moment they could be chosen. A surgeon who decided on
// Tuesday that Monday's list needed a different mesh had no way to say so: the
// list was fixed, so the change happened verbally at the theatre door, and the
// pack provider found out by being handed a request they had no record of.
//
// TWO RULES, both about the same thing — that a pack list is a message to
// somebody else, not a note to self.
//
// Nothing is deleted. Removing an item cancels it and records who removed it
// and why; the row stays. The pack provider needs to know that an item was
// asked for and then withdrawn, because they may already have picked it, and a
// list that silently loses a line looks like a list that never had it.
//
// Every change carries a reason. Not for ceremony: the provider reads it to
// decide whether to repack a tray or add to it, and "surgeon changed the plan"
// answers that question where a bare diff does not.
// ============================================================

/** Who may change a pack list after booking. */
export const PACK_EDITOR_ROLES = [
  'SURGEON', 'CONSULTANT_SURGEON', 'HOUSE_OFFICER', 'REGISTRAR',
  'THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR',
];

/**
 * The surgical team owns what its case is packed with.
 *
 * House officers are included deliberately: they do most of the booking, and a
 * rule that lets somebody create a list but never correct it produces a
 * verbal correction instead, which is the failure being fixed.
 *
 * The pack provider is NOT included. Spotting that something is missing is not
 * the same as deciding what a case needs, and a provider quietly adding an item
 * is how a tray and a record diverge.
 */
export function canEditPack(role: string | null | undefined): boolean {
  return PACK_EDITOR_ROLES.includes((role ?? '').toUpperCase());
}

export const MIN_PACK_REASON = 10;

/** Statuses where the provider has already acted on the line. */
export const ACTED_ON = ['PACKING', 'PACKED', 'DELIVERED'];

export interface PackChangeCheck {
  ok: boolean;
  problem: string | null;
  /**
   * True when the item was already being picked or has been delivered, so the
   * change has to reach a person rather than only a screen.
   */
  requiresProviderNotice: boolean;
}

export interface RemovalInput {
  currentStatus: string;
  reason: string;
  byId?: string | null;
  byRole?: string | null;
}

export function checkRemoval(input: RemovalInput): PackChangeCheck {
  const status = String(input.currentStatus ?? '').toUpperCase();
  const acted = ACTED_ON.includes(status);

  if (status === 'CANCELLED') {
    return { ok: false, problem: 'That item has already been removed from the list.', requiresProviderNotice: false };
  }
  if (!canEditPack(input.byRole)) {
    return { ok: false, problem: 'Only the surgical team may change what a case is packed with.', requiresProviderNotice: acted };
  }
  if (!input.byId) {
    return { ok: false, problem: 'The person making the change must be identified.', requiresProviderNotice: acted };
  }
  if ((input.reason ?? '').trim().length < MIN_PACK_REASON) {
    return {
      ok: false,
      problem: `Say why the item is being removed — at least ${MIN_PACK_REASON} characters. `
        + 'The pack provider reads this to decide whether to repack the tray or simply not add it.',
      requiresProviderNotice: acted,
    };
  }
  return { ok: true, problem: null, requiresProviderNotice: acted };
}

export interface AdditionInput {
  name: string;
  quantity: number;
  reason: string;
  byId?: string | null;
  byRole?: string | null;
  /** True when the rest of the list has already been packed. */
  listAlreadyPacked?: boolean;
}

export function checkAddition(input: AdditionInput): PackChangeCheck {
  const late = !!input.listAlreadyPacked;

  if (!canEditPack(input.byRole)) {
    return { ok: false, problem: 'Only the surgical team may change what a case is packed with.', requiresProviderNotice: late };
  }
  if (!input.byId) {
    return { ok: false, problem: 'The person making the change must be identified.', requiresProviderNotice: late };
  }
  if (!(input.name ?? '').trim()) {
    return { ok: false, problem: 'Name the item being added.', requiresProviderNotice: late };
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return { ok: false, problem: 'Give a whole quantity of at least one.', requiresProviderNotice: late };
  }
  if ((input.reason ?? '').trim().length < MIN_PACK_REASON) {
    return {
      ok: false,
      problem: `Say why the item is being added — at least ${MIN_PACK_REASON} characters.`,
      requiresProviderNotice: late,
    };
  }
  return { ok: true, problem: null, requiresProviderNotice: late };
}

export interface PackLine {
  id: string;
  name: string;
  quantity: number;
  status: string;
  addedAfterBooking?: boolean | null;
}

/** What the provider is being asked for now: everything not withdrawn. */
export function activeLines(lines: PackLine[]): PackLine[] {
  return lines.filter((l) => String(l.status).toUpperCase() !== 'CANCELLED');
}

/**
 * One line summarising a change, for the notification the provider receives.
 *
 * Written as a sentence rather than a diff because it is read on a phone by
 * somebody deciding whether to walk back to the store.
 */
export function changeSummary(
  added: PackLine[],
  removed: PackLine[],
  caseLabel: string,
): string {
  const parts: string[] = [];
  if (added.length) {
    parts.push(`${added.length} item${added.length === 1 ? '' : 's'} added (${added.map((a) => a.name).join(', ')})`);
  }
  if (removed.length) {
    parts.push(`${removed.length} withdrawn (${removed.map((r) => r.name).join(', ')})`);
  }
  if (parts.length === 0) return `${caseLabel}: pack list resubmitted with no changes.`;
  return `${caseLabel}: ${parts.join('; ')}.`;
}
