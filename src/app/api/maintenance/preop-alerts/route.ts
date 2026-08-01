// ============================================================
// The preoperative alert job
// ------------------------------------------------------------
// Runs every five minutes through the operating day. For every case due to
// start within the hour that has not yet been alerted, it:
//
//   1. writes an in-app notification to each assigned team member,
//   2. pushes the same to their phone,
//   3. asks the ward to prepare and send the patient,
//   4. puts a call on the Theatre Radio queue.
//
// IDEMPOTENT BY CONSTRUCTION. theatre_preop_alerts.surgeryId is unique, and the
// row is written BEFORE anything is sent. If the push provider is down or the
// function times out half way through, the case is still marked as alerted and
// the next run leaves it alone. The alternative — writing the row last — turns
// one flaky minute into an hour of a corridor speaker repeating itself.
//
// Nothing here decides anything. dueForAlert, recipientsOf and the text
// builders live in lib/theatreOps/preopAlert and are what the tests exercise.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { pushToUsers, pushToRoles } from '@/lib/pushAll';
import { acknowledgeRadioByMetadata, triggerRadio } from '@/lib/radioEvents';
import { scheduledInstant } from '@/lib/theatreOps/clock';
import {
  ALERT_LEAD_MINUTES,
  alertAnnouncement,
  alertNotification,
  announcementOrder,
  announcementPriority,
  dueForAlert,
  recipientsOf,
  wardReminder,
  WARD_ROLES,
  COORDINATION_ROLES,
  type AlertSubject,
  type TeamSlot,
} from '@/lib/theatreOps/preopAlert';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

async function authorise(request: NextRequest): Promise<{ ok: boolean; who: string; status?: number }> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) {
    return { ok: true, who: 'scheduled' };
  }
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) return { ok: false, who: '', status: 401 };
  if (!role || !ADMIN_ROLES.includes(role)) return { ok: false, who: '', status: 403 };
  return { ok: true, who: 'administrator' };
}

/** Equipment flags read as a list a person can act on. */
function equipmentOf(s: {
  needDiathermy: boolean; needCArm: boolean; needMicroscope: boolean; needSuction: boolean;
  needPneumaticTourniquet: boolean; needStirups: boolean; needMontrellMattress: boolean; needStereo: boolean;
}): string[] {
  const out: string[] = [];
  if (s.needDiathermy) out.push('Diathermy');
  if (s.needCArm) out.push('C-arm');
  if (s.needMicroscope) out.push('Microscope');
  if (s.needSuction) out.push('Suction');
  if (s.needPneumaticTourniquet) out.push('Pneumatic tourniquet');
  if (s.needStirups) out.push('Stirrups');
  if (s.needMontrellMattress) out.push('Montrell mattress');
  if (s.needStereo) out.push('Stereo');
  return out;
}

/** How long after the scheduled time a "send for the patient" call stops being useful. */
const CALL_EXPIRES_AFTER_MINUTES = 30;

/**
 * Retire preoperative radio calls that have outlived their purpose.
 *
 * Returns how many were silenced. Never throws — a failure here must not stop
 * today's alerts going out.
 */
async function silenceStaleCalls(now: Date): Promise<number> {
  try {
    const recent = await prisma.theatrePreopAlert.findMany({
      where: { announced: true, sentAt: { gte: new Date(now.getTime() - 24 * 3_600_000) } },
      select: {
        surgeryId: true,
        scheduledStart: true,
        surgery: { select: { status: true, movements: { select: { id: true }, take: 1 } } },
      },
      take: 200,
    });

    let count = 0;
    for (const a of recent) {
      const moved = a.surgery.movements.length > 0;
      const off = ['CANCELLED', 'COMPLETED', 'POSTPONED'].includes(a.surgery.status);
      const stale = now.getTime() - a.scheduledStart.getTime() > CALL_EXPIRES_AFTER_MINUTES * 60_000;
      if (!moved && !off && !stale) continue;
      count += await acknowledgeRadioByMetadata('preopAlertSurgeryId', a.surgeryId);
    }
    return count;
  } catch (error) {
    console.error('[theatre-ops] failed to silence stale preoperative calls:', error);
    return 0;
  }
}

