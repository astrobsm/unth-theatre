// ============================================================
// What each group has to record, and why
// ------------------------------------------------------------
// The problem this exists to solve: two patient movements recorded in a
// fortnight, across a hospital running full lists every day. Every figure the
// system produces — punctuality, turnover, utilisation, delay detection,
// whether a case can ever be closed — is built from timestamps that nobody was
// entering.
//
// It is not unwillingness. Nobody had been told, in one place, exactly which
// taps are theirs. So this is that list, per group, printable on one page and
// pinned where the work happens.
//
// Two rules held to throughout:
//
//   Every duty below is something the SOFTWARE ACTUALLY NEEDS. Nothing is
//   included because it would be nice to have. If a task is not read by a
//   screen, a report or the delay detector, it is not on the list — a flyer
//   that pads its list teaches people to skim it.
//
//   Every duty says WHY. "Record knife to skin" is an instruction; "record
//   knife to skin, because it is what decides whether the case counts as
//   started" is a reason. People follow reasons and forget instructions.
// ============================================================

export interface Duty {
  /** The action, in the imperative. Short enough to scan in a corridor. */
  task: string;
  /** When it is done. */
  when: string;
  /** What breaks if it is not done. This is the part that changes behaviour. */
  why: string;
  /** Where in the app. */
  where?: string;
  /** Without this, a whole measurement is impossible. */
  critical?: boolean;
}

export interface DutySheet {
  /** Stable key used in the URL and the file name. */
  id: string;
  /** How this group is named on the flyer. */
  title: string;
  /** Roles this sheet is written for. */
  roles: string[];
  /** One sentence naming the group's single most important contribution. */
  headline: string;
  duties: Duty[];
  /** Printed at the foot — the one thing to remember if nothing else. */
  remember: string;
}

