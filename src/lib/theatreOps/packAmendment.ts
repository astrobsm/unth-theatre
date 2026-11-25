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
import { roleAllowed } from '@/lib/roleGroups';

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
  return roleAllowed((role ?? '').toUpperCase(), PACK_EDITOR_ROLES);
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
  // NO REASON IS REQUIRED TO REMOVE A LINE. It used to be, on the argument
  // that the provider reads it to decide whether to repack a tray or simply
  // not add the item. That argument is still true, and it lost anyway:
  // removing an item is the commonest correction on this screen — a pack
  // composed from a standard always carries something this patient does not
  // need — and a ten-character sentence demanded for each one made the
  // quickest edit the slowest. Asked for directly.
  //
  // The box is still offered and still sent when it is filled in. What has
  // gone is the refusal. Adding an item still asks, because that one is
  // rarer, costs the hospital money, and the provider genuinely cannot
  // guess at it.
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

// ------------------------------------------------------------
// How many, and of what
// ------------------------------------------------------------

/**
 * The units the two lists are counted in.
 *
 * OFFERED, NOT ENFORCED. The catalogue already holds units these lists do not
 * name -- a template written years ago says "sachet" or "500ml bag" -- and
 * refusing to save a line because its existing unit is not on this list would
 * turn a quantity correction into a dead end. So the control offers these
 * plus whatever the line already says, and the check below only insists the
 * unit is short and not blank.
 */
export const CONSUMABLE_UNITS = [
  'piece', 'pieces', 'pair', 'pairs', 'pack', 'packs', 'box', 'roll',
  'bottle', 'set', 'sachet', 'metre',
];

export const PHARMACY_UNITS = [
  'vial', 'vials', 'ampoule', 'ampoules', 'dose', 'doses', 'tablet', 'tablets',
  'capsule', 'bottle', 'bag', 'sachet', 'tube', 'mL',
];

export const unitsFor = (list: 'CONSUMABLE' | 'PHARMACY'): string[] =>
  (list === 'PHARMACY' ? PHARMACY_UNITS : CONSUMABLE_UNITS);

/**
 * The most of anything one case may ask for.
 *
 * A ceiling, not a clinical limit. It is here to catch the missed keystroke --
 * 80 pairs of gloves typed for 8, 100 vials for 10 -- which on this screen is
 * a plausible slip and reaches the store as a real order. Anything genuinely
 * above it is a standing supply request, not a pack line.
 */
export const MAX_PACK_QUANTITY = 999;

/** The longest a unit may be. "pairs" is five; a sentence is not a unit. */
export const MAX_UNIT_LENGTH = 24;

/**
 * The longest a size or a dose may be.
 *
 * "7.5", "10 mL", "3/0 on a 26mm needle", "1 g IV stat" — roomier than a
 * unit, because a dose is written the way it is prescribed, and still short
 * enough that a sentence cannot hide in it.
 */
export const MAX_SIZE_LENGTH = 48;

/**
 * SIZE IS NOT A DETAIL ON THIS SCREEN, it is most of the point.
 *
 * Three lines reading "8 × Syringe (piece)" are not three lines about the
 * same thing: they are 2 mL, 5 mL and 10 mL, and a list that cannot say so
 * sends somebody to the store to guess. The same for gloves at 7 and at 7.5,
 * which are not interchangeable on a hand.
 *
 * It is carried on the row (SurgeryConsumableRequest.size), and for the
 * pharmacy list the equivalent is the dose
 * (SurgeryDrugDressingRequest.dosage). One concept, two column names,
 * because the two tables were written for two different vocabularies.
 */
export interface PackLineFacts {
  quantity: number;
  unit?: string | null;
  /** size for a consumable, dose for a pharmacy line. */
  size?: string | null;
}

/** "8 piece (10 mL)" — one line's countable facts, as a person reads them. */
export function packLineFacts(f: PackLineFacts): string {
  const unit = (f.unit ?? '').trim();
  const size = (f.size ?? '').trim();
  return `${f.quantity}${unit ? ` ${unit}` : ''}${size ? ` (${size})` : ''}`;
}

export interface QuantityChangeInput {
  currentStatus: string;
  currentQuantity: number;
  currentUnit?: string | null;
  /** The line's current size, or dose on the pharmacy list. */
  currentSize?: string | null;
  /** Omitted leaves the quantity alone. */
  quantity?: number | null;
  /** Omitted leaves the unit alone. */
  unit?: string | null;
  /**
   * Omitted leaves the size alone; an empty string CLEARS it.
   *
   * The distinction is deliberate and it is the only place in this file
   * where blank means something. A line that should never have carried a
   * size needs a way to say so, and "undefined means leave it, '' means
   * remove it" is the only shape that offers both through one field.
   */
  size?: string | null;
  byId?: string | null;
  byRole?: string | null;
}

/**
 * May this line's quantity or unit be corrected, and does anybody need telling?
 *
 * WHY THIS IS NOT A WITHDRAWAL AND A RE-ADD. That is how a SWAP is staged, and
 * deliberately so: cefazolin becoming ceftriaxone is a different drug, and a
 * row that quietly turns into one is how the wrong thing is carried to
 * theatre. Changing how many there are of the same item is the opposite case
 * -- the item is identical -- and withdrawing it to re-add it would tell the
 * provider that something was cancelled when nothing was.
 *
 * NO REASON IS REQUIRED, following removal rather than addition. Correcting a
 * number a standard supplied is the ordinary business of this screen, and a
 * sentence demanded for each one is what makes people stop correcting them.
 * The box is offered and sent when it is filled in.
 */
