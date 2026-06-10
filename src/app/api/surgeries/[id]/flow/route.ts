import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type FlowAction =
  | 'RECEIVE_IN_THEATRE'
  | 'MARK_ANAESTHESIZED'
  | 'MARK_KNIFE_ON_SKIN'
  | 'MARK_END_OF_SURGERY'
  | 'TRANSFER_OUT_OF_THEATRE'
  | 'RETURN_TO_WARD_CANCELLED';

const ALLOWED_ROLES = [
  'ADMIN',
  'THEATRE_MANAGER',
  'SURGEON',
  'ANAESTHETIST',
  'CONSULTANT_ANAESTHETIST',
  'SCRUB_NURSE',
  'RECOVERY_ROOM_NURSE',
];

async function createMovementOnce(surgeryId: string, phase: any, recordedBy: string, notes: string) {
  const latest = await prisma.patientMovement.findFirst({
    where: { surgeryId },
    orderBy: { timestamp: 'desc' },
    select: { phase: true, notes: true },
  });

  if (latest?.phase === phase && (latest?.notes || '') === notes) {
    return;
  }

  await prisma.patientMovement.create({
    data: {
      surgeryId,
      phase,
      recordedBy,
      notes,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const action = String(body.action || '') as FlowAction;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    const surgery = await prisma.surgery.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        procedureName: true,
        patient: { select: { name: true } },
      },
    });

    if (!surgery) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    const now = new Date();

    if (action === 'RETURN_TO_WARD_CANCELLED') {
      if (reason.length < 5) {
        return NextResponse.json(
          { error: 'Cancellation reason (minimum 5 characters) is required.' },
          { status: 400 }
        );
      }

      await prisma.surgery.update({
        where: { id: surgery.id },
        data: {
          status: 'CANCELLED',
          remarks: reason,
        },
      });

      await createMovementOnce(
        surgery.id,
        'RETURNED_TO_WARD',
        session.user.id,
        `Returned to ward - case cancelled. Reason: ${reason}`
      );

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'SURGERY_CANCELLED_FROM_FLOW',
          tableName: 'surgeries',
          recordId: surgery.id,
          changes: JSON.stringify({ reason }),
        },
      });

      return NextResponse.json({ success: true, status: 'CANCELLED' });
    }

    if (surgery.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Cancelled surgery cannot be transitioned.' }, { status: 400 });
    }

    if (action === 'RECEIVE_IN_THEATRE') {
      await prisma.surgery.update({
        where: { id: surgery.id },
        data: {
          status: 'IN_PROGRESS',
          actualStartTime: now,
        },
      });

      await prisma.surgicalTiming.upsert({
        where: { surgeryId: surgery.id },
        create: {
          surgeryId: surgery.id,
          recordedBy: session.user.id,
          patientEnteredRoomTime: now,
        },
        update: {
          patientEnteredRoomTime: now,
        },
      });

      await prisma.holdingAreaAssessment.updateMany({
        where: { surgeryId: surgery.id },
        data: {
          transferredToTheatre: true,
          transferTime: now,
          status: 'TRANSFERRED_TO_THEATRE',
        },
      });

      await createMovementOnce(surgery.id, 'INSIDE_THEATRE', session.user.id, 'Received in operating theatre');
      return NextResponse.json({ success: true, status: 'IN_PROGRESS' });
    }

    if (action === 'MARK_ANAESTHESIZED') {
      await prisma.surgicalTiming.upsert({
        where: { surgeryId: surgery.id },
        create: {
          surgeryId: surgery.id,
          recordedBy: session.user.id,
          anesthesiaStartTime: now,
          anesthesiaReadyTime: now,
        },
        update: {
          anesthesiaStartTime: now,
          anesthesiaReadyTime: now,
        },
      });

      await createMovementOnce(surgery.id, 'INSIDE_THEATRE', session.user.id, 'Anaesthesized in operating theatre');
      return NextResponse.json({ success: true });
    }

    if (action === 'MARK_KNIFE_ON_SKIN') {
      await prisma.surgery.update({
        where: { id: surgery.id },
        data: {
          status: 'IN_PROGRESS',
          knifeOnSkinTime: now,
        },
      });

      await prisma.surgicalTiming.upsert({
        where: { surgeryId: surgery.id },
        create: {
          surgeryId: surgery.id,
          recordedBy: session.user.id,
          incisionTime: now,
          procedureStartTime: now,
        },
        update: {
          incisionTime: now,
          procedureStartTime: now,
        },
      });

      await createMovementOnce(surgery.id, 'SURGERY_STARTED', session.user.id, 'Knife on skin commenced');
      return NextResponse.json({ success: true, status: 'IN_PROGRESS' });
    }

    if (action === 'MARK_END_OF_SURGERY') {
      await prisma.surgery.update({
        where: { id: surgery.id },
        data: {
          status: 'COMPLETED',
          surgeryEndTime: now,
          actualEndTime: now,
          completedAt: now,
        },
      });

      await prisma.surgicalTiming.upsert({
        where: { surgeryId: surgery.id },
        create: {
          surgeryId: surgery.id,
          recordedBy: session.user.id,
          procedureEndTime: now,
        },
        update: {
          procedureEndTime: now,
        },
      });

      await createMovementOnce(surgery.id, 'SURGERY_ENDED', session.user.id, 'End of surgery');
      return NextResponse.json({ success: true, status: 'COMPLETED' });
    }

    if (action === 'TRANSFER_OUT_OF_THEATRE') {
      await prisma.surgicalTiming.upsert({
        where: { surgeryId: surgery.id },
        create: {
          surgeryId: surgery.id,
          recordedBy: session.user.id,
          patientLeftRoomTime: now,
          signOutTime: now,
        },
        update: {
          patientLeftRoomTime: now,
          signOutTime: now,
        },
      });

      await createMovementOnce(surgery.id, 'RECOVERY_ROOM', session.user.id, 'Transferred out of operating theatre');
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown flow action' }, { status: 400 });
  } catch (error) {
    console.error('Error in surgery flow transition:', error);
    return NextResponse.json({ error: 'Failed to update surgery flow' }, { status: 500 });
  }
}
