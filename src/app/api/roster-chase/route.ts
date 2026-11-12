// ============================================================
// The board: which departments' rosters are late
// ------------------------------------------------------------
//   GET ?week=YYYY-MM-DD  (default: this week)  |  ?month=YYYY-MM
//
// Read-only. One row per standing roster department, ordered to put the ones
// with nothing submitted at the top, because that is the order somebody would
// work down.
//
// A DEPARTMENT WITH NOBODY TO WRITE TO IS ITS OWN FINDING. No assigned roster
// supervisor and nobody holding a managing role means the roster has no owner
// at all — more urgent than a roster that is merely late, and not something
// any message can fix.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiMiddleware';
import prisma from '@/lib/prisma';
import { collectRosterStandings } from '@/lib/rosterChase/collect';
import { rosterHeadline } from '@/lib/rosterChase/messages';
import {
  STATE_LABELS, watToday, resolveChasePeriod, type RosterSubmissionState,
} from '@/lib/rosterChase/overdue';
import { ROSTER_CHASE_TYPE, rosterChaseLink } from '@/lib/rosterChase/notify';

export const dynamic = 'force-dynamic';

const ACT_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR',
  'CMAC',
  'DC_MAC',
] as const;

/** Nothing submitted first, then drafted, then late, then the ones in on time. */
const ORDER: Record<RosterSubmissionState, number> = {
  MISSING: 0, DRAFTED_NOT_PUBLISHED: 1, LATE: 2, ON_TIME: 3,
};

export async function GET(request: NextRequest) {
  const { error } = await requireRole(ACT_ROLES as never);
  if (error) return error;

  try {
    const url = new URL(request.url);
    const today = watToday();
    // Week by default — that is the question theatre asks on a Monday.
    const resolved = resolveChasePeriod({
      week: url.searchParams.get('week'),
      month: url.searchParams.get('month'),
    }, today);
    if (!resolved) return NextResponse.json({ error: 'Which week?' }, { status: 400 });

    const standings = await collectRosterStandings(resolved.period, today);
    if (!standings) return NextResponse.json({ error: 'Which week?' }, { status: 400 });

    // Who has already been written to about this period, per department.
    const sent = await prisma.notification.findMany({
      where: {
        type: ROSTER_CHASE_TYPE,
        link: { startsWith: `/dashboard/roster-chase?${resolved.key}&dept=` },
      },
      select: { userId: true, link: true, createdAt: true },
    });
    const sentBy: Record<string, string> = {};
    sent.forEach((s) => { sentBy[`${s.link}|${s.userId}`] = s.createdAt.toISOString(); });

    const departments = standings.departments
      .map((d) => ({
        slug: d.slug,
        label: d.label,
        state: d.assessment.state,
        stateLabel: STATE_LABELS[d.assessment.state],
        headline: rosterHeadline({
          deptLabel: d.label, period: standings.period, assessment: d.assessment,
        }),
        dueDay: d.assessment.dueDay,
        firstPublishedDay: d.assessment.firstPublishedDay,
        daysLate: d.assessment.daysLate,
        daysOverdue: d.assessment.daysOverdue,
        version: d.assessment.version,
        publishedByName: d.assessment.publishedByName,
        draftRows: d.assessment.draftRows,
        publishedRows: d.assessment.publishedRows,
        notYetDue: d.assessment.notYetDue,
        tally: d.tally,
        nobodyToWriteTo: d.nobodyToWriteTo,
        candidateCount: d.candidateCount,
        recipients: d.recipients.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          role: r.role,
          hasPhone: r.hasPhone,
          active: r.active,
          source: r.source,
          sentAt: sentBy[`${rosterChaseLink(resolved.key, d.slug)}|${r.id}`] ?? null,
        })),
      }))
      .sort((a, b) => (ORDER[a.state as RosterSubmissionState] - ORDER[b.state as RosterSubmissionState])
        || ((b.daysOverdue ?? b.daysLate ?? 0) - (a.daysOverdue ?? a.daysLate ?? 0))
        || a.label.localeCompare(b.label));

    const counts: Record<string, number> = {
      MISSING: 0, DRAFTED_NOT_PUBLISHED: 0, LATE: 0, ON_TIME: 0,
    };
    departments.forEach((d) => { counts[d.state] += 1; });

    return NextResponse.json({
      periodKey: resolved.key,
      periodKind: resolved.kind,
      today,
      period: standings.period,
      counts,
      ownerless: departments.filter((d) => d.nobodyToWriteTo).map((d) => d.label),
      departments,
    });
  } catch (err) {
    console.error('[roster-chase] board failed:', err);
    return NextResponse.json({ error: 'Could not read the board' }, { status: 500 });
  }
}
