import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  reportingWindow,
  isBlockerReason,
  isCaseOutcome,
  describeBlocker,
} from '@/lib/caseBlockers';
import { watDay, watInstantFrom } from '@/lib/watDay';
import { triggerRadio } from '@/lib/radioEvents';

export const dynamic = 'force-dynamic';

/**
 * "I am here and I cannot start."
 *
 * GET  ?surgeryId=…   reports for one case
 * GET  ?date=YYYY-MM-DD   everything blocked that day, for the board
 * POST                raise a report, or record what became of the case
 *
 * ANY signed-in member of staff may report. That is deliberate and it is the
 * point: the person who knows the theatre is not going to start is whoever is
 * standing in it, and that is as often the technician or the circulating nurse
 * as it is the consultant. Restricting this to seniors would leave the fact
 * unrecorded until somebody senior noticed, which is the delay we are trying
 * to measure.
 */

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const surgeryId = request.nextUrl.searchParams.get('surgeryId');
  const date = request.nextUrl.searchParams.get('date');

  if (surgeryId) {
    const reports = await prisma.caseBlockerReport.findMany({
      where: { surgeryId },
      orderBy: { reportedAt: 'desc' },
    });
    return NextResponse.json({ reports });
  }

  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    const reports = await prisma.caseBlockerReport.findMany({
      where: { reportedAt: { gte: start, lte: end } },
      orderBy: { reportedAt: 'desc' },
      include: {
        surgery: {
          select: {
            id: true, procedureName: true, unit: true, theatreId: true,
            scheduledTime: true, surgeonName: true, surgeryType: true, status: true,
          },
        },
      },
    });
    return NextResponse.json({ reports });
  }

  return NextResponse.json({ error: 'Give a surgeryId or a date.' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({} as any));
    const surgeryId = String(body.surgeryId ?? '').trim();
    if (!surgeryId) {
      return NextResponse.json({ error: 'Which case?' }, { status: 400 });
    }

    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      select: {
        id: true, surgeryType: true, status: true, scheduledDate: true,
        scheduledTime: true, createdAt: true, procedureName: true, unit: true,
        location: true, patient: { select: { name: true } },
      },
    });
    if (!surgery) return NextResponse.json({ error: 'That case was not found.' }, { status: 404 });

    // ── Recording the outcome of an existing report ────────────────────────
    const reportId = String(body.reportId ?? '').trim();
    if (reportId) {
      const outcome = body.outcome;
      if (!isCaseOutcome(outcome)) {
        return NextResponse.json({ error: 'Choose what became of the case.' }, { status: 400 });
      }
      const updated = await prisma.caseBlockerReport.update({
        where: { id: reportId },
        data: {
          outcome,
          outcomeNote: String(body.outcomeNote ?? '').trim() || null,
          outcomeAt: new Date(),
          outcomeById: (session.user as any).id ?? null,
        },
      });

      // Keep the case itself honest. A blocker that ended in a cancellation
      // must not leave the surgery sitting on the list as SCHEDULED — that is
      // how a theatre spends a morning waiting for a case somebody already
      // abandoned.
      if (outcome === 'CANCELLED' && surgery.status !== 'CANCELLED') {
        await prisma.surgery.update({ where: { id: surgeryId }, data: { status: 'CANCELLED' as never } });
      }
      if (outcome === 'COMPLETED' && surgery.status !== 'COMPLETED') {
        await prisma.surgery.update({ where: { id: surgeryId }, data: { status: 'COMPLETED' as never } });
      }

      await prisma.auditLog.create({
        data: {
          userId: (session.user as any).id,
          action: 'CASE_BLOCKER_OUTCOME',
          tableName: 'case_blocker_reports',
          recordId: reportId,
          changes: JSON.stringify({ outcome, surgeryId }),
        },
      }).catch(() => { /* never block the report on the audit write */ });

      return NextResponse.json({ ok: true, report: updated });
    }

    // ── Raising a new report ───────────────────────────────────────────────
    const reason = body.reason;
    if (!isBlockerReason(reason)) {
      return NextResponse.json({ error: 'Choose what is stopping the case.' }, { status: 400 });
    }
    const detail = String(body.detail ?? '').trim();
    if (reason === 'OTHER' && !detail) {
      return NextResponse.json(
        { error: 'You chose Other — say what is stopping it, in a few words.' },
        { status: 400 },
      );
    }

    // WAT, not the server's clock. The theatre server runs UTC and a browser
    // runs whatever the handset is set to; a case at 09:00 means 09:00 in
    // Enugu on both.
    const scheduledStart = surgery.scheduledTime
      ? watInstantFrom(watDay(surgery.scheduledDate), surgery.scheduledTime)
      : null;
    const win = reportingWindow({
      surgeryType: surgery.surgeryType,
      scheduledStart,
      bookedAt: surgery.createdAt,
      status: surgery.status,
    });

    // The window is not enforced as a refusal. Somebody standing in a theatre
    // that cannot start should never be told it is too early to say so — the
    // window decides when the app ASKS, not when a person is allowed to speak.
    const report = await prisma.caseBlockerReport.create({
      data: {
        surgeryId,
        reason,
        detail: detail || null,
        reportedById: (session.user as any).id ?? null,
        reportedByName: (session.user as any).fullName || session.user.name || 'Unknown',
        reportedByRole: (session.user as any).role ?? null,
        minutesLate: win.minutesLate,
        outcome: isCaseOutcome(body.outcome) ? body.outcome : 'PENDING',
      },
    });

    // Tell the people who can actually unblock it. A report that only lands in
    // a database is a report that changes nothing today.
    try {
      const managers = await prisma.user.findMany({
        where: {
          role: { in: ['THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_CHAIRMAN'] as never },
          status: 'APPROVED' as never,
        },
        select: { id: true },
      });
      const line = describeBlocker({
        reason,
        detail: detail || null,
        reportedByName: report.reportedByName,
        minutesLate: win.minutesLate,
      });
      if (managers.length) {
        await prisma.notification.createMany({
          data: managers.map((m) => ({
            userId: m.id,
            type: 'SYSTEM' as never,
            title: `Case blocked — ${surgery.unit ?? 'theatre'}`,
            message: `${surgery.procedureName}${surgery.patient?.name ? ` for ${surgery.patient.name}` : ''}. ${line}`,
            link: `/dashboard/case-blockers?date=${new Date().toISOString().slice(0, 10)}`,
          })),
        });
      }
    } catch (e) {
      console.warn('[case-blockers] notification failed (non-fatal):', e);
    }

    // Say it out loud only when the case is genuinely overdue. A theatre four
    // minutes late does not need an announcement, and an announcement nobody
    // needs is how people learn to ignore the ones that matter.
    if (win.prompt) {
      try {
        await triggerRadio({
          category: 'WORKFLOW',
          title: `Case delayed — ${surgery.unit ?? 'theatre'}`,
          message: `${surgery.location ?? 'Theatre'}. ${surgery.procedureName} is delayed. Reason: ${
            describeBlocker({ reason, detail: detail || null })
          }. Please respond.`,
          location: surgery.location ?? null,
          urgency: 'MEDIUM',
          requireAck: false,
          repeatUntilAck: false,
          triggeredById: (session.user as any).id,
          metadata: { surgeryId, blockerReportId: report.id },
        });
      } catch (e) {
        console.warn('[case-blockers] radio failed (non-fatal):', e);
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: (session.user as any).id,
        action: 'CASE_BLOCKER_REPORTED',
        tableName: 'case_blocker_reports',
        recordId: report.id,
        changes: JSON.stringify({ surgeryId, reason, minutesLate: win.minutesLate }),
      },
    }).catch(() => { /* never block the report on the audit write */ });

    return NextResponse.json({ ok: true, report, window: win });
  } catch (error) {
    console.error('[case-blockers] failed:', error);
    return NextResponse.json(
      { error: 'That could not be recorded. Please try again.' },
      { status: 500 },
    );
  }
}
