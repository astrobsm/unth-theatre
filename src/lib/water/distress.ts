// ============================================================
// The message that goes out when a theatre has no water
// ------------------------------------------------------------
// Asked for on 6 November: any water report filed with anything other than
// OK must raise "a very distress whatsapp message" to chase the head of
// water supply and the head of the works department.
//
// WHAT "DISTRESS" MEANS HERE, AND WHAT IT DOES NOT. It means the message
// says plainly that surgery is at risk and that it is not going to wait —
// because the alternative, which is what this hospital has had until now, is
// a bell notification in an app that the head of works opens on Fridays. It
// does NOT mean shouting at a named person. These two men are the ones who
// will have to fix it, usually at night, often with no parts; a message that
// opens by blaming them is one that gets read with resentment and acted on
// slowly. The urgency is attached to the theatre's situation, which is
// genuinely urgent, and never to their character.
//
// WHY THE PROBLEM AND THE ACTION ARE QUOTED BACK. "Theatre 3: NO_WATER" is a
// summons with no information in it. The head of works needs to know what
// was found and what has already been tried, so that he brings the right
// thing and does not repeat the last hour's work. That is exactly what the
// form now insists on collecting, and this is where it is spent.
//
// WHY THE PLAN B IS IN IT. The theatre's question is never "is it broken" —
// they can see that. It is "are we operating today". The plan B answers
// that, and putting it in front of the two people who can change it is how
// it gets corrected if it is wrong.
//
// NO PATIENT IS NAMED. These messages travel on personal handsets and get
// forwarded; rooms and water are the subject, and no case details belong in
// them.
// ============================================================

import { withNetworkNotice } from '@/lib/comms/networkNotice';
import { AREA_STATUS_LABEL, type WaterArea } from './waterAreas';
import { readinessStatusLabel } from './readiness';

/**
 * Who is chased, by role.
 *
 * Roles, not people: a named recipient in the code would be wrong the day
 * somebody is transferred, and the message would go on being addressed to a
 * man who left. The label is what the message calls them.
 */
export const DISTRESS_ROLES: { role: string; label: string }[] = [
  { role: 'WATER_SUPPLY_SUPERVISOR', label: 'Head of Water Supply' },
  { role: 'WORKS_SUPERVISOR', label: 'Head of Works Department' },
];

export function distressRoleLabel(role: string | null | undefined): string {
  const found = DISTRESS_ROLES.find((r) => r.role === role);
  return found ? found.label : 'Water supply / works';
}

/** A status in words, whichever of the two reports it came from. */
export function anyStatusLabel(status: string): string {
  return AREA_STATUS_LABEL[status] ?? readinessStatusLabel(status);
}

export interface DistressInput {
  /** Which form raised it. The two read differently and should. */
  kind: 'STATUS' | 'READINESS';
  /** What the message calls the person receiving it. */
  recipientLabel: string;
  /** Their name, when we have one. A message to a role is easy to pass on. */
  recipientName?: string | null;
  /** The rooms or promises that are not OK. */
  areas: readonly WaterArea[];
  /** How the theatres get water while this is unfixed. */
  contingencyPlan?: string | null;
  loggedByName: string;
  loggedByRole?: string | null;
  at: Date;
  /** OPERATIONAL/DEGRADED/CRITICAL/OFFLINE, or READY/AT_RISK/NOT_READY. */
  overall?: string | null;
  overheadTankLevel?: number | null;
  groundTankLevel?: number | null;
  /** One sentence on where the report was logged from. */
  locationSentence?: string | null;
  /** The surgery day a readiness report covers, already formatted. */
  forDate?: string | null;
  /** How many areas were checked in all, so the scale is honest. */
  areasChecked?: number;
}

function watStamp(at: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Africa/Lagos',
    }).format(at);
  } catch {
    return at.toISOString();
  }
}

/**
 * The chase, ready to paste into WhatsApp.
 *
 * Asterisks are WhatsApp's bold. The shape is fixed: what is wrong, where,
 * what has been done, what the theatres are doing meanwhile, and what is
 * being asked of the reader — in that order, because a message read on a
 * phone at night is read from the top until it stops being new.
 */
