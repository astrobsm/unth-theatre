/**
 * The message sent to whoever booked a case that is still missing something.
 *
 * Written here rather than typed into WhatsApp each time, for two reasons. It
 * names the items instead of saying "there are outstanding issues", so the
 * booker knows what to do without opening the app; and it identifies the case
 * unambiguously — a surgeon may have three patients on one list, and "your
 * case is not ready" fits all of them.
 *
 * Courteous by default. This is a reminder between colleagues, and a message
 * that reads as an accusation gets answered later than one that does not.
 */

import { whatsappLink } from '@/lib/whatsapp';

/** The stored codes on Surgery.preopOutstanding, in words a person can act on. */
const OUTSTANDING_LABEL: Record<string, string> = {
  CONSENT: 'informed consent',
  HAEMOGLOBIN: 'a recent haemoglobin, with the date the sample was drawn',
  ELECTROLYTES: 'serum sodium, potassium and creatinine',
  VIRAL_SCREEN: 'HIV, HBsAg and HCV status',
  BLOOD_PRESSURE: 'blood pressure',
  PRESCRIPTION: 'the pharmacy prescription',
  CONSUMABLES: 'the consumables request',
};

export interface BookerChaseInput {
  patientName?: string | null;
  folderNumber?: string | null;
  procedureName?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  theatreName?: string | null;
  /** Comma-separated codes as stored on Surgery.preopOutstanding. */
  outstanding?: string | null;
  /** Who is sending — a reminder from nobody is easy to ignore. */
  fromName?: string | null;
}

/** The outstanding codes, in readable form, in the order they were recorded. */
export function outstandingItems(outstanding: string | null | undefined): string[] {
  if (!outstanding) return [];
  return outstanding
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    // An unrecognised code is shown as itself rather than dropped: a message
    // listing two of three items reads as complete and is worse than one that
    // shows something unfamiliar.
    .map((code) => OUTSTANDING_LABEL[code] ?? code.toLowerCase().replace(/_/g, ' '));
}

export function buildBookerChaseMessage(input: BookerChaseInput): string {
  const items = outstandingItems(input.outstanding);

  const who = input.patientName
    ? `${input.patientName}${input.folderNumber ? ` (${input.folderNumber})` : ''}`
    : 'a patient you booked';

  const when = [input.scheduledDate, input.scheduledTime].filter(Boolean).join(' at ');
  const where = input.theatreName ? ` in ${input.theatreName}` : '';

  const lines: string[] = [];
  lines.push(
    `Good day. This is about ${who}${input.procedureName ? `, listed for ${input.procedureName}` : ''}`
    + `${when ? `, scheduled ${when}` : ''}${where}.`,
  );

  if (items.length === 1) {
    lines.push('', `The case is still missing ${items[0]}.`);
  } else if (items.length > 1) {
    lines.push('', 'The case is still missing:', ...items.map((i) => `• ${i}`));
  } else {
    lines.push('', 'The case has outstanding pre-operative items.');
  }

  lines.push(
    '',
    'Kindly complete it before the patient is sent for, so the list is not delayed.',
  );
  if (input.fromName) lines.push('', `— ${input.fromName}, UNTH Theatre`);

  return lines.join('\n');
}

/**
 * The wa.me link, or null when the booker has no usable number.
 *
 * Null rather than a link to nowhere: wa.me opens a chat with nobody when the
 * number is malformed, which looks exactly like a message that was sent.
 */
export function bookerChaseWhatsAppUrl(
  phone: string | null | undefined,
  input: BookerChaseInput,
): string | null {
  return whatsappLink(phone, buildBookerChaseMessage(input));
}
