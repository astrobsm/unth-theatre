import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import { ssiRates, followUpDue, type SurveillanceRow } from '@/lib/ipc/ssiRate';

export const dynamic = 'force-dynamic';

/**
 * Surgical site infection surveillance: the cohort, and the rate it produces.
 *
 * A surveillance record is opened against an OPERATION, not a patient, because
 * the operation is the denominator. One record per case, enforced by a unique
 * index — two records for one case would count it twice in every rate.
 */

const IPC_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'INFECTION_CONTROL_NURSE', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE',
  'SURGEON', 'CONSULTANT_SURGEON', 'HOUSE_OFFICER',
];

const openSchema = z.object({
  surgeryId: z.string().min(1),
  woundClass: z.enum(['CLEAN', 'CLEAN_CONTAMINATED', 'CONTAMINATED', 'DIRTY_INFECTED']),
  asaGrade: z.string().optional().nullable(),
  durationMinutes: z.number().int().min(0).optional().nullable(),
  implantPlaced: z.boolean().default(false),
  prophylaxisGiven: z.boolean().optional().nullable(),
  prophylaxisAgent: z.string().optional().nullable(),
  prophylaxisTiming: z.enum(['WITHIN_60_MIN', 'TOO_EARLY', 'TOO_LATE', 'NOT_GIVEN', 'UNKNOWN']).default('UNKNOWN'),
  redosedIfLong: z.boolean().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const from = sp.get('from');
  const to = sp.get('to');
  const dueOnly = sp.get('due') === 'true';

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  // The working view: cases whose follow-up is due and still open.
  if (dueOnly) {
    where.status = 'OPEN';
    where.followUpDueOn = { lte: new Date() };
  }

  try {
    const records = await prisma.ssiSurveillance.findMany({
      where,
      orderBy: [{ followUpDueOn: 'asc' }, { createdAt: 'desc' }],
      take: 500,
      include: {
        assessments: { orderBy: { assessedOn: 'asc' }, take: 20 },
      },
    });

    // The rate is computed over the SAME filter the list shows, so the number
    // on screen always describes the rows beneath it. A rate computed over
    // everything while the list shows one month is the commonest way these
    // dashboards mislead.
    const rates = ssiRates(records as unknown as SurveillanceRow[]);

    const patientIds = Array.from(new Set(records.map((r) => r.patientId)));
    const patients = patientIds.length
      ? await prisma.patient.findMany({
          where: { id: { in: patientIds } },
          select: { id: true, name: true, folderNumber: true, ward: true },
        })
      : [];
    const byId = new Map(patients.map((p) => [p.id, p]));

    return NextResponse.json({
      records: records.map((r) => ({ ...r, patient: byId.get(r.patientId) ?? null })),
      rates,
    });
  } catch (e) {
    console.error('[ipc.surveillance.GET] failed:', e);
    return NextResponse.json({ error: 'Could not load SSI surveillance.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { id: string; role: string; fullName?: string; name?: string };
  if (!IPC_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Your role cannot open SSI surveillance.' }, { status: 403 });
  }

  try {
    const data = openSchema.parse(await req.json());

    const surgery = await prisma.surgery.findUnique({
      where: { id: data.surgeryId },
      select: { id: true, patientId: true, scheduledDate: true, procedureName: true },
    });
    if (!surgery) return NextResponse.json({ error: 'No such operation.' }, { status: 404 });
    if (!surgery.patientId) {
      return NextResponse.json(
        { error: 'That operation has no patient recorded, so it cannot be followed up.' },
        { status: 400 });
    }

    const existing = await prisma.ssiSurveillance.findUnique({
      where: { surgeryId: data.surgeryId },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'This operation is already under surveillance.', id: existing.id },
        { status: 409 });
    }

    const created = await prisma.ssiSurveillance.create({
      data: {
        surgeryId: surgery.id,
        patientId: surgery.patientId,
        woundClass: data.woundClass,
        asaGrade: data.asaGrade ?? null,
        durationMinutes: data.durationMinutes ?? null,
        implantPlaced: data.implantPlaced,
        prophylaxisGiven: data.prophylaxisGiven ?? null,
        prophylaxisAgent: data.prophylaxisAgent ?? null,
        prophylaxisTiming: data.prophylaxisTiming,
        redosedIfLong: data.redosedIfLong ?? null,
        notes: data.notes ?? null,
        // Thirty days, or ninety with an implant. Computed once, here, rather
        // than left for whoever opens the list to work out.
        followUpDueOn: followUpDue(surgery.scheduledDate ?? new Date(), data.implantPlaced),
        openedById: user.id,
        openedByName: user.fullName || user.name || 'Unknown',
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Invalid request.' }, { status: 400 });
    }
    console.error('[ipc.surveillance.POST] failed:', e);
    return NextResponse.json({ error: 'Could not open surveillance for that case.' }, { status: 500 });
  }
}
