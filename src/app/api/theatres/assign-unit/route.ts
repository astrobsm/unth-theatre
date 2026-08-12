import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/theatres/assign-unit   { unit, date, theatreId }
 *
 * Assigns one theatre to every case a unit has booked for a day.
 *
 * This matches how the theatre complex actually runs. A unit gets a room for the
 * session and works through its own list in it; it does not get a different
 * theatre per patient. Previously the person booking picked a theatre per case,
 * which meant one unit's cases could be scattered across three rooms by three
 * different bookers, and nobody could see it until the morning.
 *
 * So: the booker books, theatre assigns the room. This endpoint is the second
 * half of that.
 */

/** The people who run the floor. Booking clinicians are deliberately excluded. */
const ASSIGN_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'NURSE_MANAGER', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'NURSE',
];

/** Statuses whose theatre is still ours to decide. */
const REASSIGNABLE = ['SCHEDULED', 'READY_FOR_THEATRE', 'IN_HOLDING_AREA'] as const;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; name?: string; role?: string } | undefined;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ASSIGN_ROLES.includes(user.role ?? '')) {
    return NextResponse.json(
      { error: 'Only theatre staff or the theatre manager can assign theatres.' },
      { status: 403 });
  }

  let body: { unit?: string; date?: string; theatreId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  const unit = (body.unit ?? '').trim();
  if (!unit) return NextResponse.json({ error: 'unit is required.' }, { status: 400 });
  if (!body.theatreId) return NextResponse.json({ error: 'Choose a theatre.' }, { status: 400 });

  const target = body.date ? new Date(body.date) : new Date();
  if (Number.isNaN(target.getTime())) {
    return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
  }
  const startOfDay = new Date(target);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(target);
  endOfDay.setHours(23, 59, 59, 999);

  const theatre = await prisma.theatreSuite.findUnique({
    where: { id: body.theatreId },
    select: { id: true, name: true },
  });
  if (!theatre) return NextResponse.json({ error: 'Theatre not found.' }, { status: 404 });

  // Matched on unit OR subspecialty: the list on screen groups by unit where one
  // is recorded and by subspecialty otherwise, so the button must select exactly
  // what the operator was looking at.
  const cases = await prisma.surgery.findMany({
    where: {
      scheduledDate: { gte: startOfDay, lte: endOfDay },
      status: { in: [...REASSIGNABLE] },
      OR: [{ unit }, { subspecialty: unit }],
    },
    select: { id: true, theatreId: true, procedureName: true, patient: { select: { name: true } } },
  });

  if (cases.length === 0) {
    // Not an error — a unit with nothing booked is an ordinary state, and an
    // error here would look like a fault in the button.
    return NextResponse.json({
      ok: true, assigned: 0, theatre: theatre.name,
      message: `${unit} has no cases to assign on that date.`,
    });
  }

  // Which cases already sat in a DIFFERENT theatre. Reported back, because
  // moving a case somebody had deliberately placed elsewhere should be visible
  // rather than silent.
  const moved = cases.filter((c) => c.theatreId && c.theatreId !== theatre.id);

  await prisma.$transaction(async (tx) => {
    await tx.surgery.updateMany({
      where: { id: { in: cases.map((c) => c.id) } },
      data: { theatreId: theatre.id },
    });

    if (user.id) {
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'THEATRE_ASSIGNED_TO_UNIT',
          tableName: 'surgeries',
          // One record for the whole session assignment: this was a single
          // decision by one person, and splitting it into N rows would make the
          // log harder to read, not more precise.
          recordId: null,
          changes: JSON.stringify({
            unit,
            date: startOfDay.toISOString().slice(0, 10),
            theatre: theatre.name,
            caseCount: cases.length,
            movedFromAnotherTheatre: moved.length,
            surgeryIds: cases.map((c) => c.id),
          }),
        },
      });
    }
  });

  return NextResponse.json({
    ok: true,
    assigned: cases.length,
    theatre: theatre.name,
    movedFromAnotherTheatre: moved.length,
    message: moved.length
      ? `${cases.length} case(s) for ${unit} assigned to ${theatre.name}. ${moved.length} moved from another theatre.`
      : `${cases.length} case(s) for ${unit} assigned to ${theatre.name}.`,
  });
}
