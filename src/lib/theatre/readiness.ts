// ============================================================
// "Is this theatre ready?" — as a list of ticks, not a form
// ------------------------------------------------------------
// Two people make a theatre ready and they check different things. The scrub
// nurse answers for the sterile field, the instruments and the consumables;
// the theatre technician answers for the anaesthetic machine, the gases, the
// monitors and the airway. Neither can answer for the other, so each gets a
// list of their own and each announcement carries the name of whoever ticked
// it.
//
// WHY THE LIST LIVES HERE AND NOT IN A TABLE. It changes when practice changes
// — after an incident, after an audit, when a new machine arrives — and that
// should be a one-line edit a test can check, not a data migration plus a
// screen for editing checklists that nobody will ever open.
//
// WHY EACH RECORD STORES THE VERSION IT WAS TICKED AGAINST. A confirmation is
// a clinical claim made on a particular day against a particular list. If this
// file is edited next month, last month's record must still say what was
// actually confirmed — not what the current list happens to contain.
//
// These lists are ordinary theatre preparation written down. They are a
// starting point for the theatre to adjust, not a standard this system is
// imposing: nothing here decides clinical practice, it records what the person
// standing in the room says is true.
// ============================================================

export type ReadinessRole = 'SCRUB_NURSE' | 'THEATRE_TECHNICIAN';

export interface ReadinessCheck {
  /** Stable. It is written into every stored record and must never be reused. */
  id: string;
  /** What the person is confirming, in the words they would use. */
  label: string;
  /** Shown under the label where the tick needs qualifying. */
  hint?: string;
  /**
   * A theatre is not ready without it. An optional check is worth recording
   * and worth seeing missing, but it does not hold up a list on its own.
   */
  required: boolean;
}

export interface ReadinessList {
  role: ReadinessRole;
  /** For the heading, and for the radio. */
  who: string;
  /** Bumped whenever the checks below change. Stored with every record. */
  version: number;
  checks: ReadinessCheck[];
}

/**
 * The scrub nurse's list.
 *
 * The sterile field, what is on the trolley, and whether the room can receive
 * a patient. Deliberately short: a list long enough to be tedious is a list
 * that gets ticked straight down without being read, which is worse than no
 * list at all.
 */
export const SCRUB_NURSE_LIST: ReadinessList = {
  role: 'SCRUB_NURSE',
  who: 'Scrub nurse',
  version: 1,
  checks: [
    {
      id: 'instruments',
      label: 'Instrument set for this list is in the theatre',
      hint: 'The right set for the procedures booked today, not the one left from yesterday.',
      required: true,
    },
    {
      id: 'sterility',
      label: 'Packs checked — seals intact and indicators turned',
      hint: 'Anything with a broken seal or an unturned indicator goes back to CSSD.',
      required: true,
    },
    {
      id: 'consumables',
      label: 'Consumables and antiseptics are on the trolley',
      hint: 'Gauze, blades, sutures, gloves, gowns, spirit, povidone, savlon.',
      required: true,
    },
    {
      id: 'room',
      label: 'Theatre cleaned and the table is set',
      required: true,
    },
    {
      id: 'suction_diathermy',
      label: 'Suction and diathermy checked and working',
      hint: 'Including the plate and the leads.',
      required: true,
    },
    {
      id: 'radio',
      label: 'Radio signed out and on channel 7',
      hint: 'This is how the theatre is called when the patient is on the way.',
      required: true,
    },
    {
      id: 'present',
      label: 'I am in the theatre and ready to receive the patient',
      hint: 'This is what the announcement tells the surgical team.',
      required: true,
    },
    {
      id: 'shortfall',
      label: 'Something is short and I have already reported it',
      hint: 'Optional. Tick only if you have raised it — say what, in the note below.',
      required: false,
    },
  ],
};

/**
 * The theatre technician's list.
 *
 * The machine, the gases, the monitoring and the airway. An anaesthetic
 * machine check is itself a procedure with its own steps; this records that it
 * was done and that it passed, it does not replace it.
 */
