import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { AGENDA_TEMPLATE } from '@/lib/audit/conference';
// The same list that governs recording. Convening and minuting are the same
// privilege: a conference minute commits named people to named actions, and
// anyone who can create one can put words in the chair's mouth.
import { canRecord } from '@/lib/audit/conferenceGuard';

export const dynamic = 'force-dynamic';

/**
 * Theatre audit conferences: the list, and calling a new one.
 *
 * A sitting at which structural adjustments are taken point by point, each
 * point carrying its own decision. Distinct from the theatre-audit review
 * board, which lists what went wrong; this records what is being changed.
 */

/** GET /api/theatre-audit/conference — every sitting, newest first. */
export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const conferences = await prisma.theatreAuditConference.findMany({
      orderBy: { sittingDate: 'desc' },
      take: 60,
      select: {
        id: true, title: true, sittingDate: true, venue: true, status: true,
        chairName: true, adoptedAt: true, adoptedByName: true,
        _count: { select: { issues: true, attendees: true } },
      },
    });

    // How many points are still undecided, so the list can say which sittings
    // are unfinished without opening each one.
    const ids = conferences.map((c) => c.id);
    const undecided = ids.length
      ? await prisma.conferenceIssue.findMany({
          where: { conferenceId: { in: ids }, decision: { is: null } },
          select: { conferenceId: true },
        }).catch(() => [])
      : [];

    return NextResponse.json({
      conferences: conferences.map((c) => ({
        ...c,
        points: c._count.issues,
        attendees: c._count.attendees,
        undecided: undecided.filter((u) => u.conferenceId === c.id).length,
      })),
      // Offered to a caller starting a new sitting: the structural adjustments
      // actually put to the department, each saying whether it is already in
      // use. None of them carries a decision.
      template: AGENDA_TEMPLATE,
    });
  } catch (error) {
    return apiError('theatre-audit/conference GET', error);
  }
}

/** POST /api/theatre-audit/conference — call a sitting. */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canRecord(session.user.role)) {
    return NextResponse.json({
      error: 'A theatre audit conference is convened by theatre management or the executive.',
      code: 'NO_ACCESS',
    }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    const chairName = typeof body.chairName === 'string' ? body.chairName.trim().slice(0, 120) : '';
    const venue = typeof body.venue === 'string' ? body.venue.trim().slice(0, 200) : '';
    const purpose = typeof body.purpose === 'string' ? body.purpose.trim().slice(0, 2000) : '';
    const secretaryName = typeof body.secretaryName === 'string'
      ? body.secretaryName.trim().slice(0, 120) : '';
    const useTemplate = body.useTemplate === true;

    const sittingDate = body.sittingDate ? new Date(body.sittingDate) : new Date();
    if (!title || !chairName || Number.isNaN(sittingDate.getTime())) {
      return NextResponse.json({
        error: 'A conference needs a title, a date and the name of the chair.',
      }, { status: 400 });
    }

    const conference = await prisma.theatreAuditConference.create({
      data: {
        title,
        sittingDate,
        venue: venue || null,
        purpose: purpose || null,
        chairName,
        chairId: typeof body.chairId === 'string' ? body.chairId : null,
        secretaryName: secretaryName || session.user.name || null,
        // Whoever creates it is the recorder until somebody says otherwise.
        secretaryId: session.user.id,
        createdById: session.user.id,
        status: 'DRAFT',
        ...(useTemplate
          ? {
              issues: {
                create: AGENDA_TEMPLATE.map((t, i) => ({
                  ordinal: i + 1,
                  title: t.title,
                  area: t.area,
                  background: t.background,
                  // Carried through in full. These are the proposals actually
                  // put to the department, and a committee handed the heading
                  // without the proposal has to reconstruct it from memory.
                  currentPractice: t.currentPractice,
                  proposal: t.proposal,
                  raisedById: session.user.id,
                  raisedByName: session.user.name ?? null,
                })),
              },
            }
          : {}),
      },
      select: { id: true, title: true, status: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CONFERENCE_CONVENED',
        tableName: 'theatre_audit_conferences',
        recordId: conference.id,
        changes: JSON.stringify({ title, chairName, sittingDate, fromTemplate: useTemplate }),
      },
    }).catch(() => { /* the conference stands even if the log does not */ });

    return NextResponse.json({ conference });
  } catch (error) {
    return apiError('theatre-audit/conference POST', error);
  }
}
