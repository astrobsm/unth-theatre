import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  anyoneKnown, resolveTeamLine, type NamedPerson, type TeamLine,
} from '@/lib/allocations/teamSources';

export const dynamic = 'force-dynamic';

// GET /api/allocations/team-view?unit=<surgicalUnit>&date=<yyyy-mm-dd>
// Returns the theatre allocations (and the assigned care team) for a given
// surgical unit on a given day so a surgeon can see which theatre,
// anaesthetist, anaesthetic technician and scrub nurse are assigned.
//
// IT READS THREE PLACES, NOT ONE. Reported on 6 November: "the anaesthetic
// technicians are assigned but it shows not assigned". They were. On that
// day all four theatre allocations had a scrub nurse and NONE had an
// anaesthetist or a technician, while all 23 of the day's cases named an
// anaesthetist and the published roster carried 16 technicians. The hospital
// records who is working in three places and this endpoint read one of them,
// so it said "Not assigned" about people who were on duty.
//
// Each line now carries the source it came from — see
// src/lib/allocations/teamSources.ts for why a roster name is never printed
// as though somebody had been put in that room.
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

    // ── The other two places people are recorded ──
    //
    // The day's cases, for the anaesthetist named on each, and the published
    // roster, for who is on duty at all. Both are read once for the whole
    // day and indexed, rather than queried per theatre.
    const [dayCases, rosterRows] = await Promise.all([
      prisma.surgery.findMany({
        where: {
          scheduledDate: { gte: dayStart, lt: dayEnd },
          status: { notIn: ['CANCELLED'] },
        },
        select: {
          location: true,
          theatreId: true,
          anesthetistId: true,
          anesthetist: { select: { id: true, fullName: true } },
          // A soft reference with no foreign key (see the schema note), so
          // it cannot be joined and the names are looked up below.
          theatreTechnicianId: true,
        },
        take: 300,
      }).catch(() => []),
      prisma.roster.findMany({
        where: {
          date: { gte: dayStart, lt: dayEnd },
          status: 'PUBLISHED',
          staffCategory: { in: ['ANAESTHETISTS', 'ANAESTHETIC_TECHNICIANS'] as never },
        },
        select: {
          staffCategory: true, shift: true, seniorityLevel: true,
          user: { select: { id: true, fullName: true } },
        },
        take: 200,
      }).catch(() => []),
    ]);

    // The case technician is a soft reference, so its names come from one
    // extra lookup rather than a join.
    const technicianIds = Array.from(new Set(
      dayCases.map((c) => c.theatreTechnicianId).filter((x): x is string => !!x),
    ));
    const technicianNames = new Map<string, string>();
    if (technicianIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: technicianIds } },
        select: { id: true, fullName: true },
      }).catch(() => []);
      users.forEach((u) => technicianNames.set(u.id, u.fullName));
    }

    /** Anaesthetists and technicians named on the cases in each theatre. */
    const caseStaffByTheatre = new Map<string, { anaesthetists: NamedPerson[]; technicians: NamedPerson[] }>();
    const theatreKeys = (c: { location: string | null; theatreId: string | null }) =>
      [c.theatreId ? `id:${c.theatreId}` : null, c.location ? `nm:${c.location.toLowerCase()}` : null]
        .filter(Boolean) as string[];
    for (const c of dayCases) {
      for (const key of theatreKeys(c)) {
        const bucket = caseStaffByTheatre.get(key)
          || { anaesthetists: [] as NamedPerson[], technicians: [] as NamedPerson[] };
        if (c.anesthetist?.fullName) {
          bucket.anaesthetists.push({ id: c.anesthetist.id, name: c.anesthetist.fullName });
        }
        const techName = c.theatreTechnicianId
          ? technicianNames.get(c.theatreTechnicianId)
          : undefined;
        if (techName) {
          bucket.technicians.push({ id: c.theatreTechnicianId, name: techName });
        }
        caseStaffByTheatre.set(key, bucket);
      }
    }

    /** Who is on duty, by category and shift. */
    const onDuty = (category: string, shift: string | null): NamedPerson[] =>
      rosterRows
        .filter((r) => r.staffCategory === category && (!shift || r.shift === shift))
        .map((r) => ({
          id: r.user?.id ?? null,
          name: r.user?.fullName ?? '',
          tier: r.seniorityLevel ?? null,
        }))
        .filter((p) => p.name);

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

      const fromCases = (a.theatreId && caseStaffByTheatre.get(`id:${a.theatreId}`))
        || (a.theatre?.name && caseStaffByTheatre.get(`nm:${a.theatre.name.toLowerCase()}`))
        || { anaesthetists: [] as NamedPerson[], technicians: [] as NamedPerson[] };

      const anaesthetistLine = resolveTeamLine({
        allocation: anaesthetists.map((x) => ({ id: x.id, name: x.fullName, tier: x.tier })),
        fromCases: fromCases.anaesthetists,
        onDuty: onDuty('ANAESTHETISTS', a.shift ?? null),
        shift: a.shift ?? null,
        what: 'anaesthetist',
      });
      const technicianLine = resolveTeamLine({
        allocation: a.anaestheticTechnician
          ? [{ id: a.anaestheticTechnician.id, name: a.anaestheticTechnician.fullName }]
          : [],
        fromCases: fromCases.technicians,
        onDuty: onDuty('ANAESTHETIC_TECHNICIANS', a.shift ?? null),
        shift: a.shift ?? null,
        what: 'anaesthetic technician',
      });

      return {
        id: a.id,
        theatre: a.theatre?.name || 'Unassigned',
        theatreLocation: a.theatre?.location || null,
        surgicalUnit: a.surgicalUnit || null,
        surgeryType: a.surgeryType || null,
        shift: a.shift || null,
        startTime: a.startTime as any,
        endTime: a.endTime as any,
        // Unchanged in meaning: what the ALLOCATION says, and nothing else.
        // Anything reading these fields goes on getting the same answer.
        anaesthetists,
        anaestheticTechnician: a.anaestheticTechnician?.fullName || null,
        anaestheticTechnicianId: a.anaestheticTechnician?.id || null,
        scrubNurse: a.scrubNurse?.fullName || null,
        scrubNurseId: a.scrubNurse?.id || null,
        circulatingNurse: a.circulatingNurse?.fullName || null,
        circulatingNurseId: a.circulatingNurse?.id || null,
        // New: the best thing actually known, and which of the three places
        // it came from, so the card can say so rather than say "Not
        // assigned" about sixteen people who are on duty.
        anaesthetistLine,
        technicianLine,
        notes: a.notes || null,
        teamAssigned: anyoneKnown([anaesthetistLine, technicianLine])
          || !!a.scrubNurse,
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
        // A theatre with cases but no allocation row. It still has an
        // anaesthetist on every case and a roster behind it, and saying
        // "team not yet assigned" here was the same falsehood in a
        // different place.
        const bucket = (Array.from(g.theatreIds)
          .map((id) => caseStaffByTheatre.get(`id:${id}`))
          .find(Boolean))
          || caseStaffByTheatre.get(`nm:${g.theatreName.toLowerCase()}`)
          || { anaesthetists: [] as NamedPerson[], technicians: [] as NamedPerson[] };

        const anaesthetistLine: TeamLine = resolveTeamLine({
          allocation: [],
          fromCases: bucket.anaesthetists,
          onDuty: onDuty('ANAESTHETISTS', null),
          shift: null,
          what: 'anaesthetist',
        });
        const technicianLine: TeamLine = resolveTeamLine({
          allocation: [],
          fromCases: bucket.technicians,
          onDuty: onDuty('ANAESTHETIC_TECHNICIANS', null),
          shift: null,
          what: 'anaesthetic technician',
        });

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
          anaestheticTechnicianId: null,
          scrubNurse: null,
          scrubNurseId: null,
          circulatingNurse: null,
          circulatingNurseId: null,
          anaesthetistLine,
          technicianLine,
          notes: 'No theatre allocation row for this unit on this date.',
          teamAssigned: anyoneKnown([anaesthetistLine, technicianLine]),
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
