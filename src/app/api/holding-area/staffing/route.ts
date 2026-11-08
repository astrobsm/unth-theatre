import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { parseTheatreDay, dayKey } from '@/lib/theatre/day';
import {
  normaliseComplex, complexOfRow, HOLDING_AREA_COMPLEXES,
} from '@/lib/holdingArea/complexes';

export const dynamic = 'force-dynamic';

/**
 * Who is on the holding area, on a given day and shift.
 *
 * The holding area had nobody named to it. It was in the theatre list as
 * though it were a theatre — which is a separate wrong thing, now fixed — but
 * a room that is not a theatre still has staff in it, and there was nowhere to
 * say who. Patients wait there, are verified there, and are handed over from
 * there, and "who was on the holding area on Tuesday morning" had no answer.
 *
 * WRITTEN INTO THE ROSTER, NOT A TABLE OF ITS OWN. rosters already carries
 * exactly this — a person, a date, a shift, a sub-role of HOLDING_AREA, and
 * who put them there — and the on-duty, meals and duty-sheet screens already
 * read it. A second table would have meant a second answer to the same
 * question, and the two would disagree within a week.
 */

const MAY_ALLOCATE = [
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'INFECTION_CONTROL_NURSE',
  'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ADMIN', 'SYSTEM_ADMINISTRATOR',
];

const SHIFTS = ['MORNING', 'CALL', 'NIGHT'] as const;
type Shift = typeof SHIFTS[number];

const isShift = (v: unknown): v is Shift =>
  typeof v === 'string' && (SHIFTS as readonly string[]).includes(v);

/** GET /api/holding-area/staffing?date=YYYY-MM-DD — who is on it that day. */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const day = parseTheatreDay(request.nextUrl.searchParams.get('date'));

    // Every complex has its own holding area, so a row without a complex
    // answers a different question from the one being asked. The filter is
    // applied after reading because rows written before this change store
    // the old MAIN_THEATRE code, which `complexOfRow` resolves.
    const wantComplex = normaliseComplex(request.nextUrl.searchParams.get('complex'));

    const rows = await prisma.roster.findMany({
      where: { date: day, subRole: 'HOLDING_AREA' },
      select: {
        id: true, userId: true, staffName: true, shift: true, location: true,
        notes: true, uploadedBy: true, uploadedAt: true, status: true,
      },
      orderBy: [{ shift: 'asc' }, { staffName: 'asc' }],
    });

    // Who allocated each one. The whole point of this screen is that somebody
    // put a name against the holding area, so the record has to say who.
    const allocatorIds = Array.from(new Set(rows.map((r) => r.uploadedBy).filter(Boolean)));
    const allocators = allocatorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: allocatorIds } },
          select: { id: true, fullName: true },
        }).catch(() => [])
      : [];

    const staff = rows
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        staffName: r.staffName,
        shift: r.shift,
        complex: complexOfRow(r.location),
        notes: r.notes,
        allocatedByName: allocators.find((a) => a.id === r.uploadedBy)?.fullName ?? null,
        allocatedAt: r.uploadedAt,
        status: r.status,
      }))
      .filter((r) => !wantComplex || r.complex === wantComplex);

    return NextResponse.json({
      date: dayKey(day),
      complex: wantComplex,
      complexes: HOLDING_AREA_COMPLEXES,
      staff,
    });
  } catch (error) {
    return apiError('holding-area/staffing GET', error);
  }
}

