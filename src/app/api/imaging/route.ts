import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';

export const dynamic = 'force-dynamic';

/**
 * The radiology worklist, and the requests that fill it.
 *
 * Imaging for a theatre case has lived on paper: a card is walked to radiology
 * and the only record that a scan was asked for is that somebody remembers.
 * The list then runs without knowing whether the film exists.
 */

/** Who may ASK for imaging: the clinicians responsible for the case. */
const REQUEST_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'SURGEON', 'CONSULTANT_SURGEON', 'HOUSE_OFFICER',
  'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
];

const createSchema = z.object({
  patientId: z.string().min(1, 'A patient is required.'),
  surgeryId: z.string().optional().nullable(),
  modality: z.enum(['XRAY', 'CT', 'MRI', 'ULTRASOUND', 'FLUOROSCOPY', 'MAMMOGRAPHY', 'INTERVENTIONAL', 'OTHER']),
  bodyRegion: z.string().min(1, 'Say which part of the body.'),
  // Not optional, and deliberately so. A request that says only "CT abdomen"
  // gets a report that answers nobody's question, and the registrar reading it
  // at 2 a.m. cannot ask the person who ordered it.
  clinicalQuestion: z.string().min(3, 'Say what you need the scan to answer.'),
  urgency: z.enum(['ROUTINE', 'URGENT', 'EMERGENCY', 'INTRA_OPERATIVE']).default('ROUTINE'),
  contrastRequested: z.boolean().default(false),
  pregnancyExcluded: z.boolean().optional().nullable(),
  creatinineChecked: z.boolean().optional().nullable(),
  implantsDeclared: z.boolean().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const patientId = sp.get('patientId');
  const surgeryId = sp.get('surgeryId');
  // The worklist's normal view: everything not yet finished with.
  const outstanding = sp.get('outstanding') === 'true';

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (patientId) where.patientId = patientId;
  if (surgeryId) where.surgeryId = surgeryId;
  if (outstanding) where.status = { in: ['REQUESTED', 'ACCEPTED', 'SCHEDULED', 'PERFORMED'] };

  try {
    const requests = await prisma.imagingRequest.findMany({
      where,
      // Emergencies first, then oldest — a worklist sorted by arrival alone
      // buries the urgent request that came in after the routine ones.
      orderBy: [{ urgency: 'asc' }, { requestedAt: 'asc' }],
      take: 300,
    });

    // The patient's name is on the patient, not on the request. Fetched in one
    // query for the whole page rather than one per row.
    const patientIds = Array.from(new Set(requests.map((r) => r.patientId)));
    const patients = patientIds.length
      ? await prisma.patient.findMany({
          where: { id: { in: patientIds } },
          select: { id: true, name: true, folderNumber: true, ward: true, age: true, ageUnit: true, gender: true },
        })
      : [];
    const byId = new Map(patients.map((p) => [p.id, p]));

    return NextResponse.json({
      requests: requests.map((r) => ({ ...r, patient: byId.get(r.patientId) ?? null })),
    });
  } catch (e) {
    console.error('[imaging.GET] failed:', e);
    return NextResponse.json({ error: 'Could not load the imaging worklist.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = session!.user as { id: string; role: string; fullName?: string; name?: string };
  if (!REQUEST_ROLES.includes(user.role)) {
    return NextResponse.json(
      { error: 'Only the clinicians responsible for a case may request imaging.' },
      { status: 403 });
  }

  try {
    const body = await req.json();
    const data = createSchema.parse(body);

    // A contrast study without a creatinine, or any study on a woman of
    // child-bearing age without a pregnancy check, is refused at the scanner —
    // after the porter has moved the patient. Asked here instead, where the
    // person who knows the answer is still looking at the screen.
    const created = await prisma.imagingRequest.create({
      data: {
        patientId: data.patientId,
        surgeryId: data.surgeryId ?? null,
        modality: data.modality,
        bodyRegion: data.bodyRegion,
        clinicalQuestion: data.clinicalQuestion,
        urgency: data.urgency,
        contrastRequested: data.contrastRequested,
        pregnancyExcluded: data.pregnancyExcluded ?? null,
        creatinineChecked: data.creatinineChecked ?? null,
        implantsDeclared: data.implantsDeclared ?? null,
        notes: data.notes ?? null,
        requestedById: user.id,
        requestedByName: user.fullName || user.name || 'Unknown',
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Invalid request.' }, { status: 400 });
    }
    console.error('[imaging.POST] failed:', e);
    return NextResponse.json({ error: 'Could not save that imaging request.' }, { status: 500 });
  }
}
