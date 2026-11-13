// ============================================================
// The cases with my name on them, and what each still needs
// ------------------------------------------------------------
//   GET ?days=7
//
// Personal, not managerial: it answers only for the signed-in anaesthetist,
// and the user id comes from the session, never from the request. A
// consultant cannot read another consultant's list here — the day board at
// /dashboard/anaesthetist-board is where the whole theatre's work is shown.
//
// WHY IT SPANS DAYS. The board is a day at a time, which is right for "can
// today's list run" and wrong for "what is waiting on me". A prescription for
// Thursday written on Monday sat unapproved until somebody thought to open
// Thursday, and pharmacy cannot pack until it is approved. Three days is the
// usual elective lead time; seven is the default here so a full week's
// bookings are covered.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { summariseAnaesthesiaCase } from '@/lib/anaesthesia/board';
import {
  addDays, approvablePrescriptionIds, headline, needsOf, sortForConsultant, summarise,
  watToday, type MyCase,
} from '@/lib/anaesthesia/myCases';

export const dynamic = 'force-dynamic';

/** Only the two grades who are assigned to cases have a list of their own. */
const MY_CASES_ROLES = ['CONSULTANT_ANAESTHETIST', 'ANAESTHETIST'];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string; name?: string } | undefined;

  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!MY_CASES_ROLES.includes(user.role ?? '')) {
    return NextResponse.json({ error: 'Anaesthetists only.' }, { status: 403 });
  }

  try {
    const raw = Number(req.nextUrl.searchParams.get('days') ?? '7');
    const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 0), 30) : 7;

    const from = watToday();
    const to = addDays(from, days);

    const surgeries = await prisma.surgery.findMany({
      where: {
        // "Booked with his name on it": the anaesthetist assigned on the case.
        anesthetistId: user.id,
        scheduledDate: {
          gte: new Date(`${from}T00:00:00.000Z`),
          lte: new Date(`${to}T23:59:59.999Z`),
        },
        // A cancelled case needs nothing, and a finished one cannot be helped
        // by approving its drugs now.
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
      },
      select: {
        id: true, procedureName: true, unit: true, subspecialty: true,
        scheduledDate: true, scheduledTime: true, status: true, surgeryType: true,
        location: true, theatreId: true, anesthesiaType: true, isDayCase: true,
        patient: { select: { name: true, folderNumber: true, ptNumber: true, age: true, gender: true, ward: true } },
        surgeon: { select: { fullName: true } },
        surgeonName: true,
        anesthetist: { select: { id: true, fullName: true, phoneNumber: true } },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
    });

    const ids = surgeries.map((s) => s.id);

    const theatreIds = Array.from(new Set(surgeries.map((s) => s.theatreId).filter((x): x is string => !!x)));
    const [theatres, reviews, prescriptions] = await Promise.all([
      theatreIds.length
        ? prisma.theatreSuite.findMany({ where: { id: { in: theatreIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      ids.length
        ? prisma.preOperativeAnestheticReview.findMany({
            where: { surgeryId: { in: ids } },
            select: {
              id: true, surgeryId: true, status: true, reviewDate: true,
              anesthetistName: true, consultantName: true,
              fitnessDecision: true, approvedAt: true, asaClass: true,
            },
          })
        : Promise.resolve([]),
      ids.length
        ? prisma.anestheticPrescription.findMany({
            where: { surgeryId: { in: ids } },
            select: {
              id: true, surgeryId: true, status: true, version: true,
              prescribedByName: true, approvedByName: true, supersededById: true,
              createdAt: true,
              _count: { select: { prescriptionItems: true } },
            },
            orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
          })
        : Promise.resolve([]),
    ]);

    const theatreName = new Map(theatres.map((t) => [t.id, t.name]));
    const reviewBySurgery = new Map(reviews.map((r) => [r.surgeryId, r]));

    // Every version is grouped and the pure helper picks the live one. A
    // `take: 1` here would hide an amendment chain, which is the thing a
    // consultant most needs to see before he signs.
    const rxBySurgery = new Map<string, typeof prescriptions>();
    prescriptions.forEach((p) => {
      const arr = rxBySurgery.get(p.surgeryId) ?? [];
      arr.push(p);
      rxBySurgery.set(p.surgeryId, arr);
    });

    const cases: MyCase[] = surgeries.map((s) => {
      const summary = summariseAnaesthesiaCase({
        surgery: {
          id: s.id,
          patientName: s.patient?.name ?? null,
          folderNumber: s.patient?.folderNumber ?? s.patient?.ptNumber ?? null,
          age: s.patient?.age ?? null,
          gender: s.patient?.gender ?? null,
          isDayCase: s.isDayCase === true,
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
      });

      return {
        ...summary,
        scheduledDate: s.scheduledDate.toISOString().slice(0, 10),
        needs: needsOf(summary),
      };
    });

    const sorted = sortForConsultant(cases);
    const counts = summarise(sorted);

    return NextResponse.json({
      from,
      to,
      days,
      counts,
      headline: headline(counts),
      approvableCount: approvablePrescriptionIds(sorted).length,
      cases: sorted,
    });
  } catch (err) {
    console.error('[anaesthesia/my-cases] failed:', err);
    return NextResponse.json({ error: 'Could not read your cases' }, { status: 500 });
  }
}
