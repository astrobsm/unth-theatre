import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { withApiError } from '@/lib/apiError';
import { watClock, watDay, watDayOfWeek, watDayRange, watMinutesOfDay } from '@/lib/watDay';
import { scheduledInstant } from '@/lib/theatreOps/clock';

export const dynamic = 'force-dynamic';

// GET /api/radio/queue
// Returns the active announcements the radio client should play.
// 1. Promotes scheduled broadcasts whose time has arrived (or whose interval
//    has elapsed) into RadioAnnouncement rows.
// 2. Returns PENDING / PLAYING announcements ordered by priority desc.
async function handleGET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  /**
   * SCHEDULES ARE READ IN WAT, NOT IN THE HOST'S TIMEZONE.
   *
   * An admin who types 18:00 for the theatre-shutdown broadcast means six in
   * the evening in Enugu. getHours() answers in UTC here — the theatre server
   * pins TZ=Etc/UTC deliberately, and Vercel is UTC too — so the broadcast
   * matched at 18:00 UTC and was heard at 19:00 WAT, an hour late, every day.
   *
   * daysOfWeek had the same fault: between 23:00 and midnight WAT the UTC day
   * is still yesterday, so a Monday-only broadcast could fire on what the
   * hospital calls Tuesday and stay silent on the Monday evening it was for.
   *
   * lib/watDay states the offset explicitly and asks the host nothing.
   */
  const dow = watDayOfWeek(now); // 0..6, in WAT
  const hhmm = watClock(now);    // "HH:MM", in WAT
  const nowMinutes = watMinutesOfDay(now);
  const todayWat = watDay(now);

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

      /**
       * A DAILY announcement fires at ITS TIME OF DAY, once per WAT day.
       *
       * The comment here has always said "at/after scheduled time of day" and
       * the code never checked the time of day at all: it fired as soon as 23
       * hours had passed since the last play. So each day it went out an hour
       * EARLIER than the day before, walking backwards around the clock — a
       * shutdown notice scheduled for 18:00 reaching 17:00, then 16:00, and in
       * under a week arriving at a time bearing no relation to the schedule.
       * That is the "announcements no longer follow their time" fault.
       *
       * The 23-hour slack existed to stop a second firing on the same day. The
       * WAT calendar day does that job exactly, and without the drift.
       */
      const targetMinutes = watMinutesOfDay(a.scheduledDate);
      const dueToday = nowMinutes >= targetMinutes;
      const playedToday = a.lastPlayedAt ? watDay(a.lastPlayedAt) === todayWat : false;

      if (a.frequency === 'ONE_TIME') {
        shouldFire = !a.lastPlayedAt;
      } else if (a.frequency === 'DAILY') {
        shouldFire = dueToday && !playedToday;
      } else if (a.frequency === 'WEEKLY') {
        let allowToday = true;
        if (a.repeatDays) {
          try {
            const days = JSON.parse(a.repeatDays) as number[];
            allowToday = days.includes(dow);
          } catch { /* keep true on malformed json */ }
        }
        shouldFire = allowToday && dueToday && !playedToday;
      } else if (a.frequency === 'CUSTOM_INTERVAL' && a.customIntervalMin) {
        // An interval genuinely is "every N minutes", so elapsed time is the
        // right test here — it is only the clock-time schedules that drifted.
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
          // Equality on an indexed column. This was a substring match on the
          // metadata JSON, which sequentially scanned the whole table on every
          // poll — see dedupeKey in the schema for the measurements.
          dedupeKey: `announcementId:${a.id}`,
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
          dedupeKey: `announcementId:${a.id}`,
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

    /**
     * An emergency alert has a life, and it ends.
     *
     * It used to have none. The query below was bounded only by status, so a
     * booking left in SUBMITTED or APPROVED — which is where they stay when
     * nobody closes them — remained announceable forever. The only thing
     * stopping it was the presence of an old announcement row acting as a
     * dedupe marker, which is a silence that depends on never tidying up.
     *
     * On 22 August a retention prune removed those markers and the next poll
     * re-raised TWENTY historical emergencies at once, every one of them
     * repeating until acknowledged. That is the failure this bound prevents:
     * an alert older than twelve hours is not an emergency, it is a leftover.
     */
    const ALERT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
    /** Announce up to an hour past the time surgery was required to start. */
    const STOP_AFTER_REQUIRED_MS = 60 * 60 * 1000;

    const bookings = await prisma.emergencySurgeryBooking.findMany({
      where: {
        status: { in: ACTIVE_BOOKING_STATUSES as any },
        createdAt: { gte: new Date(Date.now() - ALERT_MAX_AGE_MS) },
      },
      // The scrub nurse lives on the surgery, not the booking, and together
      // with the theatre it is what tells us somebody has taken the case.
      include: { surgery: { select: { scrubNurseId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    for (const b of bookings) {
      /**
       * Assignment IS acknowledgement.
       *
       * A theatre and a scrub nurse mean a named person and a named room have
       * taken this case. Continuing to shout at the whole department after
       * that is noise, and noise is what makes people stop listening to the
       * alert that matters.
       */
      const taken = Boolean(b.theatreId && b.surgery?.scrubNurseId);
      const pastDeadline = b.requiredByTime
        ? Date.now() > b.requiredByTime.getTime() + STOP_AFTER_REQUIRED_MS
        : false;

      if (taken || pastDeadline) {
        // Silence whatever is still repeating, but KEEP the row. It is the
        // dedupe marker, and deleting markers is what caused the 22 August
        // storm. status EXPIRED and repeatUntilAck false stop the client
        // replaying it; the row stays as the record that this was announced.
        await prisma.radioAnnouncement.updateMany({
          where: {
            dedupeKey: `emergencyBookingId:${b.id}`,
            status: { in: ['PENDING', 'PLAYING'] },
          },
          data: { status: 'EXPIRED', repeatUntilAck: false },
        });
        continue;
      }

      const dup = await prisma.radioAnnouncement.findFirst({
        where: { dedupeKey: `emergencyBookingId:${b.id}` },
        select: { id: true },
      });
      if (dup) continue;

      const speak3 = (s: string) => `${s} I repeat. ${s} Final call. ${s}`;
      const anaesNote = (b as any).anaesthesiaType
        ? (b as any).anaesthesiaType === 'LOCAL' || (b as any).anaesthesiaType === 'NONE'
          ? ` Anaesthesia: ${(b as any).anaesthesiaType} — anaesthetist review NOT required.`
          : ` Anaesthesia: ${(b as any).anaesthesiaType}.`
        : '';
      const baseMsg =
        `Emergency surgery requested. Patient ${b.patientName}, folder ${b.folderNumber}. ` +
        `Procedure: ${b.procedureName}. Indication: ${b.indication}. ` +
        `Surgeon: ${b.surgeonName}.` +
        anaesNote +
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
          repeatEverySec: 600, // 10 minutes, until taken or an hour past the required time
          metadata: JSON.stringify({
            emergencyBookingId: b.id,
            tripleRepeat: true,
            source: 'EmergencySurgeryBooking',
          }),
          dedupeKey: `emergencyBookingId:${b.id}`,
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
        where: { dedupeKey: `emergencyPrescriptionId:${p.id}` },
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
          dedupeKey: `emergencyPrescriptionId:${p.id}`,
        },
      });
    }
  } catch (err) {
    console.error('[radio/queue] failed to auto-promote emergency events:', err);
  }

  // ----------------------------------------------------------------
  // Pre-start theatre reminder. For every case that has been CLEARED for
  // surgery (status READY_FOR_THEATRE) and is due to start within the next
  // 10 minutes, remind the nurses to transfer the patient now to a ready
  // theatre. One repeating announcement per case (deduped by surgery id);
  // it repeats every 2 minutes until acknowledged or auto-expired.
  // ----------------------------------------------------------------
  try {
    // The theatre's day, not the host's. setHours(0,0,0,0) on a UTC server
    // starts the day at 01:00 WAT and ends it at 00:59 the next morning, so an
    // early case could fall outside "today" entirely.
    const { start: dayStart, end: dayEnd } = watDayRange(todayWat);

    const clearedCases = await prisma.surgery.findMany({
      where: {
        status: 'READY_FOR_THEATRE',
        scheduledDate: { gte: dayStart, lte: dayEnd },
      },
      select: {
        id: true,
        scheduledDate: true,
        scheduledTime: true,
        procedureName: true,
        location: true,
        patient: { select: { name: true, folderNumber: true, ward: true } },
      },
      take: 40,
    });

    for (const c of clearedCases) {
      // scheduledInstant reads "HH:MM" as clinic-local and states the offset
      // explicitly. setHours() read it as UTC here, so a 09:00 list produced a
      // 10:00 WAT instant and this reminder went out an hour after the patient
      // should already have been sent for.
      const start = scheduledInstant(c.scheduledDate, c.scheduledTime || '09:00');
      if (!start) continue;
      const minutesUntilStart = (start.getTime() - now.getTime()) / 60000;

      // Fire only inside the 10-minute pre-start window (small grace either side).
      if (minutesUntilStart > 10 || minutesUntilStart < -2) continue;

      const dup = await prisma.radioAnnouncement.findFirst({
        where: { dedupeKey: `surgeryReminderId:${c.id}` },
        select: { id: true },
      });
      if (dup) continue;

      // Spoken aloud, so it must be the wall clock the theatre reads. getHours()
      // here would have announced "08:00" for an 09:00 list.
      const startLabel = watClock(start);
      const where = c.location ? ` for ${c.location}` : '';
      const base =
        `Theatre reminder. Patient ${c.patient?.name ?? ''}, folder ${c.patient?.folderNumber ?? ''}, ` +
        `is cleared for surgery${where} and is due to start at ${startLabel}. ` +
        `Nurses, please transfer the patient now to a theatre that is ready and confirm it is prepared.`;
      const speak2 = (s: string) => `${s} I repeat. ${s}`;

      await prisma.radioAnnouncement.create({
        data: {
          category: 'WORKFLOW',
          title: `Transfer reminder — ${c.patient?.name ?? 'patient'} (${c.procedureName})`,
          message: speak2(base),
          priority: 70,
          location: c.location ?? null,
          urgency: 'HIGH',
          triggerSource: 'EVENT',
          status: 'PENDING',
          requireAck: true,
          repeatUntilAck: true,
          repeatEverySec: 120, // 2 minutes
          metadata: JSON.stringify({
            surgeryReminderId: c.id,
            source: 'SurgeryPreStartReminder',
          }),
          dedupeKey: `surgeryReminderId:${c.id}`,
        },
      });
    }
  } catch (err) {
    console.error('[radio/queue] failed to emit pre-start theatre reminders:', err);
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

export const GET = withApiError('radio.queue', handleGET);
