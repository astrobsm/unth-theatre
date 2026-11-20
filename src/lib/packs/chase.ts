/**
 * Chasing the people who have to fill a pack.
 *
 * A surgeon can already SEE both lists and change them. What there has never
 * been is a way to ask the two people holding them up to get on with it. On an
 * emergency that gap is the whole problem: the case is booked, the team is
 * chased, the blood is chased — and the consumable pack and the drugs are
 * waited for, in silence, by somebody standing outside a theatre.
 *
 * Everything here is pure so that the rules about WHEN not to chase can be
 * tested, because those are the rules that decide whether anybody still reads
 * the messages in a month.
 */

export type PackList = 'CONSUMABLE' | 'PHARMACY';

export interface ChaseLine {
  id: string;
  name: string;
  quantity: number;
  unit?: string | null;
  status: string;
}

/** Statuses where the provider still owes the theatre something. */
export const OUTSTANDING_STATUSES = ['REQUESTED', 'PACKING'];

/** Statuses where they do not. */
export const SETTLED_STATUSES = ['PACKED', 'DELIVERED', 'CANCELLED'];

export function outstandingLines(lines: ChaseLine[]): ChaseLine[] {
  return lines.filter((l) => OUTSTANDING_STATUSES.includes(l.status));
}

export function liveLines(lines: ChaseLine[]): ChaseLine[] {
  return lines.filter((l) => l.status !== 'CANCELLED');
}

export interface ListState {
  total: number;
  outstanding: number;
  packed: number;
  delivered: number;
  /** The names still owed, for the message. Trimmed by the caller if long. */
  outstandingNames: string[];
}

function listState(lines: ChaseLine[]): ListState {
  const live = liveLines(lines);
  const owed = outstandingLines(lines);
  return {
    total: live.length,
    outstanding: owed.length,
    packed: live.filter((l) => l.status === 'PACKED').length,
    delivered: live.filter((l) => l.status === 'DELIVERED').length,
    outstandingNames: owed.map((l) => `${l.name}${l.quantity > 1 ? ` ×${l.quantity}` : ''}`),
  };
}

/**
 * Who may chase.
 *
 * Wider than who may EDIT a pack, and deliberately so. Deciding what a case
 * needs is a clinical judgement that belongs to the surgical team; asking
 * whether the thing already decided on has been picked yet is not. The scrub
 * nurse and the anaesthetic staff are the ones standing in the room waiting
 * for it, and a rule that makes them find a surgeon first adds a step to the
 * exact moment that has none to spare.
 *
 * The providers themselves are not here: a provider chasing their own list is
 * not a chase, and would let a late pack be papered over from the inside.
 */
export const PACK_CHASE_ROLES = [
  'SURGEON', 'CONSULTANT_SURGEON', 'HOUSE_OFFICER', 'REGISTRAR',
  'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ANAESTHETIC_TECHNICIAN',
  'SCRUB_NURSE', 'THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_CHAIRMAN',
];

export function canChasePack(role: string | null | undefined): boolean {
  return PACK_CHASE_ROLES.includes((role ?? '').toUpperCase());
}

/** The role that owns each list. */
export const CONSUMABLE_ROLES = ['CONSUMABLE_PACK_PROVIDER', 'THEATRE_STORE_KEEPER'];
export const PHARMACY_ROLES = ['PHARMACIST'];

export interface PackChaseState {
  consumables: ListState;
  pharmacy: ListState;
  /** Which lists are actually outstanding. Only these get written to. */
  chase: PackList[];
  /** True when there is somebody to chase about something. */
  worth: boolean;
  /**
   * Why not, when not. Written to be shown: "nothing is outstanding" and
   * "no list has been built yet" are completely different situations and the
   * second one needs doing something about, not waiting for.
   */
  problem: string | null;
  /** Roles the message should go to, given what is outstanding. */
  roles: string[];
}

export function chaseState(
  consumables: ChaseLine[],
  pharmacy: ChaseLine[],
): PackChaseState {
  const c = listState(consumables);
  const p = listState(pharmacy);

  const chase: PackList[] = [];
  if (c.outstanding > 0) chase.push('CONSUMABLE');
  if (p.outstanding > 0) chase.push('PHARMACY');

  const roles: string[] = [];
  if (chase.includes('CONSUMABLE')) roles.push(...CONSUMABLE_ROLES);
  if (chase.includes('PHARMACY')) roles.push(...PHARMACY_ROLES);

  let problem: string | null = null;
  if (c.total === 0 && p.total === 0) {
    // The single most important branch here. An empty pack is not a slow
    // provider; it is a list nobody has built, and chasing somebody for it
    // sends them hunting for a request that does not exist.
    problem = 'Nothing has been requested for this case yet. Build the lists first — there is nothing for the provider or pharmacy to fill.';
  } else if (chase.length === 0) {
    problem = 'Nothing is outstanding. Every item on both lists is packed, delivered or withdrawn.';
  }

  return { consumables: c, pharmacy: p, chase, worth: chase.length > 0, problem, roles };
}

