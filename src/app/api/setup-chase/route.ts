// ============================================================
// The board: elective theatre-days that were not set up, checked or closed
// ------------------------------------------------------------
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Read-only. ONE PASS over the theatre-days builds both lists — the
// technicians and the theatre-days with nobody assigned — so the two cannot
// disagree about what is outstanding.
//
// THEATRE-DAYS WITH NOBODY ASSIGNED ARE REPORTED, NOT HIDDEN. A theatre that
// operated with no technician on the allocation, on any case, or on a setup
// log is a worse finding than a late setup, and no message fixes it: somebody
// has to be allocated. Shown separately so that can happen.
//
// THE DENOMINATOR IS CARRIED. "Nine theatre-days outstanding" means nothing
// without "out of how many", and the figure that follows a complaint is the
// one that decides whether it is believed.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiMiddleware';
import prisma from '@/lib/prisma';
import { watToday } from '@/lib/watDay';
import { periodLabel } from '@/lib/dutyPerformance/export';
import { collectSetupGaps, groupByTechnician, unassigned } from '@/lib/setupChase/collect';
import {
  SETUP_GAPS, SETUP_GAP_CODES, MORNING_DUE_LABEL, END_OF_DAY_DUE_LABEL,
} from '@/lib/setupChase/gaps';
import { setupHeadline, shortDay, theatreDayBits } from '@/lib/setupChase/messages';
import { SETUP_CHASE_TYPE, setupChaseLink } from '@/lib/setupChase/notify';
import {
  SETUP_VIEW_ROLES, SETUP_SEND_ROLES, SETUP_WINDOW_DAYS,
} from '@/lib/setupChase/access';
import { shiftDay, isDayString } from '@/lib/recoveryChase/access';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error, session } = await requireRole(SETUP_VIEW_ROLES as never);
  if (error) return error;

  try {
    const url = new URL(request.url);
    const today = watToday();
    const to = url.searchParams.get('to') ?? today;
    const from = url.searchParams.get('from') ?? shiftDay(to, -(SETUP_WINDOW_DAYS - 1));

    if (!isDayString(from) || !isDayString(to)) {
      return NextResponse.json({ error: 'Which dates?' }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ error: 'The first date is after the last.' }, { status: 400 });
    }

    const { theatreDays, electiveTheatreDays } = await collectSetupGaps(from, to);
    const groups = groupByTechnician(theatreDays);
    const orphans = unassigned(theatreDays);

    // Roles and phone numbers for everybody we might write to, in one query.
    const ids = groups.map((g) => g.personId);
    const people = ids.length
      ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, fullName: true, role: true, phoneNumber: true, status: true },
      })
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));

    // What has already gone out for this window.
    const sent = ids.length
      ? await prisma.notification.findMany({
        where: {
          type: SETUP_CHASE_TYPE,
          link: { in: ids.map((id) => setupChaseLink(from, to, id)) },
        },
        select: { link: true, createdAt: true },
      })
      : [];
    const sentAt = new Map(sent.map((s) => [s.link, s.createdAt.toISOString()]));

    const dayRow = (td: typeof theatreDays[number]) => ({
      day: td.day,
      dayLabel: shortDay(td.day),
      theatreId: td.theatreId,
      theatreName: td.theatreName,
      gaps: td.gaps,
      bits: theatreDayBits(td),
      caseCount: td.caseCount,
      evidence: td.evidence,
      certifiedClock: td.certifiedClock,
      endOfDayClock: td.endOfDayClock,
      unchecked: td.unchecked,
      stoodDown: td.stoodDown,
      technicianName: td.technicianName,
      technicianSource: td.technicianSource,
      assignedTheatreName: td.assignedTheatreName,
    });

    const totals: Record<string, number> = {
      theatreDays: theatreDays.length,
      electiveTheatreDays,
      unassigned: orphans.length,
    };
    SETUP_GAP_CODES.forEach((code) => {
      totals[code] = theatreDays.filter((td) => td.gaps.indexOf(code) !== -1).length;
    });

    return NextResponse.json({
      from,
      to,
      today,
      periodLabel: periodLabel(from, to),
      deadlines: { morning: MORNING_DUE_LABEL, endOfDay: END_OF_DAY_DUE_LABEL },
      canSend: (SETUP_SEND_ROLES as readonly string[]).includes(String(session!.user.role ?? '')),
      totals,
      gapLabels: SETUP_GAP_CODES.map((c) => ({ code: c, label: SETUP_GAPS[c].label })),
      technicians: groups.map((g) => {
        const u = byId.get(g.personId);
        return {
          personId: g.personId,
          // The account's name wins over the one denormalised onto the log: a
          // name that was right when the log was written may since have been
          // corrected, and a letter to the old one looks careless.
          personName: u?.fullName || g.personName,
          role: u?.role ? String(u.role) : null,
          hasPhone: Boolean(u?.phoneNumber),
          active: !u || u.status === 'APPROVED',
          theatres: g.theatres,
          dayCount: g.theatreDays.length,
          counts: g.counts,
          headline: setupHeadline(g),
          sentAt: sentAt.get(setupChaseLink(from, to, g.personId)) ?? null,
          theatreDays: g.theatreDays.map(dayRow),
        };
      }),
      unassigned: orphans.map(dayRow),
    });
  } catch (err) {
    console.error('[setup-chase] board failed:', err);
    return NextResponse.json({ error: 'Could not read the board' }, { status: 500 });
  }
}
