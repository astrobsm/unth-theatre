// ============================================================
// The joint cases I have been asked onto
// ------------------------------------------------------------
//   GET ?days=7
//
// Personal: it answers only for the signed-in surgeon, and the id comes from
// the session and never from the request. There is no way to ask it about
// anybody else.
//
// NOT THE CASES THEY BOOKED. A surgeon's own list is already on several
// screens; this is the one thing they could not see anywhere, which is a case
// somebody ELSE booked and put their name on. Mixing the two would bury the
// invitations in a list the surgeon already knows by heart.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  addDays, jointHeadline, sortJointCases, summariseJoint, watToday, type JointCase,
} from '@/lib/surgery/jointCases';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const raw = Number(req.nextUrl.searchParams.get('days') ?? '7');
    const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 0), 30) : 7;

    const from = watToday();
    const to = addDays(from, days);

    const rows = await prisma.surgeryParticipatingUnit.findMany({
      where: {
        surgeonId: user.id,
        surgery: {
          scheduledDate: {
            gte: new Date(`${from}T00:00:00.000Z`),
            lte: new Date(`${to}T23:59:59.999Z`),
          },
          // A cancelled case needs nobody, and a finished one cannot be
          // joined. Both would only be noise on a card about what is coming.
          status: { notIn: ['CANCELLED', 'COMPLETED'] },
        },
      },
      select: {
        unit: true,
        role: true,
        note: true,
        surgery: {
          select: {
            id: true,
            unit: true,
            procedureName: true,
            scheduledDate: true,
            scheduledTime: true,
            status: true,
            surgeryType: true,
            surgeonName: true,
            theatreId: true,
            patient: { select: { name: true, folderNumber: true, ptNumber: true } },
            // Every unit on the case, so the card can say who else is coming.
            participatingUnits: { select: { unit: true } },
          },
        },
      },
    });

    const theatreIds: string[] = [];
    rows.forEach((r) => {
      const t = r.surgery?.theatreId;
      if (t && theatreIds.indexOf(t) === -1) theatreIds.push(t);
    });
    const theatres = theatreIds.length
      ? await prisma.theatreSuite.findMany({
        where: { id: { in: theatreIds } },
        select: { id: true, name: true },
      })
      : [];
    const theatreName = new Map(theatres.map((t) => [t.id, t.name]));

    const cases: JointCase[] = [];
    rows.forEach((r) => {
      const s = r.surgery;
      if (!s) return;
      const units: string[] = [];
      s.participatingUnits.forEach((p) => {
        if (units.indexOf(p.unit) === -1) units.push(p.unit);
      });
      cases.push({
        id: s.id,
        patientName: s.patient?.name ?? 'Patient',
        folderNumber: s.patient?.folderNumber ?? s.patient?.ptNumber ?? null,
        procedureName: s.procedureName,
        bookingUnit: s.unit,
        leadSurgeonName: s.surgeonName ?? null,
        scheduledDate: s.scheduledDate.toISOString().slice(0, 10),
        scheduledTime: s.scheduledTime ?? null,
        theatre: s.theatreId ? (theatreName.get(s.theatreId) ?? null) : null,
        status: s.status,
        surgeryType: s.surgeryType,
        myUnit: r.unit,
        myRole: r.role,
        note: r.note,
        units,
      });
    });

    const sorted = sortJointCases(cases);
    const counts = summariseJoint(sorted, from);

    return NextResponse.json({
      from,
      to,
      days,
      counts,
      headline: jointHeadline(counts),
      cases: sorted,
    });
  } catch (err) {
    console.error('[surgeries/joining] failed:', err);
    return NextResponse.json({ error: 'Could not read your joint cases' }, { status: 500 });
  }
}
