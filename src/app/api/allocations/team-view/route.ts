import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/allocations/team-view?unit=<surgicalUnit>&date=<yyyy-mm-dd>
// Returns the theatre allocations (and the assigned care team) for a given
// surgical unit on a given day so a surgeon can see which theatre,
// anaesthetist, anaesthetic technician and scrub nurse are assigned.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const unit = searchParams.get('unit')?.trim();
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'A date is required' }, { status: 400 });
    }

    const dayStart = new Date(`${date}T00:00:00.000`);
    if (Number.isNaN(dayStart.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const staffSelect = { select: { id: true, fullName: true, role: true } };

    // All theatre allocations for the day (with their assigned staff).
    const allocations = await prisma.theatreAllocation.findMany({
      where: { date: { gte: dayStart, lt: dayEnd } },
      include: {
        theatre: { select: { id: true, name: true, location: true } },
        scrubNurse: staffSelect,
        circulatingNurse: staffSelect,
        anaestheticTechnician: staffSelect,
        anaesthetistConsultant: staffSelect,
        anaesthetistSeniorRegistrar: staffSelect,
        anaesthetistRegistrar: staffSelect,
      },
      orderBy: [{ startTime: 'asc' }],
    });

    const mapAllocation = (
      a: (typeof allocations)[number],
      extra?: { surgeons?: string | null; caseCount?: number | null }
    ) => {
      const anaesthetists = [
        a.anaesthetistConsultant && { ...a.anaesthetistConsultant, tier: 'Consultant' },
        a.anaesthetistSeniorRegistrar && { ...a.anaesthetistSeniorRegistrar, tier: 'Senior Registrar' },
        a.anaesthetistRegistrar && { ...a.anaesthetistRegistrar, tier: 'Registrar' },
      ].filter(Boolean) as Array<{ id: string; fullName: string; role: string; tier: string }>;

      return {
        id: a.id,
        theatre: a.theatre?.name || 'Unassigned',
        theatreLocation: a.theatre?.location || null,
        surgicalUnit: a.surgicalUnit || null,
        surgeryType: a.surgeryType || null,
        shift: a.shift || null,
        startTime: a.startTime as any,
        endTime: a.endTime as any,
        anaesthetists,
        anaestheticTechnician: a.anaestheticTechnician?.fullName || null,
        scrubNurse: a.scrubNurse?.fullName || null,
        circulatingNurse: a.circulatingNurse?.fullName || null,
        notes: a.notes || null,
        teamAssigned: anaesthetists.length > 0 || !!a.anaestheticTechnician || !!a.scrubNurse,
        surgeons: extra?.surgeons ?? null,
        caseCount: extra?.caseCount ?? null,
      };
    };

    // ── No unit selected: show every theatre allocation for the day ──
    if (!unit) {
      const all = allocations.map((a) => mapAllocation(a));
      return NextResponse.json({ date, unit: null, count: all.length, allocations: all });
    }

    // ── Unit selected: drive from the unit's booked cases for the day ──
    const surgeries = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: dayStart, lt: dayEnd },
        unit: { equals: unit, mode: 'insensitive' },
      },
      select: {
        id: true,
        location: true,
        theatreId: true,
        surgeonName: true,
        surgeon: { select: { fullName: true } },
      },
    });

    // Index allocations by theatre id and by (lowercased) theatre name.
    const allocByTheatreId = new Map<string, (typeof allocations)[number][]>();
    const allocByName = new Map<string, (typeof allocations)[number][]>();
    for (const a of allocations) {
      if (a.theatreId) {
        const list = allocByTheatreId.get(a.theatreId) || [];
        list.push(a);
        allocByTheatreId.set(a.theatreId, list);
      }
      const nm = a.theatre?.name?.toLowerCase();
      if (nm) {
        const list = allocByName.get(nm) || [];
        list.push(a);
        allocByName.set(nm, list);
      }
    }

    // Group the unit's surgeries by their theatre (display name).
    interface TheatreGroup {
      theatreName: string;
      theatreIds: Set<string>;
      surgeons: Set<string>;
      caseCount: number;
    }
    const groups = new Map<string, TheatreGroup>();
    for (const s of surgeries) {
      const name = s.location || 'Unassigned theatre';
      const key = name.toLowerCase();
      if (!groups.has(key)) {
        groups.set(key, { theatreName: name, theatreIds: new Set(), surgeons: new Set(), caseCount: 0 });
      }
      const g = groups.get(key)!;
      g.caseCount += 1;
      if (s.theatreId) g.theatreIds.add(s.theatreId);
      const surgeon = s.surgeonName || s.surgeon?.fullName;
      if (surgeon) g.surgeons.add(surgeon);
    }

    const result: ReturnType<typeof mapAllocation>[] = [];
    const usedAllocationIds = new Set<string>();

    for (const g of Array.from(groups.values())) {
      const surgeonsStr = Array.from(g.surgeons).join(', ') || null;
      const matched: (typeof allocations)[number][] = [];
      for (const id of Array.from(g.theatreIds)) {
        for (const a of allocByTheatreId.get(id) || []) matched.push(a);
      }
      for (const a of allocByName.get(g.theatreName.toLowerCase()) || []) matched.push(a);
      const uniqueMatched = matched.filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i);

      if (uniqueMatched.length) {
        for (const a of uniqueMatched) {
          usedAllocationIds.add(a.id);
          result.push(mapAllocation(a, { surgeons: surgeonsStr, caseCount: g.caseCount }));
        }
      } else {
        result.push({
          id: `surg-${g.theatreName}`,
          theatre: g.theatreName,
          theatreLocation: null,
          surgicalUnit: unit,
          surgeryType: null,
          shift: null,
          startTime: dayStart.toISOString() as any,
          endTime: dayStart.toISOString() as any,
          anaesthetists: [],
          anaestheticTechnician: null,
          scrubNurse: null,
          circulatingNurse: null,
          notes: 'No theatre allocation/roster found for this unit on this date — team not yet assigned.',
          teamAssigned: false,
          surgeons: surgeonsStr,
          caseCount: g.caseCount,
        });
      }
    }

    // Also include allocations explicitly tagged with this unit not already shown.
    for (const a of allocations) {
      if (usedAllocationIds.has(a.id)) continue;
      if ((a.surgicalUnit || '').toLowerCase() === unit.toLowerCase()) {
        result.push(mapAllocation(a));
      }
    }

    return NextResponse.json({ date, unit, count: result.length, allocations: result });
  } catch (error) {
    console.error('Team-view allocation error:', error);
    return NextResponse.json({ error: 'Failed to load theatre team' }, { status: 500 });
  }
}
