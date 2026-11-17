// ============================================================
// A unit's tentative cases
// ------------------------------------------------------------
//   GET  — the plans, filtered by unit and status.
//   POST — add one.
//
// NOTHING HERE CREATES A SURGERY, and nothing here should ever be made to.
// Publishing a draft is POST /api/surgeries, the same route a typed booking
// uses, called with the draft's own fields. The only thing that happens on
// this side afterwards is the draft being marked published, which is a PATCH.
// See lib/surgeryDrafts/draft.ts for why a second creation path was refused.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import { DRAFT_PRIORITIES, DRAFT_STATUSES } from '@/lib/surgeryDrafts/draft';

export const dynamic = 'force-dynamic';

const emptyToNull = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), s.nullable());

const draftSchema = z.object({
  unit: z.string().min(1, 'Which unit is planning this?'),
  subspecialty: z.string().min(1, 'Which subspecialty?'),

  // A plan may name a patient who has no folder yet. Publishing insists on the
  // id; holding the plan does not. See missingForPublish().
  patientId: emptyToNull(z.string()),
  patientName: emptyToNull(z.string()),
  patientFolderNumber: emptyToNull(z.string()),

  surgeonId: emptyToNull(z.string()),
  surgeonName: emptyToNull(z.string()),

  procedureName: z.string().min(1, 'What operation is planned?'),
  additionalProcedures: emptyToNull(z.string()),
  indication: emptyToNull(z.string()),
  magnitude: emptyToNull(z.enum(['MAJOR', 'INTERMEDIATE', 'MINOR', 'SUPER_MAJOR'])),
  surgeryType: z.enum(['ELECTIVE', 'URGENT', 'EMERGENCY']).default('ELECTIVE'),
  anesthesiaType: emptyToNull(
    z.enum(['GENERAL', 'SPINAL', 'EPIDURAL', 'COMBINED_SPINAL_EPIDURAL', 'LOCAL', 'REGIONAL', 'SEDATION']),
  ),
  estimatedDuration: z.coerce.number().int().min(5).max(24 * 60).default(60),

  // The tentative date. Optional on purpose: a draft that must have a date is
  // a booking with extra steps, and the unit would put a placeholder in it.
  targetDate: emptyToNull(z.string()),
  preferredTime: emptyToNull(z.string()),

  priority: z.enum(DRAFT_PRIORITIES).default('NORMAL'),
  notes: emptyToNull(z.string()),
});

/** A date-only string from a date input, kept as the date the unit meant. */
function toDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const unit = searchParams.get('unit')?.trim() || '';
    const status = searchParams.get('status')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (unit) where.unit = unit;
    if (status && (DRAFT_STATUSES as readonly string[]).includes(status)) where.status = status;

    const drafts = await prisma.surgeryScheduleDraft.findMany({
      where,
      // Planned-for date first, because the question the list answers is
      // "what is coming". Drafts with no date yet sort to the end rather than
      // the beginning: they are the least urgent thing on the screen.
      orderBy: [{ targetDate: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });

    // The units that have anything planned, so the filter can offer real
    // choices rather than every unit that has ever existed.
    const units = Array.from(new Set(drafts.map((d) => d.unit))).sort();

    return NextResponse.json({ drafts, units });
  } catch (err) {
    console.error('[surgery-drafts] list failed:', err);
    return NextResponse.json({ error: 'Could not read the planned cases.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Some details are missing.', details: parsed.error.issues },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const user = session!.user as { id?: string; name?: string | null };
    const draft = await prisma.surgeryScheduleDraft.create({
      data: {
        unit: d.unit,
        subspecialty: d.subspecialty,
        patientId: d.patientId,
        patientName: d.patientName,
        patientFolderNumber: d.patientFolderNumber,
        surgeonId: d.surgeonId,
        surgeonName: d.surgeonName,
        procedureName: d.procedureName,
        additionalProcedures: d.additionalProcedures,
        indication: d.indication,
        magnitude: d.magnitude,
        surgeryType: d.surgeryType,
        anesthesiaType: d.anesthesiaType,
        estimatedDuration: d.estimatedDuration,
        targetDate: toDate(d.targetDate),
        preferredTime: d.preferredTime,
        priority: d.priority,
        notes: d.notes,
        status: 'DRAFT',
        createdById: user.id ?? null,
        createdByName: user.name ?? null,
      },
    });

    return NextResponse.json({ draft }, { status: 201 });
  } catch (err) {
    console.error('[surgery-drafts] create failed:', err);
    return NextResponse.json({ error: 'Could not save the plan.' }, { status: 500 });
  }
}
