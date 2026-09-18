import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import { toMinutes } from '@/lib/theatreOps/scheduling';

export const dynamic = 'force-dynamic';

/**
 * Move several cases at once, as one decision.
 *
 * This exists because the useful answer to "the theatre is busy at ten" is
 * usually "put mine at ten and move the others back", and that is three or four
 * edits which must all happen or none of them. Applied one at a time through
 * the ordinary edit endpoint they would fail halfway: the second move is
 * refused for clashing with the first case, which has not moved yet, and the
 * list is left in a state nobody chose.
 *
 * So the whole plan goes in one transaction, and the per-case slot check is
 * deliberately NOT re-run for each edit in isolation — the plan is checked as a
 * whole, afterwards, against the day it produces. A plan that leaves two cases
 * overlapping is rejected and nothing is written.
 *
 * WHAT IT WILL NOT DO. It will not move a case that has started, and it will
 * not move one that is cancelled or completed. It touches the time only: the
 * theatre, the surgeon, the patient and everything else stay as they were.
 */

/**
 * The only status a case may be moved from by this endpoint.
 *
 * A patient IN_HOLDING_AREA or READY_FOR_THEATRE has already been starved and
 * sent for. Moving them is sometimes right, but it is a decision somebody makes
 * on that case, not a side-effect of another booking — so it is refused here
 * and the refusal names the case.
 */
const MOVABLE_STATUSES = ['SCHEDULED'];
/** Patient out, theatre cleaned, next patient in. */
const TURNOVER = 20;

interface Move {
  id: string;
  scheduledTime: string;
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { id: string; fullName?: string; name?: string };
  const body = await req.json().catch(() => ({}));
  const moves: Move[] = Array.isArray(body.moves) ? body.moves : [];
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!moves.length) {
    return NextResponse.json({ error: 'No changes were given.' }, { status: 400 });
  }
  if (moves.length > 20) {
    return NextResponse.json({ error: 'That is too many cases to move at once.' }, { status: 400 });
  }
  for (const m of moves) {
    if (!m?.id || toMinutes(m?.scheduledTime) === null) {
      return NextResponse.json(
        { error: 'Every case being moved needs an id and a time as HH:MM.' },
        { status: 400 });
    }
  }

  const ids = moves.map((m) => m.id);
  const cases = await prisma.surgery.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, scheduledTime: true, scheduledDate: true, estimatedDuration: true,
      status: true, theatreId: true, unit: true, procedureName: true,
      patient: { select: { name: true } },
    },
  });

  if (cases.length !== ids.length) {
    return NextResponse.json({ error: 'One of those cases no longer exists.' }, { status: 404 });
  }

  const immovable = cases.filter((c) => !MOVABLE_STATUSES.includes(String(c.status).toUpperCase()));
  if (immovable.length) {
    return NextResponse.json({
      error: `${immovable[0].procedureName} cannot be moved — it is ${String(immovable[0].status).toLowerCase().replace(/_/g, ' ')}.`,
      code: 'NOT_MOVABLE',
      cases: immovable.map((c) => ({ id: c.id, procedureName: c.procedureName, status: c.status })),
    }, { status: 409 });
  }

  // ---- Check the plan as a WHOLE, against the day it produces -------------
  // Every case that day in the affected rooms, with the moves applied. This is
  // the check that matters: each move on its own looks like a clash with a case
  // that is also moving.
  const day = cases[0].scheduledDate;
  const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
  const rooms = Array.from(new Set(cases.map((c) => c.theatreId).filter(Boolean))) as string[];

  const sameDay = await prisma.surgery.findMany({
    where: {
      scheduledDate: { gte: dayStart, lte: dayEnd },
      status: { notIn: ['CANCELLED', 'COMPLETED'] },
      ...(rooms.length ? { theatreId: { in: rooms } } : { unit: cases[0].unit }),
    },
    select: {
      id: true, scheduledTime: true, estimatedDuration: true, theatreId: true,
      procedureName: true,
    },
  });

  const moveById = new Map(moves.map((m) => [m.id, m.scheduledTime]));
  const planned = sameDay.map((s) => ({
    ...s,
    scheduledTime: moveById.get(s.id) ?? s.scheduledTime,
  }));

  // Per room, because two theatres running at once is the point of having two.
  const byRoom = new Map<string, typeof planned>();
  for (const p of planned) {
    const key = p.theatreId ?? '(no theatre)';
    byRoom.set(key, [...(byRoom.get(key) ?? []), p]);
  }

  for (const [, list] of Array.from(byRoom.entries())) {
    const rows = list
      .map((p) => {
        const s = toMinutes(p.scheduledTime);
        return s === null ? null : { s, e: s + (p.estimatedDuration || 60), name: p.procedureName };
      })
      .filter((x): x is { s: number; e: number; name: string } => x !== null)
      .sort((a, b) => a.s - b.s);

    for (let i = 1; i < rows.length; i++) {
      if (rows[i].s < rows[i - 1].e + TURNOVER) {
        return NextResponse.json({
          error: `That plan leaves ${rows[i - 1].name} and ${rows[i].name} overlapping, `
            + `or without the ${TURNOVER} minutes needed between them. Nothing has been changed.`,
          code: 'PLAN_INVALID',
        }, { status: 409 });
      }
    }
  }

  // ---- Apply ------------------------------------------------------------
  const actor = user.fullName || user.name || 'Unknown';
  const applied: Array<{ id: string; from: string; to: string; procedureName: string }> = [];

  try {
    await prisma.$transaction(async (tx) => {
      for (const m of moves) {
        const before = cases.find((c) => c.id === m.id)!;
        if (before.scheduledTime === m.scheduledTime) continue;

        await tx.surgery.update({
          where: { id: m.id },
          data: { scheduledTime: m.scheduledTime },
        });

        applied.push({
          id: m.id,
          from: before.scheduledTime,
          to: m.scheduledTime,
          procedureName: before.procedureName,
        });

        // One entry per case, because the question asked afterwards is always
        // "why was MY patient moved", and it is asked of one case.
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'RESCHEDULE',
            tableName: 'surgeries',
            recordId: m.id,
            changes: JSON.stringify({
              scheduledTime: { from: before.scheduledTime, to: m.scheduledTime },
              patient: before.patient?.name ?? null,
              by: actor,
              reason: reason || 'Moved to make room for another case',
              partOfPlan: moves.length > 1 ? moves.map((x) => x.id) : undefined,
            }),
          },
        });
      }
    });
  } catch (e) {
    console.error('[surgeries/reschedule-batch] failed:', e);
    return NextResponse.json(
      { error: 'The changes could not be saved. Nothing has been moved.' },
      { status: 500 });
  }

  return NextResponse.json({ ok: true, moved: applied.length, applied });
}