/**
 * How long before the same case may be chased again.
 *
 * Ten minutes, and short on purpose: this is an emergency board, where the
 * honest reason to chase twice is that the first message has not moved
 * anybody and the patient is still waiting. Long enough that a surgeon
 * tapping a button twice does not buzz four phones twice; short enough that
 * it never becomes the reason a pack did not arrive.
 */
export const PACK_CHASE_COOLDOWN_MINUTES = 10;

export function cooldownProblem(
  lastChasedAt: Date | null | undefined,
  now: Date,
): string | null {
  if (!lastChasedAt) return null;
  const minutes = Math.floor((now.getTime() - lastChasedAt.getTime()) / 60_000);
  if (minutes >= PACK_CHASE_COOLDOWN_MINUTES) return null;
  const wait = PACK_CHASE_COOLDOWN_MINUTES - minutes;
  return `This case was chased ${minutes < 1 ? 'less than a minute' : `${minutes} min`} ago. You can chase again in ${wait} min — or ring them, the numbers are above.`;
}

/** "14:05". Local time, same on every machine — never toLocaleTimeString. */
function clock(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export interface ChaseMessageInput {
  list: PackList;
  state: PackChaseState;
  patientName?: string | null;
  folderNumber?: string | null;
  procedureName?: string | null;
  theatreName?: string | null;
  /** Set for an emergency: when the case has to start. */
  requiredBy?: Date | null;
  emergency?: boolean;
  priority?: string | null;
  fromName: string;
  /** Up to this many item names before the message says "and N more". */
  maxItems?: number;
}

/**
 * The message, per list.
 *
 * Written per list rather than one message to everybody, because the
 * pharmacist does not need a list of drapes and the pack provider cannot do
 * anything about a missing vial. A message that is mostly somebody else's
 * problem is a message that gets skimmed.
 */
export function packChaseMessage(input: ChaseMessageInput): string {
  const owed = input.list === 'CONSUMABLE' ? input.state.consumables : input.state.pharmacy;
  const maxItems = input.maxItems ?? 6;

  const head = input.emergency
    ? `🚨 EMERGENCY — ${input.priority || 'URGENT'}`
    : '🏥 UNTH Theatre';
  const what = input.list === 'CONSUMABLE' ? 'Consumable pack' : 'Pharmacy pack';

  const who = [input.patientName, input.folderNumber ? `(${input.folderNumber})` : null]
    .filter(Boolean).join(' ');

  const lines: string[] = [head];
  lines.push(`${what}: ${owed.outstanding} item${owed.outstanding === 1 ? '' : 's'} still outstanding.`);
  if (who) lines.push(`Patient: ${who}`);
  if (input.procedureName) lines.push(`Procedure: ${input.procedureName}`);
  if (input.theatreName) lines.push(`Theatre: ${input.theatreName}`);
  if (input.requiredBy) lines.push(`Required by: ${clock(input.requiredBy)}`);

  const names = owed.outstandingNames.slice(0, maxItems);
  if (names.length) {
    lines.push('');
    lines.push(...names.map((n) => `• ${n}`));
    const more = owed.outstandingNames.length - names.length;
    if (more > 0) lines.push(`• …and ${more} more`);
  }

  lines.push('');
  lines.push(`Asked by ${input.fromName}. Open ORM for the full list.`);
  return lines.join('\n');
}

/** A one-line summary for the screen and the audit entry. */
export function chaseSummary(state: PackChaseState): string {
  const parts: string[] = [];
  if (state.consumables.outstanding) {
    parts.push(`${state.consumables.outstanding} consumable${state.consumables.outstanding === 1 ? '' : 's'}`);
  }
  if (state.pharmacy.outstanding) {
    parts.push(`${state.pharmacy.outstanding} pharmacy item${state.pharmacy.outstanding === 1 ? '' : 's'}`);
  }
  if (!parts.length) return 'Nothing outstanding.';
  return `${parts.join(' and ')} outstanding.`;
}
