import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { guardWrite } from '@/lib/audit/conferenceGuard';
import { AREA_LABEL, type ConferenceArea } from '@/lib/audit/conference';

export const dynamic = 'force-dynamic';

/** Agenda points: adding one, editing one, removing one before it is decided. */

const AREAS = Object.keys(AREA_LABEL) as ConferenceArea[];
const isArea = (v: unknown): v is ConferenceArea =>
  typeof v === 'string' && (AREAS as string[]).includes(v);

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

/** POST — put a point on the agenda. */
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
    const title = str(body.title, 300);
    if (!title) {
      return NextResponse.json({ error: 'A point needs a title — what is being raised.' }, { status: 400 });
    }

    // Appended to the end. The agenda order is the order the room will take
    // them, and a new point arriving in the middle of a sitting goes last.
    const last = await prisma.conferenceIssue.findFirst({
      where: { conferenceId: params.id },
      orderBy: { ordinal: 'desc' },
      select: { ordinal: true },
    });

    const issue = await prisma.conferenceIssue.create({
      data: {
        conferenceId: params.id,
        ordinal: (last?.ordinal ?? 0) + 1,
        title,
        area: isArea(body.area) ? body.area : 'OTHER',
        background: str(body.background, 4000) || null,
        currentPractice: str(body.currentPractice, 4000) || null,
        proposal: str(body.proposal, 4000) || null,
        raisedById: session.user.id,
        raisedByName: str(body.raisedByName, 120) || session.user.name || null,
      },
    });

    return NextResponse.json({ issue });
  } catch (error) {
    return apiError('conference/[id]/issues POST', error);
  }
}

/** PATCH — edit a point, or move it up and down the agenda. */
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
    const issueId = str(body.issueId, 64);
    if (!issueId) {
      return NextResponse.json({ error: 'Which point?' }, { status: 400 });
    }

    const existing = await prisma.conferenceIssue.findFirst({
      where: { id: issueId, conferenceId: params.id },
      select: { id: true, ordinal: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'That point is not on this agenda.' }, { status: 404 });
    }

    // ── Reordering ────────────────────────────────────────────────────────
    // Swapped with its neighbour rather than renumbered wholesale, and through
    // a parking ordinal because (conferenceId, ordinal) is unique — two points
    // may not briefly share a number even inside a transaction.
    const move = body.move === 'up' ? -1 : body.move === 'down' ? 1 : 0;
    if (move !== 0) {
      const neighbour = await prisma.conferenceIssue.findFirst({
        where: { conferenceId: params.id, ordinal: existing.ordinal + move },
        select: { id: true, ordinal: true },
      });
      if (!neighbour) {
        return NextResponse.json({ issue: existing, moved: false });
      }
      await prisma.$transaction([
        prisma.conferenceIssue.update({ where: { id: existing.id }, data: { ordinal: -1 } }),
        prisma.conferenceIssue.update({ where: { id: neighbour.id }, data: { ordinal: existing.ordinal } }),
        prisma.conferenceIssue.update({ where: { id: existing.id }, data: { ordinal: neighbour.ordinal } }),
      ]);
      return NextResponse.json({ moved: true });
    }

    // ── Editing ───────────────────────────────────────────────────────────
    const data: Record<string, unknown> = {};
    if (typeof body.title === 'string' && str(body.title, 300)) data.title = str(body.title, 300);
    if (isArea(body.area)) data.area = body.area;
    (['background', 'currentPractice', 'proposal'] as const).forEach((k) => {
      if (typeof body[k] === 'string') data[k] = str(body[k], 4000) || null;
    });

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
    }

    const issue = await prisma.conferenceIssue.update({ where: { id: issueId }, data });
    return NextResponse.json({ issue });
  } catch (error) {
    return apiError('conference/[id]/issues PATCH', error);
  }
}

/** DELETE ?issueId= — take a point off the agenda, if nothing was decided. */
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
    const issueId = request.nextUrl.searchParams.get('issueId') ?? '';
    const issue = await prisma.conferenceIssue.findFirst({
      where: { id: issueId, conferenceId: params.id },
      select: { id: true, ordinal: true, decision: { select: { id: true } } },
    });
    if (!issue) {
      return NextResponse.json({ error: 'That point is not on this agenda.' }, { status: 404 });
    }

    // A decided point is a record of something the committee resolved. Taking
    // it off the agenda would delete that resolution; the way to undo a
    // decision is to record a different one.
    if (issue.decision) {
      return NextResponse.json({
        error: 'A decision has been recorded against this point, so it cannot be removed. Change the decision instead, or record it as not adopted.',
        code: 'ISSUE_DECIDED',
      }, { status: 409 });
    }

    // Anything below it closes up, so the agenda stays 1..n with no holes —
    // the numbers are how the resolution refers to each point.
    await prisma.$transaction([
      prisma.conferenceIssue.delete({ where: { id: issue.id } }),
      prisma.conferenceIssue.updateMany({
        where: { conferenceId: params.id, ordinal: { gt: issue.ordinal } },
        data: { ordinal: { decrement: 1 } },
      }),
    ]);

    return NextResponse.json({ deleted: issue.id });
  } catch (error) {
    return apiError('conference/[id]/issues DELETE', error);
  }
}
