// ============================================================
// POST /api/surgeries/[id]/amend — correct a booking, with a reason
// ------------------------------------------------------------
// The ordinary PUT refuses to touch a COMPLETED or CANCELLED surgery, and
// should keep refusing: a finished operation is a clinical record, and casual
// editing is how a theatre log stops being evidence of anything.
//
// But a case scheduled for the 8th was marked complete on the 7th, and there
// was then no way to undo it — not the status, not the unassigned anaesthetist,
// nothing. Marking the wrong row complete on a list of near-identical bookings
// is an ordinary slip, and a system with no way back from one invites people to
// work around it instead.
//
// So this is a separate door rather than a wider one. It demands a written
// reason, it is limited to the people who answer for the theatre list, and
// every field it changes is recorded before and after. The strict path is
// untouched; somebody correcting a mistake has to say that is what they are
// doing.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import {
  validateAmendment, diffAmendment, isReopening, clearedTimestamps,
  AMENDABLE_KEYS, type AmendableFields,
} from '@/lib/surgery/amend';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));

    const changes: AmendableFields = {};
    for (const key of AMENDABLE_KEYS) {
      if (body[key] !== undefined) changes[key] = body[key];
    }

    // Removing a duplicate booking is a cancellation with a particular cause,
    // so it travels the same road: same permission, same mandatory reason,
    // same audit trail. It only adds WHICH booking this one repeats, and
    // forces the outcome so a caller cannot ask to "remove a duplicate" and
    // leave it scheduled.
    //
    // CANCELLED, never deleted. A booking that vanishes takes with it the
    // record that it was ever made, and the next person to wonder why a
    // patient appears once instead of twice has nothing to read. The same
    // reason the duplicate prescriptions are cancelled rather than removed.
    const duplicateOf = typeof body.duplicateOf === 'string' ? body.duplicateOf.trim() : null;
    if (duplicateOf) {
      if (duplicateOf === params.id) {
        return NextResponse.json(
          { error: 'A booking cannot be a duplicate of itself.', code: 'SELF_DUPLICATE' },
          { status: 400 },
        );
      }
      changes.status = 'CANCELLED';
    }

    const check = validateAmendment({
      role: (session.user as { role?: string }).role,
      reason: body.reason,
      changes,
    });
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error, code: check.code },
        { status: check.code === 'NO_ACCESS' ? 403 : 400 },
      );
    }

    const before = await prisma.surgery.findUnique({
      where: { id: params.id },
      select: {
        id: true, status: true, theatreId: true, surgeonId: true, anesthetistId: true,
        scrubNurseId: true, theatreTechnicianId: true, assistantSurgeonId: true,
        procedureName: true, completedAt: true, scheduledDate: true,
        patientId: true,
        patient: { select: { name: true, folderNumber: true } },
      },
    });
    if (!before) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    const diff = diffAmendment(before as unknown as Record<string, unknown>, changes);
    if (!diff.length) {
      // Everything submitted already matches. Not an error — somebody may have
      // opened the panel and saved without altering anything — but there is no
      // point writing an audit entry saying nothing happened.
      return NextResponse.json({ surgery: before, changed: [], note: 'Nothing differed.' });
    }

    const data: Record<string, unknown> = {};
    for (const c of diff) data[c.field] = c.to;
    Object.assign(data, clearedTimestamps(before.status, changes.status));

    const updated = await prisma.surgery.update({
      where: { id: params.id },
      data: data as never,
    });

    // The record of the correction. Written after the change rather than
    // before, so a failed update cannot leave an audit entry describing
    // something that did not happen.
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        // Three distinct actions rather than one, so the register can be
        // searched for the consequential kinds. "Who re-opened a completed
        // case" and "which bookings were removed as duplicates" are both
        // questions somebody will eventually ask.
        action: duplicateOf
          ? 'SURGERY_DUPLICATE_REMOVED'
          : isReopening(before.status, changes.status)
            ? 'SURGERY_REOPENED'
            : 'SURGERY_AMENDED',
        tableName: 'surgeries',
        recordId: params.id,
        changes: JSON.stringify({
          reason: String(body.reason).trim(),
          patient: before.patient?.name ?? null,
          folderNumber: before.patient?.folderNumber ?? null,
          procedure: before.procedureName,
          ...(duplicateOf ? { duplicateOf } : {}),
          fields: diff,
        }),
      },
    }).catch((e) => {
      // The correction stands even if the log fails, and the failure is worth
      // seeing — an amendment nobody can trace is the thing this endpoint
      // exists to avoid.
      console.error('[surgery/amend] audit entry failed', params.id, e);
    });

    return NextResponse.json({
      surgery: updated,
      changed: diff,
      reopened: isReopening(before.status, changes.status),
      duplicateRemoved: Boolean(duplicateOf),
    });
  } catch (error) {
    return apiError('surgeries/amend', error);
  }
}
