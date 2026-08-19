import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { summariseAnaesthesiaCase, type BoardCase } from '@/lib/anaesthesia/board';

export const dynamic = 'force-dynamic';

// Who may look. The consultant is the intended reader, but a registrar seeing
// the same board is what lets them notice their own case is still unreviewed
// before the consultant does.
const BOARD_ROLES = [
  'CONSULTANT_ANAESTHETIST',
  'ANAESTHETIST',
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
];

/**
 * GET /api/anaesthesia/board?date=YYYY-MM-DD
 *
 * Every case booked for one day, with the two things a consultant
 * anaesthetist needs to decide whether the list can run: has each case been
 * reviewed, and has its drug prescription been approved.
 *
 * Assembled here rather than in the page because the three sources have to be
 * joined by hand — the review is one-per-surgery, the prescription is a
 * version chain, and the anaesthetist is on the surgery itself. A page doing
 * that with three fetches would show a different answer depending on which
 * arrived first.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!BOARD_ROLES.includes(role ?? '')) {
    return NextResponse.json({ error: 'Anaesthetists only.' }, { status: 403 });
  }

  const dateStr = req.nextUrl.searchParams.get('date');
  const base = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(base.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }
  const start = new Date(base); start.setHours(0, 0, 0, 0);
  const end = new Date(base); end.setHours(23, 59, 59, 999);

  const surgeries = await prisma.surgery.findMany({
    where: { scheduledDate: { gte: start, lte: end } },
    select: {
      id: true, procedureName: true, unit: true, subspecialty: true,
      scheduledTime: true, status: true, surgeryType: true, location: true,
      theatreId: true, anesthesiaType: true,
      patient: { select: { name: true, folderNumber: true, ptNumber: true, age: true, gender: true, ward: true } },
      surgeon: { select: { fullName: true } },
      surgeonName: true,
      anesthetist: { select: { id: true, fullName: true, phoneNumber: true } },
    },
    orderBy: [{ scheduledTime: 'asc' }],
  });

  const ids = surgeries.map((s) => s.id);

  // Theatre names: theatreId is a soft reference with no foreign key, kept that
  // way deliberately, so it is looked up rather than joined.
  const theatreIds = Array.from(new Set(surgeries.map((s) => s.theatreId).filter((x): x is string => !!x)));
  const theatres = theatreIds.length
    ? await prisma.theatreSuite.findMany({ where: { id: { in: theatreIds } }, select: { id: true, name: true } })
    : [];
  const theatreName = new Map(theatres.map((t) => [t.id, t.name]));

  const [reviews, prescriptions] = await Promise.all([
    ids.length
      ? prisma.preOperativeAnestheticReview.findMany({
          where: { surgeryId: { in: ids } },
          select: {
            id: true, surgeryId: true, status: true, reviewDate: true,
            anesthetistName: true, consultantName: true,
            fitnessDecision: true, fitnessDecidedAt: true,
            approvedAt: true, approvedBy: true,
            asaClass: true,
          },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.anestheticPrescription.findMany({
          where: { surgeryId: { in: ids } },
          select: {
            id: true, surgeryId: true, status: true, version: true,
            prescribedByName: true, approvedByName: true, approvedAt: true,
            createdAt: true, supersededById: true,
            _count: { select: { prescriptionItems: true } },
          },
          orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
        })
      : Promise.resolve([]),
  ]);

  const reviewBySurgery = new Map(reviews.map((r) => [r.surgeryId, r]));

  // Group every version, and let the pure helper pick which one counts. Doing
  // it here with a `take: 1` would silently hide an amendment chain, which is
  // the thing a consultant most needs to see.
  const rxBySurgery = new Map<string, typeof prescriptions>();
  for (const p of prescriptions) {
    const arr = rxBySurgery.get(p.surgeryId) ?? [];
    arr.push(p);
    rxBySurgery.set(p.surgeryId, arr);
  }

  const cases: BoardCase[] = surgeries.map((s) =>
    summariseAnaesthesiaCase({
      surgery: {
        id: s.id,
        patientName: s.patient?.name ?? null,
        folderNumber: s.patient?.folderNumber ?? s.patient?.ptNumber ?? null,
        age: s.patient?.age ?? null,
        gender: s.patient?.gender ?? null,
        ward: s.patient?.ward ?? null,
        procedureName: s.procedureName,
        unit: s.unit,
        subspecialty: s.subspecialty,
        scheduledTime: s.scheduledTime,
        status: s.status,
        surgeryType: s.surgeryType,
        location: s.location,
        theatre: s.theatreId ? (theatreName.get(s.theatreId) ?? null) : null,
        anaesthesiaType: s.anesthesiaType,
        surgeonName: s.surgeon?.fullName ?? s.surgeonName ?? null,
        anaesthetist: s.anesthetist
          ? { id: s.anesthetist.id, name: s.anesthetist.fullName, phone: s.anesthetist.phoneNumber }
          : null,
      },
      review: reviewBySurgery.get(s.id) ?? null,
      prescriptions: rxBySurgery.get(s.id) ?? [],
    })
  );

  return NextResponse.json({
    date: start.toISOString().slice(0, 10),
    canApprove: role === 'CONSULTANT_ANAESTHETIST' || role === 'ADMIN' || role === 'SYSTEM_ADMINISTRATOR',
    cases,
    summary: {
      total: cases.length,
      unassigned: cases.filter((c) => !c.anaesthetist).length,
      notReviewed: cases.filter((c) => c.review.state === 'NONE').length,
      reviewInProgress: cases.filter((c) => c.review.state === 'IN_PROGRESS').length,
      notFit: cases.filter((c) => c.review.fitness === 'NOT_FIT').length,
      rxAwaitingApproval: cases.filter((c) => c.prescription.state === 'AWAITING_APPROVAL').length,
      rxNone: cases.filter((c) => c.prescription.state === 'NONE').length,
      readyToProceed: cases.filter((c) => c.readyForTheatre).length,
    },
  });
}
