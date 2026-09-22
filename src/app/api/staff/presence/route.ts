import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { evaluate, shouldRecord, summarise, type Check } from '@/lib/staff/presence';
import { shiftAt } from '@/lib/diagnostics/onDuty';

export const dynamic = 'force-dynamic';

/**
 * Presence during a duty period.
 *
 * The availability board records what somebody says they are. It cannot tell
 * whether they are in the building, so a member of staff could mark themselves
 * present at the start of a shift and leave, and the first anybody knew was
 * when the work did not happen.
 *
 * WHAT IS RECORDED: whether the person is inside the hospital perimeter, while
 * on duty. In or out. Not a movement trail, and nothing at all outside a
 * rostered shift — that rule is enforced here, on the server, so it holds
 * however the request arrives.
 *
 * The device sends a position; this decides whether it can answer at all. A
 * fix accurate to two kilometres, or no fix, is recorded as unknown and never
 * as absence, because a nurse in a basement theatre has not left the hospital.
 */

/** Who may read other people's presence. */
const SUPERVISORS = [
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'HEAD_OF_SURGERY', 'HEAD_OF_ANAESTHESIA', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'HEAD_OF_PHARMACY', 'CSSD_SUPERVISOR', 'LAUNDRY_SUPERVISOR', 'WORKS_SUPERVISOR',
  'OXYGEN_UNIT_SUPERVISOR', 'PLUMBING_SUPERVISOR', 'WATER_SUPPLY_SUPERVISOR',
  'ADMIN', 'SYSTEM_ADMINISTRATOR',
];

const canSupervise = (role: string | null | undefined) =>
  SUPERVISORS.includes((role ?? '').toUpperCase());

/** Is this person rostered for a shift covering now? */
async function isOnRoster(userId: string, at: Date): Promise<boolean> {
  const { shift, rosterDate } = shiftAt(at);
  const row = await prisma.roster.findFirst({
    where: {
      userId, date: rosterDate, shift: shift as never,
      status: 'PUBLISHED', pendingRemoval: false,
    },
    select: { id: true },
  }).catch(() => null);
  return !!row;
}

/**
 * POST /api/staff/presence — the device reports where it is.
 *
 * Called by the app while somebody is on duty. Silently records nothing when
 * the rules say it should not, and tells the caller why, so the person's own
 * screen can say "presence is not being recorded because you are off duty"
 * rather than leaving them to wonder.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const at = new Date();

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, fullName: true, role: true, availabilityStatus: true },
    });
    if (!me) return NextResponse.json({ error: 'Not on file.' }, { status: 404 });

    const onRoster = await isOnRoster(me.id, at);
    const gate = shouldRecord({ status: me.availabilityStatus, onRoster });

    if (!gate.record) {
      // Nothing written. Somebody's own time is their own, and no operational
      // question needs the answer.
      return NextResponse.json({ recorded: false, reason: gate.reason });
    }

    const fence = await prisma.facilityGeofence.findFirst({
      where: { active: true },
      orderBy: { updatedAt: 'desc' },
    }).catch(() => null);

    const verdict = evaluate(
      {
        latitude: typeof body.latitude === 'number' ? body.latitude : null,
        longitude: typeof body.longitude === 'number' ? body.longitude : null,
        accuracyM: typeof body.accuracyM === 'number' ? Math.round(body.accuracyM) : null,
      },
      fence ? { latitude: fence.latitude, longitude: fence.longitude, radiusMetres: fence.radiusMetres } : null,
    );

    const { shift, rosterDate } = shiftAt(at);

    await prisma.staffPresenceCheck.create({
      data: {
        userId: me.id,
        userName: me.fullName,
        userRole: me.role as string,
        rosterDate,
        shift,
        at,
        onSite: verdict.onSite,
        latitude: typeof body.latitude === 'number' ? body.latitude : null,
        longitude: typeof body.longitude === 'number' ? body.longitude : null,
        distanceM: verdict.distanceM,
        accuracyM: typeof body.accuracyM === 'number' ? Math.round(body.accuracyM) : null,
        geofenceId: fence?.id ?? null,
        source: body.source === 'MANUAL' ? 'MANUAL' : 'APP_HEARTBEAT',
        status: me.availabilityStatus ?? null,
        note: typeof body.note === 'string' ? body.note.trim().slice(0, 300) : null,
      },
    });

    return NextResponse.json({
      recorded: true,
      onSite: verdict.onSite,
      reason: verdict.reason,
      // Shown to the person about themselves. Nobody should be measured by
      // something they cannot see.
      perimeterSet: !!fence,
    });
  } catch (error) {
    return apiError('staff/presence POST', error);
  }
}

/**
 * GET /api/staff/presence — the board.
 *
 * Without `userId` it returns everyone on duty today, for a supervisor. With
 * `userId=me` it returns just this person, which anybody may read about
 * themselves.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sp = request.nextUrl.searchParams;
    const wantsSelf = sp.get('userId') === 'me' || sp.get('self') === 'true';

    if (!wantsSelf && !canSupervise(session.user.role)) {
      return NextResponse.json({
        error: 'Presence records are read by supervisors and by the person they are about. '
          + 'Add ?userId=me to see your own.',
        code: 'NO_ACCESS',
      }, { status: 403 });
    }

    const now = new Date();
    const since = new Date(now.getTime() - 12 * 60 * 60_000);

    const checks = await prisma.staffPresenceCheck.findMany({
      where: {
        at: { gte: since },
        ...(wantsSelf ? { userId: session.user.id } : {}),
      },
      orderBy: { at: 'desc' },
      take: 4000,
    }).catch(() => []);

    const byUser = new Map<string, typeof checks>();
    checks.forEach((c) => {
      byUser.set(c.userId, [...(byUser.get(c.userId) ?? []), c]);
    });

    const people = Array.from(byUser.entries()).map(([userId, rows]) => {
      const summary = summarise(rows as unknown as Check[], now);
      return {
        userId,
        name: rows[0].userName,
        role: rows[0].userRole,
        shift: rows[0].shift,
        lastKnown: summary.lastKnown,
        since: summary.since,
        minutesAway: summary.minutesAway,
        stale: summary.stale,
        concern: summary.concern,
        checks: rows.length,
        // Positions are not returned to the board. It answers in or out; a map
        // of where somebody has been is not what the theatre needs and is not
        // what this was built to provide.
        lastAt: rows[0].at,
      };
    });

    const fence = await prisma.facilityGeofence.findFirst({
      where: { active: true },
      select: { id: true, name: true, radiusMetres: true },
    }).catch(() => null);

    return NextResponse.json({
      perimeter: fence,
      // Said out loud rather than left to be discovered: with no perimeter set,
      // every check returns "cannot say" and the board is empty of answers.
      warning: fence ? null : 'No facility perimeter has been set, so no check can say whether anybody is on site.',
      people: people.sort((a, b) => {
        const rank = (p: typeof a) => (p.concern ? 0 : p.lastKnown === 'OFF_SITE' ? 1 : 2);
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      }),
    });
  } catch (error) {
    return apiError('staff/presence GET', error);
  }
}
