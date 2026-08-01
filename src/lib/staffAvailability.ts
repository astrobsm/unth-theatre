// Live staff-availability statuses shared by the API, the board and the
// emergency card. A single current snapshot per user (User.availabilityStatus).

export const AVAILABILITY_STATUSES = [
  'AVAILABLE',
  'BUSY',
  'IN_THEATRE',
  'TRANSPORTING_PATIENT',
  'PREPARING_THEATRE',
  'CLEANING_THEATRE',
  'ON_EMERGENCY_CASE',
  'BREAK',
  'OFF_DUTY',
  'ON_LEAVE',
  'UNAVAILABLE',
] as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export interface AvailabilityMeta {
  label: string;
  // Tailwind classes for a chip and a status dot.
  chip: string;
  dot: string;
  // Is this status "reachable now" for an emergency? (drives sorting/urgency)
  reachable: boolean;
}

export const AVAILABILITY_META: Record<string, AvailabilityMeta> = {
  AVAILABLE: { label: 'Available', chip: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500', reachable: true },
  BUSY: { label: 'Busy', chip: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500', reachable: true },
  IN_THEATRE: { label: 'In Theatre', chip: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-500', reachable: false },
  TRANSPORTING_PATIENT: { label: 'Transporting Patient', chip: 'bg-indigo-100 text-indigo-800 border-indigo-200', dot: 'bg-indigo-500', reachable: false },
  PREPARING_THEATRE: { label: 'Preparing Theatre', chip: 'bg-cyan-100 text-cyan-800 border-cyan-200', dot: 'bg-cyan-500', reachable: false },
  CLEANING_THEATRE: { label: 'Cleaning Theatre', chip: 'bg-teal-100 text-teal-800 border-teal-200', dot: 'bg-teal-500', reachable: false },
  ON_EMERGENCY_CASE: { label: 'On Emergency Case', chip: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500', reachable: false },
  BREAK: { label: 'On Break', chip: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-400', reachable: true },
  OFF_DUTY: { label: 'Off Duty', chip: 'bg-gray-100 text-gray-500 border-gray-200', dot: 'bg-gray-300', reachable: false },
  ON_LEAVE: { label: 'On Leave', chip: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-400', reachable: false },
  UNAVAILABLE: { label: 'Unavailable', chip: 'bg-gray-200 text-gray-600 border-gray-300', dot: 'bg-gray-500', reachable: false },
};

/**
 * Statuses that mean "I am at work and findable".
 *
 * These, and only these, may carry a position. Recording where somebody is when
 * they have just marked themselves Off Duty or On Leave is not a workforce
 * board — it is tracking them in their own time, and no operational question
 * needs the answer. The rule is enforced on the SERVER, not merely hidden in
 * the UI, so it holds however the request arrives.
 */
export const LOCATABLE_STATUSES: readonly AvailabilityStatus[] = [
  'AVAILABLE',
  'BUSY',
  'IN_THEATRE',
  'TRANSPORTING_PATIENT',
  'PREPARING_THEATRE',
  'CLEANING_THEATRE',
  'ON_EMERGENCY_CASE',
  'BREAK',
];

/** May a position be attached to this status? */
export const capturesLocation = (status: string | null | undefined): boolean =>
  !!status && (LOCATABLE_STATUSES as readonly string[]).includes(status);

export const availabilityMeta = (s: string | null | undefined): AvailabilityMeta =>
  (s && AVAILABILITY_META[s]) || { label: 'Not set', chip: 'bg-gray-50 text-gray-400 border-gray-200', dot: 'bg-gray-300', reachable: false };

export const isAvailabilityStatus = (s: unknown): s is AvailabilityStatus =>
  typeof s === 'string' && (AVAILABILITY_STATUSES as readonly string[]).includes(s);
