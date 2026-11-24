/**
 * What the committee actually reads: the invitation and the reminder.
 *
 * SEPARATE FROM invite.ts FOR ONE REASON. invite.ts imports node:crypto to
 * mint and hash tokens, so anything importing it is server-only. The
 * Chairman’s Remind button renders these strings in the browser -- it offers
 * “Copy message” and a wa.me link, so the text has to exist client-side -- and
 * a stray node built-in in that import chain breaks the page bundle.
 *
 * Everything here is pure text. invite.ts re-exports it, so existing server
 * callers are unaffected.
 */
/**
 * The closing date as the committee reads it.
 *
 * Africa/Lagos explicitly. The cloud node runs in UTC, so formatting in the
 * server's own zone would put "Thursday 19 November 2026, 22:59" in a WhatsApp
 * message whose deadline is 23:59 — an hour that members would plan around.
 */
export function formatClosing(closesAt: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Lagos',
  })
    .format(closesAt)
    .replace(/,\s*(\d{2}:\d{2})$/, ', $1');
}

/**
 * Honorifics, and the form each is written in when addressing somebody.
 *
 * The canonical spelling matters: a message opening "Dear PROF. okeke"
 * because that is how the roster was typed reads as a mail-merge, which is
 * exactly what this is trying not to be.
 */
const HONORIFICS: Array<[RegExp, string]> = [
  [/^prof(?:essor)?$/i, 'Prof.'],
  [/^dr$|^doctor$/i, 'Dr'],
  [/^mr$/i, 'Mr'],
  [/^mrs$/i, 'Mrs'],
  [/^ms$|^miss$/i, 'Ms'],
  [/^engr?$|^engineer$/i, 'Engr.'],
  [/^barr?$|^barrister$/i, 'Barr.'],
  [/^rev(?:erend)?$/i, 'Rev.'],
  [/^pastor$/i, 'Pastor'],
  [/^chief$/i, 'Chief'],
  [/^matron$/i, 'Matron'],
  [/^sister$/i, 'Sister'],
  [/^sir$/i, 'Sir'],
  [/^madam$/i, 'Madam'],
];

/**
 * How to address this member: "Prof. Okeke", "Dr Nwosu", or their full name.
 *
 * "Dear Colleague" is what a circular says. A review that asks a head of
 * department for twenty-five minutes of their evening should at least know
 * who it is writing to, and the roster already holds the name.
 *
 * THE ASSUMPTION, stated because it is the way this goes wrong: the SURNAME
 * is taken to be the last word of the name. That is how the committee roster
 * is written ("Prof. A. B. Okeke"), but a row entered surname-first with a
 * title -- "Prof. Okeke Augustine" -- would be addressed as "Prof.
 * Augustine". There is no way to tell the two apart from the string, so the
 * convention is documented here rather than guessed at per name, and this is
 * the one function to change if the roster convention changes.
 *
 * Where there is no honorific, the WHOLE name is used rather than a bare
 * surname: "Dear Augustine Okeke" is correct and a little formal, while
 * "Dear Okeke" is abrupt in a way an invitation cannot afford, and inventing
 * a title or a gendered one would be worse than either.
 */
export function salutationFor(name: string | null | undefined): string {
  const raw = (name ?? '').trim().replace(/\s+/g, ' ');
  if (raw === '') return 'Colleague';

  const words = raw.split(' ');
  const first = words[0].replace(/\./g, '');
  const honorific = HONORIFICS.find(([re]) => re.test(first));

  if (!honorific) return raw;

  const rest = words.slice(1).filter((w) => w.replace(/\./g, '') !== '');
  // A title and nothing else: "Dr". Nothing to add, and "Dear Dr," is still
  // better than "Dear Colleague,".
  if (rest.length === 0) return honorific[1];

  // Initials are not a name to be addressed by, so the last word is used.
  const surname = rest[rest.length - 1];
  return `${honorific[1]} ${surname}`;
}

export interface InviteMessageInput {
  url: string;
  closesAt: Date;
  /** Addressed by name. Falls back to "Colleague" only when there is none. */
  inviteeName?: string | null;
  /** Who the message is signed by. */
  signatory?: string | null;
  signatoryTitle?: string | null;
  policyTitle?: string | null;
}

/**
 * The message that carries the link.
 *
 * WHY THE SIGNATORY IS A PARAMETER. The committee's Chairman signs this, and
 * his name is on the draft policy. It is not hardcoded here: a person's name
 * baked into a library is wrong the day the committee elects somebody else, and
 * this repository keeps real officers' names in configuration rather than in
 * source. The round carries it; the default is the office, not the person.
 */
export function buildPolicyInviteMessage(input: InviteMessageInput): string {
  const title = input.policyTitle?.trim()
    || 'the consolidated draft policy on theatre booking, pre-operative '
      + 'preparation, investigations and cancellation';
  const signatory = input.signatory?.trim() || '';
  const signatoryTitle = input.signatoryTitle?.trim()
    || 'Chairman, Theatre Users Committee, UNTH';

  const lines = [
    '*THEATRE OPERATIONAL FLOW POLICY – REVIEW ON ORM*',
    '',
    `Dear ${salutationFor(input.inviteeName)},`,
    '',
    `${title[0].toUpperCase()}${title.slice(1)} is now open for your review on ORM.`,
    '',
    'Please review each section relevant to your unit, respond to the proposed '
    + 'times and targets in [brackets], and add any comments or alternative wording.',
    '',
    `*Your personal review link:* ${input.url}`,
    `*Closing date:* ${formatClosing(input.closesAt)}`,
    '*Time needed:* about 20–30 minutes',
    '',
    // Said plainly, and said here rather than in small print at the end.
    // These links arrive in a committee WhatsApp group where forwarding a
    // useful link is the normal courtesy, and a forwarded one would record a
    // colleague's answers under this member's name.
    '*This link is individual to you.* It carries your name, and every response '
    + 'given through it is recorded as yours. Please do not forward it — if a '
    + 'colleague needs one, the Secretariat will send them their own.',
    '',
    'You can stop at any point and come back to the same link — it reopens '
    + 'where you left off, and nothing you have typed is lost.',
    '',
    'All responses will be analysed and harmonised into the final recommendation '
    + 'to Management. Thank you for your contribution.',
    '',
  ];

  if (signatory !== '') lines.push(`*${signatory}*`);
  lines.push(signatoryTitle);

  return lines.join('\n');
}

