// ============================================================
// One tentative case: read it, change it, mark it published, withdraw it
// ------------------------------------------------------------
// PATCH does two different jobs and they are kept apart on purpose:
//
//   editing the plan      — any field, while it is still a DRAFT
//   recording a publish   — status + the id of the surgery that was created
//
// The second is NOT the thing that creates the surgery. The page calls
// POST /api/surgeries first, with the draft's own fields and an idempotency
// key derived from the draft, and only then tells this route which case came
// back. If that second call never arrives the draft simply stays a draft, and
// pressing Publish again replays the same idempotent booking rather than
// making a second one. The failure mode is a draft that looks unpublished —
// not a patient on the list twice.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import { DRAFT_PRIORITIES } from '@/lib/surgeryDrafts/draft';
import { refuseIfReadOnly } from '@/lib/surgeryDrafts/access';

export const dynamic = 'force-dynamic';

const emptyToNull = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), s.nullable());

const patchSchema = z.object({
  unit: z.string().min(1).optional(),
  subspecialty: z.string().min(1).optional(),
  patientId: emptyToNull(z.string()).optional(),
  patientName: emptyToNull(z.string()).optional(),
  patientFolderNumber: emptyToNull(z.string()).optional(),
  surgeonId: emptyToNull(z.string()).optional(),
  surgeonName: emptyToNull(z.string()).optional(),
  procedureName: z.string().min(1).optional(),
  additionalProcedures: emptyToNull(z.string()).optional(),
  indication: emptyToNull(z.string()).optional(),
  magnitude: emptyToNull(z.enum(['MAJOR', 'INTERMEDIATE', 'MINOR', 'SUPER_MAJOR'])).optional(),
  surgeryType: z.enum(['ELECTIVE', 'URGENT', 'EMERGENCY']).optional(),
  anesthesiaType: emptyToNull(
    z.enum(['GENERAL', 'SPINAL', 'EPIDURAL', 'COMBINED_SPINAL_EPIDURAL', 'LOCAL', 'REGIONAL', 'SEDATION']),
  ).optional(),
  estimatedDuration: z.coerce.number().int().min(5).max(24 * 60).optional(),
  targetDate: emptyToNull(z.string()).optional(),
  preferredTime: emptyToNull(z.string()).optional(),
  priority: z.enum(DRAFT_PRIORITIES).optional(),
  notes: emptyToNull(z.string()).optional(),

  // What the case will need. See the create route for why these live on the
  // plan rather than being asked again at the moment of publishing.
  // z.boolean(), not z.coerce.boolean() — see the create route.
  needBloodTransfusion: z.boolean().optional(),
  bloodUnits: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().int().min(0).max(20).nullable(),
  ).optional(),
  needDiathermy: z.boolean().optional(),
  needStereo: z.boolean().optional(),
  needMontrellMattress: z.boolean().optional(),
  otherSpecialNeeds: emptyToNull(z.string()).optional(),
  isDayCase: z.boolean().optional(),
  postOpDestination: emptyToNull(z.string()).optional(),
  location: emptyToNull(z.string()).optional(),

  // Recording a publish, or withdrawing.
  status: z.enum(['DRAFT', 'PUBLISHED', 'WITHDRAWN']).optional(),
  publishedSurgeryId: emptyToNull(z.string()).optional(),
  publishedForDate: emptyToNull(z.string()).optional(),
});

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const draft = await prisma.surgeryScheduleDraft.findUnique({ where: { id: params.id } });
  if (!draft) return NextResponse.json({ error: 'That plan is not here.' }, { status: 404 });
  return NextResponse.json({ draft });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  // Read-only roles may see every plan and change none of it.
  const denied = refuseIfReadOnly((session!.user as { role?: string }).role, 'change a plan');
  if (denied) return NextResponse.json({ error: denied }, { status: 403 });

  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'That change could not be read.', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const existing = await prisma.surgeryScheduleDraft.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'That plan is not here.' }, { status: 404 });

    const p = parsed.data;

    // A published draft is a record of something that happened. Editing the
    // clinical detail afterwards would leave it describing a case that differs
    // from the one on the list, and the list is the real thing. Withdrawing is
    // still allowed, because that is a statement about the plan, not the case.
    const onlyStatusChange =
      Object.keys(p).every((k) => ['status', 'publishedSurgeryId', 'publishedForDate'].includes(k));
    if (existing.status === 'PUBLISHED' && !onlyStatusChange) {
      return NextResponse.json(
        {
          error:
            'This plan has already been published as a case. Change the case itself on the surgery, not the plan it came from.',
        },
        { status: 409 },
      );
    }

    // Marking it published without saying which case is how a draft ends up
    // claiming to be on a list it is not on.
    if (p.status === 'PUBLISHED' && !p.publishedSurgeryId && !existing.publishedSurgeryId) {
      return NextResponse.json(
        { error: 'A plan can only be marked published together with the case it created.' },
        { status: 400 },
      );
    }

    const user = session!.user as { id?: string };
    const data: Record<string, unknown> = {};

    ([
      'unit', 'subspecialty', 'patientId', 'patientName', 'patientFolderNumber',
      'surgeonId', 'surgeonName', 'procedureName', 'additionalProcedures', 'indication',
      'magnitude', 'surgeryType', 'anesthesiaType', 'estimatedDuration', 'preferredTime',
      'priority', 'notes', 'status', 'publishedSurgeryId',
      // What the case will need. A whitelist is the right shape here — it
      // stops a client writing publishedAt or createdById — but it means a
      // field added to the schema and not added HERE is accepted by the
      // validator and then quietly dropped, which is the worst of both.
      'needBloodTransfusion', 'bloodUnits', 'needDiathermy', 'needStereo', 'needMontrellMattress',
      'otherSpecialNeeds', 'isDayCase', 'postOpDestination', 'location',
    ] as const).forEach((k) => {
      if (p[k] !== undefined) data[k] = p[k];
    });

    const target = toDate(p.targetDate);
    if (target !== undefined) data.targetDate = target;
    const forDate = toDate(p.publishedForDate);
    if (forDate !== undefined) data.publishedForDate = forDate;

    if (p.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
      data.publishedAt = new Date();
      data.publishedById = user.id ?? null;
    }

    const draft = await prisma.surgeryScheduleDraft.update({ where: { id: params.id }, data });
    return NextResponse.json({ draft });
  } catch (err) {
    console.error('[surgery-drafts] update failed:', err);
    return NextResponse.json({ error: 'Could not save that change.' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const denied = refuseIfReadOnly((session!.user as { role?: string }).role, 'delete a plan');
  if (denied) return NextResponse.json({ error: denied }, { status: 403 });

  try {
    const existing = await prisma.surgeryScheduleDraft.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'That plan is not here.' }, { status: 404 });

    // A published plan is not deleted. The case it made is real, and removing
    // the row would erase where it came from. Withdraw covers the other case.
    if (existing.status === 'PUBLISHED') {
      return NextResponse.json(
        { error: 'This plan has been published as a case, so it is kept as the record of where that case came from.' },
        { status: 409 },
      );
    }

    await prisma.surgeryScheduleDraft.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[surgery-drafts] delete failed:', err);
    return NextResponse.json({ error: 'Could not remove that plan.' }, { status: 500 });
  }
}
