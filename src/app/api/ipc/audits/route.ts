import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';

export const dynamic = 'force-dynamic';

/**
 * Infection prevention audits: counted observation rounds, not opinions.
 *
 * "Hand hygiene is good on this list" is not an audit. Twenty-three compliant
 * moments out of thirty observed is, and it is the only form that can be
 * compared with last month or with the theatre next door.
 */

const AUDITOR_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'INFECTION_CONTROL_NURSE', 'CSSD_SUPERVISOR', 'SCRUB_NURSE', 'NURSE_MANAGER',
];

const auditSchema = z.object({
  auditType: z.enum([
    'HAND_HYGIENE', 'THEATRE_CLEANING', 'STERILISATION', 'WASTE_SEGREGATION',
    'PPE_COMPLIANCE', 'THEATRE_TRAFFIC', 'SHARPS_HANDLING', 'ENVIRONMENTAL_SWAB',
  ]),
  theatreId: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  auditDate: z.string().datetime().optional(),
  observations: z.number().int().min(1, 'An audit of nothing is not an audit.'),
  compliant: z.number().int().min(0),
  findings: z.string().optional().nullable(),
  actionsAgreed: z.string().optional().nullable(),
  actionDueOn: z.string().datetime().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const auditType = sp.get('auditType');
  const from = sp.get('from');
  const to = sp.get('to');
  const openActions = sp.get('openActions') === 'true';

  const where: Record<string, unknown> = {};
  if (auditType) where.auditType = auditType;
  if (from || to) {
    where.auditDate = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  // An audit that found something and agreed an action, where the action was
  // never closed. This is the list that actually changes anything.
  if (openActions) {
    where.actionsAgreed = { not: null };
    where.actionClosedAt = null;
  }

  try {
    const audits = await prisma.ipcAudit.findMany({
      where, orderBy: { auditDate: 'desc' }, take: 300,
    });

    // Compliance per type, summed over the same filter the list shows.
    const byType = new Map<string, { observations: number; compliant: number; rounds: number }>();
    for (const a of audits) {
      const t = byType.get(a.auditType) ?? { observations: 0, compliant: 0, rounds: 0 };
      t.observations += a.observations;
      t.compliant += a.compliant;
      t.rounds += 1;
      byType.set(a.auditType, t);
    }

    return NextResponse.json({
      audits,
      summary: Array.from(byType.entries()).map(([auditType, t]) => ({
        auditType,
        rounds: t.rounds,
        observations: t.observations,
        compliant: t.compliant,
        // Pooled over observations, not an average of percentages: a round of
        // 3 and a round of 300 do not carry equal weight.
        compliancePercent: t.observations === 0
          ? null
          : Math.round((t.compliant / t.observations) * 1000) / 10,
      })),
    });
  } catch (e) {
    console.error('[ipc.audits.GET] failed:', e);
    return NextResponse.json({ error: 'Could not load IPC audits.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { id: string; role: string; fullName?: string; name?: string };
  if (!AUDITOR_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Your role cannot file an IPC audit.' }, { status: 403 });
  }

  try {
    const data = auditSchema.parse(await req.json());

    // Also enforced by a CHECK constraint. Refused here as well so the person
    // filing it gets a sentence rather than a database error.
    if (data.compliant > data.observations) {
      return NextResponse.json(
        { error: `Compliant (${data.compliant}) cannot exceed observed (${data.observations}).` },
        { status: 400 });
    }

    const created = await prisma.ipcAudit.create({
      data: {
        auditType: data.auditType,
        theatreId: data.theatreId ?? null,
        area: data.area ?? null,
        auditDate: data.auditDate ? new Date(data.auditDate) : new Date(),
        observations: data.observations,
        compliant: data.compliant,
        findings: data.findings ?? null,
        actionsAgreed: data.actionsAgreed ?? null,
        actionDueOn: data.actionDueOn ? new Date(data.actionDueOn) : null,
        auditorId: user.id,
        auditorName: user.fullName || user.name || 'Unknown',
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Invalid audit.' }, { status: 400 });
    }
    console.error('[ipc.audits.POST] failed:', e);
    return NextResponse.json({ error: 'Could not save that audit.' }, { status: 500 });
  }
}
