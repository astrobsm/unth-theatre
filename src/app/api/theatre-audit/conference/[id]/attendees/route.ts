import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { guardWrite } from '@/lib/audit/conferenceGuard';

export const dynamic = 'force-dynamic';

/**
 * Who was in the room.
 *
 * Part of the minute, not decoration. A decision about anaesthetic cover taken
 * with no anaesthetist present is a different fact from the same decision
 * taken with three, and the first question asked of any contested resolution
 * is who was there when it was passed.
 */

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

/** POST — add somebody to the attendance. */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guard = await guardWrite(params.id, session.user.role);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const name = str(body.name, 120);
    if (!name) {
      return NextResponse.json({ error: 'A name is needed.' }, { status: 400 });
    }

    const apologies = body.apologies === true;

    const attendee = await prisma.conferenceAttendee.create({
      data: {
        conferenceId: params.id,
        userId: str(body.userId, 64) || null,
        name,
        roleAtSitting: str(body.roleAtSitting, 120) || null,
        // Apologies and presence are the same fact stated twice, so one
        // follows the other rather than being set independently — an attendee
        // marked both present and apologising is a record of nothing.
        apologies,
        present: apologies ? false : body.present !== false,
      },
    });

    return NextResponse.json({ attendee });
  } catch (error) {
    return apiError('conference/[id]/attendees POST', error);
  }
}

/** PATCH — correct somebody's presence or standing. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guard = await guardWrite(params.id, session.user.role);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const attendeeId = str(body.attendeeId, 64);

    const existing = await prisma.conferenceAttendee.findFirst({
      where: { id: attendeeId, conferenceId: params.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'That name is not on this attendance.' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (typeof body.name === 'string' && str(body.name, 120)) data.name = str(body.name, 120);
    if (typeof body.roleAtSitting === 'string') data.roleAtSitting = str(body.roleAtSitting, 120) || null;
    if (typeof body.apologies === 'boolean') {
      data.apologies = body.apologies;
      if (body.apologies) data.present = false;
    }
    if (typeof body.present === 'boolean' && data.present === undefined) {
      data.present = body.present;
      if (body.present) data.apologies = false;
    }

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
    }

    const attendee = await prisma.conferenceAttendee.update({ where: { id: attendeeId }, data });
    return NextResponse.json({ attendee });
  } catch (error) {
    return apiError('conference/[id]/attendees PATCH', error);
  }
}

/** DELETE ?attendeeId= — remove a name entered by mistake. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guard = await guardWrite(params.id, session.user.role);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
  }

  try {
    const attendeeId = request.nextUrl.searchParams.get('attendeeId') ?? '';
    const existing = await prisma.conferenceAttendee.findFirst({
      where: { id: attendeeId, conferenceId: params.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'That name is not on this attendance.' }, { status: 404 });
    }

    await prisma.conferenceAttendee.delete({ where: { id: attendeeId } });
    return NextResponse.json({ deleted: attendeeId });
  } catch (error) {
    return apiError('conference/[id]/attendees DELETE', error);
  }
}
