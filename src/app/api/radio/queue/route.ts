import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/radio/queue
// Returns the active announcements the radio client should play.
// 1. Promotes scheduled broadcasts whose time has arrived (or whose interval
//    has elapsed) into RadioAnnouncement rows.
// 2. Returns PENDING / PLAYING announcements ordered by priority desc.
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const dow = now.getDay(); // 0..6
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const broadcasts = await prisma.radioBroadcast.findMany({
    where: { active: true },
  });

  for (const b of broadcasts) {
    // date window
    if (b.startDate && now < b.startDate) continue;
    if (b.endDate && now > b.endDate) continue;
    if (!b.daysOfWeek.split(',').map((s) => s.trim()).includes(String(dow))) continue;

    let shouldFire = false;

    if (b.timeOfDay && b.timeOfDay === hhmm) {
      // fire at exact minute, but not twice in the same minute
      if (
        !b.lastTriggered ||
        now.getTime() - b.lastTriggered.getTime() > 60 * 1000
      ) {
        shouldFire = true;
      }
    } else if (b.intervalMins && b.intervalMins > 0) {
      if (
        !b.lastTriggered ||
        now.getTime() - b.lastTriggered.getTime() >= b.intervalMins * 60 * 1000
      ) {
        shouldFire = true;
      }
    }

    if (!shouldFire) continue;

    await prisma.radioAnnouncement.create({
      data: {
        broadcastId: b.id,
        category: b.category,
        title: b.title,
        message: b.message ?? b.title,
        audioUrl: b.audioUrl,
        priority: b.priority,
        triggerSource: 'SCHEDULED',
        status: 'PENDING',
      },
    });
    await prisma.radioBroadcast.update({
      where: { id: b.id },
      data: { lastTriggered: now },
    });
  }

  // ----------------------------------------------------------------
  // Promote scheduled Announcements (admin Announcements module) whose
  // scheduledDate has arrived into the radio queue. Each is enqueued as a
  // RadioAnnouncement with audioUrl pointing at the streaming endpoint so
  // the RadioPlayer plays the uploaded MP3 directly.
  // ----------------------------------------------------------------
  try {
    const due = await prisma.announcement.findMany({
      where: {
        status: { in: ['SCHEDULED', 'ACTIVE'] },
        scheduledDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      take: 20,
    });

    for (const a of due) {
      // Decide whether this announcement is due to play right now (taking
      // recurring frequency + lastPlayedAt into account so we don't spam).
      let shouldFire = false;
      const last = a.lastPlayedAt?.getTime() ?? 0;
      const sinceLast = now.getTime() - last;

      if (a.frequency === 'ONE_TIME') {
        shouldFire = !a.lastPlayedAt;
      } else if (a.frequency === 'DAILY') {
        // Fire once per calendar day at/after scheduled time of day.
        shouldFire = !a.lastPlayedAt || sinceLast >= 23 * 60 * 60 * 1000;
      } else if (a.frequency === 'WEEKLY') {
        let allowToday = true;
        if (a.repeatDays) {
          try {
            const days = JSON.parse(a.repeatDays) as number[];
            allowToday = days.includes(dow);
          } catch { /* keep true on malformed json */ }
        }
        shouldFire =
          allowToday && (!a.lastPlayedAt || sinceLast >= 23 * 60 * 60 * 1000);
      } else if (a.frequency === 'CUSTOM_INTERVAL' && a.customIntervalMin) {
        shouldFire =
          !a.lastPlayedAt || sinceLast >= a.customIntervalMin * 60 * 1000;
      }

      if (!shouldFire) continue;

      // Avoid double-enqueue if a PENDING/PLAYING radio row for this
      // announcement already exists (e.g. created in a previous poll within
      // the same minute).
      const existing = await prisma.radioAnnouncement.findFirst({
        where: {
          status: { in: ['PENDING', 'PLAYING'] },
          metadata: { contains: `"announcementId":"${a.id}"` },
        },
      });
      if (existing) continue;

      await prisma.radioAnnouncement.create({
        data: {
          category: 'CUSTOM',
          title: a.title,
          message: a.description || a.title,
          audioUrl: `/api/announcements/${a.id}/audio`,
          priority: 60,
          triggerSource: 'SCHEDULED',
          status: 'PENDING',
          metadata: JSON.stringify({ announcementId: a.id }),
        },
      });

      await prisma.announcement.update({
        where: { id: a.id },
        data: {
          lastPlayedAt: now,
          playCount: { increment: 1 },
          status: a.frequency === 'ONE_TIME' ? 'PLAYED' : 'ACTIVE',
        },
      });
    }
  } catch (err) {
    console.error('[radio/queue] failed to promote scheduled announcements:', err);
  }

  // ----------------------------------------------------------------
  // Auto-broadcast EVERY submitted Emergency Surgery Booking and every
  // submitted Emergency Prescription that is still awaiting action.
  // Each one becomes a single PENDING radio announcement that:
  //   • is EMERGENCY priority (100, top of queue)
  //   • requires acknowledgment
  //   • repeats every 5 minutes until acknowledged
  //   • speaks the message THREE TIMES in a row each cycle (the text is
  //     baked with a 3× repeat so the TTS engine voices it three times
  //     before the 5-minute gap kicks in)
  // We dedupe by stamping `metadata.emergencyBookingId` / `.prescriptionId`
  // — if ANY radio row already references that source we do nothing, so
  // once a clinician has acknowledged it the radio falls silent for that
  // case forever (until a brand-new submission is made).
  // ----------------------------------------------------------------
  try {
    const ACTIVE_BOOKING_STATUSES = ['SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED'] as const;
    const bookings = await prisma.emergencySurgeryBooking.findMany({
      where: { status: { in: ACTIVE_BOOKING_STATUSES as any } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    for (const b of bookings) {
      const dup = await prisma.radioAnnouncement.findFirst({
        where: { metadata: { contains: `"emergencyBookingId":"${b.id}"` } },
        select: { id: true },
      });
      if (dup) continue;

      const speak3 = (s: string) => `${s} I repeat. ${s} Final call. ${s}`;
      const baseMsg =
        `Emergency surgery requested. Patient ${b.patientName}, folder ${b.folderNumber}. ` +
        `Procedure: ${b.procedureName}. Indication: ${b.indication}. ` +
        `Surgeon: ${b.surgeonName}.` +
        (b.theatreName ? ` Theatre: ${b.theatreName}.` : '') +
        (b.bloodRequired
          ? ` Blood required${b.bloodType ? ` (${b.bloodType}${b.bloodUnits ? `, ${b.bloodUnits} units` : ''})` : ''}.`
          : '');

      await prisma.radioAnnouncement.create({
        data: {
          category: 'EMERGENCY',
          title: `Emergency surgery — ${b.patientName} (${b.procedureName})`,
          message: speak3(baseMsg),
          priority: 100,
          location: b.theatreName ?? null,
          specialty: b.surgicalUnit ?? null,
          urgency: 'CRITICAL',
          triggerSource: 'EVENT',
          status: 'PENDING',
          requireAck: true,
          repeatUntilAck: true,
          repeatEverySec: 300, // 5 minutes
          metadata: JSON.stringify({
            emergencyBookingId: b.id,
            tripleRepeat: true,
            source: 'EmergencySurgeryBooking',
          }),
        },
      });
    }

    const ACTIVE_PRESCRIPTION_STATUSES = ['DRAFT', 'SUBMITTED', 'PHARMACIST_VIEWED', 'PACKING'] as const;
    const prescriptions = await prisma.emergencyPrescription.findMany({
      where: { status: { in: ACTIVE_PRESCRIPTION_STATUSES as any } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    for (const p of prescriptions) {
      const dup = await prisma.radioAnnouncement.findFirst({
        where: { metadata: { contains: `"emergencyPrescriptionId":"${p.id}"` } },
        select: { id: true },
      });
      if (dup) continue;

      let medSummary = '';
      try {
        const meds = JSON.parse(p.medications) as Array<{ name?: string; dose?: string; route?: string }>;
        if (Array.isArray(meds) && meds.length > 0) {
          medSummary =
            ' Medications: ' +
            meds
              .slice(0, 4)
              .map((m) => [m.name, m.dose, m.route].filter(Boolean).join(' '))
              .join(', ') +
            (meds.length > 4 ? `, and ${meds.length - 4} more.` : '.');
        }
      } catch { /* keep medSummary empty on bad JSON */ }

      const speak3 = (s: string) => `${s} I repeat. ${s} Final call. ${s}`;
      const baseMsg =
        `Emergency prescription awaiting pharmacy. Patient ${p.patientName}, folder ${p.folderNumber}. ` +
        `Prescriber: ${p.prescribedByName}.${medSummary}` +
        (p.allergyAlerts ? ` Allergy alerts: ${p.allergyAlerts}.` : '') +
        (p.hasOutOfStockItems ? ' Some items are flagged out of stock.' : '');

      await prisma.radioAnnouncement.create({
        data: {
          category: 'EMERGENCY',
          title: `Emergency prescription — ${p.patientName}`,
          message: speak3(baseMsg),
          priority: 100,
          urgency: 'CRITICAL',
          triggerSource: 'EVENT',
          status: 'PENDING',
          requireAck: true,
          repeatUntilAck: true,
          repeatEverySec: 300, // 5 minutes
          metadata: JSON.stringify({
            emergencyPrescriptionId: p.id,
            emergencyBookingId: p.emergencyBookingId,
            tripleRepeat: true,
            source: 'EmergencyPrescription',
          }),
        },
      });
    }
  } catch (err) {
    console.error('[radio/queue] failed to auto-promote emergency events:', err);
  }

  // Expire ack-required announcements older than 30 min that nobody acked.
  // EXCEPTION: auto-promoted emergency-surgery / emergency-prescription rows
  // must keep repeating every 5 min until a clinician acknowledges them, so
  // we exclude anything whose metadata carries an emergency source id.
  await prisma.radioAnnouncement.updateMany({
    where: {
      requireAck: true,
      status: { in: ['PENDING', 'PLAYING'] },
      createdAt: { lt: new Date(now.getTime() - 30 * 60 * 1000) },
      AND: [
        { OR: [{ metadata: null }, { NOT: { metadata: { contains: 'emergencyBookingId' } } }] },
        { OR: [{ metadata: null }, { NOT: { metadata: { contains: 'emergencyPrescriptionId' } } }] },
      ],
    },
    data: { status: 'EXPIRED' },
  });

  // Safety net: non-ack PENDING items that have been sitting around for more
  // than 5 minutes are auto-marked PLAYED so the radio cannot loop on them
  // (covers cases where every listening client missed the "played" callback).
  await prisma.radioAnnouncement.updateMany({
    where: {
      requireAck: false,
      status: { in: ['PENDING', 'PLAYING'] },
      createdAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) },
    },
    data: { status: 'PLAYED', lastPlayedAt: now },
  });

  const queue = await prisma.radioAnnouncement.findMany({
    where: { status: { in: ['PENDING', 'PLAYING'] } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 20,
  });

  return NextResponse.json({ queue, serverTime: now.toISOString() });
}
