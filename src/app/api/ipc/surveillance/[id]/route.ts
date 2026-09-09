import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';

export const dynamic = 'force-dynamic';

/**
 * Recording one look at a wound, and closing a case out.
 *
 * An assessment is APPEND-ONLY. A later look never rewrites an earlier one,
 * because the sequence is the evidence: "clean at day 3, purulent at day 9" is
 * the finding, and a system that let the day-3 entry be edited afterwards
 * could not tell that story at all.
 */

const IPC_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'INFECTION_CONTROL_NURSE', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE',
  'SURGEON', 'CONSULTANT_SURGEON', 'HOUSE_OFFICER',
];

const assessSchema = z.object({
  assessedOn: z.string().datetime().optional(),
  infectionPresent: z.boolean().default(false),
  ssiType: z.enum(['SUPERFICIAL_INCISIONAL', 'DEEP_INCISIONAL', 'ORGAN_SPACE']).optional().nullable(),
  signs: z.string().optional().nullable(),
  organism: z.string().optional().nullable(),
  treatment: z.string().optional().nullable(),
  woundInspected: z.boolean().default(true),
});

const closeSchema = z.object({
  status: z.enum(['CLOSED_NO_INFECTION', 'CLOSED_INFECTION', 'LOST_TO_FOLLOW_UP']),
  notes: z.string().optional().nullable(),
});

/** Add an assessment. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { id: string; role: string; fullName?: string; name?: string };
  if (!IPC_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Your role cannot record a wound assessment.' }, { status: 403 });
  }

  try {
    const data = assessSchema.parse(await req.json());

    const rec = await prisma.ssiSurveillance.findUnique({ where: { id: params.id } });
    if (!rec) return NextResponse.json({ error: 'No such surveillance record.' }, { status: 404 });

    if (data.infectionPresent && !data.ssiType) {
      return NextResponse.json(
        { error: 'Say how deep it is — superficial, deep, or organ/space. The depth is the finding.' },
        { status: 400 });
    }

    const surgery = await prisma.surgery.findUnique({
      where: { id: rec.surgeryId },
      select: { scheduledDate: true },
    });
    const assessedOn = data.assessedOn ? new Date(data.assessedOn) : new Date();
    const opDate = surgery?.scheduledDate ?? rec.createdAt;
    const dayPostOp = Math.max(
      0, Math.round((assessedOn.getTime() - opDate.getTime()) / 86_400_000));

    const created = await prisma.$transaction(async (tx) => {
      const a = await tx.ssiAssessment.create({
        data: {
          surveillanceId: rec.id,
          assessedOn,
          dayPostOp,
          infectionPresent: data.infectionPresent,
          ssiType: data.ssiType ?? null,
          signs: data.signs ?? null,
          organism: data.organism ?? null,
          treatment: data.treatment ?? null,
          woundInspected: data.woundInspected,
          assessedById: user.id,
          assessedByName: user.fullName || user.name || 'Unknown',
        },
      });

      // The first assessment that finds an infection settles the case. Later
      // ones are still recorded — the course of it matters — but the detection
      // date and type are the FIRST ones, not the most recent.
      if (data.infectionPresent && rec.status !== 'CLOSED_INFECTION') {
        await tx.ssiSurveillance.update({
          where: { id: rec.id },
          data: {
            status: 'CLOSED_INFECTION',
            infectionType: rec.infectionType ?? data.ssiType ?? null,
            organism: rec.organism ?? data.organism ?? null,
            detectedOn: rec.detectedOn ?? assessedOn,
            closedAt: new Date(),
            closedById: user.id,
          },
        });
      }
      return a;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Invalid request.' }, { status: 400 });
    }
    console.error('[ipc.surveillance.assess] failed:', e);
    return NextResponse.json({ error: 'Could not record that assessment.' }, { status: 500 });
  }
}

/** Close a case out without an infection, or as unreachable. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { id: string; role: string };
  if (!IPC_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Your role cannot close surveillance.' }, { status: 403 });
  }

  try {
    const data = closeSchema.parse(await req.json());

    const rec = await prisma.ssiSurveillance.findUnique({ where: { id: params.id } });
    if (!rec) return NextResponse.json({ error: 'No such surveillance record.' }, { status: 404 });

    // A case that found an infection cannot be closed as clean. The assessment
    // that found it is on the record, and quietly reclassifying the case would
    // contradict it while leaving it in place.
    if (rec.status === 'CLOSED_INFECTION' && data.status !== 'CLOSED_INFECTION') {
      return NextResponse.json(
        { error: 'An infection has already been recorded on this case. It cannot be closed as clean.' },
        { status: 409 });
    }

    const updated = await prisma.ssiSurveillance.update({
      where: { id: params.id },
      data: {
        status: data.status,
        notes: data.notes ?? rec.notes,
        closedAt: new Date(),
        closedById: user.id,
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Invalid request.' }, { status: 400 });
    }
    console.error('[ipc.surveillance.PATCH] failed:', e);
    return NextResponse.json({ error: 'Could not close that record.' }, { status: 500 });
  }
}
