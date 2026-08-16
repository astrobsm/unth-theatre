import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { buildPersonalBoard, boardSummary, QUERY_CUTOFF } from '@/lib/dashboard/personalBoard';
import { apiError } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/my-board
 *
 * Everything one person needs to act on today. Scoped to the session user and
 * never to a user id from the request: a board is personal, and a caller who
 * could ask for somebody else's would be reading their disciplinary queries.
 */

/** Local day boundaries. The theatre works to WAT, not to UTC. */
const WAT_OFFSET_MINUTES = 60;

function localDayBounds(now: Date): { start: Date; end: Date } {
  const shifted = new Date(now.getTime() + WAT_OFFSET_MINUTES * 60_000);
  const start = new Date(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 0, 0, 0, 0,
  ));
  return {
    start: new Date(start.getTime() - WAT_OFFSET_MINUTES * 60_000),
    end: new Date(start.getTime() + 24 * 60 * 60_000 - WAT_OFFSET_MINUTES * 60_000),
  };
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const role = (session.user.role ?? '').toUpperCase();
  const now = new Date();
  const { start, end } = localDayBounds(now);

  try {
    const [queries, surgeries, notifications] = await Promise.all([
      // Only this person's, and only since the cutoff. Filtered in the query
      // rather than afterwards so a large history never crosses the wire.
      prisma.disciplinaryQuery.findMany({
        where: {
          recipientId: userId,
          createdAt: { gte: QUERY_CUTOFF },
          status: { notIn: ['RESPONDED', 'RESOLVED', 'DISMISSED'] },
        },
        orderBy: { deadlineTime: 'asc' },
        take: 25,
      }).catch(() => []),

      // Today's list for this person, by whichever role they hold on the case.
      prisma.surgery.findMany({
        where: {
          scheduledDate: { gte: start, lte: end },
          status: { notIn: ['CANCELLED', 'COMPLETED'] },
          OR: [
            { surgeonId: userId },
            { anesthetistId: userId },
            { supervisingConsultantId: userId },
          ],
        },
        select: {
          id: true, procedureName: true, scheduledDate: true, scheduledTime: true,
          status: true, theatreId: true,
          patient: { select: { name: true, folderNumber: true } },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 30,
      }).catch(() => []),

      prisma.systemNotification.findMany({
        where: {
          createdAt: { gte: start },
          OR: [{ userId }, { userId: null }],
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }).catch(() => []),
    ]);

    const tasks = surgeries.map((s) => ({
      id: s.id,
      title: `${s.procedureName} — ${s.patient?.name ?? 'patient'}`,
      detail: [
        s.patient?.folderNumber ? `Folder ${s.patient.folderNumber}` : null,
        s.scheduledTime ? `Due ${s.scheduledTime}` : null,
        s.status,
      ].filter(Boolean).join(' · '),
      actionUrl: `/dashboard/surgeries/${s.id}`,
      dueAt: s.scheduledDate,
    }));

    // A notification marked HIGH or CRITICAL is a warning; the rest are noise
    // on a board whose value depends on being short.
    const warnings = notifications
      .filter((n) => ['HIGH', 'CRITICAL', 'URGENT'].includes(String(n.priority ?? '').toUpperCase()))
      .map((n) => ({
        id: n.id,
        title: n.title,
        detail: n.message ?? undefined,
        actionUrl: n.actionUrl ?? undefined,
        severity: String(n.priority).toUpperCase() === 'CRITICAL'
          ? ('CRITICAL' as const) : ('HIGH' as const),
      }));

    const items = buildPersonalBoard({
      role,
      now,
      queries: queries.map((q) => ({
        id: q.id,
        referenceNumber: q.referenceNumber,
        subject: q.subject,
        description: q.description,
        status: q.status,
        deadlineTime: q.deadlineTime,
        createdAt: q.createdAt,
        recipientResponse: q.recipientResponse,
      })),
      tasks,
      warnings,
    });

    return NextResponse.json({
      name: session.user.name ?? null,
      role,
      summary: boardSummary(items),
      items,
      counts: {
        queries: items.filter((i) => i.kind === 'QUERY').length,
        tasks: items.filter((i) => i.kind === 'TASK').length,
        warnings: items.filter((i) => i.kind === 'WARNING').length,
        overdue: items.filter((i) => i.severity === 'CRITICAL').length,
      },
    });
  } catch (err) {
    return apiError('dashboard.my-board', err);
  }
}
