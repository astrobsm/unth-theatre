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
import { refuseIfReadOnly } from '@/lib/surgeryDrafts/access';

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

  // ── What the case will need ───────────────────────────────────────────
  // Requests, not findings. The unit saying what to have ready, in the same
  // words the booking form uses, so publishing hands them straight on rather
  // than asking again at the moment somebody is trying to book.
  //
  // z.boolean(), NOT z.coerce.boolean(). Coercion reads the STRING "false" as
  // true, so a client that serialised these as text would silently request
  // blood for every case it sent. The form sends real booleans; anything else
  // is refused and says so, which is the failure that gets noticed.
  needBloodTransfusion: z.boolean().default(false),
  // An empty box is not nought units: z.coerce.number() reads '' as 0, which
  // would record "none" where the unit answered nothing.
  bloodUnits: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().int().min(0).max(20).nullable(),
  ).optional(),
  needDiathermy: z.boolean().default(false),
  needStereo: z.boolean().default(false),
  needMontrellMattress: z.boolean().default(false),
  otherSpecialNeeds: emptyToNull(z.string()),

  isDayCase: z.boolean().default(false),
  postOpDestination: emptyToNull(z.string()),

  // The site, not a theatre. See the model comment for why there is no
  // theatre here.
  location: emptyToNull(z.string()),
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

  // The pharmacy, the pack provider and the store READ this list so they can
  // begin preparing; they do not plan operations. Refused here rather than by
  // hiding the button, because a screen is not a permission.
  const denied = refuseIfReadOnly((session!.user as { role?: string }).role, 'add a plan');
  if (denied) return NextResponse.json({ error: denied }, { status: 403 });

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
        needBloodTransfusion: d.needBloodTransfusion,
        bloodUnits: d.needBloodTransfusion ? (d.bloodUnits ?? null) : null,
        needDiathermy: d.needDiathermy,
        needStereo: d.needStereo,
        needMontrellMattress: d.needMontrellMattress,
        otherSpecialNeeds: d.otherSpecialNeeds,
        isDayCase: d.isDayCase,
        postOpDestination: d.postOpDestination,
        location: d.location,
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
