// ============================================================
// Hospital-wide ORM Awareness
// ------------------------------------------------------------
// Seven decks written for the restructuring of the theatre function, so that
// every member of staff can see their own part of the work and carry it out
// without being shown it twice.
//
// ONE STEP PER SLIDE, and every slide names WHO does it. A flow described as a
// paragraph is read by nobody; a flow described as "step four, the scrub nurse,
// here is the screen and here is what to press" is something a person can
// follow with the application open beside them.
//
// THE CONTENT IS TAKEN FROM THE SYSTEM, NOT INVENTED. Statuses, code formats,
// timings and messages here are the ones in the code — EmergencyBookingStatus,
// the CP/PH/AN code prefixes, the 24-hour Wi-Fi session, the 60-minute
// pre-operative alert, the 20-minute turnover. Where a step is hospital policy
// rather than software behaviour it is marked as such, because a slide that
// quietly mixes the two teaches people to distrust both.
//
// These decks are shown in the in-app Presentation module and are also the
// source for the PowerPoint files built by
// scripts/training/build-awareness-pptx.ts. One set of words, two places it can
// be read — a deck edited here changes both.
// ============================================================

import type { Deck, DeckSlide } from './presentations';

/** Alternating backgrounds, matching the existing decks. */
const bgFor = (i: number): DeckSlide['bg'] => {
  const cycle: DeckSlide['bg'][] = ['navy', 'green', 'skyblue'];
  return cycle[i % cycle.length];
};

