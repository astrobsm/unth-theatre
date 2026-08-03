// ============================================================
// One way onto the emergency board
// ------------------------------------------------------------
// A surgery can become an EMERGENCY through at least five routes:
//
//   1. the emergency booking module            (creates its own booking)
//   2. the surgeries form, type = EMERGENCY
//   3. PATCH /api/surgeries/[id] changing the type
//   4. POST /api/emergency-alerts, which upgrades the surgery
//   5. whatever gets added next
//
// Only the first ever created an EmergencySurgeryBooking — and that row is what
// the emergency list, the team availability card, the radio broadcast and the
// response-monitoring board all read. Sixteen real emergencies had reached the
// database through the other routes and were invisible to every one of them.
//
// Patching each caller would fix today and rot tomorrow, because route six will
// be written by somebody who has never read this comment. So there is one
// function, every caller uses it, and `reconcileEmergencyBoard` sweeps up
// anything that still slips through — including from code that does not exist
// yet.
// ============================================================

import prisma from '@/lib/prisma';

export type EnsureOutcome = 'created' | 'already-listed' | 'not-an-emergency' | 'failed';

export interface EnsureOptions {
  /**
   * Retire the radio announcement before it can be made.
   *
   * /api/radio/queue promotes every SUBMITTED emergency booking onto the
   * theatre radio, repeating until acknowledged. That is right for an
   * emergency happening now and wrong for one being adopted retrospectively —
   * a reconciliation sweep must never announce last week's cases across the
   * theatre complex.
   */
  suppressRadio?: boolean;
  /** Attributed as the requester when the surgeon was typed as free text. */
  fallbackUserId?: string;
}

/** Mirror the surgery rather than inventing a clinical state. */
function bookingStatusFor(surgeryStatus: string): string {
  if (surgeryStatus === 'COMPLETED') return 'COMPLETED';
  if (surgeryStatus === 'CANCELLED') return 'CANCELLED';
  if (surgeryStatus === 'IN_PROGRESS') return 'IN_PROGRESS';
  return 'SUBMITTED';
}

/**
 * Make sure this surgery appears on the emergency board.
 *
 * Idempotent — emergency_surgery_bookings.surgeryId is UNIQUE, so a repeat call
 * is a no-op. Never throws: a booking that saved but missed the board is
 * recoverable, a booking that did not save is a patient without a theatre slot.
 */