export const THEATRE_TECHNICIAN_LIST: ReadinessList = {
  role: 'THEATRE_TECHNICIAN',
  who: 'Theatre technician',
  version: 1,
  checks: [
    {
      id: 'machine',
      label: 'Anaesthetic machine checked and passed',
      hint: 'The full machine check, done today, on this machine.',
      required: true,
    },
    {
      id: 'gases',
      label: 'Oxygen supply and reserve cylinder checked',
      hint: 'Pipeline pressure, and a cylinder with enough in it to fall back on.',
      required: true,
    },
    {
      id: 'suction',
      label: 'Suction at the head end working',
      required: true,
    },
    {
      id: 'monitors',
      label: 'Monitors on and reading',
      hint: 'Saturation, blood pressure, ECG and capnography.',
      required: true,
    },
    {
      id: 'airway',
      label: 'Airway trolley and difficult-airway kit present',
      required: true,
    },
    {
      id: 'drugs',
      label: 'Emergency drugs available and in date',
      hint: 'Confirming they are there. What is given is the anaesthetist’s decision.',
      required: true,
    },
    {
      id: 'radio',
      label: 'Radio signed out and on channel 7',
      required: true,
    },
    {
      id: 'present',
      label: 'I am in the theatre and ready',
      required: true,
    },
    {
      id: 'fault',
      label: 'Something is faulty and I have already reported it',
      hint: 'Optional. Tick only if you have raised it — say what, in the note below.',
      required: false,
    },
  ],
};

export const READINESS_LISTS: Record<ReadinessRole, ReadinessList> = {
  SCRUB_NURSE: SCRUB_NURSE_LIST,
  THEATRE_TECHNICIAN: THEATRE_TECHNICIAN_LIST,
};

export function listFor(role: string): ReadinessList | null {
  return READINESS_LISTS[role as ReadinessRole] ?? null;
}

/** Ticks as stored: check id → true. Absent means not ticked. */
export type Ticks = Record<string, boolean>;

export interface ReadinessProgress {
  /** Required checks still unticked, in list order. */
  outstanding: ReadinessCheck[];
  /** Required checks ticked. */
  done: number;
  /** Required checks in total. */
  total: number;
  /** Every required check is ticked. */
  complete: boolean;
}

/**
 * How far along a confirmation is.
 *
 * Unknown ids are ignored rather than counted. A record ticked against an
 * older version of the list may name checks that no longer exist, and a
 * checklist that reads 9 of 8 is a checklist nobody trusts again.
 */
export function progress(role: string, ticks: Ticks | null | undefined): ReadinessProgress {
  const list = listFor(role);
  if (!list) return { outstanding: [], done: 0, total: 0, complete: false };

  const required = list.checks.filter((c) => c.required);
  const outstanding = required.filter((c) => !ticks?.[c.id]);

  return {
    outstanding,
    done: required.length - outstanding.length,
    total: required.length,
    // An empty list is not "complete". It would announce a theatre ready on
    // the strength of having asked nothing.
    complete: required.length > 0 && outstanding.length === 0,
  };
}

/**
 * The words the radio says when a theatre is confirmed ready.
 *
 * Spoken three times, as the theatre asked, because it is heard once over a
 * running theatre and a message heard once is a message half-heard. The
 * repetition is inside the message rather than three separate announcements:
 * three rows can be interleaved with other traffic and arrive minutes apart,
 * which is not a repetition, it is three interruptions.
 *
 * The name is in it on purpose. "Theatre 3 is ready" is information; "Theatre
 * 3 is ready, confirmed by Sister Okeke" is somebody to ask.
 */
export function readinessAnnouncement(input: {
  theatreName: string;
  role: ReadinessRole | string;
  confirmedByName: string;
  /** Anything the person flagged as short or faulty, in their words. */
  note?: string | null;
}): { title: string; message: string } {
  const list = listFor(input.role);
  const who = list?.who ?? 'The theatre staff';
  const theatre = input.theatreName || 'The theatre';

  const line =
    input.role === 'THEATRE_TECHNICIAN'
      ? `Attention surgical team. Anaesthetic preparation in ${theatre} is complete.`
      : `Attention surgical team. ${theatre} is ready to receive patients for surgery.`;

  const note = (input.note ?? '').trim();

  const message = [
    line, line, line,
    `Confirmed by ${who} ${input.confirmedByName}.`,
    // Said out loud, because a shortfall announced alongside the readiness is
    // a shortfall somebody can still do something about before the patient is
    // on the table.
    note ? `Please note: ${note}.` : '',
  ].filter(Boolean).join(' ');

  return {
    title: input.role === 'THEATRE_TECHNICIAN'
      ? `${theatre} — anaesthetic preparation complete`
      : `${theatre} is ready for surgery`,
    message,
  };
}

/**
 * A theatre is open for business when BOTH sides have confirmed.
 *
 * Kept separate from either list because neither person can answer it. A nurse
 * standing in a ready room beside an unchecked anaesthetic machine has
 * confirmed everything she is able to confirm, and the theatre is still not
 * ready for a patient.
 */
export function theatreFullyReady(
  confirmations: Array<{ role: string; complete: boolean }>,
): boolean {
  const done = (role: ReadinessRole) =>
    confirmations.some((c) => c.role === role && c.complete);
  return done('SCRUB_NURSE') && done('THEATRE_TECHNICIAN');
}