export const DUTY_SHEETS: DutySheet[] = [
  // ---------------------------------------------------------------------
  {
    id: 'scrub-nurse',
    title: 'Scrub & Circulating Nurse',
    roles: ['SCRUB_NURSE'],
    headline:
      'You hold the clock for the whole case. Almost every figure the theatre reports comes from four taps you make.',
    duties: [
      {
        task: 'Record "In theatre" the moment the patient enters the room',
        when: 'As the patient comes through the door',
        why: 'This is the boundary between waiting and working. Without it nothing can say how long the patient waited or how long the room was occupied.',
        where: 'Theatre Operations → Record Milestones',
        critical: true,
      },
      {
        task: 'Record "Time-out" when the WHO checklist is completed',
        when: 'Immediately after the time-out',
        why: 'It is the evidence the checklist happened. An unrecorded time-out cannot be shown to an accreditation visit.',
        where: 'Record Milestones, or WHO Checklists',
      },
      {
        task: 'Record "Knife to skin"',
        when: 'At incision',
        why: 'This single timestamp decides whether the case counts as started. Everything about punctuality and delay depends on it, and the delay detector flags cases that have none.',
        where: 'Theatre Operations → Record Milestones',
        critical: true,
      },
      {
        task: 'Record "Surgery ended" and "Dressing done"',
        when: 'At closure',
        why: 'These give the operating time and start the turnover clock for the next patient.',
        where: 'Theatre Operations → Record Milestones',
        critical: true,
      },
      {
        task: 'Record what was actually used, returned or damaged',
        when: 'Before leaving the room',
        why: 'The patient is billed for what was used, never for what was returned or broken. Unrecorded items stay open against the case and cannot be reconciled later.',
        where: 'Theatre Supply Unit',
      },
      {
        task: 'Record the reason if the case starts late',
        when: 'As soon as you know, and before 45 minutes',
        why: 'A reason recorded in time prevents the case being flagged as unexplained. The flag is for silence, never for lateness — a theatre that explains itself is never penalised.',
        where: 'Theatre Operations → record a delay',
        critical: true,
      },
    ],
    remember:
      'If you record nothing else, record KNIFE TO SKIN. It is the one timestamp the whole system is built on.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'porter',
    title: 'Porter',
    roles: ['PORTER'],
    headline:
      'You are the only person who can say when the patient actually left the ward. Nobody else sees it.',
    duties: [
      {
        task: 'Record "Sent for" when you are dispatched to collect the patient',
        when: 'When you leave for the ward',
        why: 'This starts the transport clock. Without it, a delay caused by a long wait for transport looks like a theatre delay instead.',
        where: 'Theatre Operations → Record Milestones',
        critical: true,
      },
      {
        task: 'Record your arrival at the ward and your departure with the patient',
        when: 'At the ward',
        why: 'These two times separate "the porter was slow" from "the ward was not ready" — a distinction nobody can make afterwards from memory.',
        where: 'Call for Patient → ward entries',
        critical: true,
      },
      {
        task: 'Make sure the ward nurse signs the call-up printout',
        when: 'At handover',
        why: 'It is the record that the patient was handed over, by name. Without a signature there is no account of who released the patient.',
      },
      {
        task: 'Record "In holding" on arrival',
        when: 'On reaching the holding area',
        why: 'It tells the theatre the patient is in the building and closes the transport leg.',
        where: 'Theatre Operations → Record Milestones',
      },
      {
        task: 'Check in for your emergency cases',
        when: 'When an emergency call goes out',
        why: 'The coordinator can only see who is coming. Silence reads as nobody coming, and they will call somebody else.',
        where: 'Theatre Operations → Team Check-in',
      },
    ],
    remember:
      'Your times are the only proof of what happened between the ward and the theatre door.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'surgeon',
    title: 'Surgeon',
    roles: ['SURGEON', 'CONSULTANT_SURGEON'],
    headline:
      'What you enter at booking decides whether the case can run at all — and whether the theatre can plan around it.',
    duties: [
      {
        task: 'Give a real start time and a realistic duration at booking',
        when: 'At booking',
        why: 'The list is built from these. An optimistic duration does not make the day shorter; it makes the second case late and the third impossible.',
        where: 'Surgeries → new booking',
        critical: true,
      },
      {
        task: 'Complete consent, haemoglobin and the bleeding-risk assessment',
        when: 'Before the day',
        why: 'Any one missing stops the case at the door. My Practice lists exactly which are outstanding on your cases.',
        where: 'My Practice',
        critical: true,
      },
      {
        task: 'Pick the procedure from the list, not free text',
        when: 'At booking',
        why: 'The list drives packs, costing and reporting. If it is genuinely missing, add it once through "Other" and it is there for everyone.',
        where: 'Surgeries → new booking',
      },
      {
        task: 'Name your team on the booking',
        when: 'At booking',
        why: 'The 60-minute alert only reaches people named on the case with an account. A surgeon typed as free text is told nothing.',
        critical: true,
      },
      {
        task: 'Check in for your cases',
        when: 'The evening before, and on the morning',
        why: 'The coordinator needs to know you are coming. It also shows you who else has not answered while there is still time.',
        where: 'Theatre Operations → Team Check-in',
      },
      {
        task: 'Complete the post-operative note and complexity score',
        when: 'Before leaving theatre',
        why: 'It is the clinical record of what was done, and the only place complexity is captured.',
      },
    ],
    remember:
      'Book the time you will actually start, and name the people who will actually be there.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'anaesthetist',
    title: 'Anaesthetist',
    roles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'],
    headline:
      'Your induction time is the boundary between a patient waiting and a case under way.',
    duties: [
      {
        task: 'Record "Anaesthesia started" at induction',
        when: 'At induction',
        why: 'It separates theatre delay from anaesthetic time. Without it, time spent inducing is counted against the surgical start.',
        where: 'Theatre Operations → Record Milestones',
        critical: true,
      },
      {
        task: 'Complete the pre-operative review before the day',
        when: 'Before the list',
        why: 'An unreviewed patient is a cancellation waiting to happen, and the review is what the holding area checks.',
        where: 'Pre-op Reviews',
        critical: true,
      },
      {
        task: 'Prescribe anaesthetic drugs so pharmacy can pack',
        when: 'After review',
        why: 'Pharmacy packs from the prescription. No prescription, no drugs in the room.',
      },
      {
        task: 'Record the reason for any anaesthetic delay',
        when: 'Before 45 minutes',
        why: 'Anaesthetic causes are a category of their own. Recorded, they show a real pattern; unrecorded, the theatre carries the blame.',
        where: 'Theatre Operations → record a delay',
      },
      {
        task: 'Check in for your cases and for emergencies',
        when: 'Before the list, and when an emergency is called',
        why: 'You are a core role: the board shows a case as unable to start until an anaesthetist has answered.',
        where: 'Theatre Operations → Team Check-in',
        critical: true,
      },
    ],
    remember:
      'Record induction. It is the line between waiting and working, and only you can draw it.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'recovery-nurse',
    title: 'Recovery Nurse',
    roles: ['RECOVERY_ROOM_NURSE'],
    headline: 'You close the case. Until you do, it stays open on every board in the hospital.',
    duties: [
      {
        task: 'Record "To recovery" when the patient is handed over',
        when: 'At handover',
        why: 'This is what marks the case complete. Cases with no recovery time stay listed as in progress for weeks.',
        where: 'Theatre Operations → Record Milestones',
        critical: true,
      },
      {
        task: 'Complete the PACU assessment and Aldrete score',
        when: 'During recovery',
        why: 'It is the record that the patient was fit to leave, and the discharge decision rests on it.',
        where: 'PACU',
        critical: true,
      },
      {
        task: 'Record "Back to ward" on discharge from recovery',
        when: 'When the patient leaves',
        why: 'It completes the patient journey and frees the recovery bay on the board.',
      },
      {
        task: 'Take the nurse handover',
        when: 'At handover',
        why: 'It carries what the ward needs to know. A verbal handover leaves no record.',
        where: 'Nurse Handover',
      },
    ],
    remember: 'A case with no recovery time is never finished, however long ago it ended.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'theatre-store',
    title: 'Theatre Store & Consumable Pack Provider',
    roles: ['THEATRE_STORE_KEEPER', 'CONSUMABLE_PACK_PROVIDER'],
    headline: 'Stock the system cannot see is stock the theatre cannot rely on.',
    duties: [
      {
        task: 'Record every receipt with batch number and expiry date',
        when: 'On delivery',
        why: 'The expiry date drives which batch is issued first, the expiry report and the disposal list. A batch received without one is invisible to all three.',
        where: 'Theatre Supply Unit',
        critical: true,
      },
      {
        task: 'Issue against the case, never off the shelf',
        when: 'At issue',
        why: 'An issue not tied to a case cannot be billed and cannot be reconciled.',
        critical: true,
      },
      {
        task: 'Record returns and breakages separately',
        when: 'After the case',
        why: 'Returned stock is not billed. Damaged stock is not billed to the patient — the hospital carries it. Recording them together bills somebody for a breakage.',
        critical: true,
      },
      {
        task: 'Clear expired stock from the shelf',
        when: 'Weekly',
        why: 'Expired stock is never issued automatically, but it still occupies the shelf and the valuation until it is disposed of.',
        where: 'Inventory Desk',
      },
      {
        task: 'Order what the reorder list shows',
        when: 'Weekly',
        why: 'A stock-out on the day is a cancelled case. The desk shows what is at or below its reorder level.',
        where: 'Inventory Desk',
      },
    ],
    remember: 'Batch number and expiry on every receipt. Everything downstream depends on them.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'cleaner',
    title: 'Theatre Cleaner',
    roles: ['CLEANER'],
    headline: 'The turnover clock runs from the moment the last patient leaves until you are done.',
    duties: [
      {
        task: 'Answer the radio call for cleaning',
        when: 'When called',
        why: 'The call repeats until somebody acknowledges it. Answering stops it and tells the theatre you are coming.',
        critical: true,
      },
      {
        task: 'Mark cleaning started and completed',
        when: 'At each point',
        why: 'This is the turnover time. It is the difference between "the theatre was slow" and "the theatre waited twenty minutes for a cleaner".',
        where: 'Theatre Reception & Workflow',
        critical: true,
      },
      {
        task: 'Tell the holding area when the room is ready',
        when: 'When cleaning is complete',
        why: 'The next patient is not sent for until the room is declared ready.',
      },
    ],
    remember: 'Marking cleaning complete is what sends for the next patient.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'ward-nurse',
    title: 'Ward Nurse',
    roles: ['NURSE', 'WARD_NURSE'],
    headline: 'The hour before theatre is yours. Almost every late start begins on the ward.',
    duties: [
      {
        task: 'Act on the 60-minute alert',
        when: 'An hour before the case',
        why: 'The system tells you an hour ahead, by name and ward. That hour is what makes an on-time start possible.',
        critical: true,
      },
      {
        task: 'Confirm identity, consent, and the documentation',
        when: 'Before the porter arrives',
        why: 'A patient who reaches the holding area without signed consent is sent back, and the list slips for everybody behind them.',
        critical: true,
      },
      {
        task: 'Have the patient prepared and ready to move',
        when: 'Before the porter arrives',
        why: 'The porter waiting on the ward is the single commonest recorded cause of a late start.',
      },
      {
        task: 'Sign the call-up printout at handover',
        when: 'When the patient leaves',
        why: 'It is the record of who released the patient and when.',
      },
    ],
    remember: 'When the alert arrives, the clock has already started.',
  },
];

export const sheetById = (id: string): DutySheet | undefined =>
  DUTY_SHEETS.find((s) => s.id === id);

/** Sheets relevant to a role — what to offer somebody by default. */
export function sheetsForRole(role: string | null | undefined): DutySheet[] {
  if (!role) return [];
  return DUTY_SHEETS.filter((s) => s.roles.includes(role));
}

/** The duties without which a measurement is impossible. */
export const criticalCount = (sheet: DutySheet): number =>
  sheet.duties.filter((d) => d.critical).length;
