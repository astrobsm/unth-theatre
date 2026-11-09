// ============================================================
// The messages, written to be approved by Meta and read by a consultant
// ------------------------------------------------------------
// WHY THE WORDING IS CONSTRAINED, and not simply written well. A
// business-initiated WhatsApp message must use a template Meta has approved in
// advance. Free text is only valid inside the 24 hours after that person
// messages the hospital first, which will essentially never be the case for a
// 6 p.m. reminder. So every line below has to satisfy Meta's rules before it
// can satisfy ours:
//
//   - Variables are POSITIONAL: {{1}}, {{2}}, in the order submitted.
//   - A body may not START or END with a variable.
//   - Two variables may not sit adjacent — "{{1}} {{2}}" is refused.
//   - Body is at most 1024 characters.
//   - Category UTILITY, never MARKETING. These are about work the recipient
//     has already undertaken, which is what UTILITY means, and mislabelling
//     gets an account restricted rather than a template rejected.
//
// AND WHY THERE IS NO CLINICAL DETAIL IN ANY OF THEM. checkSendAllowed refuses
// to put clinical content on an external channel, which is the correct rule and
// predates this file. A patient's condition does not belong in a WhatsApp
// message that sits unencrypted in a notification shade on a train. So every
// template says what is outstanding and where to fix it, and the detail stays
// behind the login — which also happens to be the behaviour wanted here, since
// the complaint is that people do not open the app.
//
// THE TONE IS DELIBERATE. These go to consultant surgeons about their own
// patients. A message that reads as an accusation gets the sender muted within
// a week and then nothing arrives at all, including the message that mattered.
// So: respectful throughout, specific about what is needed, and escalating in
// FIRMNESS rather than in blame. The emergency ladder names the medicolegal
// position because that is a fact the team is entitled to be reminded of, not
// because it is a threat.
// ============================================================

import type { CommSensitivity } from './policy';

export type TemplateCategory = 'UTILITY';

export interface TemplateSpec {
  /** Stable key the code refers to. */
  code: string;
  /** The name to register at Meta. Lower case and underscores; Meta requires it. */
  metaName: string;
  category: TemplateCategory;
  language: string;
  /**
   * The body EXACTLY as it must be submitted, with Meta's positional
   * placeholders. This string is what gets pasted into the Meta console.
   */
  metaBody: string;
  /**
   * The same body in ORM's own {{name}} form, used to render what is stored
   * against the message and shown in the app's record.
   */
  body: string;
  /** Variable names, in the order they map to {{1}}, {{2}}, … */
  variables: string[];
  /** Appended to the site root to make the button's destination. */
  buttonLabel?: string;
  /** One line explaining when this fires, shown on the setup screen. */
  when: string;
  /**
   * How far this message's content may travel.
   *
   * Declared HERE rather than at the call site, and carried into the stored
   * template row, because the whole point of the classification is that the
   * wording and its handling cannot drift apart. A caller that passes a body
   * directly can claim any sensitivity it likes; a caller naming a template
   * gets the one the words were written under.
   *
   * Omitted means OPERATIONAL, which every staff template above is: they name
   * a case count and a date, never a patient.
   */
  sensitivity?: CommSensitivity;
}

/**
 * Every template the app sends on WhatsApp.
 *
 * Adding one here is not enough to make it send: it must be registered at Meta
 * under `metaName` and reach APPROVED, and the approval has to be recorded
 * against the template row. The dispatcher refuses anything else with a reason
 * that names the template, rather than letting Meta refuse it silently.
 */
