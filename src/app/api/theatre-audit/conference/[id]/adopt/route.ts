import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { guardWrite, loadIssues } from '@/lib/audit/conferenceGuard';
import { analyse, buildResolution } from '@/lib/audit/conference';

export const dynamic = 'force-dynamic';

/**
 * Adopting the resolution.
 *
 * The moment a working document becomes a minute. Three things happen and all
 * three matter:
 *
 * The resolution is STORED VERBATIM. It is computed from the points, and the
 * points could be edited afterwards — so a stored copy is the only way the
 * document somebody printed on the day still matches the one in the system a
 * year later.
 *
 * The conference is SEALED. Points and decisions stop being editable
 * everywhere, enforced in guardWrite rather than here, so no other entrance
 * can get round it.
 *
 * And it is REFUSED while anything blocking remains. Adopting a resolution
 * whose points contradict each other — one adopted on the strength of another
 * that was turned down — commits the department to something impossible, and
 * discovers it months later through whoever tried to act on it.
 */
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
    const conference = await prisma.theatreAuditConference.findUnique({
      where: { id: params.id },
      select: {
        id: true, title: true, sittingDate: true, venue: true, chairName: true,
      },
    });
    if (!conference) {
      return NextResponse.json({ error: 'That conference is not on file.' }, { status: 404 });
    }

    const issues = await loadIssues(params.id);
    const analysis = analyse(issues);

    if (!analysis.readyToAdopt) {
      return NextResponse.json({
        error: analysis.counts.points === 0
          ? 'There is nothing on the agenda, so there is nothing to adopt.'
          : 'This resolution cannot be adopted while the analysis still shows unresolved points.',
        code: 'NOT_READY_TO_ADOPT',
        // Named, so the chair can turn straight to them rather than hunting.
        problems: analysis.blocking.map((f) => ({
          field: `point-${f.ordinals[0] ?? ''}`,
          message: f.message,
        })),
        analysis,
      }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const adoptedByName = typeof body.adoptedByName === 'string' && body.adoptedByName.trim()
      ? body.adoptedByName.trim().slice(0, 120)
      // Falls back to the chair, because it is the chair who adopts a
      // resolution — but whoever presses the button is recorded separately in
      // the audit log, and the two are not always the same person.
      : (session.user.name || conference.chairName);

    const resolution = buildResolution({
      title: conference.title,
      sittingDate: conference.sittingDate,
      venue: conference.venue,
      chairName: conference.chairName,
      issues,
    });

    const adopted = await prisma.theatreAuditConference.update({
      where: { id: params.id },
      data: {
        status: 'ADOPTED',
        adoptedAt: new Date(),
        adoptedById: session.user.id,
        adoptedByName,
        adoptedResolution: resolution,
      },
      select: { id: true, status: true, adoptedAt: true, adoptedByName: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CONFERENCE_RESOLUTION_ADOPTED',
        tableName: 'theatre_audit_conferences',
        recordId: params.id,
        changes: JSON.stringify({
          title: conference.title,
          adoptedByName,
          // Who actually pressed it, which is not always who it is adopted in
          // the name of.
          recordedBy: session.user.name ?? session.user.id,
          points: analysis.counts.points,
          adopted: analysis.counts.adopted,
          advisoryFindings: analysis.findings.filter((f) => f.level === 'advisory').length,
        }),
      },
    }).catch(() => { /* adoption stands even if the log does not */ });

    return NextResponse.json({ conference: adopted, resolution, analysis });
  } catch (error) {
    return apiError('conference/[id]/adopt POST', error);
  }
}
