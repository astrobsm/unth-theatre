import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { answerProblem } from '@/lib/oxygen/comment';

export const dynamic = 'force-dynamic';

/**
 * Who may answer theatre.
 *
 * The oxygen room itself, and the two posts that cover it out of hours. An
 * answer is a statement that the plant was looked at, so it is not open to
 * everybody the way raising the question is — but narrowing it to the one
 * supervisor account would leave a 4 pm request unanswerable until morning.
 */
const MAY_ANSWER = [
  'OXYGEN_UNIT_SUPERVISOR',
  'WORKS_SUPERVISOR',
  'THEATRE_MANAGER',
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
];

/** PATCH /api/oxygen/comments/[id] — the oxygen room answering. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!MAY_ANSWER.includes(session.user.role)) {
    return NextResponse.json(
      { error: 'Only the oxygen room can answer a request about the oxygen supply.' },
      { status: 403 },
    );
  }

  try {
    const data = await request.json();
    const problem = answerProblem({ outcome: data.outcome, body: data.body });
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    const existing = await prisma.oxygenStatusComment.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    const answerer = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { fullName: true },
    });

    const updated = await prisma.oxygenStatusComment.update({
      where: { id: params.id },
      data: {
        status: 'ANSWERED',
        answeredAt: new Date(),
        answeredById: session.user.id,
        answeredByName: answerer?.fullName || session.user.name || 'Oxygen room',
        answerOutcome: data.outcome,
        answerBody: (data.body ?? '').trim() || null,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error answering oxygen comment:', error);
    return NextResponse.json({ error: 'Failed to answer comment' }, { status: 500 });
  }
}
