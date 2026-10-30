// ============================================================
// Five duties, one measure
// ------------------------------------------------------------
// The anaesthetist's pre-op review, pharmacy's drug packing, the consumable
// provider's packing, the nurses' acknowledgement of an emergency, and the
// recording of when a case started and ended.
//
// They are different jobs done by different departments, and the temptation is
// five reports. That is how the hospital ends up with five rankings that count
// differently, five chase messages with five tones, and an argument in a
// meeting about whose figures are right. So every duty is reduced to the SAME
// three facts, and one aggregator reads them:
//
//   who was responsible, when it was due, and when (or whether) it was done.
//
// Everything a duty needs to say about itself — its name, the verb, what
// "late" means for it, what to say when chasing — lives in its definition
// here, and nowhere else.
//
// TWO RATES, NOT ONE, and this is the point of the whole design. A person can
// fail a duty two different ways: not doing it at all, and doing it too late.
// A single "performance" percentage hides which, and the two need different
// conversations. Completion is counted over everything they were responsible
// for; punctuality only over what they actually did.
// ============================================================

export type DutyKey =
  | 'PREOP_REVIEW'
  | 'PHARMACY_PACKING'
  | 'CONSUMABLE_PACKING'
  | 'EMERGENCY_ACK'
  | 'SURGERY_TIMING';

/**
 * One instance of a duty: a thing that somebody had to do.
 *
 * `doneAt === null` means it was never done — which is a finding, not missing
 * data, and must stay in the denominator. Dropping outstanding work would let
 * somebody who did nothing at all score 100%, which is exactly backwards.
 */
export interface DutyEvent {
  /** The surgery, request or alert this concerns. */
  id: string;
  /** Who was responsible. Null when the record names nobody. */
  personId: string | null;
  personName: string | null;
  /** The surgical unit, for ranking by firm. */
  unit: string | null;
  /** What this was about — patient and procedure, for the detail table. */
  label: string;
  /** When it should have been done by. Null when the duty has no deadline. */
  dueAt: Date | string | null;
  /** When it was done. Null means outstanding. */
  doneAt: Date | string | null;
}

export interface DutyDefinition {
  key: DutyKey;
  /** "Pre-op anaesthetic review" */
  label: string;
  /** Who owes it: "Anaesthetists" */
  owner: string;
  /** The verb, for sentences: "reviewed" */
  verb: string;
  /** What the deadline means, in the words staff use. */
  deadline: string;
  /** Why it matters — printed on the report and quoted in chases. */
  why: string;
  /**
   * How long after the deadline still counts as on time.
   *
   * Not a kindness: it is the difference between a measure people accept and
   * one they dismiss. A pack finished ninety seconds past a notional cut-off
   * is not a failure, and a report that calls it one gets argued with rather
   * than acted on.
   */
  graceMinutes: number;
}

