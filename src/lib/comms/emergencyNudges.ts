// ============================================================
// Chasing an emergency that has not started
// ------------------------------------------------------------
// WHAT THIS IS, AND WHAT IT IS NOT. This is a reminder ladder on WhatsApp. It
// is deliberately NOT the escalation ladder in lib/emergencyEscalation.ts,
// which fires at 60, 120 and 180 minutes and at its third rung drafts an
// invitation to appear before the Theatre Audit Committee.
//
// The two were kept apart on purpose. Nudges want to be frequent — every
// thirty minutes until the case starts — and consequences want to be rare, or
// they stop being consequences. Re-timing the governance ladder to this cadence
// would summon consultants to committee every half hour, and within a week
// nobody would attend one and the committee would mean nothing.
//
// So: reminders here, governance there, and the two clocks run independently
// against the same case. A team being nudged at 30 minutes is not being
// reported to anybody; a team still going at 180 minutes is, by the other
// ladder, exactly as it was before this file existed.
//
// THE CLOCK STARTS AT BOOKING, which is what was asked for and is also the
// defensible choice: an emergency booked is an emergency that should be under
// way, and measuring from a "required by" time lets a generous estimate hide a
// delay.
//
// THE MEDICOLEGAL SENTENCE appears from the second rung, not the first. A first
// nudge that opens by invoking medicolegal exposure reads as a threat over what
// is very often a team already scrubbing, and it is the fastest way to have the
// whole channel muted. At an hour, unexplained, it is a fact the team is
// entitled to be reminded of.
// ============================================================

import prisma from '@/lib/prisma';
import { queueMessage } from './send';

/** First nudge, in minutes after the booking was made. */
export const FIRST_NUDGE_MINUTES = 30;
/** Second nudge — the one that names the medicolegal position. */
export const SECOND_NUDGE_MINUTES = 60;
/** And every this-many minutes after that, until the case is settled. */
export const REPEAT_EVERY_MINUTES = 30;

/**
 * Stop nudging eventually.
 *
 * Not because the delay stops mattering, but because a message arriving every
 * half hour for twelve hours is one nobody reads, and by then the governance
 * ladder has done its work and the matter is with the audit committee rather
 * than with a reminder. Twenty-four rungs is twelve hours.
 */
export const MAX_NUDGES = 24;

export interface NudgeStep {
  /** 1, 2, 3 … in order of sending. */
  index: number;
  minutes: number;
  templateCode: string;
}

/**
 * Which rung is due at this many minutes, or null.
 *
 * Pure, so the ladder can be proved without a database or a clock.
 */
export function nudgeDueAt(minutesSinceBooking: number): NudgeStep | null {
  if (minutesSinceBooking < FIRST_NUDGE_MINUTES) return null;

  if (minutesSinceBooking < SECOND_NUDGE_MINUTES) {
    return { index: 1, minutes: FIRST_NUDGE_MINUTES, templateCode: 'EMERGENCY_NOT_STARTED_30' };
  }
  if (minutesSinceBooking < SECOND_NUDGE_MINUTES + REPEAT_EVERY_MINUTES) {
    return { index: 2, minutes: SECOND_NUDGE_MINUTES, templateCode: 'EMERGENCY_NOT_STARTED_60' };
  }

  // Every REPEAT_EVERY_MINUTES after the second rung.
  const past = minutesSinceBooking - SECOND_NUDGE_MINUTES;
  const steps = Math.floor(past / REPEAT_EVERY_MINUTES);
  const index = 2 + steps;
  if (index > MAX_NUDGES) return null;

  return {
    index,
    minutes: SECOND_NUDGE_MINUTES + steps * REPEAT_EVERY_MINUTES,
    templateCode: 'EMERGENCY_NOT_STARTED_REPEAT',
  };
}

