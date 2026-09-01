/**
 * The anaesthetic techniques a pre-operative review may propose.
 *
 * WHY THIS IS ITS OWN FILE
 *
 * There were three lists and they disagreed. The review form offered EIGHT
 * options; the create and update APIs each validated against their own
 * hand-written list of FIVE. Choosing Epidural or Combined Spinal-Epidural —
 * both of which the hospital has anaesthesia packs seeded for — failed zod with
 * a 400, and the anaesthetist saw the review simply stop at the last step. The
 * error banner is at the top of a long form, so nothing appeared to happen at
 * all.
 *
 * A fourth value, GENERAL_WITH_REGIONAL, was offered by the form and exists in
 * no enum anywhere — not in zod, and not in the database. It could never have
 * been saved. See ANAESTHESIA_TYPES below.
 *
 * This list IS the Prisma AnesthesiaType enum. Anything that offers a technique
 * to a user, or validates one, must read it from here, so the form and the API
 * cannot drift apart again.
 */

/**
 * Exactly the values of the Prisma `AnesthesiaType` enum, in clinical order.
 * A value absent here cannot be stored: the column is the enum, not free text.
 *
 * NOT INCLUDED: GENERAL_WITH_REGIONAL. A general anaesthetic combined with a
 * regional block is real practice, but it is not a value the database column
 * accepts, so offering it only produced a rejected review. Recording it needs a
 * migration to add the enum value — until then it is entered as GENERAL with
 * the block on the prescription.
 */
export const ANAESTHESIA_TYPES = [
  'GENERAL',
  'SPINAL',
  'EPIDURAL',
  'COMBINED_SPINAL_EPIDURAL',
  'LOCAL',
  'REGIONAL',
  'SEDATION',
] as const;

export type AnaesthesiaTypeValue = (typeof ANAESTHESIA_TYPES)[number];

/**
 * zod's z.enum() needs a mutable non-empty tuple. The element type must stay the
 * LITERAL union, not string: Prisma's update input is typed on the enum, and
 * widening it to string makes the checked/unchecked input types ambiguous, which
 * surfaces as a type error about an unrelated field.
 */
export const ANAESTHESIA_TYPE_VALUES: [AnaesthesiaTypeValue, ...AnaesthesiaTypeValue[]] = [
  ...ANAESTHESIA_TYPES,
];

/** How each is worded to the anaesthetist choosing it. */
export const ANAESTHESIA_TYPE_LABELS: Record<AnaesthesiaTypeValue, string> = {
  GENERAL: 'General Anesthesia',
  SPINAL: 'Spinal Anesthesia',
  EPIDURAL: 'Epidural Anesthesia',
  COMBINED_SPINAL_EPIDURAL: 'Combined Spinal-Epidural',
  LOCAL: 'Local Anesthesia',
  REGIONAL: 'Regional Anesthesia (Nerve Block)',
  SEDATION: 'Sedation',
};

/**
 * The technique label the seeded anaesthesia packs are filed under, so the pack
 * picker can highlight the packs matching the chosen technique.
 * Keyed by the enum value; the pack's own `technique` is this string.
 */
export const ANAESTHESIA_PACK_TECHNIQUE: Record<AnaesthesiaTypeValue, string> = {
  GENERAL: 'General',
  SPINAL: 'Spinal',
  EPIDURAL: 'Epidural',
  COMBINED_SPINAL_EPIDURAL: 'Combined Spinal-Epidural',
  LOCAL: 'Local',
  REGIONAL: 'Regional',
  SEDATION: 'Sedation',
};
