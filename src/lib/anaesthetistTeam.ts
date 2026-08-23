/**
 * Who is anaesthetising for a surgical specialty on a given day.
 *
 * The anaesthetists' published roster records, per person per day, the surgical
 * subspecialty they cover (Roster.subRole) and their grade
 * (Roster.seniorityLevel). This turns that into the team a booking or the
 * readiness board actually wants: a consultant, a senior registrar and a
 * registrar for one specialty.
 *
 * Shared rather than reimplemented per call site — the booking form, the
 * readiness board and /api/roster/anaesthetist-coverage all have to agree about
 * who is covering CTU today, and three copies of this would not stay in step.
 *
 * Only PUBLISHED rows count. A draft roster is somebody's work in progress.
 */

import prisma from '@/lib/prisma';

export type AnaesthetistContact = {
  userId: string;
  name: string;
  phone: string | null;
  seniority: string | null;
  role: string | null;
};

export type AnaesthetistTeam = {
  /** The specialty this team was resolved for, as spelled on the roster. */
  subspecialty: string | null;
  consultant: AnaesthetistContact | null;
  seniorRegistrar: AnaesthetistContact | null;
  registrar: AnaesthetistContact | null;
  /** Everyone rostered to the specialty, including extras beyond the three grades. */
  members: AnaesthetistContact[];
  /**
   * 'subspecialty' — rostered to this specialty for the day.
   * 'on-call'      — nobody was; these are the day's on-call cover instead.
   * 'none'         — nobody rostered and nobody on call.
   */
  source: 'subspecialty' | 'on-call' | 'none';
};

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

const isConsultant = (seniority: string | null | undefined, role: string | null | undefined) =>
  norm(seniority) === 'consultant' || role === 'CONSULTANT_ANAESTHETIST';

// Mirrors isOnCallRow in /api/roster/anaesthetist-coverage: a CALL shift, or an
// assignment that names itself as emergency/on-call cover.
const isOnCallRow = (shift: string, subRole: string | null | undefined) =>
  shift === 'CALL' || /all\s*emerg|on[\s-]*call/i.test(subRole || '');

const emptyTeam = (subspecialty: string | null): AnaesthetistTeam => ({
  subspecialty,
  consultant: null,
  seniorRegistrar: null,
  registrar: null,
  members: [],
  source: 'none',
});