/**
 * A short, polite chase.
 *
 * ONE WORDING, used by the scheduled job, the owner’s bulk reminder and the
 * per-member button. It lived inside the reminders route as a private
 * function, which was fine while there was one caller; a second copy written
 * for a button is how a committee starts receiving two differently-worded
 * reminders about the same review.
 *
 * VERY SHORT, and that is the Chairman’s instruction rather than a style
 * preference. This goes to heads of department who have already had the full
 * invitation; a chase that restates it is a chase nobody reads to the end of.
 * So it is four short paragraphs: the apology for intruding, why this member’s
 * own opinion is being asked for, the link, and the date.
 *
 * IT CAN CARRY THEIR LINK, which took a change elsewhere rather than here.
 * Only the SHA-256 of a token is stored, so no query rebuilds a personal URL
 * — the caller mints a fresh one and KEEPS THE PREVIOUS ONE WORKING
 * (PolicyInvitation.priorTokenHash), because a member who taps the original
 * invitation still sitting in their WhatsApp must not be told their link is
 * unrecognised. Where no url is passed — any caller that cannot mint — the
 * message falls back to pointing at the link they already hold.
 */
export interface ReminderMessageInput {
  inviteeName?: string | null;
  policyTitle?: string | null;
  closesAt: Date;
  /** Sections already answered, where the member has started. */
  answered?: number | null;
  totalSections?: number | null;
  now?: Date;
  signatory?: string | null;
  signatoryTitle?: string | null;
  /**
   * Their personal review link, where the caller was able to mint one.
   *
   * Omitted rather than faked when it is not available: a reminder that
   * pointed at a link it had guessed would send a head of department to a
   * page telling them their link is not recognised.
   */
  url?: string | null;
}

export function buildPolicyReminderMessage(input: ReminderMessageInput): string {
  const title = input.policyTitle?.trim() || 'the theatre operational flow policy';
  const now = input.now ?? new Date();
  const hoursLeft = (input.closesAt.getTime() - now.getTime()) / (60 * 60 * 1000);
  const answered = input.answered ?? 0;
  const total = input.totalSections ?? 0;
  const url = (input.url ?? '').trim();

  // “your opinion on Theatre Booking and Pre-operative Preparation Policy”
  // wants an article; “on the theatre operational flow policy”, the default,
  // already has one. Decided by the case of the first letter, which is the only
  // signal there is: a document title is typed in Title Case, the fallback
  // phrase is not.
  const namedTitle = /^[A-Z]/.test(title) ? `the ${title}` : title;

  const lines = [
    '*THEATRE POLICY REVIEW — REMINDER*',
    '',
    `Dear ${salutationFor(input.inviteeName)},`,
    '',
    // THE OPENING, IN THIS ORDER, and the order is the point. The apology for
    // the intrusion comes before anything is asked of them; the request that
    // follows is for their own professional judgement, not for a form to be
    // filled. These are consultants being written to by their own hospital.
    'We are sorry to intrude on your time. Hospital Management sincerely pleads '
    + `for your opinion on ${namedTitle}, based on your professional experience `
    + 'here, so that we can produce a robust policy to guide our practice in the '
    + 'theatre.',
    '',
  ];

  // The link itself, which is the whole reason this message is worth sending.
  if (url !== '') {
    lines.push(`*Your personal review link:* ${url}`);
  } else {
    lines.push(
      'Please use the personal link sent to you earlier in this chat. If you no '
      + 'longer have it, reply here and a new one will be sent to you.',
    );
  }

  if (hoursLeft <= 0) {
    // Never “the deadline has passed” full stop: that tells somebody holding a
    // working link not to bother, and the Chairman can still extend the round.
    lines.push(
      '*The closing date has passed, but the round is still open* — your input '
      + 'can still be included if it reaches us shortly.',
    );
  } else if (hoursLeft <= 24) {
    lines.push(
      `*Closing in about ${Math.max(1, Math.round(hoursLeft))} hours* — `
      + `${formatClosing(input.closesAt)}.`,
    );
  } else {
    lines.push(`*Closing ${formatClosing(input.closesAt)}.*`);
  }

  // Acknowledging work already done, where there is some. Telling somebody who
  // has answered seven sections that nothing has been received reads as though
  // it was not noticed, and is the quickest way to lose them.
  if (answered > 0) {
    lines.push(
      '',
      `You have completed ${answered}${total > 0 ? ` of ${total}` : ''} section`
      + `${answered === 1 ? '' : 's'} — the link reopens where you stopped.`,
    );
  }

  lines.push(
    '',
    // “The link above” only where there is one. Saying it when the message is
    // the fallback wording would point them at nothing.
    url !== ''
      ? 'Kindly use the link above to make your contribution. Thank you.'
      : 'Kindly make your contribution when you can. Thank you.',
    '',
  );

  const signatory = input.signatory?.trim() || '';
  if (signatory !== '') lines.push(`*${signatory}*`);
  lines.push(input.signatoryTitle?.trim() || 'Theatre Users Committee, UNTH');

  return lines.join('\n');
}
