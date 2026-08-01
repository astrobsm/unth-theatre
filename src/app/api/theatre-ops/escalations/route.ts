// ============================================================
// Escalations — the department's queue, and closing the loop
// ------------------------------------------------------------
// An escalation is open until somebody says otherwise. That is the whole
// value: "we told CSSD at 09:20 and they acknowledged at 09:24" is a fact,
// where "we called them" is a recollection that nobody can check a month
// later when the same thing happens again.
//
// Escalations address a ROLE, not a person. The CSSD supervisor on duty is
// whoever is on duty; addressing an individual would leave an urgent
// escalation sitting unread on somebody's day off.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { effectiveRoles } from '@/lib/roleGroups';
import { CATEGORY_BY_CODE } from '@/lib/theatreOps/delays';

export const dynamic = 'force-dynamic';

const OVERSEERS = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

// ---------------------------------------------------------------------------
// GET — what is waiting on me, or on everybody
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const mineOnly = sp.get('mine') !== 'false';
  const oversees = OVERSEERS.includes(user.role ?? '');

  // Role inheritance is honoured, so a consultant surgeon sees what is
  // addressed to surgeons without every escalation naming both.
  const myRoles = effectiveRoles(user.role ?? '');

  try {
    const escalations = await prisma.theatreEscalation.findMany({
      where: {
        ...(sp.get('status') ? { status: sp.get('status') as never } : { status: { in: ['OPEN', 'ACKNOWLEDGED'] } }),
        // A manager sees everything; everybody else sees what was addressed to
        // a role they hold.
        ...(mineOnly && !oversees ? { notifiedRole: { in: myRoles } } : {}),
      },
      include: {
        delayRecord: {
          select: {
            id: true, categoryCode: true, narrative: true, recordedAt: true,
            reportedByName: true, theatreName: true, minutesLateAtRecord: true,
            surgery: { select: { id: true, procedureName: true, scheduledDate: true, scheduledTime: true } },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 300,
    });

    const now = Date.now();
    const rows = escalations.map((e) => ({
      ...e,
      categoryLabel: CATEGORY_BY_CODE[e.delayRecord.categoryCode]?.label ?? e.delayRecord.categoryCode,
      // How long it has been sitting. The number that says whether escalating
      // to this department actually achieves anything.
      minutesOpen: Math.floor((now - e.createdAt.getTime()) / 60_000),
    }));

    return NextResponse.json({
      escalations: rows,
      totals: {
        open: rows.filter((e) => e.status === 'OPEN').length,
        acknowledged: rows.filter((e) => e.status === 'ACKNOWLEDGED').length,
        // Open for over half an hour with nobody having even acknowledged it.
        unacknowledgedOver30: rows.filter((e) => e.status === 'OPEN' && e.minutesOpen > 30).length,
      },
      viewingAll: oversees && mineOnly ? true : !mineOnly,
    });
  } catch (error) {
    console.error('[theatre-ops] escalation list failed:', error);
    return NextResponse.json({ error: 'Failed to load escalations' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH — acknowledge, or close
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string; fullName?: string; name?: string } | undefined;
  if (!user?.id) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  let body: { id?: string; action?: 'ACKNOWLEDGE' | 'RESOLVE'; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.id || !body.action) {
    return NextResponse.json({ error: 'An escalation and an action are required.' }, { status: 400 });
  }

  try {
    const escalation = await prisma.theatreEscalation.findUnique({ where: { id: body.id } });
    if (!escalation) return NextResponse.json({ error: 'Escalation not found' }, { status: 404 });

    const myRoles = effectiveRoles(user.role ?? '');
    const oversees = OVERSEERS.includes(user.role ?? '');
    // Only the department addressed may answer for it — otherwise a theatre
    // could close its own escalation and the loop would prove nothing.
    if (!oversees && !myRoles.includes(escalation.notifiedRole)) {
      return NextResponse.json(
        { error: `This was raised with ${escalation.notifiedRole.replace(/_/g, ' ').toLowerCase()}. Only they, or a theatre manager, can answer it.` },
        { status: 403 }
      );
    }

    if (escalation.status === 'RESOLVED' || escalation.status === 'CANCELLED') {
      return NextResponse.json({ success: true, alreadyClosed: true, escalation });
    }

    const name = user.fullName ?? user.name ?? null;

    if (body.action === 'ACKNOWLEDGE') {
      const updated = await prisma.theatreEscalation.update({
        where: { id: escalation.id },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedById: user.id,
          acknowledgedByName: name,
          acknowledgedAt: new Date(),
        },
      });
      return NextResponse.json({ escalation: updated, success: true });
    }

    const note = body.note?.trim();
    if (!note || note.length < 5) {
      return NextResponse.json(
        { error: 'Say what was done to resolve it — that is what makes the record worth keeping.' },
        { status: 400 }
      );
    }

    const updated = await prisma.theatreEscalation.update({
      where: { id: escalation.id },
      data: {
        status: 'RESOLVED',
        // Somebody who resolves without acknowledging first still gets an
        // acknowledgement time, so the response-time figures are not skewed by
        // a department that simply worked faster than it clicked.
        ...(escalation.acknowledgedAt
          ? {}
          : { acknowledgedById: user.id, acknowledgedByName: name, acknowledgedAt: new Date() }),
        resolvedById: user.id,
        resolvedByName: name,
        resolvedAt: new Date(),
        resolutionNote: note,
      },
    });

    return NextResponse.json({ escalation: updated, success: true });
  } catch (error) {
    console.error('[theatre-ops] escalation update failed:', error);
    return NextResponse.json({ error: 'Failed to update the escalation' }, { status: 500 });
  }
}
