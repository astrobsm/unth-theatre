// ============================================================
// Which counter picks each line of a pack
// ------------------------------------------------------------
// ONE FUNCTION, CALLED FROM EVERYWHERE. Booking creation, booking edit, the
// pack generator and a correction to the payer category all call
// routeRequestItems(). The alternative — each of those deciding for itself —
// is how a case ends up with its consumables at one counter and its drugs at
// a counter that was told about a different patient.
//
// THE SHAPE OF THE ANSWER. There is no "sub-request" record. A unit's queue
// is the rows on a case routed to it, which means one row has exactly one
// owner, the surgeon's combined view is the same query without the filter,
// and there is no second table to fall out of step with the first.
//
// WHAT IT REFUSES TO GUESS. An item the catalogue does not know is NOT
// COVERED, and is flagged for the NHIA Pharmacy to look at. Treating an
// unknown item as covered would send it to a counter that will refuse it,
// with the patient already on the list.
// ============================================================

import { roleAllowed } from '@/lib/roleGroups';

import { coverageSchemeFor, isInsuredPayer, type PayerCategory } from './categories';

export type FulfilmentUnit = 'NHIA_PHARMACY' | 'THEATRE_PHARMACY' | 'CONSUMABLE_PACK';

export type PackListKind = 'CONSUMABLE' | 'PHARMACY';

export const FULFILMENT_LABEL: Record<FulfilmentUnit, string> = {
  NHIA_PHARMACY: 'NHIA Pharmacy',
  THEATRE_PHARMACY: 'Theatre Pharmacy',
  CONSUMABLE_PACK: 'Consumable Pack Providers',
};

export interface RoutableItem {
  /** Which of the two lists the line belongs to. */
  list: PackListKind;
  name?: string | null;
  /** From the catalogue row, where the line came from one. */
  coveredByNHIA?: boolean | null;
  coveredByCEmONC?: boolean | null;
  /**
   * Covered, but only in part.
   *
   * Sections 29-36 of the NHIA Medicines Price List are a 50:50 split with
   * the enrolee -- a few named brands are 50:30:20 with the manufacturer,
   * and the enrolee's share is still 20-50%. The line goes to the NHIA desk
   * either way, because the scheme is paying something, but the family has
   * to be told they owe a share and told EARLY. Meropenem at thirteen
   * thousand naira is half a month's income for most of this hospital's
   * patients, and finding out at the theatre door is finding out too late.
   */
  nhiaPartial?: boolean | null;
  /**
   * False where the line was typed by hand and matched no catalogue row.
   *
   * It is a separate fact from "not covered". Both route the same way, but
   * only this one puts the item on the NHIA Pharmacy's review list, because
   * an item nobody has classified may well be covered and nobody has looked.
   */
  fromCatalogue?: boolean | null;
}

export interface RoutingDecision {
  routedTo: FulfilmentUnit;
  /**
   * What the team and the family are told, or null when there is nothing to
   * say. Only an INSURED patient's uncovered line carries one — on a private
   * case everything is the patient's, and saying so on every line would make
   * the words invisible on the cases that need them.
   */
  coverageNote: string | null;
  /** The NHIA Pharmacy should look at this one. */
  needsCoverageReview: boolean;
}

/** Where an uncovered line of this kind goes: exactly where it goes today. */
export function uninsuredUnitFor(list: PackListKind): FulfilmentUnit {
  return list === 'PHARMACY' ? 'THEATRE_PHARMACY' : 'CONSUMABLE_PACK';
}

/**
 * Does the scheme cover this item?
 *
 * Unknown is not covered, and is reported separately so it can be chased.
 */
export function coverageOf(
  payer: PayerCategory | null | undefined,
  item: RoutableItem,
): { covered: boolean; known: boolean } {
  const scheme = coverageSchemeFor(payer);
  if (!scheme) return { covered: false, known: true };

  // An item typed by hand has no catalogue row behind it, so there is nothing
  // to read a flag from however the flag is spelled.
  if (item.fromCatalogue === false) return { covered: false, known: false };

  const flag = scheme === 'CEmONC' ? item.coveredByCEmONC : item.coveredByNHIA;
  if (flag === null || flag === undefined) return { covered: false, known: false };
  return { covered: !!flag, known: true };
}

