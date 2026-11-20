import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { commentProblem } from '@/lib/oxygen/comment';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/oxygen/comments?status=OPEN
 * POST /api/oxygen/comments
 *
 * The reply channel from theatre to the oxygen room. Any signed-in account may
 * write one: the person standing at a dead outlet is the one who knows, and
 * restricting that to a role list would have silenced whoever happened to be
 * in the room.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const reportId = searchParams.get('reportId');

  try {
    const comments = await prisma.oxygenStatusComment.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(reportId ? { reportId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json(comments);
  } catch (error) {
    console.error('Error fetching oxygen comments:', error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await request.json();

    const problem = commentProblem({
      kind: data.kind,
      body: data.body,
      theatreName: data.theatreName,
    });
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    // The author's name is written into the row rather than left to a join.
    // A comment that cannot be attributed on the node where the user record
    // has not arrived is a comment the oxygen room cannot act on.
    const author = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { fullName: true, role: true },
    });

    const comment = await prisma.oxygenStatusComment.create({
      data: {
        reportId: data.reportId || null,
        reportedAt: data.reportedAt ? new Date(data.reportedAt) : null,
        theatreName: data.theatreName || null,
        setupLogId: data.setupLogId || null,
        kind: data.kind,
        body: (data.body ?? '').trim() || null,
        authorId: session.user.id,
        authorName: author?.fullName || session.user.name || 'Unknown',
        authorRole: author?.role || session.user.role || null,
        status: 'OPEN',
      },
    });

    return NextResponse.json(comment);
  } catch (error) {
    console.error('Error creating oxygen comment:', error);
    return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 });
  }
}
