import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type Contact = { userId: string; name: string; phone: string | null; seniority: string | null };

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();
const isConsultant = (seniority: string | null | undefined, role: string | null | undefined) =>
  norm(seniority) === 'consultant' || role === 'CONSULTANT_ANAESTHETIST';
const isOnCallRow = (shift: string, subRole: string | null | undefined) =>
  shift === 'CALL' || /all\s*emerg|on[\s-]*call/i.test(subRole || '');

// GET /api/roster/anaesthetist-coverage?date=YYYY-MM-DD
// Aligns each booked surgery that day with the anaesthetist(s) rostered to its
// surgical subspecialty (elective), and emergencies with the day's on-call
// consultant. Coverage is read from the published ANAESTHETISTS roster, where
// Roster.subRole holds the covered subspecialty and seniorityLevel = grade.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dateStr = request.nextUrl.searchParams.get('date');
    const base = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(base.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    const start = new Date(base); start.setHours(0, 0, 0, 0);
    const end = new Date(base); end.setHours(23, 59, 59, 999);

    const [rosterRows, surgeries] = await Promise.all([
      prisma.roster.findMany({
        where: { staffCategory: 'ANAESTHETISTS' as any, date: { gte: start, lte: end }, status: 'PUBLISHED' },
        include: { user: { select: { id: true, fullName: true, phoneNumber: true, role: true } } },
      }),
      prisma.surgery.findMany({
        where: { scheduledDate: { gte: start, lte: end } },
        select: {
          id: true, procedureName: true, subspecialty: true, unit: true, scheduledTime: true,
          surgeryType: true, status: true,
          patient: { select: { name: true, folderNumber: true, ptNumber: true } },
          anesthetist: { select: { id: true, fullName: true } },
        },
        orderBy: { scheduledTime: 'asc' },
      }),
    ]);

    const contactOf = (r: (typeof rosterRows)[number]): Contact => ({
      userId: r.userId,
      name: r.user?.fullName || r.staffName || 'Unknown',
      phone: r.user?.phoneNumber || null,
      seniority: r.seniorityLevel || null,
    });

    // On-call (covers ALL emergencies) + elective coverage keyed by subspecialty.
    const onCall = { consultants: [] as Contact[], residents: [] as Contact[] };
    const coverage = new Map<string, { subspecialty: string; consultants: Contact[]; residents: Contact[] }>();
    const seenOnCall = new Set<string>();

    for (const r of rosterRows) {
      const c = contactOf(r);
      const consultant = isConsultant(r.seniorityLevel, r.user?.role);
      if (isOnCallRow(r.shift, r.subRole)) {
        if (!seenOnCall.has(c.userId)) {
          seenOnCall.add(c.userId);
          (consultant ? onCall.consultants : onCall.residents).push(c);
        }
        continue;
      }
      // Elective coverage — subRole holds the covered surgical subspecialty.
      const sub = (r.subRole || '').trim();
      if (!sub) continue;
      const key = norm(sub);
      const bucket = coverage.get(key) || { subspecialty: sub, consultants: [], residents: [] };
      const list = consultant ? bucket.consultants : bucket.residents;
      if (!list.some((x) => x.userId === c.userId)) list.push(c);
      coverage.set(key, bucket);
    }

    const cases = surgeries.map((s) => {
      const isEmergency = s.surgeryType === 'EMERGENCY';
      const cov = coverage.get(norm(s.subspecialty));
      let assigned: { consultants: Contact[]; residents: Contact[] };
      let source: 'subspecialty' | 'on-call' | 'none';

      if (isEmergency) {
        assigned = { consultants: onCall.consultants, residents: onCall.residents };
        source = onCall.consultants.length || onCall.residents.length ? 'on-call' : 'none';
      } else if (cov && (cov.consultants.length || cov.residents.length)) {
        assigned = { consultants: cov.consultants, residents: cov.residents };
        source = 'subspecialty';
      } else {
        // Elective case with no subspecialty coverage — fall back to on-call, flag the gap.
        assigned = { consultants: onCall.consultants, residents: onCall.residents };
        source = onCall.consultants.length || onCall.residents.length ? 'on-call' : 'none';
      }

      const covered = source === 'subspecialty' || (isEmergency && source === 'on-call');
      return {
        id: s.id,
        patientName: s.patient?.name || 'Unknown',
        folderNumber: s.patient?.folderNumber || s.patient?.ptNumber || null,
        procedureName: s.procedureName,
        subspecialty: s.subspecialty,
        unit: s.unit,
        scheduledTime: s.scheduledTime,
        surgeryType: s.surgeryType,
        isEmergency,
        assigned,
        source,
        covered,
        currentAnaesthetist: s.anesthetist ? { id: s.anesthetist.id, name: s.anesthetist.fullName } : null,
      };
    });

    // Coverage gaps: elective subspecialties that have booked cases but no roster coverage.
    const gaps = Array.from(
      new Set(cases.filter((c) => !c.isEmergency && c.source !== 'subspecialty').map((c) => c.subspecialty))
    ).filter(Boolean);

    const coverageList = Array.from(coverage.values()).sort((a, b) => a.subspecialty.localeCompare(b.subspecialty));

    return NextResponse.json({
      date: start.toISOString().slice(0, 10),
      onCall,
      coverage: coverageList,
      cases,
      gaps,
      summary: {
        totalCases: cases.length,
        covered: cases.filter((c) => c.covered).length,
        uncovered: cases.filter((c) => !c.covered).length,
        onCallAssigned: onCall.consultants.length + onCall.residents.length > 0,
      },
    });
  } catch (error) {
    console.error('Anaesthetist coverage alignment failed:', error);
    return NextResponse.json({ error: 'Failed to build coverage' }, { status: 500 });
  }
}
