// ============================================================
// The day's list, and where the next case would go
// ------------------------------------------------------------
// Answers one question for the booking form: given what is already booked in
// this theatre on this day, when is the next free start?
//
// The arithmetic is lib/theatreOps/scheduling — the same function the booking
// route validates against. A form that computed its own suggestion would
// eventually offer a time the server then rejected, which is a worse
// experience than offering nothing.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { planList, TURNOVER_MINUTES } from '@/lib/theatreOps/scheduling';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const date = sp.get('date');
  const theatreId = sp.get('theatreId')?.trim();
  const unit = sp.get('unit')?.trim();

  if (!date) return NextResponse.json({ error: 'Which day?' }, { status: 400 });
  if (!theatreId && !unit) {
    return NextResponse.json({ error: 'Which theatre, or which unit?' }, { status: 400 });
  }

  try {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const cases = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: dayStart, lte: dayEnd },
        surgeryType: { in: ['ELECTIVE', 'URGENT'] },
        status: { notIn: ['CANCELLED'] },
        // Sequenced by theatre when one is chosen; otherwise by unit, because a
        // unit without its own theatre still cannot run two cases at once.
        ...(theatreId ? { theatreId } : { unit }),
      },
      select: {
        id: true,
        scheduledTime: true,
        estimatedDuration: true,
        procedureName: true,
        surgeonName: true,
      },
      orderBy: { scheduledTime: 'asc' },
    });

    const plan = planList(
      cases.map((c) => ({
        id: c.id,
        scheduledTime: c.scheduledTime,
        estimatedDuration: c.estimatedDuration || 60,
      }))
    );

    // Names attached back on, so the form can show WHAT is already booked
    // rather than just that something is.
    const byId = new Map(cases.map((c) => [c.id, c]));

    return NextResponse.json({
      ...plan,
      turnoverMinutes: TURNOVER_MINUTES,
      cases: plan.cases.map((c) => ({
        ...c,
        procedureName: c.id ? byId.get(c.id)?.procedureName ?? null : null,
        surgeonName: c.id ? byId.get(c.id)?.surgeonName ?? null : null,
      })),
    });
  } catch (error) {
    console.error('[theatre-ops] list plan failed:', error);
    return NextResponse.json({ error: 'Failed to load the day’s list' }, { status: 500 });
  }
}
