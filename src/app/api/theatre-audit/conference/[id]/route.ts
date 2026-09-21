import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { analyse, buildResolution } from '@/lib/audit/conference';
import { canRecord, guardWrite, loadIssues } from '@/lib/audit/conferenceGuard';

export const dynamic = 'force-dynamic';

/**
 * One conference: the whole working document.
 *
 * Returned in a single response — the sitting, who was in the room, every
 * point with its decision beside it, and the analysis. The analysis is
 * computed on read rather than stored, so it can never drift from the points
 * it describes. The one exception is an ADOPTED conference, which returns the
 * resolution exactly as it was adopted: regenerating that from data edited
 * since would silently rewrite what was agreed in the room.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const conference = await prisma.theatreAuditConference.findUnique({
      where: { id: params.id },
      include: {
        attendees: { orderBy: { createdAt: 'asc' } },
        issues: {
          orderBy: { ordinal: 'asc' },
          include: {
            decision: true,
            discussion: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });

    if (!conference) {
      return NextResponse.json({ error: 'That conference is not on file.' }, { status: 404 });
    }

    const issues = await loadIssues(conference.id);
    const analysis = analyse(issues);

    const resolution = conference.status === 'ADOPTED' && conference.adoptedResolution
      ? conference.adoptedResolution
      : buildResolution({
          title: conference.title,
          sittingDate: conference.sittingDate,
          venue: conference.venue,
          chairName: conference.chairName,
          issues,
        });

    return NextResponse.json({
      conference,
      analysis,
      resolution,
      /** Whether THIS person can write to it, so the screen knows what to offer. */
      editable: conference.status !== 'ADOPTED' && canRecord(session.user.role),
    });
  } catch (error) {
    return apiError('theatre-audit/conference/[id] GET', error);
  }
}

/** PATCH — the sitting's own details, and its status short of adoption. */
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
    const data: Record<string, unknown> = {};

    const text = (k: string, max: number) => {
      if (typeof body[k] === 'string') data[k] = body[k].trim().slice(0, max) || null;
    };
    text('title', 200);
    text('venue', 200);
    text('purpose', 2000);
    text('chairName', 120);
    text('secretaryName', 120);

    if (body.sittingDate) {
      const d = new Date(body.sittingDate);
      if (!Number.isNaN(d.getTime())) data.sittingDate = d;
    }

    // Adoption is not reachable from here. It has its own route because it
    // seals the document, and sealing must never be a side effect of an edit.
    if (typeof body.status === 'string' && ['DRAFT', 'IN_SESSION', 'ANALYSED'].includes(body.status)) {
      data.status = body.status;
    }

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
    }

    const conference = await prisma.theatreAuditConference.update({
      where: { id: params.id },
      data,
      select: { id: true, title: true, status: true, sittingDate: true, venue: true },
    });

    return NextResponse.json({ conference });
  } catch (error) {
    return apiError('theatre-audit/conference/[id] PATCH', error);
  }
}

/** DELETE — only before anybody has decided anything. */
export async function DELETE(
  _request: NextRequest,
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
    // A sitting where decisions were recorded is a record of something that
    // happened, whether or not it was ever adopted. Deleting it would remove
    // evidence that a committee met and resolved something.
    const decided = await prisma.conferenceDecision.count({
      where: { issue: { conferenceId: params.id } },
    });
    if (decided > 0) {
      return NextResponse.json({
        error: `This conference already has ${decided} recorded ${decided === 1 ? 'decision' : 'decisions'}, so it is a record of a sitting that took place and cannot be deleted.`,
        code: 'CONFERENCE_HAS_DECISIONS',
      }, { status: 409 });
    }

    await prisma.theatreAuditConference.delete({ where: { id: params.id } });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CONFERENCE_DELETED',
        tableName: 'theatre_audit_conferences',
        recordId: params.id,
        changes: JSON.stringify({ title: guard.conference?.title }),
      },
    }).catch(() => { /* the deletion stands even if the log does not */ });

    return NextResponse.json({ deleted: params.id });
  } catch (error) {
    return apiError('theatre-audit/conference/[id] DELETE', error);
  }
}
