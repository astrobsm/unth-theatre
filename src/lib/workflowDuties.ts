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
        where: 'Theatre Operations, or WHO Checklists',
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
        where: 'PACU (Recovery)',
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
    id: 'booking-office',
    title: 'Booking Officer (Departmental Clerical Staff)',
    roles: ['BOOKING_OFFICER'],
    headline:
      'Booking is your work again. A surgeon who has to type is a surgeon not operating.',
    duties: [
      {
        task: 'Register the patient from the surgeon’s written form',
        when: 'On receiving the booking form',
        why:
          'Five fields only — name, folder number, age, sex and ward. Copy the folder number EXACTLY as written, spaces and all: 34 folder numbers in the register contain an inner space, and a number typed two ways becomes two patients, which is how a neurosurgical case sat outside theatre for thirteen hours.',
        where: 'Patients → Register patient',
        critical: true,
      },
      {
        task: 'Enter the booking — three sections',
        when: 'Immediately after registering',
        why:
          'Patient, surgery, team. Nothing else is required and nothing blocks you. When you save the third section the case is on the theatre list and preparation begins.',
        where: 'Surgeries → Book a case',
        critical: true,
      },
      {
        task: 'Check the confirmation before you put the form down',
        when: 'At the moment of booking',
        why:
          'A case is booked only when the confirmation appears. If it does not, do NOT enter it again — repeated attempts after a silent failure produced 28 duplicate cases in one month. Report it instead.',
        critical: true,
      },
      {
        task: 'Return the form to the surgeon with the two patient codes',
        when: 'After booking',
        why:
          'The consumable pack code and the pharmacy code are what the patient presents to collect their items. They are generated at booking and are of no use sitting on your screen.',
      },
      {
        task: 'Tell the unit which cases still have no consent on record',
        when: 'The afternoon before the list',
        why:
          'Consent no longer blocks a booking, but the holding area will not receive a patient without it in the morning. A case flagged the day before is a consent obtained on the ward; the same case flagged at 8am is a list that does not start.',
        where: 'Surgeries → the outstanding marker on the case',
        critical: true,
      },
      {
        task: 'Report anything that will not work, once',
        when: 'As it happens',
        why:
          'With a screenshot, to 0803 332 8385. Every fault fixed this month was found because somebody described it. Reporting it once is enough — re-submitting the case is what creates duplicates.',
      },
    ],
    remember:
      'Copy the folder number exactly. Wait for the confirmation. Never enter the same case twice.',
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
        where: 'Theatre Reception',
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
    // ORM has no ward-nurse role — ward staff work from the call-up printout
    // rather than from an account. The sheet still matters, because the hour
    // before theatre is theirs, so it is printed FOR them rather than matched
    // to a login. (An earlier version listed 'NURSE' and 'WARD_NURSE' here;
    // neither exists in UserRole, so it silently matched nobody.)
    roles: [],
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

  // ---------------------------------------------------------------------
  {
    id: 'holding-area',
    title: 'Holding Area Nurse',
    // The holding area is manned by whoever is rostered to it — in ORM that is
    // a scrub nurse. Kept as its own sheet rather than folded into the scrub
    // sheet because the duties are genuinely different work.
    roles: ['SCRUB_NURSE'],
    headline:
      'You are the last check before the theatre door, and the last person who can stop a case going wrong cheaply.',
    duties: [
      {
        task: 'Record the patient as arrived in the holding area',
        when: 'On arrival',
        why: 'It closes the transport leg and tells the theatre the patient is in the building. Without it, time spent waiting here is counted against the theatre.',
        where: 'Holding Area',
        critical: true,
      },
      {
        task: 'Verify identity, side, site, consent and fasting',
        when: 'Before the patient goes through',
        why: 'This is the last point at which a wrong-site or unconsented case can be stopped without it becoming an incident.',
        where: 'Holding Area',
        critical: true,
      },
      {
        task: 'Transcribe the porter times and the ward nurse signature',
        when: 'From the call-up printout, on arrival',
        why: 'Those handwritten times are the only record of what happened on the ward. Untranscribed, they are lost the moment the paper is.',
        where: 'Holding Area',
        critical: true,
      },
      {
        task: 'Say immediately if a patient is not fit to proceed',
        when: 'As soon as you know',
        why: 'A case stopped here costs one slot. The same case stopped in the room costs the rest of the list.',
      },
    ],
    remember: 'Nothing goes through this door unverified. You are the last check there is.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'house-officer',
    title: 'House Officer',
    roles: ['HOUSE_OFFICER'],
    headline:
      'Most of what turns a patient back at the theatre door is paperwork that was yours to finish.',
    duties: [
      {
        task: 'Complete consent before the day of surgery',
        when: 'At least the day before',
        why: 'Unsigned consent is the commonest reason a patient is sent back from the holding area, and it cannot be fixed at 08:00.',
        critical: true,
      },
      {
        task: 'Enter the haemoglobin with the time the sample was taken',
        when: 'When the result comes back',
        why: 'The sample must be within 48 hours of surgery. The booking form enforces it, so a missing or stale value blocks the case.',
        where: 'Surgeries → the booking',
        critical: true,
      },
      {
        task: 'Record the bleeding-risk and nutrition assessments',
        when: 'At booking',
        why: 'Both are compulsory before a case can proceed, and your consultant sees exactly which of their cases are still missing them.',
        where: 'Surgeries',
      },
      {
        task: 'Raise the blood request in good time',
        when: 'As soon as the case is booked',
        why: 'Cross-matching takes hours the morning of surgery does not have.',
        where: 'Blood Bank',
      },
      {
        task: 'Chase outstanding investigations the day before, not on the day',
        when: 'The evening before the list',
        why: 'A result found missing at 08:00 is a lost slot; found the night before it is a phone call.',
        where: 'Surgeries → the booking',
      },
    ],
    remember: 'Everything you finish the day before is a case that starts on time.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'anaesthetic-technician',
    title: 'Anaesthetic Technician',
    roles: ['ANAESTHETIC_TECHNICIAN'],
    headline:
      'A machine that was never checked is found out at induction, with the patient already asleep.',
    duties: [
      {
        task: 'Complete the anaesthesia machine check',
        when: 'Before the first case of the day',
        why: 'It is the record that the machine was safe. An unchecked machine cannot be defended after an incident.',
        where: 'Anesthesia Setup',
        critical: true,
      },
      {
        task: 'Confirm drugs and airway equipment for each case',
        when: 'Before each case',
        why: 'The anaesthetist assumes it is in the room. Finding otherwise at induction stops the list with a patient on the table.',
        where: 'Anesthesia Setup',
        critical: true,
      },
      {
        task: 'Report faulty equipment the moment you find it',
        when: 'Immediately',
        why: 'A reported fault reaches biomedical engineering and the theatre board at once. An unreported one is discovered by the next team.',
        where: 'Fault Alerts',
        critical: true,
      },
      {
        task: 'Record the reason for any equipment-related delay',
        when: 'Before 45 minutes',
        why: 'Equipment is a delay category of its own. Recorded, it accumulates into the case for replacement; unrecorded, the theatre carries the blame.',
        where: 'Theatre Operations → record a delay',
      },
      {
        task: 'Check in for your assigned cases',
        when: 'Before the list',
        why: 'You are on the team roster, and the coordinator can only see who has answered.',
        where: 'Theatre Operations → Team Check-in',
      },
    ],
    remember: 'The machine check is the only proof the machine was safe.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'pharmacy',
    title: 'Pharmacy',
    roles: ['PHARMACIST'],
    headline: 'A pack that is not ready is a case that does not start.',
    duties: [
      {
        task: 'Dispense against the code the patient presents',
        when: 'On presentation',
        why: 'The code ties the drugs to the case. Dispensing without it leaves the case unbilled and the stock unaccounted for.',
        where: 'Pharmacy',
        critical: true,
      },
      {
        task: 'Flag anything out of stock immediately',
        when: 'As soon as you know',
        why: 'A substitution decided in theatre wastes the list. Flagged early, the anaesthetist simply prescribes an alternative.',
        critical: true,
      },
      {
        task: 'Keep the controlled drug register current',
        when: 'At every issue',
        why: 'It is a statutory record, and the register report is generated from exactly what you enter.',
        where: 'Pharmacy',
        critical: true,
      },
      {
        task: 'Record returns of unused drugs',
        when: 'After the case',
        why: 'Drugs never returned stay charged to the patient and outstanding against the case.',
      },
    ],
    remember: 'No pack without a code, and no issue without a register entry.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'blood-bank',
    title: 'Blood Bank',
    roles: ['BLOODBANK_STAFF'],
    headline: 'The theatre plans around your answer. Silence reads as blood being ready.',
    duties: [
      {
        task: 'Acknowledge every blood request',
        when: 'On receipt',
        why: 'Until you do, the surgeon cannot tell an unread request from a fulfilled one — and they look identical from the theatre.',
        where: 'Blood Bank',
        critical: true,
      },
      {
        task: 'Record cross-match completion',
        when: 'When it is done',
        why: 'The readiness board reads this. A case is not ready until the units are recorded as ready.',
        where: 'Blood Bank',
        critical: true,
      },
      {
        task: 'Say so immediately when units are unavailable',
        when: 'As soon as you know',
        why: 'A case that discovers this at knife-to-skin is an emergency of its own making.',
        critical: true,
      },
      {
        task: 'Answer emergency call-outs',
        when: 'When an emergency is booked',
        why: 'The response board shows you as awaited until you reply.',
        where: 'Theatre Operations → Team Check-in',
      },
    ],
    remember: 'An unanswered request is read as blood ready. Say no early if the answer is no.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'laboratory',
    title: 'Laboratory',
    roles: ['LABORATORY_STAFF', 'EMERGENCY_LAB_SCIENTIST'],
    headline: 'A result nobody can see has not been delivered.',
    duties: [
      {
        task: 'Enter results into the system, not only onto paper',
        when: 'As soon as they are available',
        why: 'The booking form and the readiness checks read the entered value. A paper result, however correct, cannot unblock a case.',
        where: 'Emergency Lab Workup',
        critical: true,
      },
      {
        task: 'Treat an emergency workup as an emergency',
        when: 'On receipt',
        why: 'Emergency requests are timed from the moment they were raised, and the delay is attributed to where it actually occurred.',
        where: 'Emergency Lab Workup',
        critical: true,
      },
      {
        task: 'Flag a sample you cannot process',
        when: 'Immediately',
        why: 'A theatre waiting on a result that will never arrive is the most avoidable delay there is.',
        critical: true,
      },
    ],
    remember: 'Enter it, or as far as the theatre is concerned it does not exist.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'cssd',
    title: 'CSSD',
    roles: ['CSSD_STAFF', 'CSSD_SUPERVISOR'],
    headline: 'Instruments are among the commonest causes of a late start anywhere in this hospital.',
    duties: [
      {
        task: 'Record every sterilisation cycle',
        when: 'At each cycle',
        why: 'It is the evidence a set was processed, and it is the first thing an accreditation visit asks to see.',
        where: 'CSSD',
        critical: true,
      },
      {
        task: 'Update set availability as sets go out and come back',
        when: 'At issue and at return',
        why: 'The list is planned from what the system says is available. A set recorded as available but sitting in the washer stops a case.',
        where: 'CSSD',
        critical: true,
      },
      {
        task: 'Confirm CSSD readiness for the day list',
        when: 'Before the list starts',
        why: 'It tells the theatre the sets they need exist and are sterile — before the patient has been sent for.',
        where: 'CSSD',
        critical: true,
      },
      {
        task: 'Report a set that fails or comes back incomplete',
        when: 'Immediately',
        why: 'A missing instrument found on the trolley is a recorded delay. Found here, it is a swap nobody notices.',
      },
    ],
    remember: 'The list is planned from what you record as available. Keep it true.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'oxygen',
    title: 'Oxygen Unit',
    roles: ['OXYGEN_UNIT_SUPERVISOR'],
    headline: 'Nobody notices oxygen until it is not there, and by then a patient is on the table.',
    duties: [
      {
        task: 'Record cylinder and plant levels',
        when: 'Daily',
        why: 'The readiness board reads this. An unrecorded level is treated as unknown, and a theatre cannot plan around unknown.',
        where: 'Oxygen Control',
        critical: true,
      },
      {
        task: 'Raise the alert while a level is falling, not once it is critical',
        when: 'As soon as it trends low',
        why: 'Replacement takes hours. An alert raised at critical is already too late to act on.',
        where: 'Oxygen Control',
        critical: true,
      },
      {
        task: 'Confirm supply to each theatre before the list',
        when: 'Each morning',
        why: 'A theatre with confirmed supply is a theatre that can start.',
        where: 'Oxygen Control',
      },
    ],
    remember: 'Record the level every day. An unrecorded level is an unknown one.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'power-house',
    title: 'Power House',
    roles: ['POWER_PLANT_OPERATOR'],
    headline: 'A theatre will not start a case it is not sure it can finish.',
    duties: [
      {
        task: 'Record power status and the source in use',
        when: 'At each changeover, and each shift',
        why: 'The theatre readiness board reads this before a list is released.',
        where: 'Power House',
        critical: true,
      },
      {
        task: 'Record fuel level and consumption',
        when: 'Daily',
        why: 'Fuel that runs out mid-case is a preventable emergency, and recorded consumption is what justifies the next order.',
        where: 'Power House',
        critical: true,
      },
      {
        task: 'Confirm generator readiness before each list',
        when: 'Each morning',
        why: 'A generator nobody has checked is a generator nobody can rely on.',
        where: 'Power House',
        critical: true,
      },
      {
        task: 'Log maintenance as it is done',
        when: 'At each service',
        why: 'It is the record that the plant was maintained, and it schedules the next service.',
        where: 'Power House',
      },
    ],
    remember: 'Theatres release their lists from what you record. Record it before the list, not after.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'water-plumbing',
    title: 'Water Supply & Plumbing',
    roles: ['PLUMBER', 'PLUMBING_SUPERVISOR', 'WATER_SUPPLY_SUPERVISOR'],
    headline: 'No water means no scrubbing, and no scrubbing means no operating.',
    duties: [
      {
        task: 'Record water availability for each theatre',
        when: 'Daily, before the list',
        why: 'It is part of theatre readiness. A theatre without confirmed water is not ready, however clean the room is.',
        where: 'Plumbing & Water',
        critical: true,
      },
      {
        task: 'Log every reported fault and act on it',
        when: 'On report',
        why: 'One scrub sink out of action takes a whole theatre with it. The log is how it gets prioritised over everything else.',
        where: 'Plumbing & Water',
        critical: true,
      },
      {
        task: 'Confirm when a fault has been cleared',
        when: 'On completion',
        why: 'Until it is confirmed cleared, the theatre stays marked unready and the slot stays unused.',
        critical: true,
      },
    ],
    remember: 'Confirm the fix, not only the fault. An uncleared fault keeps a theatre shut.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'engineering',
    title: 'Biomedical Engineering & Works',
    roles: ['BIOMEDICAL_ENGINEER', 'WORKS_SUPERVISOR'],
    headline: 'Equipment that is broken and unrecorded gets discovered by a surgeon, mid-case.',
    duties: [
      {
        task: 'Acknowledge fault reports',
        when: 'On receipt',
        why: 'The person who reported it cannot tell an unseen report from an unfixable one. Acknowledging closes that gap.',
        where: 'Fault Alerts',
        critical: true,
      },
      {
        task: 'Update equipment status whenever it changes',
        when: 'At each change',
        why: 'The theatre plans from equipment status. A machine marked operational while it sits in your workshop stops a case.',
        where: 'Fault Alerts',
        critical: true,
      },
      {
        task: 'Record preventive maintenance',
        when: 'At each service',
        why: 'It is the record that the device was maintained, and it schedules the next one.',
        where: 'Fault Alerts',
      },
      {
        task: 'Answer emergency call-outs for theatre equipment',
        when: 'When called',
        why: 'A theatre stopped by equipment is measured from the moment it stopped, not from when you were told.',
        where: 'Theatre Operations → Team Check-in',
      },
    ],
    remember: 'Status is what the theatre trusts. Change it the moment reality changes.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'laundry-scrubs',
    title: 'Laundry & Scrub Care',
    roles: ['LAUNDRY_STAFF', 'LAUNDRY_SUPERVISOR', 'SCRUB_CARE_PROVIDER'],
    headline: 'A theatre without clean linen is a theatre that cannot open.',
    duties: [
      {
        task: 'Record linen issued and returned, per theatre',
        when: 'At each exchange',
        why: 'It is how a shortage becomes visible before it stops a list rather than after.',
        where: 'Laundry',
        critical: true,
      },
      {
        task: 'Record scrub issue and return against the staff member',
        when: 'At issue and at return',
        why: 'Unreturned scrubs are the commonest reason there are none left for the afternoon and night lists.',
        where: 'Scrub Management',
        critical: true,
      },
      {
        task: 'Flag a shortage before the next list, not during it',
        when: 'As soon as stock runs low',
        why: 'Linen takes a full cycle to turn round, so a shortage flagged on the day cannot be solved on the day.',
      },
    ],
    remember: 'Record the return, not only the issue. What is missing is what matters.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'procurement',
    title: 'Procurement',
    roles: ['PROCUREMENT_OFFICER'],
    headline: 'A stock-out on the day is a cancelled case, and it was visible weeks earlier.',
    duties: [
      {
        task: 'Work the reorder list every week',
        when: 'Weekly',
        why: 'The Inventory Desk shows exactly what is at or below its reorder level. Nothing on that list should ever be a surprise.',
        where: 'Inventory Desk',
        critical: true,
      },
      {
        task: 'Keep vendor records and bank details current',
        when: 'On any change',
        why: 'Settlement pays what the record says. A stale account number is a payment that silently fails.',
        where: 'Vendor Accounts',
        critical: true,
      },
      {
        task: 'Record what was received against what was ordered',
        when: 'On delivery',
        why: 'A short delivery that is not recorded becomes stock the system believes exists — until a case needs it.',
        where: 'Theatre Supply Unit',
        critical: true,
      },
      {
        task: 'Review consignment stock held',
        when: 'Monthly',
        why: 'Consignment stock belongs to the vendor until it is used. Expired consignment is a commercial conversation, and it starts with knowing.',
        where: 'Vendor Accounts',
      },
    ],
    remember: 'Everything on the reorder list was predictable. Nothing on it should reach zero.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'catering',
    title: 'Theatre Cafeteria',
    roles: ['THEATRE_CAFETERIA_MANAGER'],
    headline: 'A team that has not eaten is a team still working, badly, past its limit.',
    duties: [
      {
        task: 'Read the day list and the duty roster',
        when: 'Each morning',
        why: 'Numbers come from who is actually rostered, not from an average day.',
        where: 'Duty Roster',
      },
      {
        task: 'Record meals provided per theatre and shift',
        when: 'At each service',
        why: 'It is the record behind both the cost and the next order. Nothing else in the system knows a meal was served.',
        where: 'Theatre Meals',
        critical: true,
      },
      {
        task: 'Account for the night and call teams',
        when: 'Daily',
        why: 'The call team is the one most often missed and the one least able to leave the floor to find food.',
        where: 'Duty Roster',
      },
    ],
    remember: 'Cook for the roster, not for the average day.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'theatre-management',
    title: 'Theatre Manager & Chairman',
    roles: ['THEATRE_MANAGER', 'THEATRE_CHAIRMAN'],
    headline:
      'Your job here is to make sure the record is being kept, because everything else you are shown is built out of it.',
    duties: [
      {
        task: 'Check record completeness before reading any figure',
        when: 'Weekly',
        why: 'A dashboard built on unrecorded milestones is not conservative, it is wrong. That is why completeness is shown as a headline figure.',
        where: 'Theatre Performance',
        critical: true,
      },
      {
        task: 'Clear the unexplained-delay queue',
        when: 'Weekly',
        why: 'A flag nobody ever reviews teaches the whole theatre that flags do not matter.',
        where: 'Theatre QA Review',
        critical: true,
      },
      {
        task: 'Act on the bottleneck report, not on individuals',
        when: 'Monthly',
        why: 'The reports break down by theatre, department and cause, and deliberately never by person. Fix the cause.',
        where: 'Theatre Performance',
      },
      {
        task: 'Close cases that finished but were never recorded as finished',
        when: 'Weekly',
        why: 'Cases left open accumulate on the emergency board and on every live list until somebody closes them.',
        critical: true,
      },
    ],
    remember: 'If completeness is low, nothing else on the dashboard means anything.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'executive',
    title: 'CMD, CMAC & DC-MAC',
    roles: ['CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC'],
    headline: 'The figures are only ever as honest as the recording underneath them.',
    duties: [
      {
        task: 'Read record completeness first, before any performance figure',
        when: 'At every review',
        why: 'A theatre that records nothing shows no delays at all. Completeness tells you whether the rest is worth reading.',
        where: 'Theatre Performance',
        critical: true,
      },
      {
        task: 'Sit the quality assurance review',
        when: 'As scheduled',
        why: 'Only a person can judge whether a delay was avoidable, and only with written reasoning. The software will never make that call.',
        where: 'Theatre QA Review',
        critical: true,
      },
      {
        task: 'Use the department breakdown to direct resources',
        when: 'Monthly',
        why: 'Delays are attributed to causes and departments, never to individuals. That is precisely what makes the data safe to act on.',
        where: 'Theatre Performance',
      },
    ],
    remember: 'No figure here is about a person. Fix the system that produced it.',
  },

  // ---------------------------------------------------------------------
  {
    id: 'system-admin',
    title: 'System Administrator',
    roles: ['ADMIN', 'SYSTEM_ADMINISTRATOR'],
    headline: 'Most things staff say they cannot do turn out to be something that was never set up.',
    duties: [
      {
        task: 'Approve or reject registrations promptly',
        when: 'Daily',
        why: 'A pending account cannot record anything, and the person gives up and goes back to paper.',
        where: 'User Management',
        critical: true,
      },
      {
        task: 'Clear duplicate and unused registrations',
        when: 'Monthly',
        why: 'Duplicates split one person history across two accounts and make the roster ambiguous.',
        where: 'User Management',
      },
      {
        task: 'Keep the duty roster loaded',
        when: 'Weekly',
        why: 'On-call lookups, emergency team assembly and catering numbers all read the roster. An empty roster degrades all three silently.',
        where: 'Duty Roster',
        critical: true,
      },
      {
        task: 'Check that the scheduled jobs are still running',
        when: 'Weekly',
        why: 'Pre-operative alerts and delay detection run unattended. When they stop, nothing fails visibly — they simply go quiet.',
        critical: true,
      },
      {
        task: 'Print and hand out these duty sheets',
        when: 'On induction, and whenever a workflow changes',
        why: 'Every group needs to know which taps are theirs. That is the entire reason this exists.',
        where: 'Duty Flyers',
      },
    ],
    remember: 'When a scheduled job stops, nothing breaks visibly. Check the quiet things.',
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