function dayBounds(date: Date) {
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end = new Date(date); end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * A booking carries a unit NAME ("CTU 1"); the roster carries a SUBSPECIALTY
 * ("Cardiothoracic Surgery"). surgical_units is the only thing that knows they
 * are the same thing, so translate through it.
 */
export async function subspecialtyForUnit(unitName: string | null | undefined): Promise<string | null> {
  const name = (unitName || '').trim();
  if (!name) return null;
  const unit = await prisma.surgicalUnit.findFirst({
    where: { name },
    select: { subspecialty: true },
  });
  if (unit?.subspecialty) return unit.subspecialty;
  // The booking may already hold a subspecialty rather than a unit name.
  const asSubspecialty = await prisma.surgicalUnit.findFirst({
    where: { subspecialty: name },
    select: { subspecialty: true },
  });
  return asSubspecialty?.subspecialty ?? null;
}

/** Slot the day's rows for one specialty into consultant / SR / registrar. */
function buildTeam(
  subspecialty: string | null,
  rows: Array<{ contact: AnaesthetistContact; consultant: boolean }>,
  source: AnaesthetistTeam['source'],
): AnaesthetistTeam {
  const team = emptyTeam(subspecialty);
  team.source = source;
  for (const { contact, consultant } of rows) {
    if (team.members.some((m) => m.userId === contact.userId)) continue;
    team.members.push(contact);
    const grade = norm(contact.seniority);
    if (consultant && !team.consultant) team.consultant = contact;
    else if (grade === 'senior_registrar' && !team.seniorRegistrar) team.seniorRegistrar = contact;
    else if (grade === 'registrar' && !team.registrar) team.registrar = contact;
  }
  return team;
}

type RosterRow = {
  userId: string;
  staffName: string;
  shift: string;
  subRole: string | null;
  seniorityLevel: string | null;
  user: { id: string; fullName: string; phoneNumber: string | null; role: string } | null;
};

const contactOf = (r: RosterRow): AnaesthetistContact => ({
  userId: r.userId,
  name: r.user?.fullName || r.staffName || 'Unknown',
  phone: r.user?.phoneNumber || null,
  seniority: r.seniorityLevel || null,
  role: r.user?.role || null,
});

async function publishedAnaesthetistRows(date: Date): Promise<RosterRow[]> {
  const { start, end } = dayBounds(date);
  return prisma.roster.findMany({
    where: {
      staffCategory: 'ANAESTHETISTS' as any,
      date: { gte: start, lte: end },
      status: 'PUBLISHED',
    },
    select: {
      userId: true, staffName: true, shift: true, subRole: true, seniorityLevel: true,
      user: { select: { id: true, fullName: true, phoneNumber: true, role: true } },
    },
  }) as unknown as Promise<RosterRow[]>;
}

/**
 * Every specialty's team for one day, plus the on-call cover, in ONE query.
 *
 * The readiness board renders every theatre at once; resolving each room
 * separately would be a query per room against the same set of roster rows.
 */
export async function getAnaesthetistTeamsForDate(date: Date): Promise<{
  bySubspecialty: Map<string, AnaesthetistTeam>;
  onCall: AnaesthetistTeam;
}> {
  const rows = await publishedAnaesthetistRows(date);

  const onCallRows: Array<{ contact: AnaesthetistContact; consultant: boolean }> = [];
  const grouped = new Map<string, { label: string; rows: Array<{ contact: AnaesthetistContact; consultant: boolean }> }>();

  for (const r of rows) {
    const entry = { contact: contactOf(r), consultant: isConsultant(r.seniorityLevel, r.user?.role) };
    if (isOnCallRow(r.shift, r.subRole)) { onCallRows.push(entry); continue; }
    const sub = (r.subRole || '').trim();
    if (!sub) continue;
    const key = norm(sub);
    const bucket = grouped.get(key) || { label: sub, rows: [] };
    bucket.rows.push(entry);
    grouped.set(key, bucket);
  }

  // forEach rather than for..of: the project targets an older lib without
  // downlevelIteration, so iterating a Map directly does not compile.
  const bySubspecialty = new Map<string, AnaesthetistTeam>();
  grouped.forEach((bucket, key) => {
    bySubspecialty.set(key, buildTeam(bucket.label, bucket.rows, 'subspecialty'));
  });

  const onCall = onCallRows.length
    ? buildTeam(null, onCallRows, 'on-call')
    : emptyTeam(null);

  return { bySubspecialty, onCall };
}

/**
 * Pick one specialty's team out of a day's resolved teams, falling back to the
 * on-call cover. The fallback is deliberate: an elective list with nobody
 * rostered to it still has to be anaesthetised by somebody, and `source` tells
 * the caller which case it is so the gap can be shown rather than hidden.
 */
export function selectTeam(
  teams: { bySubspecialty: Map<string, AnaesthetistTeam>; onCall: AnaesthetistTeam },
  subspecialty: string | null | undefined,
): AnaesthetistTeam {
  const key = norm(subspecialty);
  const exact = key ? teams.bySubspecialty.get(key) : undefined;
  if (exact) return exact;
  if (teams.onCall.members.length) return { ...teams.onCall, subspecialty: subspecialty ?? null };
  return emptyTeam(subspecialty ?? null);
}

/**
 * The day's on-call anaesthetists — the team an EMERGENCY goes to.
 *
 * An emergency has no elective list and no rostered specialty, so specialty
 * cover is the wrong question for it: the roster's on-call entry is the answer.
 * Those are the rows on a CALL shift, or whose assignment names itself as
 * emergency cover.
 */
export async function getOnCallAnaesthetistTeam(date: Date): Promise<AnaesthetistTeam> {
  const { onCall } = await getAnaesthetistTeamsForDate(date);
  return onCall;
}

/**
 * The anaesthetist team for one specialty on one day. `unit` is accepted as an
 * alternative to `subspecialty` and translated through surgical_units.
 */
export async function getAnaesthetistTeam(opts: {
  date: Date;
  subspecialty?: string | null;
  unit?: string | null;
}): Promise<AnaesthetistTeam> {
  let subspecialty = (opts.subspecialty || '').trim() || null;
  if (!subspecialty && opts.unit) subspecialty = await subspecialtyForUnit(opts.unit);
  // A unit name given as `subspecialty` still resolves — bookings are not
  // consistent about which they send.
  if (subspecialty) subspecialty = (await subspecialtyForUnit(subspecialty)) ?? subspecialty;

  const teams = await getAnaesthetistTeamsForDate(opts.date);
  return selectTeam(teams, subspecialty);
}
