// ============================================================
// Is my patient ready?
// ------------------------------------------------------------
// One function, read by the surgeon's dashboard, the anaesthetist's and the
// nurses'. Three screens answering the same question from three different
// pieces of arithmetic is how a case gets wheeled in on one team's
// understanding and turned away on another's.
//
// READY MEANS BOTH PAID AND PACKED, ON BOTH SIDES. Paid but not packed is a
// patient who will wait at the door; packed but not paid is a pack the
// store is holding. Neither is ready, and the difference matters because
// they are chased by different people.
// ============================================================

export type DepositStatus = 'UNPAID' | 'PAID' | 'WAIVED';

export interface DepositSide {
  status: DepositStatus;
  packedAt?: Date | string | null;
  amount?: string | number | null;
}

export interface CaseDeposit {
  consumable: DepositSide;
  pharmacy: DepositSide;
}

export type ReadinessState =
  | 'READY'
  | 'AWAITING_PAYMENT'
  | 'AWAITING_PACKING'
  | 'AWAITING_BOTH'
  | 'NOT_SET';

export interface Readiness {
  state: ReadinessState;
  /** One line, written for whoever is reading a dashboard at 7am. */
  summary: string;
  /** What is outstanding, and who is holding it. */
  outstanding: string[];
  /** Safe to wheel the patient down as far as drugs and consumables go. */
  ready: boolean;
}

const settled = (s: DepositStatus) => s === 'PAID' || s === 'WAIVED';
const packed = (side: DepositSide) => !!side.packedAt;

/**
 * No deposit record at all.
 *
 * Reported as NOT_SET rather than as unpaid, because the two call for
 * different action: unpaid means send the patient to the cashier, not set
 * means nobody has priced this case and the surgeon should ask why. Showing
 * "unpaid" for a case that was never priced sends relatives to a desk that
 * cannot help them.
 */
const NOT_SET: Readiness = {
  state: 'NOT_SET',
  summary: 'Deposits not yet recorded for this case.',
  outstanding: ['No deposit has been recorded — ask the theatre office.'],
  ready: false,
};

export function readinessOf(deposit: CaseDeposit | null | undefined): Readiness {
  if (!deposit) return NOT_SET;

  const outstanding: string[] = [];

  const consumablePaid = settled(deposit.consumable.status);
  const pharmacyPaid = settled(deposit.pharmacy.status);
  const consumablePacked = packed(deposit.consumable);
  const pharmacyPacked = packed(deposit.pharmacy);

  if (!consumablePaid) outstanding.push('Consumable deposit not paid.');
  if (!pharmacyPaid) outstanding.push('Pharmacy deposit not paid.');

  // Packing is only meaningful once it has been paid for. Reporting "pack
  // not made up" against an unpaid case sends the surgeon to the store,
  // who will rightly send them to the cashier.
  if (consumablePaid && !consumablePacked) outstanding.push('Consumable pack not yet made up.');
  if (pharmacyPaid && !pharmacyPacked) outstanding.push('Pharmacy pack not yet made up.');

  const anyUnpaid = !consumablePaid || !pharmacyPaid;
  const anyUnpacked = !consumablePacked || !pharmacyPacked;

  if (!anyUnpaid && !anyUnpacked) {
    return {
      state: 'READY',
      summary: 'Drugs and consumables paid for and packed.',
      outstanding: [],
      ready: true,
    };
  }

  const state: ReadinessState = anyUnpaid && anyUnpacked
    ? (consumablePaid || pharmacyPaid ? 'AWAITING_BOTH' : 'AWAITING_PAYMENT')
    : anyUnpaid
      ? 'AWAITING_PAYMENT'
      : 'AWAITING_PACKING';

  const summary =
    state === 'AWAITING_PAYMENT'
      ? 'Waiting on the deposit.'
      : state === 'AWAITING_PACKING'
        ? 'Paid — waiting for the pack to be made up.'
        : 'Deposit and packing both outstanding.';

  return { state, summary, outstanding, ready: false };
}

/** Colour for the badge. Kept here so three dashboards cannot disagree. */
export function readinessTone(state: ReadinessState): 'green' | 'amber' | 'red' | 'grey' {
  switch (state) {
    case 'READY':
      return 'green';
    case 'AWAITING_PACKING':
      return 'amber';
    case 'AWAITING_PAYMENT':
    case 'AWAITING_BOTH':
      return 'red';
    default:
      return 'grey';
  }
}
