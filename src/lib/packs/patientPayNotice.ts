/**
 * Telling a patient there is a pack waiting to be paid for — and why what they
 * buy outside the hospital cannot be used on them.
 *
 * The board already shows "Consumable: Prescribed, not packed (0/30)" and gives
 * the pack provider a row of WhatsApp buttons. Every one of those buttons
 * reaches a member of STAFF. The person who actually has to act — the patient
 * who has not yet paid — was the one person on that card nobody could contact,
 * so the pack sat at 0/30 until the morning of surgery and the case was
 * delayed or cancelled at the door.
 *
 * THE SECOND HALF IS A PATIENT-SAFETY MESSAGE, NOT A COMMERCIAL ONE. Patients
 * here are routinely advised by well-meaning relatives to buy drugs and
 * consumables cheaply outside and bring them in. The theatre cannot use those,
 * and the reason has to be given properly or the refusal reads as the hospital
 * protecting its own sales. So the message explains what cannot be known about
 * an item that came from outside — whether it is genuine, whether it was kept
 * at the right temperature, whether its sterile wrapping is still intact, and
 * which batch it came from if a fault is found later — and says plainly that
 * anything already bought should be brought to the theatre pharmacy to be
 * checked rather than thrown away.
 *
 * WHO IT IS ADDRESSED TO CHANGES THE WORDING. patientContact() falls back to
 * the next of kin when the patient has no phone of their own, which is common
 * here. "You have prescriptions to pay for" sent to somebody's son is wrong in
 * a way that makes the hospital look careless, so the builder takes the owner
 * and writes about the patient in the third person when the phone is not
 * theirs.
 *
 * Pure: no database, no network. The wording is the part that must be arguable
 * against a test rather than discovered in somebody's WhatsApp.
 */

import type { ContactOwner } from '@/lib/patients/contact';

/**
 * Who may bring up a patient's phone number from this board.
 *
 * The two offices the money is actually paid at, the store keeper who stands in
 * for the consumable office, and theatre management. Deliberately NOT everybody
 * who can see the readiness board: the board is open wide because knowing a
 * case is not ready is operational, while a patient's personal number is not.
 */
export const PATIENT_CONTACT_ROLES = [
  'CONSUMABLE_PACK_PROVIDER',
  'THEATRE_STORE_KEEPER',
  'PHARMACIST',
  'THEATRE_MANAGER',
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
];

export function canNotifyPatientAboutPacks(role: string | null | undefined): boolean {
  return PATIENT_CONTACT_ROLES.includes((role ?? '').trim());
}

/** Where the money is actually paid. */
export type PayPoint = 'CONSUMABLE_OFFICE' | 'THEATRE_PHARMACY';

export const PAY_POINT_LABEL: Record<PayPoint, string> = {
  CONSUMABLE_OFFICE: 'the CONSUMABLE OFFICE',
  THEATRE_PHARMACY: 'the THEATRE PHARMACY',
};

export interface OutstandingPacks {
  /** Consumable items prescribed but not yet paid for / packed. */
  consumable: number;
  /** Pharmacy items prescribed but not yet paid for / packed. */
  pharmacy: number;
}

export function outstandingPayPoints(o: OutstandingPacks): PayPoint[] {
  const points: PayPoint[] = [];
  if (o.consumable > 0) points.push('CONSUMABLE_OFFICE');
  if (o.pharmacy > 0) points.push('THEATRE_PHARMACY');
  return points;
}

