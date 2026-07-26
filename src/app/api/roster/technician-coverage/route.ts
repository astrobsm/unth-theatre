import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type Tech = { userId: string; name: string; phone: string | null; seniority: string | null };
const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

// GET /api/roster/technician-coverage?date=YYYY-MM-DD
// Anaesthetic technicians are assigned to a THEATRE (or day/night call cover or
// ICU). This aligns each booked surgery to the technician on its theatre — the
// theatre comes from the surgery's own theatre, else the surgical unit's
// theatre-for-that-weekday (SurgicalUnitSchedule), else its location.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dateStr = request.nextUrl.searchParams.get('date');
    const base = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(base.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    const start = new Date(base); start.setHours(0, 0, 0, 0);
    const end = new Date(base); end.setHours(23, 59, 59, 999);
    const dow = start.getDay(); // 0=Sun..6=Sat, matches SurgicalUnitSchedule.dayOfWeek

    const [rosterRows, surgeries, theatres, units, schedules] = await Promise.all([
      prisma.roster.findMany({
        where: { staffCategory: 'ANAESTHETIC_TECHNICIANS' as any, date: { gte: start, lte: end }, status: 'PUBLISHED' },
        include: { user: { select: { id: true, fullName: true, phoneNumber: true } } },
      }),
      prisma.surgery.findMany({
        where: { scheduledDate: { gte: start, lte: end } },
        select: {
          id: true, procedureName: true, subspecialty: true, unit: true, location: true, theatreId: true,
          scheduledTime: true, surgeryType: true,
          patient: { select: { name: true, folderNumber: true, ptNumber: true } },
        },
        orderBy: { scheduledTime: 'asc' },
      }),
      prisma.theatreSuite.findMany({ select: { id: true, name: true } }),
      prisma.surgicalUnit.findMany({ select: { id: true, name: true } }),
      prisma.surgicalUnitSchedule.findMany({ where: { dayOfWeek: dow }, select: { unitId: true, theatreName: true } }),
    ]);

    const theatreById = new Map(theatres.map((t) => [t.id, t.name]));
    const unitIdByName = new Map(units.map((u) => [norm(u.name), u.id]));
    const theatreByUnitId = new Map(schedules.map((s) => [s.unitId, s.theatreName]));

    const techOf = (r: (typeof rosterRows)[number]): Tech => ({
      userId: r.userId,
      name: r.user?.fullName || r.staffName || 'Unknown',
      phone: r.user?.phoneNumber || null,
      seniority: r.seniorityLevel || null,
    });

    const dayCall: Tech[] = [];
    const nightCall: Tech[] = [];
    const icu: Tech[] = [];
    const byTheatre = new Map<string, { theatre: string; technicians: Tech[] }>();

    for (const r of rosterRows) {
      const t = techOf(r);
      const sub = (r.subRole || '').trim();
      if (/night\s*call/i.test(sub)) { nightCall.push(t); continue; }
      if (/day\s*call/i.test(sub)) { dayCall.push(t); continue; }
      if (/\bicu\b/i.test(sub)) { icu.push(t); continue; }
      if (sub) {
        const key = norm(sub);
        const bucket = byTheatre.get(key) || { theatre: sub, technicians: [] };
        if (!bucket.technicians.some((x) => x.userId === t.userId)) bucket.technicians.push(t);
        byTheatre.set(key, bucket);
        continue;
      }
      // No explicit assignment — fall back to the shift.
      if (r.shift === 'NIGHT') nightCall.push(t);
      else if (r.shift === 'CALL') dayCall.push(t);
    }

    const resolveTheatre = (s: (typeof surgeries)[number]): string | null => {
      if (s.theatreId && theatreById.has(s.theatreId)) return theatreById.get(s.theatreId)!;
      if (s.unit) {
        const uid = unitIdByName.get(norm(s.unit));
        if (uid && theatreByUnitId.has(uid)) return theatreByUnitId.get(uid)!;
      }
      return s.location || null;
    };

    const cases = surgeries.map((s) => {
      const isEmergency = s.surgeryType === 'EMERGENCY';
      const theatre = resolveTheatre(s);
      const match = theatre ? byTheatre.get(norm(theatre)) : undefined;

      let assigned: Tech[];
      let source: 'theatre' | 'call' | 'none';
      if (isEmergency) {
        const [hh] = (s.scheduledTime || '08:00').split(':').map((n) => parseInt(n, 10));
        const daytime = !Number.isNaN(hh) && hh >= 8 && hh < 18;
        assigned = daytime ? dayCall : nightCall;
        source = assigned.length ? 'call' : 'none';
      } else if (match && match.technicians.length) {
        assigned = match.technicians;
        source = 'theatre';
      } else {
        assigned = [];
        source = 'none';
      }

      return {
        id: s.id,
        patientName: s.patient?.name || 'Unknown',
        folderNumber: s.patient?.folderNumber || s.patient?.ptNumber || null,
        procedureName: s.procedureName,
        subspecialty: s.subspecialty,
        unit: s.unit,
        theatre: theatre || '—',
        scheduledTime: s.scheduledTime,
        surgeryType: s.surgeryType,
        isEmergency,
        assigned,
        source,
        covered: source === 'theatre' || (isEmergency && source === 'call'),
      };
    });

    // Theatres that have booked cases but no technician assigned.
    const gaps = Array.from(
      new Set(cases.filter((c) => !c.isEmergency && c.source !== 'theatre' && c.theatre !== '—').map((c) => c.theatre))
    );

    const coverageByTheatre = Array.from(byTheatre.values()).sort((a, b) => a.theatre.localeCompare(b.theatre));

    return NextResponse.json({
      date: start.toISOString().slice(0, 10),
      dayCall, nightCall, icu,
      coverageByTheatre,
      cases,
      gaps,
      summary: {
        totalCases: cases.length,
        covered: cases.filter((c) => c.covered).length,
        uncovered: cases.filter((c) => !c.covered).length,
      },
    });
  } catch (error) {
    console.error('Technician coverage alignment failed:', error);
    return NextResponse.json({ error: 'Failed to build coverage' }, { status: 500 });
  }
}