export async function GET(request: NextRequest) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Sign in to continue.' : 'Only an administrator may run the alert job.' },
      { status: auth.status ?? 403 }
    );
  }

  // An administrator opening this in a browser is inspecting, not running.
  // The scheduler always sends the bearer token, so it always sends for real.
  const dryRun = auth.who === 'administrator' && request.nextUrl.searchParams.get('send') !== '1';

  const now = new Date();
  // `scheduledDate` is a DAY, stored at midnight — not the moment the case
  // starts. Filtering it against a window of hours around `now` therefore
  // drops the entire list the moment the clock passes midnight UTC, which is
  // exactly what a rehearsal against live data showed: a day with a full list
  // returned nothing. The window is a day either side, and dueForAlert does
  // the minute-level work.
  const from = new Date(now.getTime() - 36 * 3_600_000);
  const to = new Date(now.getTime() + 36 * 3_600_000);

  try {
    // ---- Silence yesterday's speaker ------------------------------------
    // The call repeats every five minutes until someone acknowledges it, which
    // is right while a patient still needs sending for and intolerable
    // afterwards. Nothing else in the system knows to stop it, so this job
    // does: once the patient has moved, or the case is off, or the scheduled
    // time is half an hour gone, the announcement is retired whether or not a
    // human ever pressed acknowledge.
    const silenced = dryRun ? 0 : await silenceStaleCalls(now);

    const surgeries = await prisma.surgery.findMany({
      where: { scheduledDate: { gte: from, lte: to } },
      select: {
        id: true,
        scheduledDate: true,
        scheduledTime: true,
        status: true,
        surgeryType: true,
        procedureName: true,
        unit: true,
        location: true,
        surgeonId: true,
        surgeonName: true,
        assistantSurgeonId: true,
        anesthetistId: true,
        scrubNurseId: true,
        theatreTechnicianId: true,
        supervisingConsultantId: true,
        supervisingConsultantName: true,
        needBloodTransfusion: true,
        needDiathermy: true,
        needCArm: true,
        needMicroscope: true,
        needSuction: true,
        needPneumaticTourniquet: true,
        needStirups: true,
        needMontrellMattress: true,
        needStereo: true,
        otherSpecialNeeds: true,
        remarks: true,
        patient: { select: { name: true, folderNumber: true, ward: true } },
        items: { select: { item: { select: { name: true } } }, take: 12 },
        teamMembers: { select: { userId: true, memberName: true, role: true } },
        movements: { select: { id: true }, take: 1 },
        preopAlert: { select: { id: true } },
        surgeon: { select: { fullName: true } },
        assistantSurgeon: { select: { fullName: true } },
        anesthetist: { select: { fullName: true } },
        bloodRequests: { select: { bloodType: true, unitsRequested: true }, take: 3 },
      },
      take: 500,
    });

    const candidates = surgeries
      .map((s) => {
        const scheduledStart = scheduledInstant(s.scheduledDate, s.scheduledTime);
        const decision = dueForAlert(
          {
            scheduledStart,
            status: s.status,
            alreadyAlerted: !!s.preopAlert,
            started: s.movements.length > 0,
          },
          now
        );
        return { surgery: s, scheduledStart, decision, isEmergency: s.surgeryType === 'EMERGENCY' };
      })
      .filter((c) => c.decision.send);

    // Soonest first, emergencies ahead of elective cases at the same time, so
    // four theatres starting at 08:00 are called in order rather than in
    // whatever order the rows came back.
    const ordered = announcementOrder(candidates);

    const sent: { surgeryId: string; procedure: string; minutesBefore: number; recipients: number }[] = [];
    const skipped: { surgeryId: string; reason: string }[] = [];

    for (const c of ordered) {
      const s = c.surgery;
      const minutesBefore = c.decision.minutesBefore ?? ALERT_LEAD_MINUTES;

      const slots: TeamSlot[] = [
        { userId: s.surgeonId, name: s.surgeon?.fullName ?? s.surgeonName, role: 'Surgeon' },
        { userId: s.assistantSurgeonId, name: s.assistantSurgeon?.fullName ?? null, role: 'Assistant Surgeon' },
        { userId: s.anesthetistId, name: s.anesthetist?.fullName ?? null, role: 'Anaesthetist' },
        { userId: s.scrubNurseId, name: null, role: 'Scrub Nurse' },
        { userId: s.theatreTechnicianId, name: null, role: 'Anaesthetic Technician' },
        { userId: s.supervisingConsultantId, name: s.supervisingConsultantName, role: 'Supervising Consultant' },
        ...s.teamMembers.map((m) => ({
          userId: m.userId ?? null,
          name: m.memberName ?? null,
          role: m.role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase()),
        })),
      ];
      const recipients = recipientsOf(slots);

      const patientName = s.patient?.name || 'the patient';
      const subject: AlertSubject = {
        patientName,
        hospitalNumber: s.patient?.folderNumber ?? null,
        procedureName: s.procedureName,
        theatre: s.location ?? null,
        scheduledTime: s.scheduledTime,
        unit: s.unit ?? null,
        ward: s.patient?.ward ?? null,
        team: slots
          .filter((x) => x.name)
          .map((x) => ({ role: x.role, name: x.name as string })),
        packs: s.items.map((i) => i.item.name),
        bloodRequired: s.needBloodTransfusion || s.bloodRequests.length > 0,
        bloodDetail: s.bloodRequests.length
          ? s.bloodRequests.map((b) => `${b.bloodType ?? 'group pending'}, ${b.unitsRequested ?? '?'} units`).join('; ')
          : null,
        equipment: equipmentOf(s),
        specialInstructions: [s.otherSpecialNeeds, s.remarks].filter(Boolean).join(' — ') || null,
      };

      if (dryRun) {
        sent.push({
          surgeryId: s.id,
          procedure: s.procedureName,
          minutesBefore,
          recipients: recipients.length,
        });
        continue;
      }

      // ---- Claim the case FIRST -------------------------------------------
      // The unique constraint is the guard. If two runs overlap, the second
      // loses the race here and sends nothing, rather than both sending.
      try {
        await prisma.theatrePreopAlert.create({
          data: {
            surgeryId: s.id,
            scheduledStart: c.scheduledStart as Date,
            minutesBefore,
            recipientIds: JSON.stringify(recipients.map((r) => r.userId)),
            recipientCount: recipients.length,
          },
        });
      } catch {
        skipped.push({ surgeryId: s.id, reason: 'already claimed by a concurrent run' });
        continue;
      }

      const notification = alertNotification(subject, minutesBefore);
      const ward = wardReminder(subject, minutesBefore);
      const link = `/dashboard/theatre-ops?surgery=${s.id}`;

      // Everything below is best-effort. A failure in any one channel must not
      // prevent the others, and must not undo the claim above.
      const results = await Promise.allSettled([
        recipients.length
          ? prisma.notification.createMany({
              data: recipients.map((r) => ({
                userId: r.userId,
                type: 'PREOP_ALERT',
                title: notification.title,
                message: notification.message,
                link,
              })),
            })
          : Promise.resolve(null),

        recipients.length
          ? pushToUsers(recipients.map((r) => r.userId), {
              title: notification.title,
              body: `${subject.procedureName} — ${subject.patientName}`,
              url: link,
              priority: 'HIGH',
              tag: `preop-${s.id}`,
              data: { surgeryId: s.id, kind: 'PREOP_ALERT' },
            })
          : Promise.resolve(null),

        pushToRoles(WARD_ROLES, {
          title: ward.title,
          body: ward.message,
          url: link,
          priority: 'HIGH',
          tag: `preop-ward-${s.id}`,
          data: { surgeryId: s.id, kind: 'PREOP_WARD_REMINDER' },
        }),

        pushToRoles(COORDINATION_ROLES, {
          title: notification.title,
          body: `${subject.procedureName} — ${subject.patientName}`,
          url: link,
          tag: `preop-coord-${s.id}`,
          data: { surgeryId: s.id, kind: 'PREOP_ALERT' },
        }),

        triggerRadio({
          category: 'WORKFLOW',
          title: `Send for ${subject.patientName}`,
          message: alertAnnouncement(subject),
          priority: announcementPriority(minutesBefore, c.isEmergency),
          location: subject.theatre,
          specialty: s.unit ?? null,
          // Repeats until someone acknowledges, which in practice means until
          // the patient has been called for. An announcement nobody has to
          // answer is an announcement everybody learns to ignore.
          requireAck: true,
          repeatUntilAck: true,
          repeatEverySec: 300,
          metadata: { preopAlertSurgeryId: s.id, kind: 'PREOP_ALERT' },
        }),
      ]);

      await prisma.theatrePreopAlert.update({
        where: { surgeryId: s.id },
        data: {
          pushSent: results[1].status === 'fulfilled',
          wardNotified: results[2].status === 'fulfilled',
          announced: results[4].status === 'fulfilled',
        },
      }).catch(() => { /* the claim stands either way */ });

      sent.push({
        surgeryId: s.id,
        procedure: s.procedureName,
        minutesBefore,
        recipients: recipients.length,
      });
    }

    return NextResponse.json({
      ranAt: now,
      by: auth.who,
      dryRun,
      leadMinutes: ALERT_LEAD_MINUTES,
      examined: surgeries.length,
      alerted: sent.length,
      callsSilenced: silenced,
      cases: sent,
      skipped,
      ...(dryRun ? { note: 'Nothing was sent. Add ?send=1 to run it for real.' } : {}),
    });
  } catch (error) {
    console.error('[theatre-ops] preoperative alert job failed:', error);
    return NextResponse.json({ error: 'The alert job failed' }, { status: 500 });
  }
}
