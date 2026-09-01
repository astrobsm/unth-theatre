import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { bucketTechnicianRoster, specialtyKey } from '@/lib/technicianCoverage';

export const dynamic = 'force-dynamic';

type Tech = { userId: string; name: string; phone: string | null; seniority: string | null };
const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

// GET /api/roster/technician-coverage?date=YYYY-MM-DD
//
// Anaesthetic technicians are rostered to a SURGICAL SPECIALTY — Neurosurgery,
// Orthopaedics and so on — or to day call, night call or ICU. This aligns each
// booked surgery to the technician covering its specialty.
//
// It used to align on THEATRE, which the booking seldom states: the theatre was
// derived from the surgery's own theatre, else the surgical unit's
// theatre-for-that-weekday, else the free-text location. The specialty is on the
// booking itself, so the match is against something a person actually entered.
// The theatre is still resolved and returned, because it is worth SEEING on the
// board — it is just no longer what coverage is decided by.
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
          theatreTechnicianId: true, scheduledTime: true, surgeryType: true,
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

    // Resolve currently-assigned technicians (soft ref) to names.
    const assignedIds = Array.from(new Set(surgeries.map((s) => s.theatreTechnicianId).filter((x): x is string => !!x)));
    const assignedUsers = assignedIds.length
      ? await prisma.user.findMany({ where: { id: { in: assignedIds } }, select: { id: true, fullName: true } })
      : [];
    const userNameById = new Map(assignedUsers.map((u) => [u.id, u.fullName]));

    // Bucketing lives in @/lib/technicianCoverage, shared with the gap alert so
    // the board and the alert cannot disagree about whether a day is covered.
    const { bySpecialty, dayCall, nightCall, icu } = bucketTechnicianRoster<Tech>(
      rosterRows,
      (r) => {
        const row = r as (typeof rosterRows)[number];
        return {
          userId: row.userId,
          name: row.user?.fullName || row.staffName || 'Unknown',
          phone: row.user?.phoneNumber || null,
          seniority: row.seniorityLevel || null,
        };
      },
    );

    // Still shown on the board — a coordinator wants to know WHERE the case is,
    // even though the technician is now matched by specialty.
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

      // The booking's own specialty. Falls back to the unit when the specialty
      // field is blank, because a unit name like "Neuro Unit III" still resolves
      // to Neurosurgery through specialtyKey.
      const key = specialtyKey(s.subspecialty) ?? specialtyKey(s.unit);
      const match = key ? bySpecialty.get(key) : undefined;

      let assigned: Tech[];
      let source: 'specialty' | 'call' | 'none';
      if (isEmergency) {
        const [hh] = (s.scheduledTime || '08:00').split(':').map((n) => parseInt(n, 10));
        const daytime = !Number.isNaN(hh) && hh >= 8 && hh < 18;
        assigned = daytime ? dayCall : nightCall;
        source = assigned.length ? 'call' : 'none';
      } else if (match && match.technicians.length) {
        assigned = match.technicians;
        source = 'specialty';
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
        covered: source === 'specialty' || (isEmergency && source === 'call'),
        currentTechnician: s.theatreTechnicianId
          ? { id: s.theatreTechnicianId, name: userNameById.get(s.theatreTechnicianId) || 'Assigned' }
          : null,
      };
    });

    // Specialties that have booked cases but no technician covering them. Named
    // by how the booking spells it, so the coordinator can go and find it.
    const gaps = Array.from(
      new Set(
        cases
          .filter((c) => !c.isEmergency && c.source !== 'specialty')
          .map((c) => c.subspecialty || c.unit)
          .filter((x): x is string => !!x && x.trim() !== ''),
      ),
    );

    const coverageBySpecialty = Array.from(bySpecialty.values())
      .sort((a, b) => a.specialty.localeCompare(b.specialty));

    return NextResponse.json({
      date: start.toISOString().slice(0, 10),
      dayCall, nightCall, icu,
      coverageBySpecialty,
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
