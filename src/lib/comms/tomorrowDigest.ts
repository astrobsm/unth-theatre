// ============================================================
// The six o'clock reminder about tomorrow's list
// ------------------------------------------------------------
// The problem this exists for, in the words it was reported in: staff are
// reluctant to look at the blockers on their surgeries. The app has known for
// months which cases are missing consent, labs or a prescription, and has been
// saying so on a dashboard nobody opens.
//
// ONE MESSAGE PER PERSON, NOT PER CASE. This is the decision that makes the
// difference between a reminder and a nuisance. A consultant with five cases
// tomorrow, four of them incomplete, gets ONE message that says so — not four.
// Four messages at six in the evening is how a sender gets muted, and a muted
// sender does not deliver the emergency escalation either.
//
// WHO IS TOLD. The surgeon, the supervising consultant and whoever booked the
// case: the three people who can actually resolve an outstanding item. Not the
// whole team, because a scrub nurse cannot obtain a consent and telling them
// nightly trains everyone to ignore it.
//
// WHAT IT DOES NOT SAY. Which patient, and what is wrong with them. That is
// clinical detail and checkSendAllowed refuses it on an external channel, which
// is right — a WhatsApp message sits unencrypted on a lock screen. It says how
// many cases and how many items, and the button opens the list behind a login.
// That constraint happens to serve the goal exactly: the only way to find out
// more is to open the app, which is the behaviour being asked for.
// ============================================================

import prisma from '@/lib/prisma';
import { queueMessage } from './send';
import { theatreDay, theatreDayBounds } from '@/lib/theatre/day';

/**
 * When a morning list starts, in hours after theatre midnight.
 *
 * Used only as the expiry: a reminder about a list that is already under way
 * is worse than no reminder, because it teaches the reader that these arrive
 * too late to act on and the next one goes unread.
 */
const LIST_STARTS_HOUR = 8;

/** Cases counted as still needing something done. */
export interface OutstandingCase {
  surgeryId: string;
  items: string[];
}

export interface DigestRecipient {
  userId: string;
  name: string;
  phone: string | null;
  /** Why they are on the list, for the record and for the log line. */
  roles: string[];
  cases: OutstandingCase[];
}

export interface DigestSummary {
  /** The theatre day the digest was about. */
  forDate: string;
  casesConsidered: number;
  casesWithOutstanding: number;
  recipients: number;
  queued: number;
  skipped: Array<{ name: string; reason: string }>;
}

/** "3 pre-op items", "consent", "consent and 2 pre-op items". */
export function describeItems(items: string[]): string {
  const unique: string[] = [];
  items.forEach((i) => { if (unique.indexOf(i) === -1) unique.push(i); });

  const hasConsent = unique.indexOf('CONSENT') !== -1;
  const others = unique.filter((i) => i !== 'CONSENT').length;

  if (hasConsent && others === 0) return 'a consent';
  if (hasConsent) return `a consent and ${others} pre-operative item${others > 1 ? 's' : ''}`;
  return `${others} pre-operative item${others > 1 ? 's' : ''}`;
}

/** "2 cases" / "1 case". Used where a template must not begin with a number alone. */
export function describeCases(n: number): string {
  return n === 1 ? '1 case' : `${n} cases`;
}

/**
 * Split the stored `preopOutstanding` field.
 *
 * Written as a comma-separated list of MissingItem codes by the booking routes.
 * Defensive about whitespace and empties because a value written by six
 * different call sites eventually contains all of them.
 */
