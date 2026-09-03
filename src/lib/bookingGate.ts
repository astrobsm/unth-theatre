/**
 * What must be settled before an elective booking may be filled in.
 *
 * TWO GATES, both asked for after the same thing kept happening: bookings that
 * looked complete and were not.
 *
 * 1. A PATIENT MUST BE CHOSEN FIRST. The form let somebody fill in a procedure,
 *    a theatre and a team, and only then discover they had never picked a
 *    patient — or, worse, submit against a blank. Everything below the patient
 *    is inert until one is selected.
 *
 * 2. A PATIENT WITH AN UNFINISHED CASE CANNOT SIMPLY BE BOOKED AGAIN. If the
 *    last operation was never marked completed, booking a second one produces
 *    two open cases for one person: the theatre list shows them twice, PACU
 *    cannot admit against either with confidence, and nobody can tell which is
 *    real. The earlier case has to be closed first.
 *
 * The second is deliberately NOT a silent block. It says which case, what state
 * it is in, and offers to close it — because the usual truth is that the
 * operation happened and nobody pressed the button.
 */

/** Statuses that mean a case is finished with, one way or another. */
export const CLOSED_STATUSES = ['COMPLETED', 'CANCELLED'] as const;

export interface PriorCase {
  id: string;
  procedureName: string;
  /** SurgeryStatus. */
  status: string;
  scheduledDate: string | Date;
  surgeonName?: string | null;
}

/** Is this case still open — neither completed nor cancelled? */
export function isOpenCase(c: Pick<PriorCase, 'status'>): boolean {
  return !(CLOSED_STATUSES as readonly string[]).includes(String(c.status).toUpperCase());
}

/** The cases standing in the way of booking this patient again. */
export function blockingCases(prior: readonly PriorCase[]): PriorCase[] {
  return prior.filter(isOpenCase);
}

export type GateState =
  /** No patient chosen: the rest of the form is inert. */
  | { state: 'NEEDS_PATIENT'; message: string }
  /** Chosen, but an earlier case is still open. */
  | { state: 'NEEDS_CLOSING'; message: string; cases: PriorCase[] }
  /** Still finding out; the form stays inert rather than flickering open. */
  | { state: 'CHECKING'; message: string }
  /** Nothing in the way. */
  | { state: 'OPEN' };

export interface GateInput {
  patientId: string | null | undefined;
  /** null while the check is still running. */
  priorCases: readonly PriorCase[] | null;
  patientName?: string | null;
}

/**
 * Whether the booking form may be filled in, and what to say if not.
 *
 * CHECKING keeps the form shut. Opening it while the answer is unknown and
 * shutting it a moment later is worse than waiting: somebody types into a field
 * that then goes dead under them.
 */
export function bookingGate(input: GateInput): GateState {
  if (!input.patientId) {
    return {
      state: 'NEEDS_PATIENT',
      message: 'Select the patient first. Nothing else on this form can be filled in until you do.',
    };
  }

  if (input.priorCases === null) {
    return { state: 'CHECKING', message: 'Checking this patient for an unfinished operation…' };
  }

  const blocking = blockingCases(input.priorCases);
  if (blocking.length > 0) {
    const who = input.patientName ? `${input.patientName} has` : 'This patient has';
    const n = blocking.length;
    return {
      state: 'NEEDS_CLOSING',
      message:
        `${who} ${n} earlier operation${n === 1 ? '' : 's'} that ${n === 1 ? 'was' : 'were'} never marked completed. ` +
        `Close ${n === 1 ? 'it' : 'them'} before booking again, or this patient will appear on the list twice.`,
      cases: blocking,
    };
  }

  return { state: 'OPEN' };
}

/** May the rest of the form be used? */
export const isFormUsable = (g: GateState): boolean => g.state === 'OPEN';

/** "SCHEDULED" -> "Scheduled", "IN_PROGRESS" -> "In progress". */
export function readableStatus(status: string): string {
  const s = String(status).replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
