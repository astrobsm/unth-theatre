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
];

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