export function parseOutstanding(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Build the digest for a given day without sending anything.
 *
 * Separated from the sending so it can be shown on screen — "this is who would
 * be messaged tonight and why" — which is the only way an administrator can
 * sensibly decide to switch this on.
 */
export async function buildTomorrowDigest(theatreDayMidnight: Date): Promise<{
  recipients: DigestRecipient[];
  casesConsidered: number;
}> {
  // Bounds are taken from a theatre-day midnight, not an arbitrary instant —
  // theatreDayBounds shifts by the WAT offset and assumes it was given one.
  const { start, end } = theatreDayBounds(theatreDayMidnight);

  const surgeries = await prisma.surgery.findMany({
    where: {
      scheduledDate: { gte: start, lt: end },
      // A case already cancelled or done needs no chasing.
      status: { notIn: ['CANCELLED', 'COMPLETED'] as never },
    },
    select: {
      id: true,
      preopOutstanding: true,
      surgeonId: true,
      surgeonName: true,
      supervisingConsultantId: true,
      supervisingConsultantName: true,
      bookedById: true,
      bookedByName: true,
    },
  });

  // Keyed by user so somebody who is both surgeon and booker on a case is one
  // recipient with two roles, not two messages.
  const byUser = new Map<string, DigestRecipient>();

  const add = (
    userId: string | null | undefined,
    name: string | null | undefined,
    role: string,
    c: OutstandingCase,
  ) => {
    if (!userId) return;
    let r = byUser.get(userId);
    if (!r) {
      r = { userId, name: name ?? 'Colleague', phone: null, roles: [], cases: [] };
      byUser.set(userId, r);
    }
    if (r.roles.indexOf(role) === -1) r.roles.push(role);
    if (!r.cases.some((x) => x.surgeryId === c.surgeryId)) r.cases.push(c);
  };

  for (const s of surgeries) {
    const items = parseOutstanding(s.preopOutstanding);
    if (!items.length) continue;
    const c: OutstandingCase = { surgeryId: s.id, items };

    add(s.surgeonId, s.surgeonName, 'Surgeon', c);
    add(s.supervisingConsultantId, s.supervisingConsultantName, 'Supervising consultant', c);
    add(s.bookedById, s.bookedByName, 'Booked the case', c);
  }

  // Phone numbers in one query rather than per recipient.
  const ids = Array.from(byUser.keys());
  if (ids.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, phoneNumber: true },
    });
    for (const u of users) {
      const r = byUser.get(u.id);
      if (!r) continue;
      r.phone = u.phoneNumber ?? null;
      // The account's own name beats whatever was denormalised onto the case.
      if (u.fullName) r.name = u.fullName;
    }
  }

  return { recipients: Array.from(byUser.values()), casesConsidered: surgeries.length };
}

/** A courteous short form: "Dr Okafor" from "Dr Chidi Okafor". */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return full.trim();
  const title = /^(dr|prof|mr|mrs|ms|miss)\.?$/i.test(parts[0]) ? parts[0] : null;
  const last = parts[parts.length - 1];
  return title ? `${title} ${last}` : full.trim();
}

/**
 * Queue tomorrow's reminders.
 *
 * @param now injected so the job can be exercised at a chosen time.
 */
export async function sendTomorrowDigest(now: Date = new Date()): Promise<DigestSummary> {
  // Tomorrow as the THEATRE reckons it. Taking "now + 24h" and using it
  // directly would put the boundary an hour out for the hour either side of
  // midnight, and file a case under the wrong day.
  const tomorrow = theatreDay(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const { recipients, casesConsidered } = await buildTomorrowDigest(tomorrow);

  const dateLabel = tomorrow.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });

  // Worthless once the list is under way. An expiry means a message stuck
  // behind a provider outage is dropped rather than arriving mid-operation and
  // teaching everybody that these reminders come too late to act on.
  const { start: dayStart } = theatreDayBounds(tomorrow);
  const listStart = new Date(dayStart.getTime() + LIST_STARTS_HOUR * 60 * 60_000);

  const summary: DigestSummary = {
    forDate: dateLabel,
    casesConsidered,
    casesWithOutstanding: 0,
    recipients: recipients.length,
    queued: 0,
    skipped: [],
  };

  const seenCases = new Set<string>();
  for (const r of recipients) for (const c of r.cases) seenCases.add(c.surgeryId);
  summary.casesWithOutstanding = seenCases.size;

  for (const r of recipients) {
    if (!r.phone) {
      summary.skipped.push({ name: r.name, reason: 'No phone number on their ORM account.' });
      continue;
    }

    const allItems: string[] = [];
    r.cases.forEach((c) => c.items.forEach((i) => allItems.push(i)));

    const res = await queueMessage({
      channel: 'WHATSAPP',
      priority: 'NORMAL',
      recipientUserId: r.userId,
      recipientName: r.name,
      recipientAddress: r.phone,
      recipientIsStaff: true,
      templateCode: 'BLOCKERS_TOMORROW',
      variables: {
        name: shortName(r.name),
        caseCount: describeCases(r.cases.length),
        date: dateLabel,
        outstanding: describeItems(allItems),
      },
      // The button opens their own list rather than one case: the message is
      // about several, and dropping somebody into one of five is worse than
      // dropping them into the list that holds all of them.
      relatedType: 'my_list',
      relatedId: r.userId,
      trigger: 'BLOCKERS_TOMORROW',
      // One per person per day. A re-run of the cron cannot double-message, and
      // the date is in the key so tomorrow's digest is a different message.
      scope: `${r.userId}:${dateLabel}`,
      expiresAt: listStart,
    });

    if (res.queued) summary.queued += 1;
    else if (!res.duplicate) {
      summary.skipped.push({ name: r.name, reason: res.reason ?? 'Refused by the send policy.' });
    }
  }

  return summary;
}
