import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Roles permitted to mark a surgery as completed.
 *
 * The scrub nurse and the recovery room nurse are here for the same reason:
 * the case is finished when the patient leaves the theatre, and by then the
 * surgeon is frequently not the person at a screen. A patient cannot be
 * admitted to PACU until the case reads COMPLETED, so leaving this to the
 * surgeon alone means recovery is blocked on somebody who has already moved
 * on — and the recovery nurse, who is with the patient, could not record what
 * had plainly happened.
 *
 * Who actually pressed it is recorded in the audit log below, so widening the
 * list costs no accountability.
 */
const ALLOWED = [
  'SURGEON', 'CONSULTANT_SURGEON',
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE',
  'ADMIN', 'THEATRE_MANAGER', 'SYSTEM_ADMINISTRATOR',
];

// POST - Mark a surgery as COMPLETED so PACU can admit the patient and the
// surgeon can write the post-operative note.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ALLOWED.includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only the surgical team, the scrub or recovery room nurse, the theatre manager or an administrator can mark a surgery as completed' },
        { status: 403 }
      );
    }

    const surgery = await prisma.surgery.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, actualStartTime: true },
    });

    if (!surgery) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    if (surgery.status === 'COMPLETED') {
      return NextResponse.json({ error: 'Surgery is already marked completed' }, { status: 400 });
    }
    if (surgery.status === 'CANCELLED') {
      return NextResponse.json({ error: 'A cancelled surgery cannot be marked completed' }, { status: 400 });
    }

    const now = new Date();

    const updated = await prisma.surgery.update({
      where: { id: params.id },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        actualEndTime: now,
        surgeryEndTime: now,
        // If the case start was never captured, fall back to now so timing stays consistent.
        actualStartTime: surgery.actualStartTime ?? now,
      },
      include: {
        patient: { select: { id: true, name: true, folderNumber: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'surgeries',
        recordId: params.id,
        // The role is recorded alongside the user because "who closed this
        // case" is a different question from "which account was used", and it
        // is the one asked when a completion time is later disputed.
        changes: JSON.stringify({
          status: { from: surgery.status, to: 'COMPLETED' },
          completedAt: now,
          completedBy: { userId: session.user.id, role: session.user.role },
        }),
      },
    });

    return NextResponse.json({
      surgery: updated,
      message: 'Surgery marked as completed. The patient can now be admitted to PACU and a post-operative note recorded.',
    });
  } catch (error) {
    console.error('Error completing surgery:', error);
    return NextResponse.json({ error: 'Failed to mark surgery as completed' }, { status: 500 });
  }
}
