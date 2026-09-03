/**
 * Running the escalation ladder against the live board.
 *
 * The rules are in lib/emergencyEscalation and the wording in
 * lib/emergencyEscalationMessages; this is the part that touches the database.
 *
 * IT IS IDEMPOTENT. It is driven by a cron that may run every few minutes, may
 * be late, may run twice, and may be the second node to run. A rung already
 * recorded is never fired again.
 *
 * The rung is RECORDED BEFORE anyone is notified. If notifying then fails,
 * people are under-chased rather than chased twice — and of those two, a
 * repeated summons before a committee is much the worse.
 */

import prisma from '@/lib/prisma';
import { pushToUsers } from '@/lib/pushAll';
import {
  stagesToFire,
  minutesLate,
  escalationClockFrom,
  isSettled,
  CMD_ROLES,
} from '@/lib/emergencyEscalation';
import {
  stage1Message,
  stage2Message,
  cmdMessage,
  committeeInvitation,
  type CasePerson,
  type CaseFacts,
} from '@/lib/emergencyEscalationMessages';

/** Statuses of a booking still waiting to start. */
const OPEN_STATUSES = ['SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED'];

export interface RunSummary {
  checked: number;
  resolved: number;
  fired: { bookingId: string; patient: string; stages: number[]; notified: number }[];
  invitationsDrafted: number;
}

/**
 * Everyone named on the case, with the part they play in it.
 *
 * Three sources, because an emergency accumulates its team in three places: the
 * booking itself names the surgeon and anaesthetist, the linked surgery carries
 * the theatre team, and EmergencyTeamAvailability holds whoever was called out
 * and answered. De-duplicated by person — somebody who is both the booked
 * anaesthetist and an answering team member is one person to chase, and their
 * FIRST named role is the one they are addressed by.
 */
async function teamFor(booking: any): Promise<CasePerson[]> {
  const out: CasePerson[] = [];
  const seen = new Set<string>();

  const add = (userId: string | null | undefined, name: string | null | undefined, roleOnCase: string) => {
    if (!userId || seen.has(userId)) return;
    seen.add(userId);
    out.push({ userId, name: name || 'Unknown', roleOnCase });
  };

  add(booking.surgeonId, booking.surgeonName, 'Surgeon');
  add(booking.anesthetistId, booking.anesthetistName, 'Anaesthetist');

  if (booking.surgeryId) {
    const s = await prisma.surgery.findUnique({
      where: { id: booking.surgeryId },
      select: {
        surgeonId: true, assistantSurgeonId: true, anesthetistId: true,
        scrubNurseId: true, theatreTechnicianId: true, supervisingConsultantId: true,
      },
    });
    if (s) {
      add(s.surgeonId, null, 'Surgeon');
      add(s.assistantSurgeonId, null, 'Assistant Surgeon');
      add(s.anesthetistId, null, 'Anaesthetist');
      add(s.scrubNurseId, null, 'Scrub Nurse');
      add(s.theatreTechnicianId, null, 'Anaesthetic Technician');
      add(s.supervisingConsultantId, null, 'Supervising Consultant');
    }
  }

  const answered = await prisma.emergencyTeamAvailability.findMany({
    where: { emergencyBookingId: booking.id },
    select: { userId: true, userName: true, teamRole: true },
  });
  for (const a of answered) add(a.userId, a.userName, String(a.teamRole).replace(/_/g, ' '));

  // Names and numbers, for anyone added without them.
  const ids = out.map((p) => p.userId);
  if (ids.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, phoneNumber: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    for (const p of out) {
      const u = byId.get(p.userId);
      if (u) {
        if (!p.name || p.name === 'Unknown') p.name = u.fullName;
        p.phoneNumber = u.phoneNumber;
      }
    }
  }

  return out;
}

/** The reason anyone has recorded for this case not starting, if any. */
async function reasonFor(booking: any): Promise<string | null> {
  if (!booking.surgeryId) return null;
  const report = await prisma.caseBlockerReport.findFirst({
    where: { surgeryId: booking.surgeryId },
    orderBy: { reportedAt: 'desc' },
    select: { reason: true, detail: true, reportedByName: true },
  });
  if (!report) return null;
  const text = report.detail?.trim() || report.reason.replace(/_/g, ' ').toLowerCase();
  return `${text} (${report.reportedByName})`;
}

async function notify(userIds: string[], title: string, body: string, link: string) {
  if (!userIds.length) return;
  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, type: 'SYSTEM_ALERT' as any, title, message: body, link })),
    });
  } catch (e) {
    console.error('[emergency-escalation] dashboard notice failed:', e);
  }
  // Push is best-effort: a failed push must not stop the record being written.
  void pushToUsers(userIds, { title, body, url: link, priority: 'HIGH', tag: 'emergency-delay' });
}

/**
 * Walk every open emergency and fire whatever rungs are due.
 *
 * @param now injected so the behaviour can be exercised at a chosen time.
 */