export interface PayNoticeInput {
  patientName: string;
  outstanding: OutstandingPacks;
  /** Whose phone this is going to. */
  owner: ContactOwner;
  procedureName?: string | null;
  scheduledAt?: Date | string | null;
  theatreName?: string | null;
  /** Who is sending it, for the sign-off. */
  senderName?: string | null;
  senderOffice?: string | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * "Tuesday 24 November", composed from local parts.
 *
 * Never toLocaleDateString: this machine and the theatre server are both WAT
 * but print differently, and a surgery date that reads one way on the board and
 * another in the patient's WhatsApp is the thing an argument at the door turns
 * on.
 */
function dayText(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Why this notice cannot be sent, or null when it can. */
export function payNoticeProblem(input: {
  outstanding: OutstandingPacks;
  hasContact: boolean;
}): string | null {
  if (outstandingPayPoints(input.outstanding).length === 0) {
    return 'Nothing is outstanding on this case — both packs are accounted for. '
      + 'There is nothing to ask the patient to pay for.';
  }
  if (!input.hasContact) {
    return 'This patient has no phone number and no next-of-kin number on file, so '
      + 'there is nobody to send this to. Add a number on the patient record first.';
  }
  return null;
}

/**
 * The full message.
 *
 * Long, and deliberately so. The payment half is three lines; the rest is the
 * safety explanation, which is the only part that changes what somebody does
 * when a relative offers to buy the drugs cheaper at the market. A refusal
 * without a reason gets ignored and the items arrive anyway on the morning.
 */
export function buildPatientPayMessage(input: PayNoticeInput): string {
  const toPatient = input.owner === 'PATIENT';
  const name = input.patientName.trim() || 'the patient';
  const points = outstandingPayPoints(input.outstanding);

  const lines: string[] = [
    '*UNIVERSITY OF NIGERIA TEACHING HOSPITAL, ITUKU-OZALLA*',
    'Theatre Complex',
    '',
  ];

  if (toPatient) {
    lines.push(`Good day, ${name}.`, '');
    lines.push(
      'You are on the theatre list for surgery'
      + (input.procedureName ? ` (${input.procedureName})` : '')
      + (dayText(input.scheduledAt) ? ` on ${dayText(input.scheduledAt)}` : '')
      + '.',
    );
  } else {
    lines.push('Good day.', '');
    lines.push(
      `${name} is on the theatre list for surgery`
      + (input.procedureName ? ` (${input.procedureName})` : '')
      + (dayText(input.scheduledAt) ? ` on ${dayText(input.scheduledAt)}` : '')
      + '. This message is for you as the person we can reach.',
    );
  }

  lines.push('', '*ITEMS PRESCRIBED AND WAITING TO BE PAID FOR*', '');

  if (input.outstanding.consumable > 0) {
    lines.push(
      `• Theatre consumables — ${input.outstanding.consumable} item`
      + `${input.outstanding.consumable === 1 ? '' : 's'}. `
      + `Pay at ${PAY_POINT_LABEL.CONSUMABLE_OFFICE}.`,
    );
  }
  if (input.outstanding.pharmacy > 0) {
    lines.push(
      `• Medicines — ${input.outstanding.pharmacy} item`
      + `${input.outstanding.pharmacy === 1 ? '' : 's'}. `
      + `Pay at ${PAY_POINT_LABEL.THEATRE_PHARMACY}.`,
    );
  }

  lines.push(
    '',
    points.length > 1
      ? 'Please settle both before the day of surgery so that the pack can be made '
        + 'ready in time.'
      : 'Please settle this before the day of surgery so that the pack can be made '
        + 'ready in time.',
    '',
    '*PLEASE READ — THIS IS ABOUT YOUR SAFETY*',
    '',
    'Any drug or material bought outside this hospital cannot be used in the '
    + 'theatre unless it was supplied by the theatre pharmacy, or brought to the '
    + 'theatre pharmacy and checked first.',
    '',
    'This is not about money. It is because, for an item that comes from outside, '
    + 'we have no way of knowing:',
    '',
    '• whether it is genuine, or a counterfeit made to look like it;',
    '• whether it has truly expired, or been relabelled with a new date;',
    '• whether it was stored at the right temperature — some medicines quietly '
    + 'lose their strength after a few hours in the heat, and still look perfectly '
    + 'normal;',
    '• whether the sterile wrapping is still intact. Once a sterile item has been '
    + 'opened, squeezed into a bag or handled, it is no longer sterile — and it is '
    + 'going inside the body;',
    '• which batch it came from, so that if a fault is discovered later we can '
    + 'trace exactly what was used.',
    '',
    'During an operation these are not small risks. An anaesthetic drug that is '
    + 'weaker than it claims can wear off at the wrong moment. An antibiotic that '
    + 'is fake does not prevent the infection it was given for. A drug meant to '
    + 'stop bleeding that does not work cannot be replaced quickly once bleeding '
    + 'has started. An unsterile material introduces infection directly into a '
    + 'clean wound.',
    '',
    'The theatre pharmacy can account for where every item it supplies came from. '
    + 'That is why the hospital will not use what it cannot verify — not to make '
    + 'you spend more, but because the risk of the alternative falls on '
    + `${toPatient ? 'you' : name}, on the operating table, where it cannot be undone.`,
    '',
    '*IF YOU HAVE ALREADY BOUGHT SOMETHING OUTSIDE*',
    '',
    'Please do not throw it away, and please do not bring it straight to the '
    + 'theatre on the day. Bring it to the theatre pharmacy before the day of '
    + 'surgery. Some items can be checked and accepted; the pharmacist will tell '
    + 'you which.',
    '',
    'If paying is difficult, please come and tell us early rather than on the '
    + 'morning of surgery. We would far rather help you sort it out in advance '
    + 'than send you home from the theatre door.',
    '',
  );

  const office = input.senderOffice?.trim()
    || (points.length === 1 && points[0] === 'THEATRE_PHARMACY'
      ? 'Theatre Pharmacy'
      : 'Theatre Consumable Office');
  if (input.senderName?.trim()) lines.push(`— ${input.senderName.trim()}, ${office}`);
  else lines.push(`— ${office}`);
  lines.push('UNTH Ituku-Ozalla Theatre Complex');

  return lines.join('\n');
}

/**
 * A short version, for a phone call or where a long message will not be read.
 *
 * It keeps the one sentence that changes behaviour — bring it to the pharmacy
 * to be checked — and drops the explanation, because a caller can give that in
 * their own words and a long SMS cannot.
 */
export function buildShortPayMessage(input: PayNoticeInput): string {
  const toPatient = input.owner === 'PATIENT';
  const name = input.patientName.trim() || 'the patient';
  const bits: string[] = [];

  if (input.outstanding.consumable > 0) {
    bits.push(`${input.outstanding.consumable} consumable item`
      + `${input.outstanding.consumable === 1 ? '' : 's'} at the consumable office`);
  }
  if (input.outstanding.pharmacy > 0) {
    bits.push(`${input.outstanding.pharmacy} medicine`
      + `${input.outstanding.pharmacy === 1 ? '' : 's'} at the theatre pharmacy`);
  }

  const who = toPatient ? 'You have' : `${name} has`;
  const day = dayText(input.scheduledAt);

  return [
    'UNTH Theatre: ',
    `${who} ${bits.join(' and ')} still to be paid for`,
    day ? ` before surgery on ${day}` : ' before the day of surgery',
    '. Drugs or materials bought outside cannot be used in theatre unless the ',
    'theatre pharmacy has supplied or checked them — please bring anything already ',
    'bought to the pharmacy first. This is for patient safety.',
  ].join('');
}