export const DUTIES: Record<DutyKey, DutyDefinition> = {
  PREOP_REVIEW: {
    key: 'PREOP_REVIEW',
    label: 'Pre-operative anaesthetic review',
    owner: 'Anaesthetists',
    verb: 'reviewed',
    deadline: 'before the end of the day before surgery',
    why:
      'An unreviewed patient cannot be safely anaesthetised. A review done on the morning '
      + 'of surgery finds the problems too late to act on them, and the case is either '
      + 'delayed on the table or done without the optimisation it needed.',
    graceMinutes: 0,
  },
  PHARMACY_PACKING: {
    key: 'PHARMACY_PACKING',
    label: 'Pharmacy drug packing',
    owner: 'Pharmacy',
    verb: 'packed',
    deadline: 'before the start of the operating list',
    why:
      'Drugs that are not packed before the list starts are fetched during it. The theatre '
      + 'waits, the next case slides, and somebody is sent out of a running theatre to find '
      + 'what should already have been on the trolley.',
    graceMinutes: 30,
  },
  CONSUMABLE_PACKING: {
    key: 'CONSUMABLE_PACKING',
    label: 'Consumable pack preparation',
    owner: 'Consumable pack providers',
    verb: 'packed',
    deadline: 'before the start of the operating list',
    why:
      'A pack drawn after the list has started is a case that cannot begin. The sets are '
      + 'sterile and counted the day before for exactly this reason, and a late pack undoes '
      + 'that work for every case behind it.',
    graceMinutes: 30,
  },
  EMERGENCY_ACK: {
    key: 'EMERGENCY_ACK',
    label: 'Emergency acknowledgement',
    owner: 'Theatre nurses',
    verb: 'acknowledged',
    deadline: 'within 15 minutes of the alert',
    why:
      'An emergency alert nobody answers is an emergency nobody is preparing for. The '
      + 'acknowledgement is how the theatre knows a named person has taken it — until it '
      + 'arrives, the surgeon is assuming cover that may not exist.',
    graceMinutes: 5,
  },
  SURGERY_TIMING: {
    key: 'SURGERY_TIMING',
    label: 'Recording start and end of surgery',
    owner: 'Theatre nurses',
    verb: 'recorded',
    deadline: 'on the day of surgery',
    why:
      'Times that are not recorded cannot be recovered. Theatre utilisation, turnover and '
      + 'every case-duration figure the hospital plans with are built from these two '
      + 'timestamps, and a missing pair is a case that silently never happened.',
    graceMinutes: 0,
  },
};

export const DUTY_KEYS: DutyKey[] = [
  'PREOP_REVIEW',
  'PHARMACY_PACKING',
  'CONSUMABLE_PACKING',
  'EMERGENCY_ACK',
  'SURGERY_TIMING',
];

export function isDutyKey(v: unknown): v is DutyKey {
  return typeof v === 'string' && DUTY_KEYS.indexOf(v as DutyKey) !== -1;
}

/** One person's record for one duty in one window. */
export interface DutyPerformance {
  personId: string | null;
  name: string;
  units: string[];
  /** Everything they were responsible for. */
  total: number;
  /** Of those, how many were done at all. */
  done: number;
  /** Never done. */
  outstanding: number;
  /** Done, but past the deadline. */
  late: number;
  /** Done within the deadline. */
  onTime: number;
  /** done / total. How much of the work was done. */
  completionRate: number | null;
  /** onTime / done. How much of what they did was on time. */
  punctualityRate: number | null;
  /** Median minutes early (positive) or late (negative) against the deadline. */
  medianMarginMinutes: number | null;
  /** Nothing outstanding and nothing late. */
  perfect: boolean;
  ranked: boolean;
  commendable: boolean;
}

export interface DutyUnitPerformance {
  unit: string;
  total: number;
  done: number;
  outstanding: number;
  late: number;
  onTime: number;
  completionRate: number | null;
  punctualityRate: number | null;
  ranked: boolean;
}

export interface DutyCaseRow {
  id: string;
  label: string;
  unit: string;
  personName: string;
  personId: string | null;
  dueAtLabel: string;
  doneAtLabel: string;
  /** Minutes early (positive) or late (negative). Null when not measurable. */
  marginMinutes: number | null;
  state: 'ON_TIME' | 'LATE' | 'OUTSTANDING';
}

export interface DutyReport {
  duty: DutyKey;
  from: string;
  to: string;
  total: number;
  done: number;
  outstanding: number;
  late: number;
  onTime: number;
  completionRate: number | null;
  punctualityRate: number | null;
  /** Best first; only those with enough work to rank. */
  people: DutyPerformance[];
  /** Below the volume floor — listed, never hidden. */
  unranked: DutyPerformance[];
  units: DutyUnitPerformance[];
  /** Worth a letter of appreciation. */
  commendable: DutyPerformance[];
  /** Ranked people falling short — the ones to chase. */
  chaseable: DutyPerformance[];
  /** Every instance, worst first, for the detail table. */
  cases: DutyCaseRow[];
}
