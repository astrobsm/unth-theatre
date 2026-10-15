// ============================================================
// Summonses: reading your own, and the committee reading everybody's
// ------------------------------------------------------------
// Two audiences with different rights, deliberately in one route so they
// cannot drift apart:
//
//   ANYONE sees their own. A person summoned to answer for something is
//   entitled to read what they are accused of, and a summons they cannot
//   read is one they cannot prepare for.
//
//   THE COMMITTEE sees all of them, and is the only party that may excuse
//   somebody or mark them absent. Letting people excuse themselves would
//   make the attendance record worthless, which is most of what the sitting
//   produces.
//
// Acknowledging is the exception: that is the summoned person saying they
// will attend, and it is theirs to say.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canRecord } from '@/lib/audit/conferenceGuard';

export const dynamic = 'force-dynamic';

const SELECT = {
  id: true, cause: true, ground: true, reason: true, status: true,
  personName: true, roleOnCase: true, userId: true,
  raisedAt: true, notifiedAt: true, acknowledgedAt: true,
  excusedAt: true, excusedReason: true,
  surgeryId: true, cancellationId: true, conferenceId: true,
  conference: {
    select: {
      id: true, title: true, sittingDate: true, mode: true,
      venue: true, meetingLink: true, status: true,
    },
  },
  surgery: {
    select: {
      procedureName: true, scheduledDate: true, unit: true,
      patient: { select: { name: true, folderNumber: true } },
    },
  },
} as const;

/**
 * GET /api/theatre-audit/summonses
 *
 * ?scope=mine (default) or ?scope=all for the committee.
 * ?conferenceId= to narrow to one sitting.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const wantsAll = searchParams.get('scope') === 'all';
  const committee = canRecord(session.user.role);
  // Asking for everybody's without the standing to see them gets your own
  // back rather than a refusal — the page works either way, which is what a
  // shared page needs.
  const scope = wantsAll && committee ? 'all' : 'mine';
  const conferenceId = searchParams.get('conferenceId');

  try {
    const summonses = await prisma.auditSummons.findMany({
      where: {
        ...(scope === 'mine' ? { userId: session.user.id } : {}),
        ...(conferenceId ? { conferenceId } : {}),
        status: { not: 'WITHDRAWN' },
      },
      orderBy: [{ raisedAt: 'desc' }],
      take: 400,
      select: SELECT,
    });

    return NextResponse.json({ scope, committee, summonses });
  } catch (error) {
    console.error('summonses list failed:', error);
    return NextResponse.json({ error: 'Could not read the summonses' }, { status: 500 });
  }
}

/**
 * PATCH /api/theatre-audit/summonses
 *
 * Body: { id, action: 'acknowledge' | 'excuse' | 'attended' | 'no_show' | 'withdraw',
 *         reason? }
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  const action = String(body.action ?? '');
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!id) return NextResponse.json({ error: 'Which summons?' }, { status: 400 });

  const summons = await prisma.auditSummons.findUnique({
    where: { id }, select: { id: true, userId: true, status: true, personName: true },
  });
  if (!summons) return NextResponse.json({ error: 'No such summons.' }, { status: 404 });

  const committee = canRecord(session.user.role);
  const isMine = summons.userId === session.user.id;
  const now = new Date();

  let data: Record<string, unknown>;
  switch (action) {
    case 'acknowledge':
      // Theirs to say, and only theirs.
      if (!isMine) {
        return NextResponse.json(
          { error: 'Only the person summoned can confirm they will attend.' },
          { status: 403 },
        );
      }
      data = { status: 'ACKNOWLEDGED', acknowledgedAt: now };
      break;

    case 'excuse':
      if (!committee) {
        return NextResponse.json(
          { error: 'Excusing somebody from the audit is the chairman’s decision, not your own.' },
          { status: 403 },
        );
      }
      if (reason.length < 5) {
        return NextResponse.json(
          { error: 'Give the reason they are excused. An attendance record with unexplained '
            + 'absences is not one the committee can use.' },
          { status: 400 },
        );
      }
      data = { status: 'EXCUSED', excusedAt: now, excusedReason: reason };
      break;

    case 'attended':
    case 'no_show':
      if (!committee) {
        return NextResponse.json(
          { error: 'Attendance is recorded by the committee.' },
          { status: 403 },
        );
      }
      data = { status: action === 'attended' ? 'ATTENDED' : 'NO_SHOW' };
      break;

    case 'withdraw':
      if (!committee) {
        return NextResponse.json({ error: 'Only the committee can withdraw a summons.' }, { status: 403 });
      }
      if (reason.length < 5) {
        return NextResponse.json(
          { error: 'Say why it is withdrawn, so the record shows it was answered rather '
            + 'than quietly dropped.' },
          { status: 400 },
        );
      }
      data = { status: 'WITHDRAWN', excusedAt: now, excusedReason: reason };
      break;

    default:
      return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
  }

  try {
    const updated = await prisma.auditSummons.update({
      where: { id }, data, select: SELECT,
    });
    return NextResponse.json({ ok: true, summons: updated });
  } catch (error) {
    console.error('summons update failed:', error);
    return NextResponse.json({ error: 'The summons could not be updated' }, { status: 500 });
  }
}
