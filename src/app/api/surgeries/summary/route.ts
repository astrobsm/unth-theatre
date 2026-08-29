import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getAnaesthetistTeamsForDate, selectTeam } from '@/lib/anaesthetistTeam';

type Contact = { name: string; phone: string | null } | null;

/** Who a unit's cases belong to today, as the card needs to show it. */
interface UnitTeam {
  theatre: string | null;
  anaesthetists: {
    consultant: Contact;
    seniorRegistrar: Contact;
    registrar: Contact;
    /** allocated | subspecialty | on-call | none — the card says which. */
    source: string;
  };
  scrubNurse: Contact;
  circulatingNurse: Contact;
  anaestheticTechnician: Contact;
}

export const dynamic = 'force-dynamic';

/**
 * GET /api/surgeries/summary?date=YYYY-MM-DD
 *
 * How many cases each surgical unit has, and nothing else — no patients, no
 * procedures, no consent scans. It exists so the surgery page can draw a card
 * per unit without loading a single case.
 *
 * The page used to fetch every surgery and group them in the browser, which
 * meant downloading the entire theatre list to find out that Neurosurgery has
 * four cases. This answers that question with a GROUP BY and a few hundred
 * bytes; the cases themselves arrive only when somebody opens a unit.
 *
 * Counts come from the database rather than from a fetched list on purpose: a
 * count computed by counting things you already downloaded is not a saving.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dateStr = req.nextUrl.searchParams.get('date');
  const where: Record<string, unknown> = {};

  if (dateStr) {
    const base = new Date(dateStr);
    if (Number.isNaN(base.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }
    const start = new Date(base); start.setHours(0, 0, 0, 0);
    const end = new Date(base); end.setHours(23, 59, 59, 999);
    where.scheduledDate = { gte: start, lte: end };
  }

  const [byUnit, byStatus, total] = await Promise.all([
    prisma.surgery.groupBy({
      by: ['unit'],
      where,
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.surgery.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    }),
    prisma.surgery.count({ where }),
  ]);

  // A second pass for the counts that decide whether a card needs attention.
  // Grouped in one query rather than one query per unit, which is the shape
  // this endpoint exists to avoid.
  const urgent = await prisma.surgery.groupBy({
    by: ['unit'],
    where: { ...where, surgeryType: 'EMERGENCY' },
    _count: { _all: true },
  });
  const urgentByUnit = new Map(urgent.map((u) => [u.unit, u._count._all]));

  const scheduled = await prisma.surgery.groupBy({
    by: ['unit'],
    where: { ...where, status: 'SCHEDULED' },
    _count: { _all: true },
  });
  const scheduledByUnit = new Map(scheduled.map((u) => [u.unit, u._count._all]));


  // ── Who is on each unit today ────────────────────────────────────────────
  //
  // The cards used to say only how many cases a unit had, which answered the
  // wrong question: standing in a corridor, what you need is the name and the
  // number of the person you have to reach.
  //
  // Two sources, in this order.
  //
  // TheatreAllocation is the day's actual assignment for a unit — scrub nurse,
  // circulating nurse, technician and all three anaesthetist grades — so it is
  // taken first wherever it exists.
  //
  // The published anaesthetist roster fills the anaesthetists back in when an
  // allocation has not been made, which is most days: the roster names a
  // consultant, senior registrar and registrar per SURGICAL SPECIALTY, and that
  // is a real answer rather than a blank.
  //
  // Both are fetched ONCE for the whole date and matched in memory. A query per
  // unit is exactly what this endpoint exists to avoid.
  const unitNames = byUnit.map((u) => u.unit).filter(Boolean) as string[];
  const teamByUnit = new Map<string, UnitTeam>();

  if (dateStr && unitNames.length) {
    const base = new Date(dateStr);
    const dayStart = new Date(base); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(base); dayEnd.setHours(23, 59, 59, 999);

    const contact = (u: { id: string; fullName: string; phoneNumber: string | null } | null | undefined) =>
      u ? { name: u.fullName, phone: u.phoneNumber ?? null } : null;

    const pick = { select: { id: true, fullName: true, phoneNumber: true } };

    const [allocations, rosterTeams] = await Promise.all([
      prisma.theatreAllocation.findMany({
        where: { date: { gte: dayStart, lte: dayEnd }, surgicalUnit: { in: unitNames } },
        include: {
          scrubNurse: pick,
          circulatingNurse: pick,
          anaestheticTechnician: pick,
          anaesthetistConsultant: pick,
          anaesthetistSeniorRegistrar: pick,
          anaesthetistRegistrar: pick,
          theatre: { select: { name: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      getAnaesthetistTeamsForDate(dayStart).catch(() => null),
    ]);

    // Unit -> subspecialty, resolved once for every unit on the list rather
    // than one lookup at a time.
    const units = await prisma.surgicalUnit.findMany({
      where: { name: { in: unitNames } },
      select: { name: true, subspecialty: true },
    });
    const subspecialtyOf = new Map(units.map((u) => [u.name, u.subspecialty]));

    for (const unit of unitNames) {
      const alloc = allocations.find((a) => a.surgicalUnit === unit);
      const roster = rosterTeams ? selectTeam(rosterTeams, subspecialtyOf.get(unit)) : null;

      teamByUnit.set(unit, {
        theatre: alloc?.theatre?.name ?? null,
        anaesthetists: {
          consultant:
            contact(alloc?.anaesthetistConsultant) ??
            (roster?.consultant ? { name: roster.consultant.name, phone: roster.consultant.phone } : null),
          seniorRegistrar:
            contact(alloc?.anaesthetistSeniorRegistrar) ??
            (roster?.seniorRegistrar ? { name: roster.seniorRegistrar.name, phone: roster.seniorRegistrar.phone } : null),
          registrar:
            contact(alloc?.anaesthetistRegistrar) ??
            (roster?.registrar ? { name: roster.registrar.name, phone: roster.registrar.phone } : null),
          // 'subspecialty' means somebody is rostered to this unit's specialty.
          // 'on-call' means nobody is and this is the call team standing in —
          // the card must be able to say so rather than showing a bare name.
          source: alloc?.anaesthetistConsultantId ? 'allocated' : roster?.source ?? 'none',
        },
        scrubNurse: contact(alloc?.scrubNurse),
        circulatingNurse: contact(alloc?.circulatingNurse),
        anaestheticTechnician: contact(alloc?.anaestheticTechnician),
      });
    }
  }
  return NextResponse.json({
    date: dateStr ?? null,
    total,
    units: byUnit.map((u) => ({
      unit: u.unit,
      cases: u._count._all,
      scheduled: scheduledByUnit.get(u.unit) ?? 0,
      emergencies: urgentByUnit.get(u.unit) ?? 0,
      team: u.unit ? teamByUnit.get(u.unit) ?? null : null,
    })),
    statuses: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
  });
}