export function checkQuantityChange(input: QuantityChangeInput): PackChangeCheck {
  const status = String(input.currentStatus ?? '').toUpperCase();
  const acted = ACTED_ON.includes(status);

  if (status === 'CANCELLED') {
    return {
      ok: false,
      problem: 'That item has been withdrawn from the list. Add it again if it is needed.',
      requiresProviderNotice: false,
    };
  }
  if (!canEditPack(input.byRole)) {
    return {
      ok: false,
      problem: 'Only the surgical team may change what a case is packed with.',
      requiresProviderNotice: acted,
    };
  }
  if (!input.byId) {
    return {
      ok: false,
      problem: 'The person making the change must be identified.',
      requiresProviderNotice: acted,
    };
  }

  const wantsQuantity = input.quantity !== undefined && input.quantity !== null;
  const unit = input.unit === undefined || input.unit === null ? null : String(input.unit).trim();
  const wantsUnit = unit !== null;
  // Not `?? null`: an empty string is a request to CLEAR the size, which is
  // different from not mentioning it.
  const wantsSize = input.size !== undefined && input.size !== null;
  const size = wantsSize ? String(input.size).trim() : null;

  if (!wantsQuantity && !wantsUnit && !wantsSize) {
    return { ok: false, problem: 'Nothing was changed.', requiresProviderNotice: false };
  }
  if (wantsSize && (size as string).length > MAX_SIZE_LENGTH) {
    return {
      ok: false,
      problem: 'That size is too long. Put the detail in the note instead.',
      requiresProviderNotice: acted,
    };
  }
  if (wantsQuantity) {
    const q = input.quantity as number;
    if (!Number.isInteger(q) || q < 1) {
      return { ok: false, problem: 'Give a whole quantity of at least one.', requiresProviderNotice: acted };
    }
    if (q > MAX_PACK_QUANTITY) {
      return {
        ok: false,
        problem: `${q} is more than one case can ask for. The most is ${MAX_PACK_QUANTITY}.`,
        requiresProviderNotice: acted,
      };
    }
  }
  if (wantsUnit) {
    if (unit === '') {
      return { ok: false, problem: 'A unit cannot be blank.', requiresProviderNotice: acted };
    }
    if (unit.length > MAX_UNIT_LENGTH) {
      return { ok: false, problem: 'That unit is too long to be a unit.', requiresProviderNotice: acted };
    }
  }

  return { ok: true, problem: null, requiresProviderNotice: acted };
}

/**
 * Has anything actually changed?
 *
 * Kept apart from the check above so that resubmitting an unchanged line is
 * not an ERROR -- it is a no-op, and the API skips it silently. Reporting
 * "nothing was changed" for a line nobody meant to change would bury the one
 * problem that mattered in a list of three that did not.
 */
export function quantityChanged(input: {
  currentQuantity: number;
  currentUnit?: string | null;
  currentSize?: string | null;
  quantity?: number | null;
  unit?: string | null;
  size?: string | null;
}): boolean {
  const q = input.quantity ?? input.currentQuantity;
  const u = (input.unit ?? input.currentUnit ?? '').trim();
  const s = (input.size === undefined || input.size === null
    ? (input.currentSize ?? '')
    : input.size).trim();
  return q !== input.currentQuantity
    || u !== String(input.currentUnit ?? '').trim()
    || s !== String(input.currentSize ?? '').trim();
}

/**
 * "1 pair \u2192 8 pairs (7.5)", for the provider's notification and the line.
 *
 * Both sides in full rather than only what moved. The provider is deciding
 * whether to walk back to the store, and "now 8" without "was 1" leaves them
 * counting what is already on the trolley.
 */
export function quantityChangeLabel(from: PackLineFacts, to: PackLineFacts): string {
  return `${packLineFacts(from)} \u2192 ${packLineFacts(to)}`;
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
export interface ChangedLine {
  name: string;
  /** Already rendered, e.g. "1 piece \u2192 8 pairs". */
  change: string;
}

export function changeSummary(
  added: PackLine[],
  removed: PackLine[],
  caseLabel: string,
  changed: ChangedLine[] = [],
): string {
  const parts: string[] = [];
  if (added.length) {
    parts.push(`${added.length} item${added.length === 1 ? '' : 's'} added (${added.map((a) => a.name).join(', ')})`);
  }
  if (removed.length) {
    parts.push(`${removed.length} withdrawn (${removed.map((r) => r.name).join(', ')})`);
  }
  // Quantities last, and spelled out rather than counted. A provider reading
  // this on a phone is deciding whether to walk back to the store, and
  // "2 changed" does not answer that where "Surgical gloves 1 pair -> 8 pairs"
  // does.
  if (changed.length) {
    parts.push(
      `${changed.length} quantit${changed.length === 1 ? 'y' : 'ies'} changed `
      + `(${changed.map((c) => `${c.name} ${c.change}`).join(', ')})`,
    );
  }
  if (parts.length === 0) return `${caseLabel}: pack list resubmitted with no changes.`;
  return `${caseLabel}: ${parts.join('; ')}.`;
}
