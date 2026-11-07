// ============================================================
// How a consultant is written to, as against everybody else
// ------------------------------------------------------------
// Asked for on 7 November:
//
//   "in the messages change the word chased to (reached out to) when its to
//    the consultant, make it very polite and as an attention being drawn to
//    speak to the residents working under him to do the needful"
//
// WHY THIS IS NOT COSMETIC. Every chase in this application was written in
// one voice: short, imperative, and aimed at the person who will physically
// do the thing. That voice is right for the porter who must walk to a ward
// and wrong for a consultant, who in this hospital does not fetch the patient
// — he tells the registrar to. A message that instructs a consultant as
// though he were the one carrying the trolley is read as impertinence, and
// the next one from the same system is not read at all. The instruction is
// therefore about whether these messages keep working at all, not about
// manners.
//
// WHAT CHANGES, AND WHAT DOES NOT. The register changes: "being chased"
// becomes "being reached out to", the opening is a greeting and an apology
// for the intrusion, and the ask is put as attention being drawn so that he
// may direct the residents and registrars under him. What does NOT change is
// a single fact — the hour, the deadline, the review, the blocker and the
// standing notice are identical in both versions. Politeness that softens the
// facts would be worse than rudeness, because the consultant would then be
// the one person on the case reading a gentler account of it.
//
// "SIR/MA" IS DELIBERATE. It is the ordinary respectful address in a Nigerian
// teaching hospital and it covers both without the system having to guess
// anything about the person it is writing to — which it has no business
// guessing and no column to guess from.
//
// WHO COUNTS AS A CONSULTANT is decided by the role on the account, never by
// a job title typed into a slot label. A roster label reading "Anaesthetist
// (1st on call)" may be a consultant or a senior registrar on any given
// night, and addressing a registrar as a consultant reads as sarcasm.
// ============================================================

/**
 * The roles written to in the consultant register.
 *
 * Heads of department and the executive are included: the same reasoning
 * applies with more force the more senior the recipient.
 */
export const CONSULTANT_ROLES = [
  'CONSULTANT_ANAESTHETIST',
  'CONSULTANT_SURGEON',
  'HEAD_OF_ANAESTHESIA',
  'HEAD_OF_SURGERY',
  'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'HEAD_OF_PHARMACY',
  'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR',
  'CMAC',
  'DC_MAC',
] as const;

const CONSULTANT_SET: ReadonlySet<string> = new Set(CONSULTANT_ROLES);

/** Is this account a consultant or above? */
export const isConsultantRole = (role: string | null | undefined): boolean =>
  !!role && CONSULTANT_SET.has(role);

/**
 * "reached out to" for a consultant, "chased" for everybody else.
 *
 * The exact substitution that was asked for, kept in one place so a fifth
 * message builder cannot quietly reintroduce the old word.
 */
export const contactVerb = (consultant: boolean): string =>
  (consultant ? 'reached out to' : 'chased');

/** The past-tense form, for a sentence about what has already been done. */
export const contactedVerb = (consultant: boolean): string =>
  (consultant ? 'been reached out to' : 'been chased');

/**
 * How the message opens.
 *
 * A consultant is greeted and the intrusion is apologised for before
 * anything is asked of him. Everybody else gets their name and their part in
 * the case, which is what they need in the first line on a corridor phone.
 */
export function opening(input: {
  name: string;
  label: string;
  consultant: boolean;
}): string[] {
  if (!input.consultant) {
    return [`${input.name}, you are being *${contactVerb(false)}* as *${input.label}*.`];
  }
  return [
    `Dear ${input.name},`,
    '',
    'Good day sir/ma. Please accept our apologies for the intrusion.',
    '',
    // No "attention is drawn" here: that is the ask, and saying it twice in
    // one message reads as padding. No "above"/"below" either -- the facts
    // sit on different sides of this block in different messages.
    `You are being *${contactVerb(true)}* as *${input.label}* on the emergency below.`,
  ];
}

/**
 * The ask, as it is put to a consultant.
 *
 * The thing that was actually asked for: not "do this", but "kindly direct
 * the people under you". It takes the duty sentence written for everybody
 * else and places it as the thing the team needs to be told to do, so there
 * is still exactly one duty in the message and it is still the correct one.
 */
export function consultantAsk(duty: string): string[] {
  return [
    '*We are drawing your kind attention to this,* so that you may speak to the '
    + 'residents and registrars working under you to do the needful.',
    '',
    `*What the case is waiting on:* ${duty}`,
    '',
    'If you would rather handle it personally, or if somebody else should be '
    + 'contacted on this, kindly let the theatre know and it will be recorded.',
  ];
}

/** The duty, as it is put to everybody else. */
export function standardAsk(duty: string): string[] {
  return [`*What is needed from you:* ${duty}`];
}

/** The ask in whichever register applies. */
export const askBlock = (duty: string, consultant: boolean): string[] =>
  (consultant ? consultantAsk(duty) : standardAsk(duty));

/**
 * How the message closes.
 *
 * A consultant is thanked. Nobody else is, because a chase that ends in
 * thanks reads as though the thing asked for were optional, and for the
 * person who must walk to the ward it is not.
 */
export function closing(consultant: boolean): string[] {
  return consultant
    ? ['Thank you very much sir/ma for your understanding and your help.']
    : [];
}