function buildDeck(meta: Omit<Deck, 'slides'>, slides: Omit<DeckSlide, 'bg'>[]): Deck {
  return { ...meta, slides: slides.map((s, i) => ({ ...s, bg: bgFor(i) })) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. NETWORK ACCESS — the captive portal
// ─────────────────────────────────────────────────────────────────────────────
export const networkAccessDeck: Deck = buildDeck(
  {
    id: 'awareness-network-access',
    title: 'Getting On: Theatre Wi-Fi and Signing In',
    description:
      'How to join the theatre network through the captive portal and sign in to ORM — one identity for both.',
    audience: 'Every member of staff',
    icon: '📶',
    category: 'Overview',
  },
  [
    {
      title: 'Getting On',
      subtitle: 'The theatre network, and your ORM account',
      bullets: [
        'One username and one password for the Wi-Fi AND the application',
        'Works inside the theatre complex even when the hospital internet is down',
        'Takes about twenty seconds, once a day',
        'If you can read this slide, you already have an account',
      ],
      voiceOver:
        'This first deck covers the thing everybody does before anything else: joining the theatre network and signing in. You have one username and one password, and they work for both.',
    },
    {
      title: 'Step 1 — Connect to the theatre Wi-Fi',
      subtitle: 'Anyone with a phone, tablet or laptop',
      bullets: [
        'Open Wi-Fi settings and select the theatre network',
        'The network is protected — your phone will join, but you cannot use it yet',
        'Nothing has asked for your ORM details at this point',
        'This is normal: joining the radio and being allowed on are two steps',
      ],
      voiceOver:
        'Select the theatre network in your Wi-Fi settings. Your device will join the radio, but it cannot reach anything yet. That is expected — joining and being allowed on are two separate steps.',
    },
    {
      title: 'Step 2 — The sign-in page appears',
      subtitle: 'The captive portal',
      bullets: [
        'Most phones open it by themselves within a few seconds',
        'If it does not appear, open a browser and go to any page',
        'The page is titled "UNTH Theatre Wi-Fi"',
        'Do not dismiss it — until you sign in, nothing else will load',
      ],
      voiceOver:
        'A sign-in page appears automatically on most devices. If it does not, open your browser and visit any page; the portal will take over. The page is titled UNTH Theatre Wi-Fi.',
    },
    {
      title: 'Step 3 — Sign in with your ORM details',
      subtitle: 'The same details you use for the application',
      bullets: [
        'Username, or the phone number on your ORM profile',
        'Your ORM password',
        'There is no separate Wi-Fi password to remember or share',
        'Your password is never stored on the router',
      ],
      voiceOver:
        'Enter your ORM username — or the phone number on your profile — and your ORM password. There is no separate Wi-Fi password. Your password is checked against the theatre server and is never stored on the router.',
    },
    {
      title: 'Step 4 — You are on for the day',
      subtitle: 'Twenty-four hours from sign-in',
      bullets: [
        'A session lasts twenty-four hours, then the portal asks again',
        'Long enough for a full list plus the changeover either side',
        'Signing in again is the same twenty seconds',
        'Each device signs in separately — phone and tablet are two sessions',
      ],
      voiceOver:
        'Once accepted you are on for twenty-four hours — a full working day plus the changeover either side, so you are never challenged in the middle of a list. Each device signs in separately.',
    },
    {
      title: 'If it will not let you in',
      subtitle: 'What the message means',
      bullets: [
        '"No account found" — check the spelling, or try your username instead of your phone',
        '"Incorrect password" — the password itself is wrong; ask for a reset',
        '"Still awaiting approval" — your account exists but an administrator has not approved it',
        '"That temporary password has expired" — ask an administrator to send a new one',
      ],
      voiceOver:
        'The portal tells you which of four things is wrong: no account found, incorrect password, an account still awaiting approval, or a temporary password that has expired. Each has a different fix.',
    },
    {
      title: 'Forgotten your username or password?',
      subtitle: 'Administrator, Theatre Manager',
      bullets: [
        'An administrator can send both to your registered WhatsApp number',
        'User Management → find the person → Send login details',
        'You receive your username and a temporary password',
        'The temporary password lasts 48 hours and must be changed as you sign in',
      ],
      voiceOver:
        'If you have forgotten either, an administrator can send your username and a temporary password to your registered WhatsApp number. The temporary password lasts forty-eight hours and you will be asked to set your own as you sign in.',
    },
    {
      title: 'Why the network is separate',
      subtitle: 'For everybody',
      bullets: [
        'The theatre server runs inside the complex, on its own database',
        'When the hospital internet fails, ORM keeps working in theatre',
        'Records made during an outage sync to the cloud when the link returns',
        'This is why the Wi-Fi asks who you are: the same account, the same server',
      ],
      voiceOver:
        'The theatre server runs inside the complex on its own database, so when the hospital internet fails, ORM keeps working here. Work done during an outage syncs back when the link returns.',
    },
    {
      title: 'Signing in to ORM itself',
      subtitle: 'After the network lets you through',
      bullets: [
        'Open the ORM app or go to the theatre address in a browser',
        'Same username and password again',
        'What you can see is decided by your role — you will not see other people’s screens',
        'If a screen you need is missing, ask an administrator for that module',
      ],
      voiceOver:
        'Now open ORM itself and sign in with the same details. What you see is decided by your role. If a screen you need is missing, an administrator can grant you that module.',
    },
    {
      title: 'Two rules that matter',
      subtitle: 'For everybody, without exception',
      bullets: [
        'Never sign in as somebody else — every entry is recorded against the account that made it',
        'Never share your password, including with a colleague in a hurry',
        'A shared account makes an audit trail worthless and puts the sharer at risk',
        'If you need access you do not have, ask — it takes a minute to grant',
      ],
      voiceOver:
        'Two rules. Never sign in as somebody else, and never share your password. Every entry is recorded against the account that made it, and a shared account makes the record worthless — including as a defence of your own practice.',
    },
    {
      title: 'What you should be able to do now',
      subtitle: 'Check yourself',
      bullets: [
        'Join the theatre Wi-Fi and reach the sign-in page',
        'Sign in with your ORM username or phone number',
        'Recognise which of the four failure messages you are seeing',
        'Know who to ask for a reset, and how long a temporary password lasts',
      ],
      voiceOver:
        'By now you should be able to join the network, sign in, read the failure message if there is one, and know who to ask for a reset.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. THE EMERGENCY FLOW — landing at theatre to return to the ward
// ─────────────────────────────────────────────────────────────────────────────
export const emergencyFlowDeck: Deck = buildDeck(
  {
    id: 'awareness-emergency-flow',
    title: 'The Emergency Case, End to End',
    description:
      'Every step from the case landing at theatre to the patient going back to the ward, and who does each one.',
    audience: 'Surgeons, anaesthetists, nurses, porters, pharmacy, laboratory, blood bank',
    icon: '🚨',
    category: 'Booking',
  },
  [
    {
      title: 'The Emergency Case',
      subtitle: 'From the moment it lands, to the patient back on the ward',
      bullets: [
        'Sixteen steps, each owned by a named role',
        'Nothing here waits on a form being complete — an emergency is booked first',
        'The record catches up; the patient does not wait for it',
        'Follow this deck with ORM open beside you',
      ],
      voiceOver:
        'An emergency has sixteen steps from landing at theatre to the patient going back to the ward. Each one is owned by a named role. Nothing here waits on paperwork — the case is booked first and the record catches up.',
    },
    {
      title: 'Step 1 — Book the emergency',
      subtitle: 'Surgeon or House Officer · Sidebar → Emergency Booking',
      bullets: [
        'The patient does NOT have to be registered first — type the name and folder number',
        'Diagnosis, procedure, unit, indication: why this is an emergency',
        'Set "required by" — the time the operation must start',
        'Press Submit. The case now exists and is visible to the whole theatre',
      ],
      voiceOver:
        'Step one. The surgeon or house officer opens Emergency Booking. The patient does not have to be registered first — type the name and folder number. State the diagnosis, the procedure and why this is an emergency, then set the time by which the operation must start.',
    },
    {
      title: 'Step 2 — The theatre is told, automatically',
      subtitle: 'Nobody presses this',
      bullets: [
        'Alerts go out to the roles that must act: theatre, anaesthesia, pharmacy, blood bank, laboratory',
        'The case appears on the emergency board and on the theatre radio',
        'You do not need to telephone anybody to announce it',
        'The status is now SUBMITTED',
      ],
      voiceOver:
        'Step two happens on its own. Alerts go to every role that must act — theatre, anaesthesia, pharmacy, blood bank and laboratory — and the case appears on the emergency board. You do not need to ring round announcing it.',
    },
    {
      title: 'Step 3 — Who is reachable right now',
      subtitle: 'Theatre Manager, Coordinator · Emergency board',
      bullets: [
        'The board shows the availability each person last recorded',
        'Available and Busy are reachable; In Theatre and On Emergency Case are not',
        'Off Duty and On Leave are shown, so nobody is rung for nothing',
        'This is only as good as what staff have set — see the Staff Availability deck',
      ],
      voiceOver:
        'Step three. The board shows who is reachable, using the availability each person last recorded. Available and Busy are reachable; In Theatre and On Emergency Case are not. This is only as good as what staff keep up to date.',
    },
    {
      title: 'Step 4 — Approve the case',
      subtitle: 'Theatre Manager or Consultant on call',
      bullets: [
        'Approving records who accepted the case, and when',
        'Status moves SUBMITTED → APPROVED',
        'A rejection must carry a reason — it is part of the record',
        'Approval is about theatre capacity, not clinical judgement',
      ],
      voiceOver:
        'Step four. The theatre manager or consultant on call approves the case, which records who accepted it and when. A rejection must carry a reason. This decision is about theatre capacity, not clinical judgement.',
    },
    {
      title: 'Step 5 — Assign the theatre',
      subtitle: 'Theatre Manager · Status → THEATRE_ASSIGNED',
      bullets: [
        'Choose the room and the time',
        'If the room is busy, ORM shows you the whole day and what can be moved',
        'You can keep your time and push other cases back — it shows exactly which',
        'A case already in the holding area or on the table is never moved automatically',
      ],
      voiceOver:
        'Step five. Assign the room and the time. If the room is busy, ORM shows you the theatre’s whole day and what can be moved — including the option to keep your time and push the other cases back. A patient already sent for is never moved automatically.',
    },
    {
      title: 'Step 6 — Emergency pre-anaesthetic review',
      subtitle: 'Anaesthetist · Sidebar → Emergency Booking → Review',
      bullets: [
        'The short-form review: airway, ASA, last meal, allergies, comorbidities',
        'Record the fitness decision and any condition attached to it',
        'An unfit patient does not reach the theatre door — the holding area stops them',
        'Record what you would need to make them fit, not only that they are not',
      ],
      voiceOver:
        'Step six. The anaesthetist completes the emergency pre-anaesthetic review — airway, ASA grade, last meal, allergies, comorbidities — and records the fitness decision. An unfit patient is stopped at the holding area, so record what would be needed to make them fit.',
    },
    {
      title: 'Step 7 — The anaesthetist prescribes',
      subtitle: 'Anaesthetist · An AN- code is generated',
      bullets: [
        'Prescribe the anaesthetic drugs for the case',
        'ORM generates an Anaesthesia Drug code: AN-XXXXXX',
        'Give that code to whoever is collecting from pharmacy',
        'Pharmacy keys it in and sees exactly what was prescribed',
      ],
      voiceOver:
        'Step seven. The anaesthetist prescribes the anaesthetic drugs, and ORM generates an anaesthesia drug code beginning A N. Whoever collects from pharmacy carries that code, and pharmacy keys it in to see exactly what was prescribed.',
    },
    {
      title: 'Step 8 — Urgent laboratory work',
      subtitle: 'Laboratory Staff · Emergency Lab Workup',
      bullets: [
        'The requests are already on the laboratory screen — they were sent at booking',
        'Enter the results as they come, not at the end',
        'Every result is visible to the surgeon and anaesthetist the moment it is entered',
        'Nobody should be walking a result up to theatre on paper',
      ],
      voiceOver:
        'Step eight. The laboratory sees the requests on their own screen, sent at booking. Results are entered as they come and are visible to the surgeon and anaesthetist immediately. Nobody should be carrying a result up to theatre on paper.',
    },
    {
      title: 'Step 9 — Blood, if it is needed',
      subtitle: 'Blood Bank Staff',
      bullets: [
        'The request carries the group, the units and the urgency',
        'Blood bank sees it on the emergency board without being telephoned',
        'Record issue against the case, so the theatre knows it is ready',
        'An unanswered blood request is visible to the whole theatre — it cannot be lost',
      ],
      voiceOver:
        'Step nine. Where blood is needed the request carries the group, the units and the urgency, and the blood bank sees it without being telephoned. An unanswered request stays visible to the whole theatre.',
    },
    {
      title: 'Step 10 — Consumables and drugs are packed',
      subtitle: 'Consumable Pack Provider · Pharmacist',
      bullets: [
        'Two codes are generated at booking: CP- for the pack, PH- for the drugs',
        'The patient or relative carries the code to the provider',
        'The provider keys it in and sees exactly what was requested',
        'Covered in detail in the Pharmacy and Consumable Pack decks',
      ],
      voiceOver:
        'Step ten. Two codes are generated at booking — C P for the consumable pack and P H for the drugs. The patient or relative carries the code to the provider, who keys it in and sees exactly what was requested.',
    },
    {
      title: 'Step 11 — Call for the patient',
      subtitle: 'Scrub Nurse or Coordinator · Call for Patient',
      bullets: [
        'One press puts the call on the theatre radio and notifies the ward',
        'The porter sees the job on their own screen',
        'The call repeats every five minutes until it is acknowledged',
        'It retires itself once the patient has been moved',
      ],
      voiceOver:
        'Step eleven. One press calls for the patient: the theatre radio announces it, the ward is notified and the porter sees the job. The call repeats every five minutes until acknowledged, and retires itself once the patient has moved.',
    },
    {
      title: 'Step 12 — The porter moves the patient',
      subtitle: 'Porter · Patient Transport',
      bullets: [
        'Accept the job, then record collection from the ward',
        'Record arrival at the holding area',
        'These two timestamps are how delay is measured — not to blame anybody',
        'A movement not recorded is a movement nobody can account for later',
      ],
      voiceOver:
        'Step twelve. The porter accepts the job, records collection from the ward and arrival at the holding area. Those two timestamps are how delay is measured — and a movement not recorded is one nobody can account for afterwards.',
    },
    {
      title: 'Step 13 — The holding area check',
      subtitle: 'Holding Area Nurse',
      bullets: [
        'Identity, consent, site marking, fasting, allergies, notes and investigations',
        'Anything outstanding is flagged here, at the last point it can still be fixed',
        'A red alert stops the patient at the door and tells the theatre why',
        'This is the safety net for everything the earlier steps missed',
      ],
      voiceOver:
        'Step thirteen. The holding area nurse checks identity, consent, site marking, fasting, allergies, notes and investigations. Anything outstanding is flagged at the last point it can still be fixed, and a red alert stops the patient at the door.',
    },
    {
      title: 'Step 14 — Reception into theatre',
      subtitle: 'Scrub Nurse · Theatre Reception',
      bullets: [
        'Receive the patient from the holding area',
        'WHO Surgical Safety Checklist: sign in, time out, sign out',
        'Swab, instrument and needle counts before and after',
        'The case moves to IN_PROGRESS',
      ],
      voiceOver:
        'Step fourteen. The scrub nurse receives the patient, completes the WHO surgical safety checklist at sign in, time out and sign out, and records the swab, instrument and needle counts. The case moves to in progress.',
    },
    {
      title: 'Step 15 — The operation and the note',
      subtitle: 'Surgeon · Anaesthetist',
      bullets: [
        'The anaesthetist records the monitoring chart as the case runs',
        'Milestones are timestamped as they happen, not reconstructed afterwards',
        'The surgeon writes the operation note on the structured form',
        'The note carries the post-operative orders the ward will follow',
      ],
      voiceOver:
        'Step fifteen. The anaesthetist records the monitoring chart as the case runs and milestones are timestamped as they happen. The surgeon writes the operation note, which carries the post-operative orders the ward will follow.',
    },
    {
      title: 'Step 16 — Recovery, and back to the ward',
      subtitle: 'Recovery Room Nurse · Porter',
      bullets: [
        'PACU assessment, with the Aldrete score recorded at intervals',
        'Discharge from PACU opens the transfer page — it is not just a button',
        'ORM works out the escort level; a red alert requires a named nurse',
        'Choose the porter, print the transfer slip, and the patient goes back with it',
      ],
      voiceOver:
        'Step sixteen. The recovery nurse records the PACU assessment and Aldrete score. Discharging the patient opens the transfer page: ORM works out the escort level, a red alert requires a named nurse escort, and you choose the porter and print the transfer slip that goes back to the ward with the patient.',
    },
    {
      title: 'If the case runs late',
      subtitle: 'Nobody has to report this',
      bullets: [
        'Thirty minutes past the required-by time, a warning appears and notifications go out',
        'Forty-five minutes, with no reason recorded, and the case is flagged',
        'The flag goes to the audit committee, who decide what it means',
        'Recording the reason early is what stops it becoming a flag',
      ],
      voiceOver:
        'If the case runs late, nobody has to report it. At thirty minutes past the required time a warning goes out; at forty-five, with no reason recorded, the case is flagged to the audit committee. Recording the reason early is what stops it becoming a flag.',
    },
    {
      title: 'What you should be able to do now',
      subtitle: 'Check yourself',
      bullets: [
        'Book an emergency without the patient being registered first',
        'Know which step is yours, and what the next person is waiting for',
        'Read the emergency board and tell who is reachable',
        'Follow the case from the ward, through theatre, and back',
      ],
      voiceOver:
        'By now you should be able to book an emergency, know which step is yours and what the next person is waiting for, read the emergency board, and follow the case from the ward through theatre and back again.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. THE ELECTIVE FLOW
// ─────────────────────────────────────────────────────────────────────────────
export const electiveFlowDeck: Deck = buildDeck(
  {
    id: 'awareness-elective-flow',
    title: 'The Elective Case, End to End',
    description:
      'Registration to discharge from recovery, step by step, with the role that owns each step.',
    audience: 'Surgeons, house officers, nurses, anaesthetists, pharmacy, stores, porters',
    icon: '📅',
    category: 'Booking',
  },
  [
    {
      title: 'The Elective Case',
      subtitle: 'Registration to recovery, in order',
      bullets: [
        'The difference from an emergency is preparation, not urgency of care',
        'Most cancellations are decided days before the list, not on the morning',
        'Each step below closes one of the reasons cases get cancelled',
        'Fifteen steps, each owned by a named role',
      ],
      voiceOver:
        'The elective case differs from an emergency in preparation, not in the care given. Most cancellations are decided days before the list, and each step here closes one of the reasons.',
    },
    {
      title: 'Step 1 — Register the patient',
      subtitle: 'Booking Officer, House Officer · Patients → Register',
      bullets: [
        'Search first. Type the name or folder number before creating anything',
        'If the patient is already on file, ORM will tell you and offer that record',
        'Registering the same person twice splits their history in two',
        'Folder number typed differently is the commonest cause — check the warning',
      ],
      voiceOver:
        'Step one. Search before you register. If the patient is already on file ORM will show you the record and offer it. Registering somebody twice splits their history in two, and a folder number typed differently is the commonest cause.',
    },
    {
      title: 'Step 2 — Book the surgery',
      subtitle: 'Surgeon or House Officer · Surgeries → New Booking',
      bullets: [
        'Patient, procedure, indication, unit, date and time',
        'Say how long you expect the case to take — the list is built from it',
        'The theatre list can be opened from the form before you choose a time',
        'If the slot is taken, ORM shows the day and what can be moved',
      ],
      voiceOver:
        'Step two. Book the case: patient, procedure, indication, unit, date and time. Say honestly how long you expect it to take, because the whole list is built from that figure. You can look at the theatre list from inside the form before choosing.',
    },
    {
      title: 'If the theatre is busy at your time',
      subtitle: 'Surgeon · The dialog that opens on the booking form',
      bullets: [
        'You are shown the theatre’s whole day, not just told the slot is taken',
        'Keep your time and push the other cases back — it lists exactly which move',
        'Or take a free window, or use another theatre that is free at that hour',
        'You can also type new times straight into the list and save them',
        'A patient already in the holding area or on the table is never moved',
      ],
      voiceOver:
        'If the theatre is busy at the time you chose, you are shown the theatre’s whole day rather than simply told the slot is taken. You can keep your time and push the other cases back — it lists exactly which ones move and to when — or take a free window, or use another theatre. A patient already sent for is never moved.',
    },
    {
      title: 'Step 3 — The pre-operative requirements',
      subtitle: 'Surgeon · Recorded at booking',
      bullets: [
        'Haemoglobin within 48 hours, electrolytes, urea and creatinine',
        'Hepatitis B and C, HIV status',
        'Bleeding risk and nutritional status for every patient',
        'Pressure-sore risk for anyone over 45',
      ],
      voiceOver:
        'Step three. The pre-operative requirements are recorded at booking: a haemoglobin within forty-eight hours, electrolytes and creatinine, viral screening, bleeding and nutritional risk for everybody, and pressure-sore risk for anyone over forty-five.',
    },
    {
      title: 'Step 4 — Consent',
      subtitle: 'Surgeon · Attached to the case',
      bullets: [
        'Complete the structured consent form, or upload the signed paper',
        'Consent is checked again in the holding area',
        'An elective case cannot proceed without it',
        'What is outstanding is shown on the board until it is cleared',
      ],
      voiceOver:
        'Step four. Complete the consent form or upload the signed paper. Consent is checked again in the holding area, and what is outstanding stays on the board until it is cleared.',
    },
    {
      title: 'Step 5 — The codes are issued',
      subtitle: 'Given to the patient or relative',
      bullets: [
        'CP-XXXXXX — the consumable pack code',
        'PH-XXXXXX — the pharmacy drug code',
        'Write them down or print them for the patient',
        'The patient presents the code; the provider keys it in and sees the list',
      ],
      voiceOver:
        'Step five. Two codes are generated: C P for the consumable pack and P H for the pharmacy drugs. Give them to the patient or relative. The provider keys the code in and sees exactly what was requested.',
    },
    {
      title: 'Step 6 — The estimate and the deposit',
      subtitle: 'Booking Officer · Estimates',
      bullets: [
        'The estimate is itemised, and every line carries the price it was built from',
        'It does not change because a price changed afterwards',
        'The patient sees what they are paying for, line by line',
        'This is the defence against being charged for something unrecorded',
      ],
      voiceOver:
        'Step six. The estimate is itemised and every line keeps the price it was built from, so the document handed to a patient in August still reads the same in September. The patient can see exactly what they are paying for.',
    },
    {
      title: 'Step 7 — Investigations',
      subtitle: 'House Officer · Pre-operative Investigations',
      bullets: [
        'Record results against the case as they arrive',
        'Missing results show on the case-readiness board',
        'The anaesthetist reads them before the pre-operative visit',
        'A result in a file nobody can find is a result nobody has',
      ],
      voiceOver:
        'Step seven. Record investigation results against the case as they arrive. What is missing shows on the readiness board, and the anaesthetist reads what is there before the pre-operative visit.',
    },
    {
      title: 'Step 8 — The pre-operative visit',
      subtitle: 'Anaesthetist · Pre-Op Visit',
      bullets: [
        'The patient is seen on the ward before the day of surgery',
        'Fitness is recorded, with any optimisation the patient needs',
        'An unfit patient is identified days early, not on the morning',
        'Covered in full in the Anaesthesia Review deck',
      ],
      voiceOver:
        'Step eight. The anaesthetist sees the patient on the ward before the day of surgery and records fitness and any optimisation needed. This is where an unfit patient is identified days early rather than on the morning.',
    },
    {
      title: 'Step 9 — Theatre allocation',
      subtitle: 'Theatre Manager · Theatre Allocation',
      bullets: [
        'The room, the list order and the nursing team for the day',
        'Nurses allocated here appear on the booked case and on theatre readiness',
        'Twenty minutes sits between every pair of cases, by rule',
        'The allocation is what the morning runs on',
      ],
      voiceOver:
        'Step nine. The theatre manager allocates the room, the list order and the nursing team. Twenty minutes sits between every pair of cases for the patient to leave, the theatre to be cleaned and the next patient to come in.',
    },
    {
      title: 'Step 10 — One hour before',
      subtitle: 'Nobody presses this',
      bullets: [
        'Everyone assigned to the case is notified an hour ahead',
        'The ward is reminded: identity, consent, documentation, transfer',
        'The theatre radio calls for the patient by name and procedure',
        'It repeats every five minutes until somebody acknowledges it',
      ],
      voiceOver:
        'Step ten happens on its own. An hour before the case, everyone assigned is notified, the ward is reminded, and the theatre radio calls for the patient by name and procedure, repeating until acknowledged.',
    },
    {
      title: 'Step 11 — Team check-in',
      subtitle: 'Everybody assigned to the case',
      bullets: [
        'Say whether you are coming, before the case — not when you are missed',
        'The coordinator can see which theatres are short and act early',
        'Answering takes one press',
        'A case that is short of a team member is better known at seven than at nine',
      ],
      voiceOver:
        'Step eleven. Everybody assigned says whether they are coming. It takes one press, and it lets the coordinator see which theatres are short early enough to do something about it.',
    },
    {
      title: 'Step 12 — Call for the patient, and the move',
      subtitle: 'Scrub Nurse · Porter',
      bullets: [
        'The call goes to the ward, the radio and the porter together',
        'The porter records collection and arrival',
        'Both timestamps feed the delay figures',
        'Nobody needs to telephone the ward to chase',
      ],
      voiceOver:
        'Step twelve. The call goes to the ward, the radio and the porter together. The porter records collection and arrival, and both timestamps feed the delay figures.',
    },
    {
      title: 'Step 13 — Holding area and reception',
      subtitle: 'Holding Area Nurse · Scrub Nurse',
      bullets: [
        'The full holding-area check: identity, consent, marking, fasting, allergies',
        'Reception into theatre, then the WHO checklist at sign in, time out and sign out',
        'Swab, instrument and needle counts before and after',
        'The case moves to IN_PROGRESS',
      ],
      voiceOver:
        'Step thirteen. The holding area completes its checks, the scrub nurse receives the patient, and the WHO checklist and the counts are recorded. The case moves to in progress.',
    },
    {
      title: 'Step 14 — The operation note',
      subtitle: 'Surgeon · after the case',
      bullets: [
        'The form adapts to the operation — a graft asks about the donor site',
        'Findings stay in your own words; the orders are structured',
        'Position, feeding, mobilisation, VTE, escalation: what the ward will follow',
        'Signing produces the nursing summary the ward reads',
      ],
      voiceOver:
        'Step fourteen. The surgeon writes the operation note on a form that adapts to the operation. The findings stay in your own words; the orders are structured, and signing produces the nursing summary the ward reads.',
    },
    {
      title: 'Step 15 — Recovery and the ward',
      subtitle: 'Recovery Room Nurse · Porter',
      bullets: [
        'PACU assessment and the Aldrete score',
        'Discharge opens the transfer page: escort level, porter, printed slip',
        'A red alert requires a named nurse escort — this is not optional',
        'The slip goes back to the ward with the patient',
      ],
      voiceOver:
        'Step fifteen. The recovery nurse records the assessment and Aldrete score. Discharge opens the transfer page, which sets the escort level, names the porter and prints the slip that travels back to the ward with the patient.',
    },
    {
      title: 'What you should be able to do now',
      subtitle: 'Check yourself',
      bullets: [
        'Register without creating a duplicate, and book without a clash',
        'Give the patient their CP and PH codes and explain them',
        'Know what the holding area will check, before the patient gets there',
        'Write an operation note that the ward can actually follow',
      ],
      voiceOver:
        'By now you should be able to register without creating a duplicate, book without a clash, hand over the codes and explain them, and write an operation note the ward can follow.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. ANAESTHESIA REVIEW
// ─────────────────────────────────────────────────────────────────────────────
export const anaesthesiaReviewDeck: Deck = buildDeck(
  {
    id: 'awareness-anaesthesia-review',
    title: 'The Anaesthesia Review Flow',
    description:
      'Pre-operative review, fitness, optimisation and prescribing — elective and emergency.',
    audience: 'Anaesthetists, consultant anaesthetists, anaesthetic technicians, surgeons',
    icon: '🩺',
    category: 'Clinical',
  },
  [
    {
      title: 'The Anaesthesia Review',
      subtitle: 'The decision that prevents most cancellations',
      bullets: [
        'A patient found unfit on the morning is a cancelled list and a wasted bed',
        'The same patient found unfit on Tuesday is a patient who gets optimised',
        'ORM makes the review visible to everyone who needs it, the moment it is made',
        'Eleven steps, elective and emergency',
      ],
      voiceOver:
        'The anaesthesia review is the decision that prevents most cancellations. A patient found unfit on the morning is a cancelled list; the same patient found unfit on Tuesday is one who gets optimised.',
    },
    {
      title: 'Step 1 — See the board',
      subtitle: 'Anaesthetist · Anaesthetist Review Board',
      bullets: [
        'Every case awaiting review, with the date it is booked for',
        'Sorted so the cases nearest their date are first',
        'A case with no review is visible to the whole theatre, not only to you',
        'Pick up cases early — nothing forces them onto you at the last minute',
      ],
      voiceOver:
        'Step one. The review board shows every case awaiting review with the date it is booked for, nearest first. A case with no review is visible to the whole theatre.',
    },
    {
      title: 'Step 2 — Read what is already recorded',
      subtitle: 'Before you see the patient',
      bullets: [
        'Haemoglobin, electrolytes, creatinine and viral screening from booking',
        'Investigations entered by the house officer',
        'Comorbidities and current medication from registration',
        'Do not re-ask what the system already knows',
      ],
      voiceOver:
        'Step two. Read what is already recorded before you see the patient — the booking bloods, the investigations, the comorbidities and the current medication. Do not re-ask what the system already holds.',
    },
    {
      title: 'Step 3 — The pre-operative visit',
      subtitle: 'Anaesthetist · Pre-Op Visit',
      bullets: [
        'See the patient on the ward, before the day of surgery',
        'Airway assessment, comorbidities, exercise tolerance, previous anaesthesia',
        'Record what you found, not only your conclusion',
        'The ward nurse and the surgeon can both read it afterwards',
      ],
      voiceOver:
        'Step three. See the patient on the ward before the day of surgery. Record the airway assessment, comorbidities, exercise tolerance and previous anaesthesia — what you found, not only your conclusion.',
    },
    {
      title: 'Step 4 — ASA grade and the fitness decision',
      subtitle: 'Anaesthetist',
      bullets: [
        'Record the ASA grade',
        'Fit, fit with conditions, or not yet fit',
        '"Not yet fit" is not a refusal — it is a list of what is needed',
        'The decision is attached to the case and visible from every screen that shows it',
      ],
      voiceOver:
        'Step four. Record the ASA grade and the fitness decision: fit, fit with conditions, or not yet fit. Not yet fit is not a refusal — it is a statement of what is needed.',
    },
    {
      title: 'Step 5 — Optimisation requirements',
      subtitle: 'Anaesthetist · The most useful thing you will record',
      bullets: [
        'Name what has to happen: transfuse to 10, control the sugar, treat the chest',
        'Each requirement is a line the surgical team can act on and tick off',
        'A patient with three named requirements gets optimised',
        'A patient marked only "unfit" gets cancelled',
      ],
      voiceOver:
        'Step five, and it is the most useful thing you will record. Name what has to happen — transfuse to ten, control the sugar, treat the chest. A patient with three named requirements gets optimised; a patient marked only unfit gets cancelled.',
    },
    {
      title: 'Step 6 — Prescribe',
      subtitle: 'Anaesthetist · Anaesthetic Prescription',
      bullets: [
        'Prescribe the anaesthetic drugs against the case',
        'ORM generates the AN- code for pharmacy',
        'A consultant anaesthetist approves where approval is required',
        'The pharmacist sees the prescription; nothing is carried on paper',
      ],
      voiceOver:
        'Step six. Prescribe the anaesthetic drugs against the case. ORM generates the A N code for pharmacy, a consultant approves where approval is required, and the pharmacist sees the prescription without anything being carried on paper.',
    },
    {
      title: 'Step 7 — The emergency short form',
      subtitle: 'Anaesthetist · When there is no time for step three',
      bullets: [
        'Airway, ASA, last meal, allergies, comorbidities — the essentials only',
        'Completed at the bedside or in the holding area',
        'The same fitness decision and the same optimisation list',
        'Brevity is expected; silence is not',
      ],
      voiceOver:
        'Step seven. For an emergency there is a short form: airway, ASA, last meal, allergies and comorbidities. The same fitness decision and the same optimisation list follow. Brevity is expected — silence is not.',
    },
    {
      title: 'Step 8 — The anaesthetic machine check',
      subtitle: 'Anaesthetic Technician · Anaesthesia Setup',
      bullets: [
        'The machine, the circuit, the monitors, the suction, the emergency drugs',
        'Recorded against the theatre and the day',
        'Theatre readiness shows whether it has been done',
        'A check recorded is a check somebody can rely on',
      ],
      voiceOver:
        'Step eight. The anaesthetic technician records the machine check — machine, circuit, monitors, suction and emergency drugs — against the theatre and the day. Theatre readiness shows whether it has been done.',
    },
    {
      title: 'Step 9 — During the case',
      subtitle: 'Anaesthetist · Monitoring record',
      bullets: [
        'Vital signs charted as the case runs',
        'Drugs and fluids recorded as they are given',
        'Blood products recorded against the case',
        'The chart is the record; it is not reconstructed afterwards',
      ],
      voiceOver:
        'Step nine. During the case the anaesthetist charts vital signs, drugs, fluids and blood products as they are given. The chart is the record — it is not reconstructed afterwards.',
    },
    {
      title: 'Step 10 — Handover to recovery',
      subtitle: 'Anaesthetist → Recovery Room Nurse',
      bullets: [
        'What was given, what to watch, and what to call you for',
        'The recovery nurse records the Aldrete score against your handover',
        'A red alert in recovery reaches you, not only the nurse beside the patient',
        'Handover is a record, not only a conversation',
      ],
      voiceOver:
        'Step ten. Hand over to recovery: what was given, what to watch and what to call you for. A red alert in recovery reaches you, not only the nurse standing beside the patient.',
    },
    {
      title: 'What you should be able to do now',
      subtitle: 'Check yourself',
      bullets: [
        'Find every case awaiting your review, and pick them up early',
        'Record a fitness decision with named optimisation requirements',
        'Prescribe and know where the AN- code goes',
        'Complete the emergency short form at the bedside',
      ],
      voiceOver:
        'By now you should be able to find every case awaiting review, record a fitness decision with named requirements, prescribe and know where the code goes, and complete the emergency short form at the bedside.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. PHARMACY
// ─────────────────────────────────────────────────────────────────────────────
export const pharmacyFlowDeck: Deck = buildDeck(
  {
    id: 'awareness-pharmacy-flow',
    title: 'Pharmacy — Packing and Communication',
    description:
      'How a drug request reaches pharmacy, how the code works, and how the pack gets to theatre.',
    audience: 'Pharmacists, pharmacy technicians, surgeons, anaesthetists',
    icon: '💊',
    category: 'Support Services',
  },
  [
    {
      title: 'Pharmacy',
      subtitle: 'Packing and communication, without paper',
      bullets: [
        'Nothing in this flow depends on a piece of paper reaching you',
        'The request is on your screen the moment it is made',
        'The patient carries a code, not a prescription sheet',
        'Ten steps',
      ],
      voiceOver:
        'Nothing in the pharmacy flow depends on a piece of paper reaching you. The request is on your screen the moment it is made, and the patient carries a short code rather than a prescription sheet.',
    },
    {
      title: 'Step 1 — The request is made',
      subtitle: 'Surgeon at booking · Anaesthetist when prescribing',
      bullets: [
        'The surgeon requests the drugs and dressings needed for the case',
        'The anaesthetist prescribes the anaesthetic drugs separately',
        'Both land on the pharmacy screen without anybody carrying anything',
        'Two codes: PH- for the surgical drugs, AN- for the anaesthetic drugs',
      ],
      voiceOver:
        'Step one. The surgeon requests drugs and dressings at booking, and the anaesthetist prescribes the anaesthetic drugs separately. Both reach pharmacy directly, under two codes: P H and A N.',
    },
    {
      title: 'Step 2 — The patient is given the code',
      subtitle: 'Surgeon or Booking Officer → patient or relative',
      bullets: [
        'A short code, e.g. PH-7K9QF2',
        'Deliberately avoids letters and digits that look alike — no 0, O, 1 or I',
        'Easy to read aloud over a telephone and easy to type',
        'Write it down for the patient; do not rely on them remembering it',
      ],
      voiceOver:
        'Step two. The patient or relative is given a short code such as P H dash seven K nine Q F two. It deliberately avoids characters that look alike, so it can be read aloud and typed without confusion.',
    },
    {
      title: 'Step 3 — The patient presents the code',
      subtitle: 'Pharmacist · Surgery Code Lookup',
      bullets: [
        'Key the code into the lookup',
        'The exact request appears: drugs, doses, quantities, the case and the patient',
        'You are not working from what the relative remembers',
        'A wrong or expired code shows nothing — ask the ward, not the relative',
      ],
      voiceOver:
        'Step three. Key the code into the lookup and the exact request appears — drugs, doses, quantities, the case and the patient. You are never working from what a relative remembers.',
    },
    {
      title: 'Step 4 — Check the prescription',
      subtitle: 'Pharmacist · Clinical check',
      bullets: [
        'Read the comorbidities and current medication carried on the patient record',
        'ORM warns where an NSAID is prescribed without cover for a dyspeptic patient',
        'The warning is a prompt, not a decision — the judgement stays yours',
        'Query anything unclear against the case, so the answer is on the record',
      ],
      voiceOver:
        'Step four. Check the prescription against the comorbidities and current medication carried on the patient record. ORM prompts where an N S A I D is prescribed without cover for a dyspeptic patient, but the judgement stays yours.',
    },
    {
      title: 'Step 5 — Pack against the case',
      subtitle: 'Pharmacist · Medication Collection',
      bullets: [
        'Pack what the request names, batch by batch',
        'Stock is picked first-expired-first-out — you do not choose the box',
        'An expired batch is never offered',
        'Record what was issued, not what was asked for, when they differ',
      ],
      voiceOver:
        'Step five. Pack against the case. Stock is picked first expired, first out, so the short-dated box does not sit at the back of the shelf. Record what was actually issued where it differs from what was asked for.',
    },
    {
      title: 'Step 6 — Mark it ready',
      subtitle: 'Pharmacist',
      bullets: [
        'Marking the pack ready tells the theatre, immediately',
        'The case-readiness board updates without a telephone call',
        'An unready pack is visible to the coordinator before the list starts',
        'This is the step that stops a case being called with no drugs',
      ],
      voiceOver:
        'Step six. Marking the pack ready tells the theatre immediately, and the readiness board updates without a telephone call. This is the step that stops a case being called with no drugs.',
    },
    {
      title: 'Step 7 — Collection',
      subtitle: 'Pharmacist → theatre staff or relative',
      bullets: [
        'Record who collected and when',
        'The collection is attached to the case, not to a day book',
        'A drug that left pharmacy and cannot be accounted for is visible',
        'This protects you as much as it protects the patient',
      ],
      voiceOver:
        'Step seven. Record who collected the pack and when, against the case rather than in a day book. A drug that left pharmacy and cannot be accounted for is visible — which protects you as much as it protects the patient.',
    },
    {
      title: 'Step 8 — What comes back',
      subtitle: 'Pharmacist · Medication Return',
      bullets: [
        'Every unit issued must end up somewhere: used, returned or damaged',
        'Record returns against the case as they come back',
        'Unreturned medication raises a query, automatically',
        'The query is answered on the record, not in a corridor',
      ],
      voiceOver:
        'Step eight. Every unit issued must end somewhere — used, returned or damaged. Record returns against the case; unreturned medication raises a query automatically, and the query is answered on the record.',
    },
    {
      title: 'Step 9 — The post-operative prescription',
      subtitle: 'Surgeon → Pharmacist',
      bullets: [
        'Written on the operation-note screen and sent to pharmacy directly',
        'Categories, doses, routes, frequencies and durations, not free text',
        'Controlled drugs are flagged on the prescription itself',
        'It can also be printed on the 80mm thermal printer for the patient',
      ],
      voiceOver:
        'Step nine. The post-operative prescription is written on the operation-note screen and sent to pharmacy directly, with categories, doses, routes and durations rather than free text. Controlled drugs are flagged on the prescription.',
    },
    {
      title: 'What you should be able to do now',
      subtitle: 'Check yourself',
      bullets: [
        'Look a request up from the code a patient hands you',
        'Pack against the case and mark it ready',
        'Record collection and returns so nothing is unaccounted for',
        'Explain to a relative what the code is and why it is not a prescription sheet',
      ],
      voiceOver:
        'By now you should be able to look a request up from the code, pack against the case, mark it ready, record collection and returns, and explain the code to a relative.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. CONSUMABLE PACKS
// ─────────────────────────────────────────────────────────────────────────────
export const consumablePackDeck: Deck = buildDeck(
  {
    id: 'awareness-consumable-packs',
    title: 'Consumable Packs — Communication and Packing',
    description:
      'From the request at booking to the pack arriving in theatre, and what comes back afterwards.',
    audience: 'Consumable pack providers, theatre store keepers, scrub nurses, surgeons',
    icon: '📦',
    category: 'Support Services',
  },
  [
    {
      title: 'Consumable Packs',
      subtitle: 'From the booking to the trolley',
      bullets: [
        'The pack is requested when the case is booked, not on the morning',
        'The patient carries a code; you key it in and see the list',
        'Stock moves are recorded against the case, batch by batch',
        'Nine steps',
      ],
      voiceOver:
        'The consumable pack is requested when the case is booked, not on the morning of the list. The patient carries a code, you key it in and see the list, and every stock movement is recorded against the case.',
    },
    {
      title: 'Step 1 — The pack is requested',
      subtitle: 'Surgeon at booking',
      bullets: [
        'A standard pack is proposed from the procedure and its magnitude',
        'The surgeon adds or removes items for this particular case',
        'Where two procedures are booked together the packs are merged',
        'The merge takes the HIGHER quantity of a shared item, never the sum',
      ],
      voiceOver:
        'Step one. A standard pack is proposed from the procedure and its magnitude, and the surgeon adjusts it for the case. Where two procedures are booked together the packs merge, taking the higher quantity of a shared item rather than the sum.',
    },
    {
      title: 'Step 2 — The CP code is issued',
      subtitle: 'Given to the patient or relative',
      bullets: [
        'A short code, e.g. CP-4M7TQX',
        'The same unambiguous alphabet as the pharmacy code',
        'It identifies the CASE, not the patient — it is not a payment reference',
        'Give it to the patient in writing',
      ],
      voiceOver:
        'Step two. A consumable pack code is issued, beginning C P. It identifies the case rather than the patient, and it is not a payment reference. Give it to the patient in writing.',
    },
    {
      title: 'Step 3 — The provider receives the patient',
      subtitle: 'Consumable Pack Provider · Consumable Packs screen',
      bullets: [
        'Key the code in',
        'The exact item list for that case appears, with quantities',
        'Nothing is taken on trust from a relative or a scrap of paper',
        'The patient can see the same list — it is the basis of the charge',
      ],
      voiceOver:
        'Step three. Key the code in and the exact item list for that case appears with quantities. Nothing is taken on trust, and the patient can see the same list — it is the basis of the charge.',
    },
    {
      title: 'Step 4 — Pack it',
      subtitle: 'Consumable Pack Provider',
      bullets: [
        'Pack against the list, item by item',
        'Stock is allocated first-expired-first-out; you do not pick the batch',
        'An expired batch is never allocated',
        'Where an item is unavailable, record it — do not substitute silently',
      ],
      voiceOver:
        'Step four. Pack against the list. Stock is allocated first expired, first out, and an expired batch is never allocated. Where an item is unavailable, record it rather than substituting silently.',
    },
    {
      title: 'Step 5 — Short of something?',
      subtitle: 'Consumable Pack Provider → Theatre Store Keeper',
      bullets: [
        'Raise the shortage against the case, not as a general note',
        'The theatre and the surgeon see it before the patient is called',
        'A restock request can be raised from the same screen',
        'A shortage discovered in theatre is a cancelled or delayed case',
      ],
      voiceOver:
        'Step five. If you are short of something, raise it against the case rather than as a general note. The theatre and the surgeon see it before the patient is called — a shortage discovered in theatre is a delayed or cancelled case.',
    },
    {
      title: 'Step 6 — Mark the pack ready',
      subtitle: 'Consumable Pack Provider',
      bullets: [
        'The case-readiness board updates immediately',
        'The scrub nurse and the coordinator can both see it',
        'No telephone call is needed to confirm',
        'A pack not marked ready reads as not ready — mark it',
      ],
      voiceOver:
        'Step six. Mark the pack ready and the readiness board updates immediately for the scrub nurse and the coordinator. A pack that is ready but not marked reads as not ready.',
    },
    {
      title: 'Step 7 — Into theatre',
      subtitle: 'Theatre Store Keeper · Scrub Nurse',
      bullets: [
        'The pack is issued to the case and the movement is recorded',
        'Consignment stock becomes the hospital’s only when it is used',
        'The scrub nurse checks the pack against the list before the case',
        'A discrepancy found now is a conversation; found later it is an argument',
      ],
      voiceOver:
        'Step seven. The pack is issued to the case and the movement recorded. The scrub nurse checks the pack against the list before the case — a discrepancy found now is a conversation, found afterwards it is an argument.',
    },
    {
      title: 'Step 8 — What comes back',
      subtitle: 'Scrub Nurse → Theatre Store Keeper',
      bullets: [
        'Every item issued must be used, returned or recorded as damaged',
        'Returns go back against the case',
        'The reports show the discrepancy rather than balancing it quietly',
        'This is how the hospital knows what a case actually costs',
      ],
      voiceOver:
        'Step eight. Every item issued must be used, returned or recorded as damaged, and returns go back against the case. The reports show any discrepancy rather than quietly balancing it.',
    },
    {
      title: 'What you should be able to do now',
      subtitle: 'Check yourself',
      bullets: [
        'Look a pack up from the code a patient hands you',
        'Pack against the list and record a shortage properly',
        'Mark the pack ready so the theatre can see it',
        'Explain to a patient what the code is and what the list means',
      ],
      voiceOver:
        'By now you should be able to look a pack up from a code, pack against the list, record a shortage, mark the pack ready, and explain the code and the list to a patient.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. STAFF AVAILABILITY
// ─────────────────────────────────────────────────────────────────────────────
export const staffAvailabilityDeck: Deck = buildDeck(
  {
    id: 'awareness-staff-availability',
    title: 'Reporting Where You Are',
    description:
      'Staff availability: what the statuses mean, when to change them, and what they are used for.',
    audience: 'Every member of clinical and theatre support staff',
    icon: '🟢',
    category: 'Operations',
  },
  [
    {
      title: 'Reporting Where You Are',
      subtitle: 'Two presses, and an emergency finds the right person first time',
      bullets: [
        'The emergency board is built entirely from what staff set',
        'Nobody is tracked — you set your own status',
        'It takes two presses and lasts until you change it',
        'Eight slides',
      ],
      voiceOver:
        'The emergency board is built entirely from what staff set themselves. Nobody is tracked: you set your own status, it takes two presses, and it lasts until you change it.',
    },
    {
      title: 'Step 1 — Open Staff Availability',
      subtitle: 'Everybody · Sidebar → Staff Availability',
      bullets: [
        'Your current status is at the top',
        'Change it with one press',
        'Optionally say where you are, if you are at work',
        'That is the whole screen',
      ],
      voiceOver:
        'Step one. Open Staff Availability from the sidebar. Your current status is at the top and one press changes it.',
    },
    {
      title: 'Step 2 — The statuses that mean "call me"',
      subtitle: 'Reachable now',
      bullets: [
        'Available — at work and free',
        'Busy — at work, occupied, but can be interrupted for an emergency',
        'On Break — at work, and interruptible',
        'These three are what the emergency board looks for first',
      ],
      voiceOver:
        'Step two. Three statuses mean you can be called: Available, Busy, and On Break. The emergency board looks for these first.',
    },
    {
      title: 'Step 3 — The statuses that mean "not now"',
      subtitle: 'At work, but committed',
      bullets: [
        'In Theatre · On Emergency Case — operating',
        'Transporting Patient · Preparing Theatre · Cleaning Theatre',
        'These say you are working and should not be pulled away',
        'They are not "unavailable" — they are "committed to something else"',
      ],
      voiceOver:
        'Step three. In Theatre, On Emergency Case, Transporting Patient, Preparing Theatre and Cleaning Theatre all say you are working and should not be pulled away. They do not mean unavailable — they mean committed.',
    },
    {
      title: 'Step 4 — The statuses that mean "not at work"',
      subtitle: 'Off Duty, On Leave, Unavailable',
      bullets: [
        'Set Off Duty when your shift ends',
        'Set On Leave when you go on leave',
        'A colleague is not rung at midnight because you forgot',
        'Your location is never recorded on these — that is enforced by the server',
      ],
      voiceOver:
        'Step four. Off Duty, On Leave and Unavailable mean you are not at work. Set them, so a colleague is not rung at midnight because somebody forgot. Your location is never recorded against these statuses — the server refuses it.',
    },
    {
      title: 'Step 5 — Where you are, and only while at work',
      subtitle: 'Optional, and deliberately limited',
      bullets: [
        'You may record your location only on an at-work status',
        'Marking yourself Off Duty clears it',
        'Recording where somebody is in their own time is not a workforce board',
        'The rule is enforced on the server, not merely hidden on the screen',
      ],
      voiceOver:
        'Step five. You may record where you are, but only while at work. Marking yourself off duty clears it. Recording where somebody is in their own time is not a workforce board, and the rule is enforced on the server rather than merely hidden on the screen.',
    },
    {
      title: 'Step 6 — When to change it',
      subtitle: 'The habit that makes it work',
      bullets: [
        'At the start of your shift — set Available',
        'When you scrub — In Theatre',
        'When you finish the case — back to Available',
        'At the end of your shift — Off Duty',
      ],
      voiceOver:
        'Step six, and this is the habit that makes it work. Available at the start of your shift, In Theatre when you scrub, Available again when the case finishes, and Off Duty at the end.',
    },
    {
      title: 'What it is used for',
      subtitle: 'And what it is not',
      bullets: [
        'USED: finding an anaesthetist for an emergency at three in the morning',
        'USED: seeing which theatre is short before the list starts',
        'NOT used for attendance, discipline or pay',
        'A board nobody updates sends people to ring whoever they always ring',
      ],
      voiceOver:
        'It is used for finding an anaesthetist at three in the morning, and for seeing which theatre is short before the list starts. It is not used for attendance, discipline or pay. A board nobody updates just sends people back to ringing whoever they always ring.',
    },
    {
      title: 'What you should be able to do now',
      subtitle: 'Check yourself',
      bullets: [
        'Set your status in two presses',
        'Say which statuses mean you can be called for an emergency',
        'Know that your location is only ever recorded while you are at work',
        'Set Off Duty at the end of a shift without being reminded',
      ],
      voiceOver:
        'By now you should be able to set your status in two presses, say which ones mean you can be called, and set Off Duty at the end of a shift without being reminded.',
    },
  ],
);

/** The seven awareness decks, in the order they should be delivered. */
export const AWARENESS_DECKS: Deck[] = [
  networkAccessDeck,
  emergencyFlowDeck,
  electiveFlowDeck,
  anaesthesiaReviewDeck,
  pharmacyFlowDeck,
  consumablePackDeck,
  staffAvailabilityDeck,
];
