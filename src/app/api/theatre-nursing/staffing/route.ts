import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { parseTheatreDay, dayKey } from '@/lib/theatre/day';
import {
  NURSING_POSTS, PERIOPERATIVE_NURSE_ROLES, nursingForDay, postAllowsShift, postByKey,
} from '@/lib/roster/theatreNursing';

export const dynamic = 'force-dynamic';

/**
 * Who is nursing the theatre today: the main-theatre emergency pair, the A/E
 * theatre pair, and the nurse supervisors.
 *
 * Rows go into `rosters`, exactly as the holding-area screen does, so that a
 * name entered here is already known to the meal count, the duty sheets and
 * the duty-performance screens without any of them being changed. The rules
 * about which post may be staffed on which shift live in
 * lib/roster/theatreNursing, next to the resolver the emergency chase uses, so
 * a shift this endpoint accepts is a shift that chase can actually find.
 */

const MAY_ALLOCATE = [
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'INFECTION_CONTROL_NURSE',
  'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ADMIN', 'SYSTEM_ADMINISTRATOR',
];

/** GET /api/theatre-nursing/staffing?date=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const day = parseTheatreDay(request.nextUrl.searchParams.get('date'));
    const staff = await nursingForDay(day);

    // Who allocated each one. The whole point of this screen is that somebody
    // put a name against a post, so the record has to say who.
    const allocatorIds = Array.from(
      new Set(staff.map((s) => s.allocatedBy).filter((v): v is string => !!v)),
    );
    const allocators = allocatorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: allocatorIds } },
          select: { id: true, fullName: true },
        }).catch(() => [])
      : [];

    return NextResponse.json({
      date: dayKey(day),
      posts: NURSING_POSTS,
      staff: staff.map((s) => ({
        ...s,
        allocatedByName: allocators.find((a) => a.id === s.allocatedBy)?.fullName ?? null,
      })),
    });
  } catch (error) {
    return apiError('theatre-nursing/staffing GET', error);
  }
}

/** POST /api/theatre-nursing/staffing — put somebody on a nursing post. */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!MAY_ALLOCATE.includes((session.user.role ?? '').toUpperCase())) {
    return NextResponse.json({
      error: 'Staffing the theatre nursing posts is done by theatre nursing and theatre management.',
      code: 'NO_ACCESS',
    }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const postKey = typeof body.postKey === 'string' ? body.postKey.trim() : '';
    const shift = typeof body.shift === 'string' ? body.shift.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 300) : '';
    const day = parseTheatreDay(typeof body.date === 'string' ? body.date : null);

    const post = postByKey(postKey);
    if (!post || !userId) {
      return NextResponse.json(
        { error: 'Choose the post and the member of staff.' },
        { status: 400 },
      );
    }

    // A shift this post cannot be found on is refused rather than written.
    // The main-theatre emergency posts carry no MORNING, because an emergency
    // never reads the morning roster: a row written there would sit on the
    // screen looking staffed and would be chased by nobody.
    if (!postAllowsShift(post.key, shift)) {
      return NextResponse.json({
        error: `${post.label} is staffed on ${post.shifts.join(' or ')}, not ${shift || 'nothing'}.`,
        code: 'SHIFT_NOT_ON_THIS_POST',
      }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, role: true, status: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'That member of staff is not on file.' }, { status: 404 });
    }
    if (user.status !== 'APPROVED') {
      return NextResponse.json(
        { error: `${user.fullName}'s account has not been approved yet.` },
        { status: 409 },
      );
    }
    // "From among the perioperative nurses", as asked. Said plainly rather
    // than filtered out of the picker alone, because the picker is not the
    // only way a request reaches this endpoint.
    if (!(PERIOPERATIVE_NURSE_ROLES as readonly string[]).includes(user.role)) {
      return NextResponse.json({
        error: `${user.fullName} is not registered as a perioperative nurse, so cannot hold this post.`,
        code: 'NOT_A_PERIOPERATIVE_NURSE',
      }, { status: 409 });
    }

    // Already on that post for that shift. Said plainly rather than silently
    // written twice -- two rows for one person is what makes a duty sheet
    // stop being believed.
    const existing = await prisma.roster.findFirst({
      where: {
        userId, date: day, shift: shift as never,
        subRole: post.subRole, location: post.location,
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({
        error: `${user.fullName} is already on ${post.label} for that shift.`,
        code: 'ALREADY_ALLOCATED',
      }, { status: 409 });
    }

    const created = await prisma.roster.create({
      data: {
        userId,
        staffName: user.fullName,
        staffCategory: 'NURSES',
        subRole: post.subRole,
        location: post.location,
        // No theatreId. These posts are held against a shift, not a room --
        // which is the entire point for the emergency that has no room yet.
        theatreId: null,
        date: day,
        shift: shift as never,
        uploadedBy: session.user.id,
        notes: notes || null,
        // Live immediately: this is today's floor being staffed, not next
        // month's roster being drafted, and only PUBLISHED rows are on duty.
        status: 'PUBLISHED',
      },
      select: { id: true, staffName: true, shift: true, notes: true, uploadedAt: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'THEATRE_NURSING_POST_ALLOCATED',
        tableName: 'rosters',
        recordId: created.id,
        changes: JSON.stringify({
          post: post.key, staffName: user.fullName, date: dayKey(day), shift,
          location: post.location, subRole: post.subRole, notes: notes || null,
        }),
      },
    }).catch(() => { /* the allocation stands even if the log does not */ });

    return NextResponse.json({ allocated: created, post: post.key });
  } catch (error) {
    return apiError('theatre-nursing/staffing POST', error);
  }
}

/** DELETE /api/theatre-nursing/staffing?id=… — take somebody off a post. */
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

    // Scoped to the nursing posts. This endpoint must not become a way to
    // delete arbitrary roster entries for the rest of the theatre.
    const row = await prisma.roster.findFirst({
      where: { id, subRole: { in: ['SCRUB', 'CIRCULATING', 'SUPERVISING'] } },
      select: { id: true, staffName: true, date: true, shift: true, subRole: true, location: true },
    });
    if (!row) {
      return NextResponse.json({ error: 'That allocation is not on file.' }, { status: 404 });
    }

    await prisma.roster.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'THEATRE_NURSING_POST_REMOVED',
        tableName: 'rosters',
        recordId: id,
        changes: JSON.stringify({
          staffName: row.staffName, date: dayKey(row.date), shift: row.shift,
          subRole: row.subRole, location: row.location,
        }),
      },
    }).catch(() => { /* removal stands even if the log does not */ });

    return NextResponse.json({ removed: id });
  } catch (error) {
    return apiError('theatre-nursing/staffing DELETE', error);
  }
}
