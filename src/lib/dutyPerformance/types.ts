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
  /**
   * The WAT calendar day on which the person had to ACT — not the day of
   * surgery. For a pack or a review done the evening before, that is the day
   * before the list; for an alert or a set of theatre times, the day itself.
   *
   * THIS IS WHAT MAKES A MESSAGE PERSONAL. A roster row says somebody was on
   * the night of the 7th; only this field can say which cases that night
   * actually carried. Without it the board could quote the department's figure
   * to everybody and nothing else, which is precisely what staff objected to:
   * "that is not my duty". Optional because report.ts has never needed it, and
   * an event that cannot say which day it fell on is matched to no roster
   * line rather than to a guessed one.
   */
  dutyDay?: string | null;
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
  /** Why it matters — printed on the report. */
  why: string;
  /**
   * The same thing in one sentence, for a message read on a phone between
   * cases. The long `why` stays for the report and the PDF; a chase that
   * opens with a paragraph is a chase that is scrolled past.
   */
  whyShort: string;
  /** The one instruction: where to go and what to press. */
  ask: string;
  /**
   * The staff whoever holds this duty is senior to, named the way they are
   * named on the ward.
   *
   * EVERY ONE OF THESE DUTIES IS SUPERVISED, and that is the half of the
   * appeal a figure cannot make. A consultant can see that their registrars
   * enter the review; a pharmacist can see that the intern on the shift ticks
   * the pack. Asking somebody to look after their own cases and saying
   * nothing about the people working under them asks for half the job.
   */
  subordinates: string;
  /**
   * The duty broken into the steps somebody actually performs, in order,
   * naming the screen each one happens on.
   *
   * EVERY DUTY HAS THESE AND THEY ARE NOT OPTIONAL. A message that says only
   * "please do this on time" assumes the reader knows where the button is.
   * Repeatedly, they did not: the work was being done and simply never
   * recorded, which the board then read as work never done. Telling somebody
   * their figure is poor without telling them where the screen is produces a
   * worse figure and a resentful colleague.
   */
  steps: string[];
  /** Where in the ORM the work is recorded: "Dashboard → Pharmacy". */
  where: string;
  /**
   * The user roles that actually perform this duty.
   *
   * THE REASON THIS FIELD EXISTS. A chase about pharmacy packing once had no
   * legitimate recipient at all, because nothing in the data named one. The
   * roles are how the board finds the right people before it writes to
   * anybody — an anaesthetist must never receive a pharmacy chase.
   */
  roles: string[];
  /**
   * The published roster category that names who was on, where one exists.
   *
   * Null where the duty is not rostered a week ahead. Perioperative nursing
   * is deliberately not a department roster (scrub nurses are allocated to
   * theatres day by day), so those duties fall back to role alone.
   */
  rosterCategory: string | null;
  /**
   * For a duty that is routinely DONE by juniors and OWED by a senior.
   *
   * The pre-op review is the clear case: the registrars and senior registrars
   * working with a consultant see most of the patients, which is how a
   * teaching hospital is supposed to work. Writing to the consultant as though
   * they personally failed to review two patients is both wrong and easy to
   * dismiss — and dismissed is the one outcome that guarantees the next month
   * reads the same.
   *
   * So where this is set the appeal changes shape: it asks the senior to make
   * sure the person who saw the patient enters it, and it says plainly why a
   * figure against their own name may understate the work. Null wherever
   * whoever does the job is also whoever records it.
   */
  delegation: {
    /** What the senior is actually being asked to do about it. */
    appeal: string;
    /** The same ask in one sentence, for the short message. */
    short: string;
    /** Why the figure against their own name may not be the whole story. */
    attribution: string;
  } | null;
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
      'An unreviewed patient cannot be safely anaesthetised — and a review nobody else can '
      + 'see is the same thing to everybody preparing the case. The entry on the ORM is how '
      + 'the surgeon, the scrub nurse, pharmacy and the theatre coordinator learn that the '
      + 'patient has been seen, what plan was agreed, and what still has to be sorted before '
      + 'morning. A review that exists only in the ward notes reaches none of them, and a '
      + 'review done on the morning of surgery finds the problems too late to act on: the '
      + 'case is either delayed on the table or done without the optimisation it needed.',
    graceMinutes: 0,
    where: 'Dashboard → Pre-op Reviews',
    subordinates: 'the residents and registrars working with you',
    whyShort:
      'Until the review is on the ORM, the rest of the team is preparing a case nobody '
      + 'has confirmed is fit.',
    ask:
      'Dashboard → Pre-op Reviews: open the case, complete it and press Submit — the '
      + 'day before surgery, under the login of whoever saw the patient.',
    roles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'],
    rosterCategory: 'ANAESTHETISTS',
    delegation: {
      appeal:
        'Most of these patients are seen by the residents working with you, and that is '
        + 'exactly as it should be — nobody is asking a consultant to review every patient '
        + 'personally. What we are asking for is narrower: that the doctor who saw the '
        + 'patient enters the review on the ORM the same day, and that you ask your '
        + 'residents for it the way you would ask for the case notes. One question on the '
        + 'round — “is it on the ORM?” — is what closes this gap.',
      short:
        'Most of these are seen by your residents. Please ask them to enter the review '
        + 'on the ORM the same day — whoever saw the patient enters it under their own '
        + 'login.',
      attribution:
        'These are the cases the ORM holds against your name. Where a resident saw the '
        + 'patient and entered the review under their own login, it counts to them and not '
        + 'to you — so a figure like this usually means the review was never entered by '
        + 'anybody, rather than that the patient was never seen.',
    },
    steps: [
      'Open Dashboard → Pre-op Reviews. The cases assigned to you, and to the '
      + 'residents working with you, are listed with the soonest first.',
      'See the patient — or have the resident see the patient — before the end '
      + 'of the day before surgery.',
      'Whoever saw the patient enters the review on that screen, under their '
      + 'own login, on the same day, and presses Submit. A review left as a '
      + 'draft has not reached theatre and is counted as not done.',
      'Ask your residents for it on the round. The entry is what tells the '
      + 'surgeon, the nurses and pharmacy that the patient is reviewed and what '
      + 'was agreed — until it is in, the rest of the team is preparing a case '
      + 'nobody has confirmed is fit.',
      'If a case cannot be taken, hand it back on the same screen rather than '
      + 'leaving it. A handback in time is not held against anybody — it is '
      + 'how the case reaches somebody who can do it.',
    ],
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
    where: 'Dashboard → Pharmacy',
    subordinates: 'the pharmacy staff and interns on your shift',
    whyShort: 'Theatre cannot tell a packed trolley from one nobody has started.',
    ask:
      'Dashboard → Pharmacy → Pack Drugs: pack the night before and tick each medicine '
      + 'as packed.',
    roles: ['PHARMACIST', 'HEAD_OF_PHARMACY'],
    rosterCategory: 'PHARMACISTS',
    // The pharmacist who packs the trolley is the pharmacist who ticks it.
    delegation: null,
    steps: [
      'Open Dashboard → Pharmacy and read the prescriptions for the next '
      + 'day’s lists.',
      'Pack the drugs the night before — not on the morning of the list.',
      'Press Pack Drugs and tick each medicine as packed. Until that is done '
      + 'theatre cannot tell a packed trolley from one nobody has started.',
      'Where an item is out of stock, mark it Out of Stock and press '
      + '“List to buy” to print it for the patient to take out and purchase.',
      'When the patient returns with the medicines, press “Verify purchase”, '
      + 'check each one against the prescription and record it. A drug nobody '
      + 'checked is a drug of unknown origin on an anaesthetic trolley.',
    ],
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
    where: 'Dashboard → Consumable Packs',
    subordinates: 'the store staff working with you',
    whyShort: 'A pack drawn after the list has started is a case that cannot begin.',
    ask:
      'Dashboard → Consumable Packs: pack the day before and mark each item packed.',
    roles: ['CONSUMABLE_PACK_PROVIDER', 'THEATRE_STORE_KEEPER'],
    rosterCategory: null,
    delegation: null,
    steps: [
      'Open Dashboard → Consumable Packs. The next day’s cases are listed '
      + 'with everything each one needs.',
      'Draw and pack the consumables the day before the list.',
      'Mark each item packed on that screen, so theatre can see the pack is '
      + 'ready without sending somebody to look for it.',
      'Anything you cannot supply: mark it and say what is short. A surgeon who '
      + 'learns the evening before can change the plan; one who learns on the '
      + 'table cannot.',
    ],
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
    where: 'the red ACKNOWLEDGE banner on your dashboard, or Dashboard → '
      + 'Emergency Booking',
    subordinates: 'the nurses on your shift',
    whyShort:
      'Until somebody acknowledges, the surgeon is assuming cover that may not exist.',
    ask:
      'Press ACKNOWLEDGE on the red banner on your dashboard within 15 minutes — even '
      + 'while you are still arranging cover.',
    roles: ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'],
    rosterCategory: 'NURSES',
    delegation: null,
    steps: [
      'When an emergency alert arrives, open it from the red ACKNOWLEDGE banner '
      + 'at the top of your dashboard, or from Dashboard → Emergency Booking.',
      'Press ACKNOWLEDGE within 15 minutes — even while you are still arranging '
      + 'cover. The acknowledgement is only saying a named person has seen it.',
      'If you cannot take it, acknowledge it and say so, so it moves on to '
      + 'somebody who can. An alert left unanswered does not move anywhere.',
    ],
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
    where: 'the case → Timing (Dashboard → Theatre Operations)',
    subordinates: 'the nurses and anaesthetic technicians on your team',
    whyShort:
      'A time not entered on the day cannot be recovered, and the case becomes '
      + 'uncountable.',
    ask:
      'Dashboard → Theatre Operations → the case → Timing: enter the incision time and '
      + 'the end of procedure the same day.',
    roles: ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'ANAESTHETIC_TECHNICIAN'],
    rosterCategory: 'NURSES',
    delegation: null,
    steps: [
      'Open the case from Dashboard → Theatre Operations and choose Timing.',
      'Record the time of incision when the surgeon begins.',
      'Record the end of procedure when the operation finishes.',
      'Both must be in before the end of the day. One without the other records '
      + 'nothing — the pair is what makes the case countable, and a time not '
      + 'entered on the day cannot be recovered afterwards.',
    ],
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
