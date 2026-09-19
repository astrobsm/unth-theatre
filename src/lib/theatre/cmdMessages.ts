/**
 * The two messages the Chief Medical Director sends from the theatre board.
 *
 * One asks what is missing. One says thank you. Both are drafted here rather
 * than typed each time, and both open WhatsApp with the text already in the
 * box — the CMD reads it, edits it if they want to, and presses send. Nothing
 * leaves this system on its own: a message signed by the CMD that the CMD did
 * not write is worse than no message.
 *
 * WHY THE THANK-YOU IS TREATED AS SERIOUSLY AS THE CHASE. A board that only
 * ever produces "what is missing" becomes a board people stop wanting to
 * appear on. The theatre that started on time is the more common case and the
 * one nobody ever hears about.
 *
 * WHAT THESE MESSAGES NEVER DO. They do not accuse, and they do not state that
 * somebody failed to turn up. The board knows who has not ANSWERED, which is
 * not the same thing — people are operating, teaching, post-call or out of
 * signal — so the chase asks a question rather than making a charge.
 */

import { whatsappLink } from '@/lib/whatsapp';

export interface CaseBrief {
  patientName?: string | null;
  procedureName?: string | null;
  scheduledTime?: string | null;
  theatreName?: string | null;
}

export interface ChaseInput {
  /** Who is being written to, so the message opens with their name. */
  toName?: string | null;
  /** Their part on the case: "Surgeon", "Scrub nurse". */
  toRole?: string | null;
  theatreName?: string | null;
  /** The case this is about, where it is about one. */
  cases?: CaseBrief[];
  /**
   * What the board shows as outstanding, in plain words — "the anaesthetic
   * machine check", "your availability for the 09:00 case". Written by the
   * caller because only the board knows what is actually missing.
   */
  outstanding?: string[];
  /** The CMD's name. A message from nobody is easy to put aside. */
  fromName?: string | null;
  fromTitle?: string | null;
}

const caseLine = (c: CaseBrief): string => {
  const bits = [
    c.scheduledTime ? c.scheduledTime : null,
    c.procedureName ? c.procedureName : null,
    c.patientName ? `for ${c.patientName}` : null,
    c.theatreName ? `in ${c.theatreName}` : null,
  ].filter(Boolean);
  return bits.length ? `• ${bits.join(' — ')}` : '';
};

const signature = (input: { fromName?: string | null; fromTitle?: string | null }): string => {
  const name = (input.fromName ?? '').trim();
  const title = (input.fromTitle ?? '').trim() || 'Chief Medical Director';
  return name ? `— ${name}, ${title}` : `— ${title}`;
};

/**
 * "What is still needed?"
 *
 * Asks. The recipient may already have dealt with it, may be in the middle of
 * it, or may know something the board does not.
 */
export function buildChaseMessage(input: ChaseInput): string {
  const greeting = input.toName ? `Good day ${input.toName},` : 'Good day,';

  const cases = (input.cases ?? []).map(caseLine).filter(Boolean);
  const outstanding = (input.outstanding ?? []).map((s) => s.trim()).filter(Boolean);

  const where = input.theatreName ? ` in ${input.theatreName}` : '';

  const lines = [
    greeting,
    '',
    `I am looking at today's theatre board${where}.`,
  ];

  if (cases.length) {
    lines.push('', cases.length === 1 ? 'This is about:' : 'This is about:', ...cases);
  }

  if (outstanding.length) {
    lines.push(
      '',
      outstanding.length === 1
        ? 'The board still shows this outstanding:'
        : 'The board still shows these outstanding:',
      ...outstanding.map((o) => `• ${o}`),
    );
  }

  lines.push(
    '',
    // The question, not the charge. And an explicit invitation to say the
    // board is wrong, because it sometimes is.
    'Could you let me know what is needed, or whether the board is out of date?',
    'If something is holding you up, tell me and I will have it moved.',
    '',
    signature(input),
  );

  return lines.join('\n');
}

export interface AppreciationInput {
  toName?: string | null;
  toRole?: string | null;
  theatreName?: string | null;
  cases?: CaseBrief[];
  /** What specifically is being thanked — "confirming before 07:30". */
  forWhat?: string | null;
  fromName?: string | null;
  fromTitle?: string | null;
}

/**
 * "Thank you."
 *
 * Specific on purpose. A thank-you that names what was done is read as
 * meant; a general one is read as a circular.
 */
export function buildAppreciationMessage(input: AppreciationInput): string {
  const greeting = input.toName ? `Good day ${input.toName},` : 'Good day,';
  const where = input.theatreName ? ` in ${input.theatreName}` : '';
  const cases = (input.cases ?? []).map(caseLine).filter(Boolean);

  const what = (input.forWhat ?? '').trim();

  const lines = [
    greeting,
    '',
    what
      ? `Thank you for ${what}.`
      : `Thank you for being ready on time${where} today.`,
  ];

  if (cases.length) lines.push('', ...cases);

  lines.push(
    '',
    'It was visible on the theatre board this morning, and it is noticed.',
    '',
    signature(input),
  );

  return lines.join('\n');
}

/** The wa.me link, or null when there is no usable number to open a chat with. */
export function chaseLink(phone: string | null | undefined, input: ChaseInput): string | null {
  return whatsappLink(phone, buildChaseMessage(input));
}

export function appreciationLink(
  phone: string | null | undefined,
  input: AppreciationInput,
): string | null {
  return whatsappLink(phone, buildAppreciationMessage(input));
}
