import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getAnaesthetistTeamsForDate, selectTeam } from '@/lib/anaesthetistTeam';
import { findByUnit } from '@/lib/unitMatch';
import { dedupeTeam } from '@/lib/theatre/teamNames';

type Contact = { name: string; phone: string | null } | null;

/** Who a unit's cases belong to today, as the card needs to show it. */
interface UnitTeam {
  theatre: string | null;
  /**
   * The unit's surgical team on today's cases: the operating surgeons and
   * supervising consultants, and the senior registrars, registrars and house
   * officers named on the booking.
   */
  surgeons: Array<{ name: string; phone: string | null; role: string }>;
  /**
   * The unit declared, on the booking, that it has no registrar / no senior
   * registrar. Kept apart from an empty list because "nobody was named" and
   * "there is nobody" are different facts, and a card that shows them the
   * same way sends somebody looking for a person who does not exist.
   */
  noRegistrar: boolean;
  noSeniorRegistrar: boolean;
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
  cleaner: Contact;
  porter: Contact;
  /**
   * How the allocation above was found: 'unit' when it names this unit,
   * 'theatre' when it names only the room this unit's list is running in.
   * The card says which, because a nurse allocated to the ROOM is a different
   * claim from a nurse allocated to YOUR LIST, and the person reading the card
   * at 7 a.m. is the one who has to know the difference.
   */
  nursingSource: 'unit' | 'theatre' | null;
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
      // Every allocation for the day, NOT only those whose surgicalUnit string
      // equals a unit name on the page.
      //
      // That filter was the bug. The allocation form sends "O/G FIRM 2" and the
      // registry — and therefore the case — says "O&G Firm 2", so `in
      // unitNames` excluded the very row it was looking for and the card
      // reported a unit with a scrub nurse allocated to it as unstaffed. A
      // theatre list is a dozen allocations; fetching all of them and matching
      // in memory costs nothing and cannot miss on spelling.
      prisma.theatreAllocation.findMany({
        where: { date: { gte: dayStart, lte: dayEnd } },
        include: {
          scrubNurse: pick,
          circulatingNurse: pick,
          anaestheticTechnician: pick,
          anaesthetistConsultant: pick,
          anaesthetistSeniorRegistrar: pick,
          anaesthetistRegistrar: pick,
          cleaner: pick,
          porter: pick,
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

    // ── The surgeons operating in this unit today ────────────────────────────
    //
    // Unlike the anaesthetist or the scrub nurse, a unit does not have ONE
    // surgeon — it has whoever is operating on each of its cases, which on a
    // four-case ENT list is often one person and sometimes three. So the card
    // lists the distinct surgeons, not "the surgeon".
    //
    // Both the operating surgeon and the supervising consultant are collected:
    // when a list runs late the consultant is frequently the person who has to
    // be reached, and their number is otherwise two screens away.
    //
    // One query for the cases, one for the people. The phone lives on the user
    // record, not on the surgery, so it has to be joined — but joined once for
    // every unit on the page rather than per unit.
    const dayCases = await prisma.surgery.findMany({
      where: { ...where, unit: { in: unitNames } },
      select: {
        id: true,
        unit: true,
        theatreId: true,
        surgeonId: true,
        surgeonName: true,
        supervisingConsultantId: true,
        supervisingConsultantName: true,
        noUnitRegistrar: true,
        noUnitSeniorRegistrar: true,
      },
    });

    // Which room each unit's list is running in, for the fallback below. The
    // commonest theatre across the unit's cases rather than the first, so one
    // case moved to another room does not redirect the whole unit's staffing.
    const theatreOfUnit = new Map<string, string>();
    {
      const tally: Record<string, Record<string, number>> = {};
      for (const s of dayCases) {
        if (!s.unit || !s.theatreId) continue;
        const forUnit = tally[s.unit] ?? (tally[s.unit] = {});
        forUnit[s.theatreId] = (forUnit[s.theatreId] ?? 0) + 1;
      }
      for (const unit of Object.keys(tally)) {
        const counts = tally[unit];
        const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        if (best) theatreOfUnit.set(unit, best);
      }
    }

    const surgeonIds = Array.from(
      new Set(
        dayCases
          .flatMap((s) => [s.surgeonId, s.supervisingConsultantId])
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const surgeonUsers = surgeonIds.length
      ? await prisma.user.findMany({
          where: { id: { in: surgeonIds } },
          select: { id: true, fullName: true, phoneNumber: true },
        })
      : [];
    const phoneOf = new Map(surgeonUsers.map((u) => [u.id, u.phoneNumber ?? null]));
    const nameOf = new Map(surgeonUsers.map((u) => [u.id, u.fullName]));

    const surgeonsByUnit = new Map<string, Array<{ name: string; phone: string | null; role: string }>>();
    for (const s of dayCases) {
      if (!s.unit) continue;
      const list = surgeonsByUnit.get(s.unit) ?? [];
      const add = (id: string | null, fallbackName: string | null, role: string) => {
        const name = (id ? nameOf.get(id) : null) ?? fallbackName;
        if (!name) return;
        // De-duplicated by name: the same surgeon on three cases is one person
        // to ring, and a card repeating them three times is a worse card.
        // Exact-match de-duplication let "Oko" and "oko" be two people, and a
        // "Dr " prefix a third. dedupeTeam below does the real collapsing;
        // this only avoids obvious repeats before it runs.
        if (list.some((x) => x.name === name)) return;
        list.push({ name, phone: id ? phoneOf.get(id) ?? null : null, role });
      };
      add(s.surgeonId, s.surgeonName, 'Surgeon');
      add(s.supervisingConsultantId, s.supervisingConsultantName, 'Consultant');
      surgeonsByUnit.set(s.unit, list);
    }

    // ── The rest of the surgical team, as named on each booking ─────────────
    //
    // These are the people a card is actually used to reach. The consultant is
    // in theatre or in clinic; the registrar and the house officer are the
    // ones who answer at seven in the morning and who know whether the patient
    // has been sent for. They were collected by the booking form all along and
    // shown nowhere.
    //
    // One query for every case on the page, not one per unit.
    const teamRows = dayCases.length
      ? await prisma.surgicalTeamMember.findMany({
          where: {
            surgeryId: { in: dayCases.map((c) => c.id) },
            role: { in: ['SENIOR_REGISTRAR', 'REGISTRAR', 'HOUSE_OFFICER'] },
          },
          select: {
            surgeryId: true, role: true, memberName: true,
            user: { select: { fullName: true, phoneNumber: true } },
          },
        })
      : [];

    /** The words the card uses, matching the anaesthesia rows above it. */
    const TEAM_ROLE_LABEL: Record<string, string> = {
      SENIOR_REGISTRAR: 'Snr registrar',
      REGISTRAR: 'Registrar',
      HOUSE_OFFICER: 'House officer',
    };

    const unitOfSurgery = new Map(dayCases.map((c) => [c.id, c.unit]));
    for (const t of teamRows) {
      const unit = unitOfSurgery.get(t.surgeryId);
      if (!unit) continue;
      // The linked account's name wins over the typed one: it is the name the
      // phone number belongs to, and a card with a name and no number is half
      // an answer.
      const name = t.user?.fullName ?? t.memberName;
      if (!name) continue;
      const list = surgeonsByUnit.get(unit) ?? [];
      if (list.some((x) => x.name === name)) continue;
      list.push({
        name,
        phone: t.user?.phoneNumber ?? null,
        role: TEAM_ROLE_LABEL[t.role] ?? t.role,
      });
      surgeonsByUnit.set(unit, list);
    }

    // Read in the order somebody works down the card when a list is late.
    const ROLE_ORDER = ['Surgeon', 'Consultant', 'Snr registrar', 'Registrar', 'House officer'];
    for (const [unit, raw] of Array.from(surgeonsByUnit.entries())) {
      // ONE PERSON, ONE LINE. The free-text fallback on the team picker means
      // the same person reaches this list once by account and once as typed
      // text, in two spellings and often two roles — and the typed one has no
      // phone number. dedupeTeam keeps whichever entry can actually be rung.
      const list = dedupeTeam(raw, ROLE_ORDER);
      list.sort((a, b) => {
        const ra = ROLE_ORDER.indexOf(a.role);
        const rb = ROLE_ORDER.indexOf(b.role);
        return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
      });
      surgeonsByUnit.set(unit, list);
    }

    // A unit's declaration holds when EVERY case on its list says so. One
    // booking claiming no registrar while three name one is not a unit
    // without a registrar — it is one booking that was filled in carelessly,
    // and the card should show the registrar rather than hide them.
    const declaredNoRegistrar = new Map<string, boolean>();
    const declaredNoSenior = new Map<string, boolean>();
    for (const unit of unitNames) {
      const cases = dayCases.filter((c) => c.unit === unit);
      declaredNoRegistrar.set(unit, cases.length > 0 && cases.every((c) => c.noUnitRegistrar));
      declaredNoSenior.set(unit, cases.length > 0 && cases.every((c) => c.noUnitSeniorRegistrar));
    }

    for (const unit of unitNames) {
      // Named on the allocation, in whichever of the hospital's three
      // spellings the person who made it happened to use.
      const byUnit = findByUnit(allocations, unit, (a) => a.surgicalUnit);

      // Otherwise the allocation for the ROOM this unit's list is running in.
      //
      // This is how the floor actually works: a unit gets a theatre for the
      // session and the scrub nurse is allocated to the theatre, frequently
      // without anybody naming the unit on the allocation at all. Those nurses
      // are on this list — reporting them as absent because a text field was
      // left blank is the same failure as the spelling mismatch, one field
      // along. Only allocations that name NO unit are eligible, so a room
      // explicitly allocated to a different unit is never borrowed from.
      const theatreId = theatreOfUnit.get(unit);
      const byTheatre = byUnit
        ? undefined
        : theatreId
          ? allocations.find((a) => a.theatreId === theatreId && !a.surgicalUnit)
          : undefined;

      const alloc = byUnit ?? byTheatre;
      const roster = rosterTeams ? selectTeam(rosterTeams, subspecialtyOf.get(unit)) : null;

      teamByUnit.set(unit, {
        theatre: alloc?.theatre?.name ?? null,
        surgeons: surgeonsByUnit.get(unit) ?? [],
        noRegistrar: declaredNoRegistrar.get(unit) ?? false,
        noSeniorRegistrar: declaredNoSenior.get(unit) ?? false,
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
        cleaner: contact(alloc?.cleaner),
        porter: contact(alloc?.porter),
        nursingSource:
          !alloc || !(alloc.scrubNurseId || alloc.circulatingNurseId)
            ? null
            : byUnit ? 'unit' : 'theatre',
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
