import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { autoBuildLines, replaceLines, nextEstimateNumber } from '@/lib/estimates/service';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/estimates?surgeryId=&patientId=&status=
 * POST /api/estimates                       create one, optionally auto-costed
 *
 * The totals a client sends are ignored. Amounts come from the price master and
 * are recomputed on the server — that is the whole point of the module, and the
 * only way an estimate stays defensible when someone disputes it later.
 */

/** Who may prepare an estimate. Viewing is wider; writing is not. */
const PREPARE_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CONSULTANT_SURGEON', 'SURGEON', 'ACCOUNTANT', 'BILLING_OFFICER',
];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const where: Record<string, unknown> = {};
  if (sp.get('surgeryId')) where.surgeryId = sp.get('surgeryId');
  if (sp.get('patientId')) where.patientId = sp.get('patientId');
  if (sp.get('status')) where.status = sp.get('status');

  const estimates = await prisma.surgeryEstimate.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { lines: { orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }] } },
  });

  return NextResponse.json({ estimates });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; name?: string; role?: string } | undefined;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!PREPARE_ROLES.includes(user.role ?? '')) {
    return NextResponse.json({ error: 'Not permitted to prepare estimates.' }, { status: 403 });
  }

  let body: {
    surgeryId?: string;
    patientId?: string;
    autoBuild?: boolean;
    procedureCode?: string;
    anaesthesiaCode?: string;
    theatreCode?: string;
    admissionBaseCode?: string;
    ward?: string;
    expectedStayDays?: number;
    admissionType?: 'DAY_CASE' | 'INPATIENT';
    depositPercent?: number;
    validDays?: number;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  if (!body.patientId) {
    return NextResponse.json({ error: 'patientId is required.' }, { status: 400 });
  }

  // Clinical context is SNAPSHOTTED onto the estimate. A patient renamed or a
  // procedure re-coded must not alter a document already handed over.
  const patient = await prisma.patient.findUnique({
    where: { id: body.patientId },
    select: { id: true, name: true, folderNumber: true, ward: true },
  });
  if (!patient) return NextResponse.json({ error: 'Patient not found.' }, { status: 404 });

  const surgery = body.surgeryId
    ? await prisma.surgery.findUnique({
        where: { id: body.surgeryId },
        // surgeonName is stored directly on Surgery; there is no diagnosis
        // column, so the estimate's diagnosis is entered by the preparer.
        select: {
          id: true, procedureName: true, subspecialty: true, unit: true,
          scheduledDate: true, surgeryType: true, anesthesiaType: true,
          surgeonName: true,
        },
      })
    : null;

  if (body.surgeryId && !surgery) {
    return NextResponse.json({ error: 'Surgery not found.' }, { status: 404 });
  }

  // Prices are those in force on the PLANNED OPERATION DATE, not today. An
  // estimate for next month should quote next month's prices where a change is
  // already scheduled.
  const on = surgery?.scheduledDate ?? new Date();

  let built: Awaited<ReturnType<typeof autoBuildLines>> = { lines: [], unpriced: [] };
  if (body.autoBuild) {
    built = await autoBuildLines({
      subspecialty: surgery?.subspecialty ?? null,
      procedureCode: body.procedureCode ?? null,
      anaesthesiaCode: body.anaesthesiaCode ?? null,
      theatreCode: body.theatreCode ?? null,
      admissionBaseCode: body.admissionBaseCode ?? null,
      ward: body.ward ?? patient.ward ?? null,
      expectedStayDays: body.expectedStayDays ?? 0,
      admissionType: body.admissionType ?? 'INPATIENT',
      on,
    });
  }

  // Retried on the unique-number collision two simultaneous bookings can cause.
  let created: { id: string; estimateNumber: string } | null = null;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    try {
      created = await prisma.$transaction(async (tx) => {
        const number = await nextEstimateNumber(tx as never, new Date().getUTCFullYear());
        return tx.surgeryEstimate.create({
          data: {
            estimateNumber: number,
            surgeryId: surgery?.id ?? null,
            patientId: patient.id,
            patientName: patient.name,
            folderNumber: patient.folderNumber ?? null,
            procedureName: surgery?.procedureName ?? 'To be confirmed',
            subspecialty: surgery?.subspecialty ?? null,
            unit: surgery?.unit ?? null,
            surgeonName: surgery?.surgeonName ?? null,
            anaesthesiaType: surgery?.anesthesiaType ?? null,
            surgeryType: surgery?.surgeryType ?? null,
            plannedDate: surgery?.scheduledDate ?? null,
            admissionType: (body.admissionType ?? 'INPATIENT') as never,
            expectedStayDays: body.expectedStayDays ?? 0,
            validUntil: body.validDays
              ? new Date(Date.now() + body.validDays * 86_400_000)
              : null,
            preparedById: user.id ?? null,
            preparedByName: user.name ?? null,
          },
          select: { id: true, estimateNumber: true },
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!/estimateNumber|Unique constraint/i.test(msg) || attempt === 2) throw err;
    }
  }
  if (!created) {
    return NextResponse.json({ error: 'Could not allocate an estimate number.' }, { status: 500 });
  }

  const totals = await replaceLines(created.id, built.lines, {
    expectedStayDays: body.expectedStayDays,
    admissionType: body.admissionType,
    depositPercent: body.depositPercent,
  });

  if (user.id) {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'ESTIMATE_CREATED',
        tableName: 'surgery_estimates',
        recordId: created.id,
        changes: JSON.stringify({
          estimateNumber: created.estimateNumber,
          subtotalKobo: totals.subtotalKobo,
          lineCount: totals.lines.length,
          autoBuild: Boolean(body.autoBuild),
          unpricedCount: built.unpriced.length,
        }),
      },
    });
  }

  return NextResponse.json({
    id: created.id,
    estimateNumber: created.estimateNumber,
    totals,
    // Surfaced, not buried: these are charges the hospital has not priced, and
    // an estimate missing them understates what the patient will be asked for.
    unpriced: built.unpriced,
  }, { status: 201 });
}