export async function runEmergencyEscalation(now: Date = new Date()): Promise<RunSummary> {
  const summary: RunSummary = { checked: 0, resolved: 0, fired: [], invitationsDrafted: 0 };

  const bookings = await prisma.emergencySurgeryBooking.findMany({
    where: { status: { in: [...OPEN_STATUSES, 'IN_PROGRESS'] as any } },
    include: { delayEscalation: true },
  });

  for (const booking of bookings) {
    summary.checked += 1;

    const input = {
      requiredByTime: booking.requiredByTime,
      requestedAt: booking.requestedAt,
      status: booking.status as string,
      stageAlreadyFired: booking.delayEscalation?.stage ?? 0,
    };

    // A case that has started or been called off is closed out, not chased.
    if (isSettled(input)) {
      if (booking.delayEscalation && !booking.delayEscalation.resolvedAt) {
        await prisma.emergencyDelayEscalation.update({
          where: { id: booking.delayEscalation.id },
          data: { resolvedAt: now, resolvedReason: booking.status, lastCheckedAt: now },
        });
        summary.resolved += 1;
      }
      continue;
    }

    const due = stagesToFire(input, now);
    if (!due.length) {
      if (booking.delayEscalation) {
        await prisma.emergencyDelayEscalation.update({
          where: { id: booking.delayEscalation.id },
          data: { lastCheckedAt: now },
        });
      }
      continue;
    }

    const late = minutesLate(input, now) ?? 0;
    const dueAt = escalationClockFrom(input) ?? new Date(booking.requestedAt);
    const team = await teamFor(booking);
    const reasonGiven = await reasonFor(booking);

    const facts: CaseFacts = {
      patientName: booking.patientName,
      folderNumber: booking.folderNumber,
      procedureName: booking.procedureName,
      theatreName: booking.theatreName,
      dueAt,
      minutesLate: late,
      reasonGiven,
    };

    const link = '/dashboard/emergency-booking';
    const highest = due[due.length - 1];

    // The record is written FIRST and in one statement. If notifying then
    // fails, people are under-chased rather than chased twice — and a repeated
    // committee summons is the worse of those two.
    const escalation = await prisma.emergencyDelayEscalation.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        stage: highest,
        stage1At: due.includes(1) ? now : null,
        stage2At: due.includes(2) ? now : null,
        stage3At: due.includes(3) ? now : null,
        minutesLateAtLastStage: late,
        reasonAtLastStage: reasonGiven,
        lastCheckedAt: now,
      },
      update: {
        stage: highest,
        ...(due.includes(1) ? { stage1At: now } : {}),
        ...(due.includes(2) ? { stage2At: now } : {}),
        ...(due.includes(3) ? { stage3At: now } : {}),
        minutesLateAtLastStage: late,
        reasonAtLastStage: reasonGiven,
        lastCheckedAt: now,
      },
    });

    const teamIds = team.map((t) => t.userId);

    // Stage 1 and 2 are per-person, because each is addressed by their own role
    // on the case. A single broadcast is what nobody answers.
    for (const stage of due) {
      if (stage === 1 || stage === 2) {
        for (const person of team) {
          const m = stage === 1 ? stage1Message(person, facts) : stage2Message(person, facts);
          await notify([person.userId], m.title, m.body, link);
        }
      }

      if (stage === 2) {
        const cmds = await prisma.user.findMany({
          where: { role: { in: CMD_ROLES as any }, status: 'APPROVED' },
          select: { id: true },
        });
        const m = cmdMessage(facts, team);
        await notify(cmds.map((c) => c.id), m.title, m.body, link);
      }

      if (stage === 3) {
        // DRAFTED, NOT SENT. Calling somebody before a committee is not
        // something a cron job does unattended; an administrator reviews these
        // and sends them.
        for (const person of team) {
          try {
            await prisma.auditCommitteeInvitation.upsert({
              where: { escalationId_userId: { escalationId: escalation.id, userId: person.userId } },
              create: {
                escalationId: escalation.id,
                bookingId: booking.id,
                userId: person.userId,
                personName: person.name,
                roleOnCase: person.roleOnCase,
                phoneNumber: person.phoneNumber ?? null,
                message: committeeInvitation(person, facts),
              },
              update: {},  // never overwrite an invitation an administrator has edited
            });
            summary.invitationsDrafted += 1;
          } catch (e) {
            console.error('[emergency-escalation] invitation draft failed:', e);
          }
        }

        const admins = await prisma.user.findMany({
          where: { role: { in: ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'] as any }, status: 'APPROVED' },
          select: { id: true },
        });
        await notify(
          admins.map((a) => a.id),
          'Theatre Audit Committee invitations ready to send',
          `${facts.patientName} — ${facts.procedureName} never started and is now three hours late. ` +
            `${team.length} invitation(s) are drafted and waiting for you to review and send.`,
          '/dashboard/emergency-escalations',
        );
      }
    }

    summary.fired.push({
      bookingId: booking.id,
      patient: booking.patientName,
      stages: due,
      notified: teamIds.length,
    });
  }

  return summary;
}