/** POST /api/holding-area/staffing — put somebody on the holding area. */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!MAY_ALLOCATE.includes((session.user.role ?? '').toUpperCase())) {
    return NextResponse.json({
      error: 'Allocating staff to the holding area is done by theatre nursing and theatre management.',
      code: 'NO_ACCESS',
    }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const shift = body.shift;
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 300) : '';
    const day = parseTheatreDay(typeof body.date === 'string' ? body.date : null);

    // Which holding area. Required, and never guessed: an allocation put in
    // the wrong complex names somebody to a room they are not standing in,
    // and the chase that follows reaches them instead of whoever is.
    const complex = normaliseComplex(body.complex);

    if (!userId || !isShift(shift)) {
      return NextResponse.json(
        { error: 'Choose the member of staff and which shift they are covering.' },
        { status: 400 },
      );
    }
    if (!complex) {
      return NextResponse.json({
        error: 'Choose which theatre complex’s holding area they are on. '
          + 'Each complex has its own.',
        complexes: HOLDING_AREA_COMPLEXES,
      }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, status: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'That member of staff is not on file.' }, { status: 404 });
    }

    // Already on it for that shift. Said plainly rather than silently written
    // twice — two rows for one person is what makes a duty sheet stop being
    // believed.
    // Across EVERY complex, not just this one. Nobody can stand in two
    // holding areas at once, and a roster that says they do is a roster that
    // sends half the chases to a room the person is not in.
    const existing = await prisma.roster.findFirst({
      where: { userId, date: day, shift, subRole: 'HOLDING_AREA' },
      select: { id: true, location: true },
    });
    if (existing) {
      const where = complexOfRow(existing.location);
      return NextResponse.json({
        error: where === complex
          ? `${user.fullName} is already on the ${complex} holding area for that shift.`
          : `${user.fullName} is already on the ${where} holding area for that shift. `
            + 'Take them off there first — nobody can cover two holding areas at once.',
        code: 'ALREADY_ALLOCATED',
      }, { status: 409 });
    }

    const created = await prisma.roster.create({
      data: {
        userId,
        staffName: user.fullName,
        staffCategory: 'NURSES',
        subRole: 'HOLDING_AREA',
        // No theatreId. That is the point of this whole change: the holding
        // area is not a theatre, so a row naming somebody to it names no room.
        theatreId: null,
        // The complex, stored verbatim. Within subRole HOLDING_AREA this
        // column means "which holding area"; see lib/holdingArea/complexes.ts
        // for why it is this column and not a new one.
        location: complex,
        date: day,
        shift,
        uploadedBy: session.user.id,
        notes: notes || null,
        // Live immediately. This is today's floor being staffed, not next
        // month's roster being drafted, and a draft nobody publishes is
        // somebody standing in the holding area with no record of it.
        status: 'PUBLISHED',
      },
      select: {
        id: true, staffName: true, shift: true, location: true, notes: true, uploadedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'HOLDING_AREA_STAFF_ALLOCATED',
        tableName: 'rosters',
        recordId: created.id,
        changes: JSON.stringify({
          staffName: user.fullName, date: dayKey(day), shift, complex, notes: notes || null,
        }),
      },
    }).catch(() => { /* the allocation stands even if the log does not */ });

    return NextResponse.json({
      allocated: { ...created, complex: complexOfRow(created.location) },
    });
  } catch (error) {
    return apiError('holding-area/staffing POST', error);
  }
}

/** DELETE /api/holding-area/staffing?id=… — take somebody off it again. */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!MAY_ALLOCATE.includes((session.user.role ?? '').toUpperCase())) {
    return NextResponse.json({ error: 'Forbidden', code: 'NO_ACCESS' }, { status: 403 });
  }

  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Which allocation?' }, { status: 400 });

    // Scoped to holding-area rows. This endpoint must not become a way to
    // delete arbitrary roster entries for the rest of the theatre.
    const row = await prisma.roster.findFirst({
      where: { id, subRole: 'HOLDING_AREA' },
      select: { id: true, staffName: true, date: true, shift: true },
    });
    if (!row) {
      return NextResponse.json({ error: 'That allocation is not on file.' }, { status: 404 });
    }

    await prisma.roster.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'HOLDING_AREA_STAFF_REMOVED',
        tableName: 'rosters',
        recordId: id,
        changes: JSON.stringify({
          staffName: row.staffName, date: dayKey(row.date), shift: row.shift,
        }),
      },
    }).catch(() => { /* removal stands even if the log does not */ });

    return NextResponse.json({ removed: id });
  } catch (error) {
    return apiError('holding-area/staffing DELETE', error);
  }
}