/** "45 minutes", "1 hour 15 minutes", "2 hours". */
export function humaniseElapsed(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} minutes`;
  const hours = `${h} hour${h > 1 ? 's' : ''}`;
  return m === 0 ? hours : `${hours} ${m} minutes`;
}

/** A courteous short form: "Dr Okafor" from "Dr Chidi Okafor". */
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return full.trim();
  const title = /^(dr|prof|mr|mrs|ms|miss)\.?$/i.test(parts[0]) ? parts[0] : null;
  return title ? `${title} ${parts[parts.length - 1]}` : full.trim();
}

export interface NudgeSummary {
  checked: number;
  nudged: Array<{ bookingId: string; step: number; minutes: number; recipients: number }>;
  queued: number;
  skipped: Array<{ name: string; reason: string }>;
}

/** Statuses meaning the case is still waiting to start. */
const OPEN_STATUSES = ['SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED'];

/**
 * Nudge every open emergency that is overdue a rung.
 *
 * @param now injected so the ladder can be exercised at a chosen time.
 */
export async function runEmergencyNudges(now: Date = new Date()): Promise<NudgeSummary> {
  const summary: NudgeSummary = { checked: 0, nudged: [], queued: 0, skipped: [] };

  const bookings = await prisma.emergencySurgeryBooking.findMany({
    where: {
      status: { in: OPEN_STATUSES as never },
      // Nothing older than a day: a booking left open overnight is a data
      // problem for somebody to clear up, not a team to chase at 4 a.m.
      createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      createdAt: true,
      surgeonId: true,
      surgeonName: true,
      anesthetistId: true,
      anesthetistName: true,
      surgeon: { select: { id: true, fullName: true, phoneNumber: true } },
      anesthetist: { select: { id: true, fullName: true, phoneNumber: true } },
      // Everyone who answered the call-out, whatever they answered. Somebody
      // who said they were delayed is still on the case and still needs to know
      // it has not started.
      teamAvailability: {
        select: {
          userId: true, userName: true,
          user: { select: { fullName: true, phoneNumber: true } },
        },
      },
    },
  });

  summary.checked = bookings.length;

  for (const b of bookings) {
    const minutes = Math.floor((now.getTime() - b.createdAt.getTime()) / 60_000);
    const step = nudgeDueAt(minutes);
    if (!step) continue;

    const bookedAt = b.createdAt.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos',
    });
    const elapsed = humaniseElapsed(step.minutes);

    // Everyone named on the case. The whole team, deliberately — a delay is
    // rarely one person's to fix, and a surgeon chased alone for a theatre that
    // has no technician is being blamed for somebody else's blocker.
    const people: Array<{ userId: string; name: string; phone: string | null }> = [];
    const push = (userId: string | null | undefined, name: string | null | undefined,
      phone: string | null | undefined) => {
      if (!userId || people.some((p) => p.userId === userId)) return;
      people.push({ userId, name: name ?? 'Colleague', phone: phone ?? null });
    };

    push(b.surgeonId, b.surgeon?.fullName ?? b.surgeonName, b.surgeon?.phoneNumber);
    push(b.anesthetistId, b.anesthetist?.fullName ?? b.anesthetistName, b.anesthetist?.phoneNumber);
    for (const m of b.teamAvailability) {
      push(m.userId, m.user?.fullName ?? m.userName, m.user?.phoneNumber);
    }

    let queuedHere = 0;
    for (const p of people) {
      if (!p.phone) {
        summary.skipped.push({ name: p.name, reason: 'No phone number on their ORM account.' });
        continue;
      }

      const res = await queueMessage({
        channel: 'WHATSAPP',
        // An emergency that has not started outranks everything else queued.
        priority: 'URGENT',
        recipientUserId: p.userId,
        recipientName: p.name,
        recipientAddress: p.phone,
        recipientIsStaff: true,
        templateCode: step.templateCode,
        variables: { name: shortName(p.name), bookedAt, elapsed },
        relatedType: 'emergency_booking',
        relatedId: b.id,
        trigger: 'EMERGENCY_NOT_STARTED',
        // The rung is in the key, so a cron running every fifteen minutes
        // cannot send the same rung twice, and the next rung is a new message.
        scope: `${b.id}:${p.userId}:${step.index}`,
        escalationLevel: step.index,
        // A nudge that could not be delivered within the repeat interval is
        // superseded by the next rung rather than arriving late behind it.
        expiresAt: new Date(now.getTime() + REPEAT_EVERY_MINUTES * 60_000),
      });

      if (res.queued) { summary.queued += 1; queuedHere += 1; }
      else if (!res.duplicate) {
        summary.skipped.push({ name: p.name, reason: res.reason ?? 'Refused by the send policy.' });
      }
    }

    if (queuedHere) {
      summary.nudged.push({
        bookingId: b.id, step: step.index, minutes: step.minutes, recipients: queuedHere,
      });
    }
  }

  return summary;
}