export async function ensureEmergencyBooking(
  surgeryId: string,
  options: EnsureOptions = {}
): Promise<EnsureOutcome> {
  try {
    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      select: {
        id: true, surgeryType: true, status: true, procedureName: true, unit: true,
        indication: true, surgeonId: true, surgeonName: true, anesthesiaType: true,
        estimatedDuration: true, theatreId: true, location: true, createdAt: true,
        needBloodTransfusion: true, otherSpecialNeeds: true,
        scheduledDate: true, scheduledTime: true,
        patient: { select: { name: true, folderNumber: true, age: true, gender: true, ward: true } },
        emergencyBooking: { select: { id: true } },
      },
    });

    if (!surgery) return 'failed';
    if (surgery.surgeryType !== 'EMERGENCY') return 'not-an-emergency';
    if (surgery.emergencyBooking) return 'already-listed';

    // surgeonId is a required relation. Where the surgeon was typed as free
    // text, fall back to whoever is acting, then to any administrator — the
    // row cannot exist without one, and an unattributed emergency is worse
    // than one attributed to the person who caused it to be recorded.
    let surgeonId = surgery.surgeonId ?? options.fallbackUserId ?? null;
    if (!surgeonId && surgery.surgeonName) {
      const match = await prisma.user.findFirst({
        where: { fullName: { equals: surgery.surgeonName, mode: 'insensitive' } },
        select: { id: true },
      });
      surgeonId = match?.id ?? null;
    }
    if (!surgeonId) {
      const admin = await prisma.user.findFirst({
        where: { role: { in: ['SYSTEM_ADMINISTRATOR', 'ADMIN'] } },
        select: { id: true },
      });
      surgeonId = admin?.id ?? null;
    }
    if (!surgeonId) return 'failed';

    const booking = await prisma.emergencySurgeryBooking.create({
      data: {
        surgeryId: surgery.id,
        patientName: surgery.patient?.name ?? 'Unknown',
        folderNumber: surgery.patient?.folderNumber ?? '',
        age: surgery.patient?.age ?? null,
        gender: surgery.patient?.gender ?? null,
        ward: surgery.patient?.ward ?? null,
        // The surgeries form has no separate diagnosis field; the clinical
        // indication is what was actually written about this patient.
        diagnosis: surgery.indication,
        procedureName: surgery.procedureName,
        surgicalUnit: surgery.unit,
        indication: surgery.indication,
        surgeonId,
        surgeonName: surgery.surgeonName || 'Not named',
        anaesthesiaType: surgery.anesthesiaType ?? null,
        // The emergency was raised when the surgery was booked, not now.
        requestedAt: surgery.createdAt,
        requiredByTime: startInstant(surgery.scheduledDate, surgery.scheduledTime),
        estimatedDuration: surgery.estimatedDuration,
        theatreId: surgery.theatreId ?? null,
        theatreName: surgery.location ?? null,
        priority: 'CRITICAL',
        bloodRequired: surgery.needBloodTransfusion,
        bloodUnits: surgery.needBloodTransfusion ? 2 : null,
        specialRequirements: surgery.otherSpecialNeeds ?? null,
        status: bookingStatusFor(surgery.status) as never,
      },
      select: { id: true },
    });

    if (options.suppressRadio) {
      // The queue skips any booking that already has a radio row, whatever its
      // status. Writing a retired one here means the announcement can never be
      // made rather than being made and then stopped.
      await prisma.radioAnnouncement.create({
        data: {
          category: 'EMERGENCY',
          title: `Recorded retrospectively — ${surgery.procedureName}`,
          message: 'Adopted onto the emergency board after the fact. Not for broadcast.',
          priority: 0,
          status: 'CANCELLED',
          triggerSource: 'SYSTEM',
          requireAck: false,
          repeatUntilAck: false,
          metadata: JSON.stringify({ emergencyBookingId: booking.id, reconciled: true }),
        },
      }).catch(() => { /* the booking matters more than the suppression row */ });
    }

    return 'created';
  } catch (error: unknown) {
    // P2002 — another request won the race and it is already on the board.
    if ((error as { code?: string })?.code === 'P2002') return 'already-listed';
    console.error('[emergency] could not add surgery to the emergency board:', surgeryId, error);
    return 'failed';
  }
}

/** "HH:MM" on the booked day, as an instant. Falls back to the day itself. */
function startInstant(date: Date, time: string | null): Date {
  const m = time ? /^(\d{1,2}):(\d{2})$/.exec(time.trim()) : null;
  if (!m) return date;
  const d = new Date(date);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

/**
 * How recent an emergency must be to be worth announcing when it is adopted.
 *
 * Inside this window the case is plausibly still live and the theatre should
 * hear about it. Outside it, the sweep is tidying history and must stay silent.
 */
export const ANNOUNCE_IF_NEWER_THAN_MS = 6 * 60 * 60 * 1000;

/**
 * Should adopting this case put it on the radio?
 *
 * Pure, exported and tested, because getting it backwards is silent in both
 * directions: too eager and the theatre hears about last month's cases; too
 * shy and a genuine emergency is adopted without anybody being told.
 */
export function shouldAnnounceOnAdoption(surgeryCreatedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - surgeryCreatedAt.getTime() < ANNOUNCE_IF_NEWER_THAN_MS;
}

export interface ReconcileResult {
  examined: number;
  added: number;
  failed: number;
}

/**
 * Adopt every emergency that reached the database without a booking row.
 *
 * This is the guarantee. Whatever route created the surgery — including one
 * written after this code — it appears on the emergency board.
 *
 * Bounded so it can run on a page load without becoming the slowest thing on
 * the screen. Anything older than a few hours is adopted silently.
 */
export async function reconcileEmergencyBoard(limit = 25): Promise<ReconcileResult> {
  try {
    const orphans = await prisma.surgery.findMany({
      where: { surgeryType: 'EMERGENCY', emergencyBooking: { is: null } },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    let added = 0;
    let failed = 0;
    const now = Date.now();

    for (const o of orphans) {
      const announce = shouldAnnounceOnAdoption(o.createdAt, new Date(now));
      const outcome = await ensureEmergencyBooking(o.id, { suppressRadio: !announce });
      if (outcome === 'created') added++;
      else if (outcome === 'failed') failed++;
    }

    return { examined: orphans.length, added, failed };
  } catch (error) {
    console.error('[emergency] board reconciliation failed:', error);
    return { examined: 0, added: 0, failed: 0 };
  }
}