/**
 * Where one line goes, and what anybody is told about it.
 *
 * UNSPECIFIED AND PRIVATE ARE THE SAME ANSWER and that is deliberate: a case
 * booked before this question existed must route exactly as it did before,
 * and "exactly as before" is the private path. They differ only in what the
 * screen says about them.
 */
export function routeItem(
  payer: PayerCategory | null | undefined,
  item: RoutableItem,
): RoutingDecision {
  if (!isInsuredPayer(payer)) {
    return { routedTo: uninsuredUnitFor(item.list), coverageNote: null, needsCoverageReview: false };
  }

  const scheme = coverageSchemeFor(payer) ?? 'NHIA';
  const { covered, known } = coverageOf(payer, item);

  if (covered) {
    return {
      routedTo: 'NHIA_PHARMACY',
      // Said on a covered line only when the patient still owes something.
      // A note on every covered line would make the words invisible on the
      // ones that cost a family money.
      coverageNote: item.nhiaPartial
        ? `Covered by ${scheme} in part only \u2014 the patient pays a share. Tell the family before the day.`
        : null,
      needsCoverageReview: false,
    };
  }

  // Said plainly, and said now. The family finds out either way, and the
  // ward the evening before is a better place to hear it than the theatre
  // door on the morning.
  return {
    routedTo: uninsuredUnitFor(item.list),
    coverageNote: known
      ? `Not covered by ${scheme}. Patient pays.`
      : `Not on the ${scheme} list — NHIA Pharmacy to confirm. Patient pays unless confirmed.`,
    needsCoverageReview: !known,
  };
}

/**
 * The whole list at once.
 *
 * Order is preserved and every input gets exactly one output, so a caller can
 * zip the two together by index. A routing that silently dropped a line would
 * be a line nobody is picking.
 */
export function routeRequestItems(
  payer: PayerCategory | null | undefined,
  items: RoutableItem[],
): RoutingDecision[] {
  return items.map((i) => routeItem(payer, i));
}

/** The three queues a case can be split across, for the combined view. */
export function groupByUnit<T extends { routedTo: FulfilmentUnit }>(
  rows: T[],
): { unit: FulfilmentUnit; label: string; rows: T[] }[] {
  const order: FulfilmentUnit[] = ['NHIA_PHARMACY', 'THEATRE_PHARMACY', 'CONSUMABLE_PACK'];
  return order
    .map((unit) => ({
      unit,
      label: FULFILMENT_LABEL[unit],
      rows: rows.filter((r) => r.routedTo === unit),
    }))
    .filter((g) => g.rows.length > 0);
}

/**
 * Which units a role may read.
 *
 * THE BOOKING TEAM SEES EVERYTHING, each unit sees only its own. Kept here
 * beside the routing rather than in each route, so "who sees what" is one
 * list to read when somebody says a counter is seeing the wrong cases.
 */
const UNIT_ROLES: Record<FulfilmentUnit, string[]> = {
  NHIA_PHARMACY: ['NHIA_PHARMACY'],
  THEATRE_PHARMACY: ['PHARMACIST', 'HEAD_OF_PHARMACY'],
  CONSUMABLE_PACK: ['CONSUMABLE_PACK_PROVIDER', 'THEATRE_STORE_KEEPER'],
};

/** Roles that see every unit's lines, because they own or run the case. */
export const SEES_EVERY_UNIT = [
  'SURGEON', 'CONSULTANT_SURGEON', 'HOUSE_OFFICER',
  'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE',
  'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ADMIN', 'SYSTEM_ADMINISTRATOR',
];

export function unitsVisibleTo(role: string | null | undefined): FulfilmentUnit[] {
  // roleAllowed, never a bare includes: a consultant surgeon and a Head of
  // Surgery both stand in for SURGEON through ROLE_INHERITS, and so does a
  // house officer. A raw list check would show them an empty pack.
  const r = String(role ?? '').toUpperCase();
  if (roleAllowed(r, SEES_EVERY_UNIT)) {
    return ['NHIA_PHARMACY', 'THEATRE_PHARMACY', 'CONSUMABLE_PACK'];
  }
  return (Object.keys(UNIT_ROLES) as FulfilmentUnit[])
    .filter((u) => roleAllowed(r, UNIT_ROLES[u]));
}