export function buildWaterDistressMessage(input: DistressInput): string {
  const worst = input.areas.length;
  const lines: string[] = [];

  lines.push('🚨🚨 *WATER EMERGENCY — THEATRE AT RISK* 🚨🚨');
  lines.push('');
  lines.push(
    input.recipientName
      ? `${input.recipientName} (${input.recipientLabel}),`
      : `${input.recipientLabel},`,
  );
  lines.push('');

  if (input.kind === 'STATUS') {
    lines.push(
      `*${worst} operating area${worst === 1 ? ' is' : 's are'} without usable water right now.* `
      + `Reported ${watStamp(input.at)} by ${input.loggedByName}`
      + `${input.loggedByRole ? ` (${input.loggedByRole.replace(/_/g, ' ').toLowerCase()})` : ''}`
      + `${input.areasChecked ? ` out of ${input.areasChecked} areas checked` : ''}.`,
    );
  } else {
    lines.push(
      `*Water for ${input.forDate || 'the next surgery day'} is not assured.* `
      + `The daily readiness report filed ${watStamp(input.at)} by ${input.loggedByName} `
      + `is *${readinessStatusLabel(input.overall || 'NOT_READY')}*.`,
    );
  }

  lines.push('');
  lines.push('*What is wrong:*');
  input.areas.forEach((a) => {
    const where = a.location ? ` — ${a.location}` : '';
    lines.push(`• *${a.name}*${where}: ${anyStatusLabel(a.status)}`);
    if ((a.problem ?? '').trim()) lines.push(`   Problem: ${(a.problem ?? '').trim()}`);
    if ((a.actionTaken ?? '').trim()) lines.push(`   Already done: ${(a.actionTaken ?? '').trim()}`);
  });

  if (input.kind === 'STATUS' && input.overall && input.overall !== 'OPERATIONAL') {
    lines.push('');
    lines.push(`Overall water supply is logged as *${input.overall}*.`);
  }

  const overhead = input.overheadTankLevel;
  const ground = input.groundTankLevel;
  if (typeof overhead === 'number' || typeof ground === 'number') {
    lines.push('');
    lines.push(
      '*Tanks:* '
      + [
        typeof overhead === 'number' ? `overhead ${overhead}%` : null,
        typeof ground === 'number' ? `ground ${ground}%` : null,
      ].filter(Boolean).join(', ')
      + '.',
    );
  }

  const plan = (input.contingencyPlan ?? '').trim();
  lines.push('');
  lines.push(
    plan
      ? `*Plan B for water today:* ${plan}`
      : '*Plan B for water today:* none has been given. The theatres have no stated '
        + 'alternative supply.',
  );

  lines.push('');
  lines.push(
    '*What we are asking:* attend to this now, and tell us what you find. '
    + 'Scrubbing, instrument decontamination and the restrooms all stop without water, '
    + 'and a list cannot safely start on a theatre that has none.',
  );

  lines.push('');
  lines.push(
    '*This does not close by itself.* It stays open on the theatre water board, '
    + 'and it is cleared only when somebody goes back, looks at the same area again '
    + 'and logs it as OK. Tell us when it is fixed and we will go and re-assess it.',
  );

  if (input.locationSentence) {
    lines.push('');
    lines.push(`_${input.locationSentence}_`);
  }

  lines.push('');
  lines.push('— UNTH Theatre, Operative Resource Manager');

  return withNetworkNotice(lines.join('\n'));
}

/**
 * The short line for the in-app bell, where there is no room for the above.
 *
 * The bell is not the delivery — see the WhatsApp hand-off — but it is what a
 * theatre manager sees first, and it has to name the rooms.
 */
export function distressNotificationLine(areas: readonly WaterArea[]): string {
  const named = areas.slice(0, 4)
    .map((a) => `${a.name} (${anyStatusLabel(a.status)})`)
    .join(', ');
  const rest = areas.length - Math.min(4, areas.length);
  return `${named}${rest > 0 ? ` +${rest} more` : ''}`;
}
