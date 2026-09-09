import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';

export const dynamic = 'force-dynamic';

/**
 * Moving one imaging request along, one step at a time.
 *
 * Each action is named rather than exposing the status column, because who may
 * do a thing depends on WHICH thing. A house officer may cancel their own
 * request; only radiology may say a scan was performed, and only a radiologist
 * may report it. A single PATCH on `status` cannot express that, and every
 * system that has tried has ended up with surgeons marking their own scans
 * reported to clear a worklist.
 */

const RADIOLOGY = ['RADIOLOGIST', 'RADIOGRAPHER'];
const ADMIN = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];
const CLINICAL = [
  'SURGEON', 'CONSULTANT_SURGEON', 'HOUSE_OFFICER',
  'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
];

const actionSchema = z.object({
  action: z.enum(['accept', 'schedule', 'perform', 'report', 'cancel', 'acknowledge']),
  scheduledFor: z.string().datetime().optional(),
  reportText: z.string().optional(),
  criticalFinding: z.boolean().optional(),
  cancelReason: z.string().optional(),
  notes: z.string().optional(),
});

/** Which roles may take each action. */
const ALLOWED: Record<string, string[]> = {
  accept: [...RADIOLOGY, ...ADMIN],
  schedule: [...RADIOLOGY, ...ADMIN],
  perform: [...RADIOLOGY, ...ADMIN],
  // Reporting is a radiologist's act. A radiographer performs the study.
  report: ['RADIOLOGIST', ...ADMIN],
  cancel: [...RADIOLOGY, ...ADMIN, ...CLINICAL],
  // Anyone caring for the patient can be the one who reads a critical result.
  acknowledge: [...RADIOLOGY, ...ADMIN, ...CLINICAL],
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { id: string; role: string; fullName?: string; name?: string };
  const who = user.fullName || user.name || 'Unknown';

  try {
    const body = await req.json();
    const { action, ...rest } = actionSchema.parse(body);

    if (!ALLOWED[action].includes(user.role)) {
      return NextResponse.json(
        { error: `Your role cannot ${action} an imaging request.` }, { status: 403 });
    }

    const existing = await prisma.imagingRequest.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'No such imaging request.' }, { status: 404 });

    if (existing.status === 'CANCELLED' && action !== 'acknowledge') {
      return NextResponse.json(
        { error: 'That request was cancelled. Raise a new one rather than reviving this.' },
        { status: 409 });
    }

    const now = new Date();
    let data: Record<string, unknown>;

    switch (action) {
      case 'accept':
        data = { status: 'ACCEPTED' };
        break;

      case 'schedule':
        if (!rest.scheduledFor) {
          return NextResponse.json({ error: 'A scheduled time is required.' }, { status: 400 });
        }
        data = { status: 'SCHEDULED', scheduledFor: new Date(rest.scheduledFor) };
        break;

      case 'perform':
        data = {
          status: 'PERFORMED', performedAt: now,
          performedById: user.id, performedByName: who,
        };
        break;

      case 'report':
        if (!rest.reportText || rest.reportText.trim().length < 3) {
          return NextResponse.json({ error: 'A report needs some text.' }, { status: 400 });
        }
        data = {
          status: 'REPORTED',
          reportText: rest.reportText,
          reportedAt: now,
          reportedById: user.id,
          reportedByName: who,
          criticalFinding: rest.criticalFinding ?? false,
          // A study reported without ever being marked performed is the normal
          // case on a busy day; record the performance rather than lose it.
          ...(existing.performedAt ? {} : { performedAt: now }),
        };
        break;

      case 'cancel':
        if (!rest.cancelReason || !rest.cancelReason.trim()) {
          return NextResponse.json(
            { error: 'Say why it is being cancelled — an unexplained cancellation teaches nobody anything.' },
            { status: 400 });
        }
        data = { status: 'CANCELLED', cancelReason: rest.cancelReason };
        break;

      case 'acknowledge':
        if (!existing.criticalFinding) {
          return NextResponse.json(
            { error: 'Nothing to acknowledge: this report carries no critical finding.' },
            { status: 400 });
        }
        // Recorded, never cleared. "It was in the report" is not the same as
        // somebody having read it, and this is the only difference between the
        // two that survives to an audit.
        data = { criticalAckAt: now, criticalAckById: user.id, criticalAckByName: who };
        break;

      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    if (rest.notes !== undefined) data.notes = rest.notes;

    const updated = await prisma.imagingRequest.update({ where: { id: params.id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Invalid request.' }, { status: 400 });
    }
    console.error('[imaging.PATCH] failed:', e);
    return NextResponse.json({ error: 'Could not update that imaging request.' }, { status: 500 });
  }
}