export const WHATSAPP_TEMPLATES: TemplateSpec[] = [
  {
    code: 'BLOCKERS_TOMORROW',
    metaName: 'orm_blockers_tomorrow',
    category: 'UTILITY',
    language: 'en',
    when: 'Every evening at 6 p.m., to each surgeon, supervising consultant and booking '
      + 'officer who has a case tomorrow with something outstanding.',
    metaBody:
      'Good evening {{1}}.\n\n'
      + 'You have {{2}} scheduled for tomorrow, {{3}}. '
      + 'Our records show {{4}} still outstanding before the list can proceed.\n\n'
      + 'Please review and complete these in the Operative Resource Manager at your '
      + 'convenience this evening. Tapping the button below opens the items directly.\n\n'
      + 'Thank you for your time.',
    body:
      'Good evening {{name}}.\n\n'
      + 'You have {{caseCount}} scheduled for tomorrow, {{date}}. '
      + 'Our records show {{outstanding}} still outstanding before the list can proceed.\n\n'
      + 'Please review and complete these in the Operative Resource Manager at your '
      + 'convenience this evening. Tapping the button below opens the items directly.\n\n'
      + 'Thank you for your time.',
    variables: ['name', 'caseCount', 'date', 'outstanding'],
    buttonLabel: 'Review my list',
  },

  {
    code: 'EMERGENCY_NOT_STARTED_30',
    metaName: 'orm_emergency_not_started_30',
    category: 'UTILITY',
    language: 'en',
    when: 'Thirty minutes after an emergency is booked, if the case has not been marked as started.',
    metaBody:
      'Dear {{1}},\n\n'
      + 'The emergency case booked at {{2}} has not yet been marked as started, '
      + 'now {{3}} after booking.\n\n'
      + 'If the case is under way, please mark it started so the team and the '
      + 'record agree. If something is holding it up, please record the reason — '
      + 'that is what allows it to be escalated and resolved.\n\n'
      + 'Thank you.',
    body:
      'Dear {{name}},\n\n'
      + 'The emergency case booked at {{bookedAt}} has not yet been marked as started, '
      + 'now {{elapsed}} after booking.\n\n'
      + 'If the case is under way, please mark it started so the team and the '
      + 'record agree. If something is holding it up, please record the reason — '
      + 'that is what allows it to be escalated and resolved.\n\n'
      + 'Thank you.',
    variables: ['name', 'bookedAt', 'elapsed'],
    buttonLabel: 'Open the case',
  },

  {
    code: 'EMERGENCY_NOT_STARTED_60',
    metaName: 'orm_emergency_not_started_60',
    category: 'UTILITY',
    language: 'en',
    when: 'One hour after booking, if the case is still not marked as started.',
    metaBody:
      'Dear {{1}},\n\n'
      + 'The emergency case booked at {{2}} remains unstarted {{3}} after booking, '
      + 'and no reason has been recorded.\n\n'
      + 'Delay to an emergency procedure is a matter of record and may be reviewed '
      + 'clinically and medicolegally. Please either start the case or record what '
      + 'is preventing it, so that the delay is accounted for and help can be sent.\n\n'
      + 'Your prompt attention is appreciated.',
    body:
      'Dear {{name}},\n\n'
      + 'The emergency case booked at {{bookedAt}} remains unstarted {{elapsed}} after booking, '
      + 'and no reason has been recorded.\n\n'
      + 'Delay to an emergency procedure is a matter of record and may be reviewed '
      + 'clinically and medicolegally. Please either start the case or record what '
      + 'is preventing it, so that the delay is accounted for and help can be sent.\n\n'
      + 'Your prompt attention is appreciated.',
    variables: ['name', 'bookedAt', 'elapsed'],
    buttonLabel: 'Open the case',
  },

  {
    code: 'EMERGENCY_NOT_STARTED_REPEAT',
    metaName: 'orm_emergency_not_started_repeat',
    category: 'UTILITY',
    language: 'en',
    when: 'Every thirty minutes thereafter, until the case starts, is cancelled or is rescheduled.',
    metaBody:
      'Dear {{1}},\n\n'
      + 'This is a further notice regarding the emergency case booked at {{2}}, '
      + 'now {{3}} without a recorded start.\n\n'
      + 'This delay is being logged against the case and the theatre record, and '
      + 'has been notified to theatre management. Every member of the team named on '
      + 'this case is receiving this message.\n\n'
      + 'Please start the case, or record the obstruction so that it can be removed.',
    body:
      'Dear {{name}},\n\n'
      + 'This is a further notice regarding the emergency case booked at {{bookedAt}}, '
      + 'now {{elapsed}} without a recorded start.\n\n'
      + 'This delay is being logged against the case and the theatre record, and '
      + 'has been notified to theatre management. Every member of the team named on '
      + 'this case is receiving this message.\n\n'
      + 'Please start the case, or record the obstruction so that it can be removed.',
    variables: ['name', 'bookedAt', 'elapsed'],
    buttonLabel: 'Open the case',
  },

  {
    code: 'DIAGNOSTIC_REQUEST_WAITING',
    metaName: 'orm_diagnostic_request_waiting',
    category: 'UTILITY',
    language: 'en',
    when: 'To the laboratory, blood bank or radiology staff on duty when a request for a '
      + 'surgical patient has been waiting longer than its expected turnaround.',
    metaBody:
      'Dear {{1}},\n\n'
      + 'A {{2}} request for a surgical patient has been waiting {{3}} without a '
      + 'result being uploaded.\n\n'
      + 'The theatre list depends on it. If the sample or request has not reached '
      + 'you, please say so in the app so the ward can be told; if it is in '
      + 'progress, recording that is enough.\n\n'
      + 'Thank you for your help.',
    body:
      'Dear {{name}},\n\n'
      + 'A {{discipline}} request for a surgical patient has been waiting {{waited}} without a '
      + 'result being uploaded.\n\n'
      + 'The theatre list depends on it. If the sample or request has not reached '
      + 'you, please say so in the app so the ward can be told; if it is in '
      + 'progress, recording that is enough.\n\n'
      + 'Thank you for your help.',
    variables: ['name', 'discipline', 'waited'],
    buttonLabel: 'Open the request',
  },

  {
    code: 'STOCK_REORDER',
    metaName: 'orm_stock_reorder',
    category: 'UTILITY',
    language: 'en',
    when: 'Each morning, to the store keepers, procurement, pharmacy, consumable pack '
      + 'providers and theatre management — but only on a day when something is actually '
      + 'out, at its reorder level, approaching it, or expiring within 30 days.',
    metaBody:
      'Good morning {{1}}.\n\n'
      + 'Theatre stock position for {{2}}: {{3}}.\n\n'
      + 'The affected items and their quantities are listed in the Operative Resource '
      + 'Manager. Please arrange resupply for anything already at or below its reorder '
      + 'level, and use the items nearing expiry first.\n\n'
      + 'Thank you.',
    body:
      'Good morning {{name}}.\n\n'
      + 'Theatre stock position for {{date}}: {{summary}}.\n\n'
      + 'The affected items and their quantities are listed in the Operative Resource '
      + 'Manager. Please arrange resupply for anything already at or below its reorder '
      + 'level, and use the items nearing expiry first.\n\n'
      + 'Thank you.',
    variables: ['name', 'date', 'summary'],
    buttonLabel: 'Open the stock list',
  },

  {
    code: 'ROSTER_MISSING',
    metaName: 'orm_roster_missing',
    category: 'UTILITY',
    language: 'en',
    when: 'To a departmental roster supervisor when no roster has been uploaded for a '
      + 'period that is about to begin.',
    metaBody:
      'Dear {{1}},\n\n'
      + 'No duty roster has yet been uploaded for {{2}} covering {{3}}.\n\n'
      + 'Without it the app cannot tell who is on duty, which means requests raised '
      + 'during that period cannot be directed to anybody and may go unanswered.\n\n'
      + 'Please upload it when you are able. Thank you.',
    body:
      'Dear {{name}},\n\n'
      + 'No duty roster has yet been uploaded for {{department}} covering {{period}}.\n\n'
      + 'Without it the app cannot tell who is on duty, which means requests raised '
      + 'during that period cannot be directed to anybody and may go unanswered.\n\n'
      + 'Please upload it when you are able. Thank you.',
    variables: ['name', 'department', 'period'],
    buttonLabel: 'Upload the roster',
  },

  {
    code: 'PREOP_REVIEW_OVERDUE',
    metaName: 'orm_preop_review_overdue',
    category: 'UTILITY',
    language: 'en',
    when: 'At 7pm to the Head of Anaesthesia, listing tomorrow\u2019s cases that still have '
      + 'no preoperative anaesthetic review. Sent at 7pm rather than 9pm so there is '
      + 'still time to reassign: at 9pm it would be a reproach rather than a warning.',
    metaBody:
      'Dear {{1}},\n\n'
      + '{{2}} case(s) on tomorrow\u2019s list for {{3}} have no preoperative anaesthetic '
      + 'review, and the 7pm deadline for reassigning them has now passed.\n\n'
      + 'The review deadline is 9pm. Cases still unreviewed after that are recorded for '
      + 'the weekly theatre audit.\n\n'
      + 'The cases are listed in the Operative Resource Manager. Thank you.',
    body:
      'Dear {{name}},\n\n'
      + '{{count}} case(s) on tomorrow\u2019s list for {{date}} have no preoperative '
      + 'anaesthetic review, and the 7pm deadline for reassigning them has now passed.\n\n'
      + 'The review deadline is 9pm. Cases still unreviewed after that are recorded for '
      + 'the weekly theatre audit.\n\n'
      + 'The cases are listed in the Operative Resource Manager. Thank you.',
    variables: ['name', 'count', 'date'],
    buttonLabel: 'Open the review list',
  },

  {
    code: 'AUDIT_SUMMONS',
    metaName: 'orm_audit_summons',
    category: 'UTILITY',
    language: 'en',
    when: 'When the theatre audit chairman convenes a sitting, to each person summoned. '
      + 'Deliberately states the ground and the case, because a summons that does not '
      + 'say what it is about cannot be prepared for and gets ignored.',
    metaBody:
      'Dear {{1}},\n\n'
      + 'You are requested to attend the Theatre Audit meeting on {{2}}, {{3}}.\n\n'
      + 'Matter: {{4}}\n\n'
      + 'The full record is in the Operative Resource Manager. If you are unable to '
      + 'attend, please inform the chairman beforehand. Thank you.',
    body:
      'Dear {{name}},\n\n'
      + 'You are requested to attend the Theatre Audit meeting on {{when}}, {{where}}.\n\n'
      + 'Matter: {{matter}}\n\n'
      + 'The full record is in the Operative Resource Manager. If you are unable to '
      + 'attend, please inform the chairman beforehand. Thank you.',
    variables: ['name', 'when', 'where', 'matter'],
    buttonLabel: 'Open the summons',
  },

  // ── Messages to the patient ────────────────────────────────────────────
  //
  // Everything above goes to a colleague with an ORM account. These four go to
  // a patient or their next of kin, on a personal phone, and that changes four
  // things.
  //
  // 1. THE TONE. Somebody waiting for an operation is frightened, and a message
  //    that reads like a system notification makes it worse. These say who we
  //    are, what is happening, what to do, and that we are sorry — in that
  //    order, because that is the order the worry arrives in. They never use a
  //    word a person would have to look up, and they never leave a patient
  //    wondering whether they have been forgotten.
  //
  // 2. NO CLINICAL DETAIL, EVER. Not the procedure, not the diagnosis, not a
  //    result. A phone is shared, read over a shoulder, and backed up to
  //    somebody's cloud account — and one digit typed wrong at booking sends
  //    the lot to a stranger. The reasons are picked from a fixed list in
  //    lib/patients/notices.ts exactly so that nobody can type a diagnosis into
  //    a box that ends up here.
  //
  // 3. THE WARD HAS THE LAST WORD. Every one of these points back to the ward
  //    nurse and says to follow them if the two differ. A WhatsApp message
  //    cannot know that this patient is diabetic and must not fast like
  //    everyone else, so it must not be the final authority on anything
  //    clinical — and it says so in the message rather than in a comment here.
  //
  // 4. THEY CARRY THE FEEDBACK LINK. The moment a patient is holding a message
  //    from the hospital is the moment they are most able to say how it is
  //    going, and the link is anonymous, so saying something unflattering
  //    costs them nothing. It goes last, after the instruction, so it never
  //    competes with the thing they actually need to read.

  {
    code: 'PATIENT_SAFETY_NOTICE',
    metaName: 'orm_patient_safety_notice',
    category: 'UTILITY',
    language: 'en',
    sensitivity: 'PATIENT_IDENTIFIED',
    when: 'Given to a patient once their operation is booked, and again whenever they ask. '
      + 'Warns them that only the ward nurses and the hospital pharmacist may hand them a '
      + 'list of items to buy.',
    metaBody:
      'Dear {{1}}, a short safety note from {{2}}.\n\n'
      + 'Sometimes people approach patients with a list of items or medicines to buy, or '
      + 'ask them for money. Only the nurses on your ward and the hospital pharmacist may '
      + 'give you such a list.\n\n'
      + 'If anyone else gives you a list, asks you for money, or offers to buy things on '
      + 'your behalf, please do not pay and do not buy anything. Show the list to your '
      + 'ward nurse first and let them confirm it — even if the person is in uniform, and '
      + 'even if they say the theatre sent them.\n\n'
      + 'If this happens, please tell your ward nurse or the theatre office. You are not '
      + 'in any trouble for asking, and we would far rather you asked.\n\n'
      + 'You are in good hands, and your operation is being looked after.\n\n'
      + 'To tell us about your care, anonymously: {{3}} — it helps us put things right.',
    body:
      'Dear {{name}}, a short safety note from {{hospital}}.\n\n'
      + 'Sometimes people approach patients with a list of items or medicines to buy, or '
      + 'ask them for money. Only the nurses on your ward and the hospital pharmacist may '
      + 'give you such a list.\n\n'
      + 'If anyone else gives you a list, asks you for money, or offers to buy things on '
      + 'your behalf, please do not pay and do not buy anything. Show the list to your '
      + 'ward nurse first and let them confirm it — even if the person is in uniform, and '
      + 'even if they say the theatre sent them.\n\n'
      + 'If this happens, please tell your ward nurse or the theatre office. You are not '
      + 'in any trouble for asking, and we would far rather you asked.\n\n'
      + 'You are in good hands, and your operation is being looked after.\n\n'
      + 'To tell us about your care, anonymously: {{feedbackLink}} — it helps us put '
      + 'things right.',
    variables: ['name', 'hospital', 'feedbackLink'],
  },

  {
    code: 'PATIENT_CASE_HOLDING',
    metaName: 'orm_patient_case_holding',
    category: 'UTILITY',
    language: 'en',
    sensitivity: 'PATIENT_IDENTIFIED',
    when: 'While a patient is waiting and the list has run late. Confirms the operation is '
      + 'still going ahead and says what is holding it up.',
    metaBody:
      'Dear {{1}}, a message from {{2}}.\n\n'
      + 'Your operation is still going ahead. You have not been forgotten, and your place '
      + 'on the list is being kept for you.\n\n'
      + 'What is holding things up: {{3}}. We expect to send for you {{4}}.\n\n'
      + 'Please stay on the ward, as we may call for you at short notice, and keep to the '
      + 'eating and drinking instructions your nurse gave you unless they tell you '
      + 'otherwise.\n\n'
      + 'We are sorry for the wait. If anything worries you while you wait, please ask '
      + 'your ward nurse — that is what they are there for.\n\n'
      + 'To tell us how this felt, anonymously: {{5}} — we do read every one.',
    body:
      'Dear {{name}}, a message from {{hospital}}.\n\n'
      + 'Your operation is still going ahead. You have not been forgotten, and your place '
      + 'on the list is being kept for you.\n\n'
      + 'What is holding things up: {{reason}}. We expect to send for you {{expected}}.\n\n'
      + 'Please stay on the ward, as we may call for you at short notice, and keep to the '
      + 'eating and drinking instructions your nurse gave you unless they tell you '
      + 'otherwise.\n\n'
      + 'We are sorry for the wait. If anything worries you while you wait, please ask '
      + 'your ward nurse — that is what they are there for.\n\n'
      + 'To tell us how this felt, anonymously: {{feedbackLink}} — we do read every one.',
    variables: ['name', 'hospital', 'reason', 'expected', 'feedbackLink'],
  },

  {
    code: 'PATIENT_CASE_RESCHEDULED',
    metaName: 'orm_patient_case_rescheduled',
    category: 'UTILITY',
    language: 'en',
    sensitivity: 'PATIENT_IDENTIFIED',
    when: 'When an operation is moved to another day. Carries the new date and what to do '
      + 'about eating and drinking before it.',
    metaBody:
      'Dear {{1}}, a message from {{2}}.\n\n'
      + 'Your operation has been moved to another day. We are sorry — we know how much '
      + 'goes into preparing for it, and we would not move it without good reason.\n\n'
      + 'New date: {{3}}.\nWhy it moved: {{4}}.\n\n'
      + 'Before that day: {{5}}\n\n'
      + 'Your ward nurse will go through all of this with you and will say if anything is '
      + 'different in your own case — please follow them rather than this message if the '
      + 'two differ. Your place is kept, and your surgical team knows about the change.\n\n'
      + 'To tell us about your care, anonymously: {{6}} — it helps us do better.',
    body:
      'Dear {{name}}, a message from {{hospital}}.\n\n'
      + 'Your operation has been moved to another day. We are sorry — we know how much '
      + 'goes into preparing for it, and we would not move it without good reason.\n\n'
      + 'New date: {{newDate}}.\nWhy it moved: {{reason}}.\n\n'
      + 'Before that day: {{instructions}}\n\n'
      + 'Your ward nurse will go through all of this with you and will say if anything is '
      + 'different in your own case — please follow them rather than this message if the '
      + 'two differ. Your place is kept, and your surgical team knows about the change.\n\n'
      + 'To tell us about your care, anonymously: {{feedbackLink}} — it helps us do better.',
    variables: ['name', 'hospital', 'newDate', 'reason', 'instructions', 'feedbackLink'],
  },

  {
    code: 'PATIENT_CASE_CANCELLED',
    metaName: 'orm_patient_case_cancelled',
    category: 'UTILITY',
    language: 'en',
    sensitivity: 'PATIENT_IDENTIFIED',
    when: 'When an operation will not take place as planned and no new date has been set '
      + 'yet. Says what to do now, including about eating and drinking.',
    metaBody:
      'Dear {{1}}, a message from {{2}}.\n\n'
      + 'We are very sorry: your operation will not go ahead as planned.\n\n'
      + 'Why: {{3}}.\n\n'
      + 'What to do now: {{4}}\n\n'
      + 'A new date has not been fixed yet. Your surgical team and your ward nurse will '
      + 'arrange one with you, and you remain under their care in the meantime. Please do '
      + 'not leave the ward until your nurse has seen you, and do ask them anything you '
      + 'are unsure about.\n\n'
      + 'To tell us about your care, anonymously: {{5}} — especially when we have let you '
      + 'down.',
    body:
      'Dear {{name}}, a message from {{hospital}}.\n\n'
      + 'We are very sorry: your operation will not go ahead as planned.\n\n'
      + 'Why: {{reason}}.\n\n'
      + 'What to do now: {{instructions}}\n\n'
      + 'A new date has not been fixed yet. Your surgical team and your ward nurse will '
      + 'arrange one with you, and you remain under their care in the meantime. Please do '
      + 'not leave the ward until your nurse has seen you, and do ask them anything you '
      + 'are unsure about.\n\n'
      + 'To tell us about your care, anonymously: {{feedbackLink}} — especially when we '
      + 'have let you down.',
    variables: ['name', 'hospital', 'reason', 'instructions', 'feedbackLink'],
  },

  {
    code: 'PATIENT_PAYMENT_WARNING',
    metaName: 'orm_patient_payment_warning',
    category: 'UTILITY',
    language: 'en',
    sensitivity: 'PATIENT_IDENTIFIED',
    when: 'Once the drug and consumable deposits are set for a case. Tells the patient that '
      + 'the hospital now supplies everything, that no one may hand them a shopping list, '
      + 'and that money goes to the revenue unit and nowhere else.',
    metaBody:
      'Dear {{1}}, an important note about payment from {{2}}.\n\n'
      + 'Everything needed for your operation — your medicines and the theatre items — is '
      + 'arranged by the hospital. {{3}}\n\n'
      + 'So please do not accept a shopping list or a prescription to go and buy anything, '
      + 'from anybody, and do not hand money to any individual. Payment is made only at the '
      + 'hospital revenue unit, and you must be given an official receipt for it.\n\n'
      + 'Money given to a person instead of the revenue unit is at your own risk. It cannot '
      + 'be traced and it cannot be refunded. It should not happen to you, and you do not '
      + 'have to accept it.\n\n'
      + 'If anyone asks you for money or hands you a list, please tell your ward nurse or '
      + 'the theatre office straight away. You are not in any trouble for asking, and your '
      + 'care will not be affected.\n\n'
      + 'To tell us about this, anonymously: {{4}} — it is how we put a stop to it.',
    body:
      'Dear {{name}}, an important note about payment from {{hospital}}.\n\n'
      + 'Everything needed for your operation — your medicines and the theatre items — is '
      + 'arranged by the hospital. {{deposit}}\n\n'
      + 'So please do not accept a shopping list or a prescription to go and buy anything, '
      + 'from anybody, and do not hand money to any individual. Payment is made only at the '
      + 'hospital revenue unit, and you must be given an official receipt for it.\n\n'
      + 'Money given to a person instead of the revenue unit is at your own risk. It cannot '
      + 'be traced and it cannot be refunded. It should not happen to you, and you do not '
      + 'have to accept it.\n\n'
      + 'If anyone asks you for money or hands you a list, please tell your ward nurse or '
      + 'the theatre office straight away. You are not in any trouble for asking, and your '
      + 'care will not be affected.\n\n'
      + 'To tell us about this, anonymously: {{feedbackLink}} — it is how we put a stop to it.',
    variables: ['name', 'hospital', 'deposit', 'feedbackLink'],
  },
];

