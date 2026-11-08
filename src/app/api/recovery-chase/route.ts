// ============================================================
// The board: completed operations the ORM cannot account for after theatre
// ------------------------------------------------------------
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Read-only, and LOOKING BACKWARDS, which is the opposite of the case-chase
// board. A missing consent is worth finding before the operation; a missing
// recovery record can only be found after it, and the window therefore
// defaults to the fortnight that has just gone.
//
// TWO LEVELS OF PERMISSION, DELIBERATELY. Any perioperative nurse may READ
// this board — a supervisor who can see their own day can close the gap
// without anybody writing to them, which is the outcome worth having. Sending
// a message is theatre management's, because a chase carrying a medicolegal
// warning is not something one nurse should be able to send another.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiMiddleware';
import prisma from '@/lib/prisma';
import { watToday } from '@/lib/watDay';
import { periodLabel } from '@/lib/dutyPerformance/export';
import { collectRecoveryGaps, allGapCases } from '@/lib/recoveryChase/collect';
import { RECOVERY_GAPS, RECOVERY_GAP_CODES } from '@/lib/recoveryChase/gaps';
import { recoveryHeadline, dayWords } from '@/lib/recoveryChase/messages';
import { RECOVERY_CHASE_TYPE, recoveryChaseLink } from '@/lib/recoveryChase/notify';
import {
  RECOVERY_VIEW_ROLES, RECOVERY_SEND_ROLES, RECOVERY_WINDOW_DAYS, shiftDay, isDayString,
} from '@/lib/recoveryChase/access';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error, session } = await requireRole(RECOVERY_VIEW_ROLES as never);
  if (error) return error;

  try {
    const url = new URL(request.url);
    const today = watToday();
    const to = url.searchParams.get('to') ?? today;
    const from = url.searchParams.get('from') ?? shiftDay(to, -(RECOVERY_WINDOW_DAYS - 1));

    if (!isDayString(from) || !isDayString(to)) {
      return NextResponse.json({ error: 'Which dates?' }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ error: 'The first date is after the last.' }, { status: 400 });
    }

    const days = await collectRecoveryGaps(from, to);
    const cases = allGapCases(days);

    // What has already gone out, so nobody is written to twice about a day.
    const links = days.flatMap((d) => d.supervisors
      .concat(d.recoveryNurses, d.recordHolders)
      .map((p) => recoveryChaseLink(d.day, p.id)));
    const sent = links.length
      ? await prisma.notification.findMany({
        where: { type: RECOVERY_CHASE_TYPE, link: { in: links } },
        select: { link: true, createdAt: true },
      })
      : [];
    const sentAt = new Map(sent.map((s) => [s.link, s.createdAt.toISOString()]));

    const shape = (day: string) => (p: {
      id: string; fullName: string; role: string | null; hasPhone: boolean;
      active: boolean; shift: string | null; source: string; caseIds: string[];
    }) => ({
      ...p,
      caseCount: p.caseIds.length,
      sentAt: sentAt.get(recoveryChaseLink(day, p.id)) ?? null,
    });

    const totals: Record<string, number> = {
      cases: cases.length,
      completed: days.reduce((n, d) => n + d.completedCount, 0),
      mortalities: days.reduce((n, d) => n + d.mortalityCount, 0),
      daysWithNobodyToWriteTo: days.filter(
        (d) => d.cases.length > 0 && d.supervisors.length === 0 && d.recoveryNurses.length === 0,
      ).length,
    };
    RECOVERY_GAP_CODES.forEach((code) => {
      totals[code] = cases.filter((c) => c.gaps.indexOf(code) !== -1).length;
    });

    return NextResponse.json({
      from,
      to,
      today,
      periodLabel: periodLabel(from, to),
      canSend: (RECOVERY_SEND_ROLES as readonly string[]).includes(String(session!.user.role ?? '')),
      totals,
      gapLabels: RECOVERY_GAP_CODES.map((c) => ({
        code: c, label: RECOVERY_GAPS[c].label, missing: RECOVERY_GAPS[c].missing,
      })),
      days: days
        // Days with nothing outstanding are kept out of the list but counted
        // in the totals above: the denominator matters, the empty row does not.
        .filter((d) => d.cases.length > 0)
        .reverse()
        .map((d) => ({
          day: d.day,
          dayLabel: dayWords(d.day),
          completedCount: d.completedCount,
          mortalityCount: d.mortalityCount,
          counts: d.counts,
          headline: recoveryHeadline(d.cases),
          nobodyToWriteTo: d.supervisors.length === 0 && d.recoveryNurses.length === 0,
          unmatchedCount: d.unmatched.length,
          cases: d.cases,
          supervisors: d.supervisors.map(shape(d.day)),
          recoveryNurses: d.recoveryNurses.map(shape(d.day)),
          recordHolders: d.recordHolders.map(shape(d.day)),
        })),
    });
  } catch (err) {
    console.error('[recovery-chase] board failed:', err);
    return NextResponse.json({ error: 'Could not read the board' }, { status: 500 });
  }
}
