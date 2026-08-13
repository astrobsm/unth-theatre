import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/theatres/assign-team
 *   { role, userIds[], surgeryIds[]? , unit?, date? }
 *
 * GET  /api/theatres/assign-team?surgeryId=…   who is on a case
 *
 * Assigns ANY NUMBER of people to a role, on one case or across a unit's whole
 * list for a day, and records who did it.
 *
 * Two rules that shape this:
 *
 * 1. Each service assigns its own people. Anaesthesia is assigned by the
 *    anaesthetists, technicians by the technicians, nurses by the nursing staff.
 *    A theatre manager can do any of it; a surgeon can do none of it. Being put
 *    on a list by someone outside your own service is how a rota becomes a
 *    surprise.
 *
 * 2. Removal is recorded, not deleted. "Who took me off this case" is asked as
 *    often as who put them on it.
 */

type TeamRole =
  | 'SCRUB_NURSE' | 'CIRCULATING_NURSE'
  | 'CONSULTANT_ANAESTHETIST' | 'ANAESTHETIST' | 'ANAESTHETIC_TECHNICIAN';

/** Anyone who runs the floor may assign any role. */
const FLOOR_MANAGERS = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

/** Otherwise, who may assign which role — each service its own. */
const ASSIGNERS: Record<TeamRole, string[]> = {
  SCRUB_NURSE: ['NURSE_MANAGER', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'NURSE'],
  CIRCULATING_NURSE: ['NURSE_MANAGER', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'NURSE'],
  // Anaesthesia is assigned by anaesthetists. A consultant can place a
  // consultant; a resident can place either, because at 2am the resident is who
  // is there.
  CONSULTANT_ANAESTHETIST: ['CONSULTANT_ANAESTHETIST', 'ANAESTHETIST'],
  ANAESTHETIST: ['CONSULTANT_ANAESTHETIST', 'ANAESTHETIST'],
  // Technicians assign their own category, as asked.
  ANAESTHETIC_TECHNICIAN: ['ANAESTHETIC_TECHNICIAN', 'CONSULTANT_ANAESTHETIST', 'ANAESTHETIST'],
};

const ALL_ROLES = Object.keys(ASSIGNERS) as TeamRole[];

function mayAssign(role: TeamRole, userRole: string): boolean {
  return FLOOR_MANAGERS.includes(userRole) || ASSIGNERS[role].includes(userRole);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const surgeryId = req.nextUrl.searchParams.get('surgeryId');
  if (!surgeryId) return NextResponse.json({ error: 'surgeryId is required.' }, { status: 400 });

  const rows = await prisma.theatreTeamAssignment.findMany({
    where: { surgeryId, removedAt: null },
    orderBy: [{ role: 'asc' }, { assignedAt: 'asc' }],
    select: {
      id: true, role: true, userId: true, userName: true,
      assignedByName: true, assignedByRole: true, assignedAt: true,
    },
  });

  // Grouped by role, because that is how a readiness board reads it.
  const team: Record<string, typeof rows> = {};
  for (const r of rows) (team[r.role] ??= []).push(r);

  return NextResponse.json({ surgeryId, team });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; name?: string; role?: string } | undefined;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const actorRole = user.role ?? '';

  let body: {
    role?: string;
    userIds?: string[];
    surgeryIds?: string[];
    unit?: string;
    date?: string;
    /** Replace the role's current members rather than adding to them. */
    replace?: boolean;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  const role = String(body.role ?? '').toUpperCase() as TeamRole;
  if (!ALL_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of ${ALL_ROLES.join(', ')}` }, { status: 400 });
  }
  if (!mayAssign(role, actorRole)) {
    return NextResponse.json({
      error: `Your role cannot assign ${role.replace(/_/g, ' ').toLowerCase()}s. That is done by the service concerned.`,
    }, { status: 403 });
  }

  const userIds = Array.from(new Set((body.userIds ?? []).filter(Boolean)));

  // Which cases. Either explicit, or a unit's whole list for a day — the same
  // shape as theatre assignment, because the two are done together.
  let surgeryIds = Array.from(new Set((body.surgeryIds ?? []).filter(Boolean)));
  if (surgeryIds.length === 0 && body.unit) {
    const target = body.date ? new Date(body.date) : new Date();
    if (Number.isNaN(target.getTime())) {
      return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
    }
    const startOfDay = new Date(target); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(target); endOfDay.setHours(23, 59, 59, 999);
    const cases = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: startOfDay, lte: endOfDay },
        status: { in: ['SCHEDULED', 'READY_FOR_THEATRE', 'IN_HOLDING_AREA'] },
        OR: [{ unit: body.unit }, { subspecialty: body.unit }],
      },
      select: { id: true },
    });
    surgeryIds = cases.map((c) => c.id);
  }

  if (surgeryIds.length === 0) {
    // Not an error: a unit with nothing booked is ordinary, and an error here
    // would look like a broken button.
    return NextResponse.json({ ok: true, assigned: 0, cases: 0, message: 'No cases to assign to.' });
  }

  // Names snapshotted at assignment: a rota printed today must still read
  // correctly if somebody is renamed or leaves.
  const people = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true },
      })
    : [];
  if (people.length !== userIds.length) {
    return NextResponse.json({ error: 'One or more of those people were not found.' }, { status: 404 });
  }

  let added = 0;
  let removed = 0;

  await prisma.$transaction(async (tx) => {
    for (const surgeryId of surgeryIds) {
      if (body.replace) {
        // Withdrawn, not deleted — "who took me off this case" is asked as often
        // as who put them on it.
        const gone = await tx.theatreTeamAssignment.updateMany({
          where: {
            surgeryId, role, removedAt: null,
            ...(userIds.length ? { userId: { notIn: userIds } } : {}),
          },
          data: {
            removedAt: new Date(),
            removedById: user.id ?? null,
            removedByName: user.name ?? null,
          },
        });
        removed += gone.count;
      }

      for (const p of people) {
        // Upsert on the natural key, and clear any earlier withdrawal so
        // re-adding somebody works rather than colliding with a dead row.
        await tx.theatreTeamAssignment.upsert({
          where: { surgeryId_role_userId: { surgeryId, role, userId: p.id } },
          create: {
            surgeryId, role, userId: p.id, userName: p.fullName,
            assignedById: user.id ?? null,
            assignedByName: user.name ?? null,
            assignedByRole: actorRole || null,
          },
          update: {
            userName: p.fullName,
            removedAt: null, removedById: null, removedByName: null,
            assignedById: user.id ?? null,
            assignedByName: user.name ?? null,
            assignedByRole: actorRole || null,
            assignedAt: new Date(),
          },
        });
        added++;
      }
    }

    if (user.id) {
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'THEATRE_TEAM_ASSIGNED',
          tableName: 'theatre_team_assignments',
          changes: JSON.stringify({
            role, unit: body.unit ?? null, date: body.date ?? null,
            caseCount: surgeryIds.length,
            people: people.map((p) => p.fullName),
            replaced: Boolean(body.replace),
            removed,
          }),
        },
      });
    }
  });

  const label = role.replace(/_/g, ' ').toLowerCase();
  return NextResponse.json({
    ok: true,
    assigned: added,
    cases: surgeryIds.length,
    removed,
    message: people.length
      ? `${people.length} ${label}${people.length === 1 ? '' : 's'} assigned across ${surgeryIds.length} case${surgeryIds.length === 1 ? '' : 's'}.`
      : `${removed} ${label}${removed === 1 ? '' : 's'} removed.`,
  });
}