/** The templates addressed to a patient rather than to a member of staff. */
export const PATIENT_TEMPLATE_CODES = [
  'PATIENT_SAFETY_NOTICE',
  'PATIENT_PAYMENT_WARNING',
  'PATIENT_CASE_HOLDING',
  'PATIENT_CASE_RESCHEDULED',
  'PATIENT_CASE_CANCELLED',
] as const;

export type PatientTemplateCode = typeof PATIENT_TEMPLATE_CODES[number];

export const templateByCode = (code: string): TemplateSpec | undefined =>
  WHATSAPP_TEMPLATES.find((t) => t.code === code);

/**
 * Meta's own rules, checked before anybody wastes a submission.
 *
 * A rejected template is not a quick fix: it is a resubmission and another wait,
 * and the rejection reason Meta gives is frequently just "does not follow our
 * guidelines". Catching the mechanical rules here is free.
 */
export function validateTemplate(t: TemplateSpec): string[] {
  const problems: string[] = [];
  const body = t.metaBody;

  if (body.length > 1024) {
    problems.push(`Body is ${body.length} characters; Meta's limit is 1024.`);
  }
  if (/^\s*\{\{\d+\}\}/.test(body)) {
    problems.push('Body starts with a variable, which Meta refuses.');
  }
  if (/\{\{\d+\}\}\s*$/.test(body)) {
    problems.push('Body ends with a variable, which Meta refuses.');
  }
  if (/\{\{\d+\}\}[\s]*\{\{\d+\}\}/.test(body)) {
    problems.push('Two variables are adjacent, which Meta refuses.');
  }
  if (!/^[a-z0-9_]+$/.test(t.metaName)) {
    problems.push(`"${t.metaName}" must be lower case letters, digits and underscores only.`);
  }

  // The placeholders present must be exactly 1..n, with none skipped, or the
  // positional parameters line up against the wrong words — a sentence that
  // reads perfectly and states something untrue.
  //
  // Written with Array.from and a loop rather than spreads: this project
  // compiles to ES5, where spreading an iterator is a build error (TS2802).
  const found: number[] = Array.from(body.match(/\{\{\d+\}\}/g) ?? [])
    .map((m) => Number(m.replace(/\D/g, '')));
  const expected = t.variables.map((_, i) => i + 1);
  const unique: number[] = [];
  found.forEach((n) => { if (unique.indexOf(n) === -1) unique.push(n); });
  unique.sort((a, b) => a - b);
  if (unique.join(',') !== expected.join(',')) {
    problems.push(
      `Placeholders are ${unique.join(', ') || 'none'} but ${t.variables.length} variables are `
      + `declared (${t.variables.join(', ')}). They must be {{1}}..{{${t.variables.length}}}.`);
  }

  // The two bodies must agree, or the app records one wording and sends another
  // — and for messages whose purpose is to establish that a team was warned,
  // that is the one discrepancy that must never exist.
  const ormVars = Array.from(t.body.match(/\{\{\w+\}\}/g) ?? [])
    .map((m) => m.slice(2, -2));
  if (ormVars.join(',') !== t.variables.join(',')) {
    problems.push(
      `The app-side body uses ${ormVars.join(', ') || 'no variables'} but the declared order is `
      + `${t.variables.join(', ')}. They must match, in the same order.`);
  }

  return problems;
}
