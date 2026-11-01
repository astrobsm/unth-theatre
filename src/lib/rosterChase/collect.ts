// ============================================================
// Where each department stands on its roster, and who to write to
// ------------------------------------------------------------
// WHO IS THE HEAD OF DEPARTMENT HERE? Whoever has been assigned as the
// department's roster supervisor, and only then the people whose role allows
// them to manage it. The assignment exists precisely so this question has an
// answer, and a chase sent to a role rather than a person is a chase four
// people each assume is for one of the others.
//
// THE GLOBAL ADMINISTRATORS ARE NEVER RECIPIENTS. Every department's
// managerRoles list begins with ROSTER_ADMIN_ROLES, because an administrator
// may edit any roster. Writing to them about the porters' roster would send
// the theatre manager a letter about a duty that is not theirs, twelve times a
// month, which is how a chase becomes noise.
// ============================================================

import prisma from '@/lib/prisma';
import { ROSTER_DEPARTMENTS, ROSTER_ADMIN_ROLES } from '@/lib/rosterDepartments';
import {
  assessRoster, monthPeriod, watToday, dueDay, daysBetween,
  type RosterAssessment, type RosterPeriod, type PublicationFact,
} from './overdue';

/**
 * The role that is actually the head of a roster department, where one exists.
 *
 * Kept here rather than in ROSTER_DEPARTMENTS because that file answers a
 * different question — who may EDIT a department's roster — and the two
 * answers are not the same. Pharmacy's managerRoles is `PHARMACIST`, which is
 * correct for editing and wrong for a letter: there are ten pharmacists, and
 * writing to all of them about the roster is how four people each conclude the
 * message was meant for one of the others.
 */
const HEAD_ROLE_BY_DEPT: Record<string, string[]> = {
  anaesthetists: ['HEAD_OF_ANAESTHESIA'],
  'nurse-anaesthetists': ['HEAD_OF_ANAESTHESIA'],
  'anaesthetic-technicians': ['HEAD_OF_ANAESTHESIA'],
  pharmacy: ['HEAD_OF_PHARMACY'],
  'electrical-technicians': ['WORKS_SUPERVISOR'],
};

/**
 * How many stand-ins a role fallback may name before it is not a recipient
 * list any more.
 *
 * Two: a department whose roster is genuinely shared between two people is
 * real. Ten is not a head of department, it is a cadre, and the honest answer
 * in that case is that nobody has been made responsible — which the board says
 * instead of guessing.
 */
const MAX_STAND_INS = 2;

/** Who we would write to, and how we worked out that it was them. */
export interface RosterRecipient {
  id: string;
  fullName: string;
  role: string | null;
  hasPhone: boolean;
  active: boolean;
  /** SUPERVISOR: assigned to this department. ROLE: holds a managing role. */
  source: 'SUPERVISOR' | 'ROLE';
}

export interface DeptStanding {
  slug: string;
  label: string;
  category: string;
  assessment: RosterAssessment;
  recipients: RosterRecipient[];
  /**
   * How many of the three preceding months had no publication in by their own
   * deadline.
   *
   * Computed from publications alone, which is why it is named as a count of
   * months rather than presented as a verdict: a department whose rows were
   * published before this machinery existed would show here, and the letter
   * only ever uses it to say "a pattern usually means something structural".
   */
  priorLateMonths: number;
  /** Set when there is nobody at all to write to. */
  nobodyToWriteTo: boolean;
  /**
   * How many people could have managed this roster when that list was too
   * long to be a recipient list. Non-zero means "nobody is responsible, and
   * here is how many could be" — which is what the board asks to be fixed.
   */
  candidateCount: number;
}

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/** The month before `month` ("2026-11" -> "2026-10"). */
export function previousMonth(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const t = new Date(Date.UTC(y, mo - 2, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Every department's standing for one month.
 *
 * Four queries for the whole hospital, whatever the number of departments:
 * publications, row counts, supervisors and the users who could stand in for
 * one. A per-department loop of queries would be twelve round trips to answer
 * one screen.
 */
export async function collectRosterStandings(month: string, today?: string): Promise<{
  period: RosterPeriod;
  departments: DeptStanding[];
} | null> {
  const period = monthPeriod(month);
  if (!period) return null;

  const now = today ?? watToday();
  const slugs = ROSTER_DEPARTMENTS.map((d) => d.slug);
  const categories = ROSTER_DEPARTMENTS.map((d) => d.category);

  // Publications whose period OVERLAPS the month, not whose periodStart is in
  // it: a fortnightly roster published for the 28th of one month to the 10th
  // of the next is a real submission for both, and an equality test on
  // periodStart would report the second month as empty.
  const windowStart = new Date(`${previousMonth(month)}-01T00:00:00.000Z`);
  const periodEnd = new Date(`${period.end}T23:59:59.999Z`);

  const [pubs, draftRows, publishedRows, supervisors] = await Promise.all([
    prisma.rosterPublication.findMany({
      where: {
        department: { in: slugs },
        status: 'PUBLISHED',
        periodStart: { lte: periodEnd },
        periodEnd: { gte: windowStart },
      },
      select: {
        department: true, periodStart: true, periodEnd: true, version: true,
        publishedAt: true, publishedByName: true, rowCount: true,
      },
    }),
    prisma.roster.groupBy({
      by: ['staffCategory'],
      where: {
        staffCategory: { in: categories as never },
        status: 'DRAFT',
        date: { gte: new Date(`${period.start}T00:00:00.000Z`), lte: periodEnd },
      },
      _count: { _all: true },
    }),
    prisma.roster.groupBy({
      by: ['staffCategory'],
      where: {
        staffCategory: { in: categories as never },
        status: 'PUBLISHED',
        date: { gte: new Date(`${period.start}T00:00:00.000Z`), lte: periodEnd },
      },
      _count: { _all: true },
    }),
    prisma.rosterSupervisor.findMany({
      where: { deptSlug: { in: slugs } },
      select: {
        deptSlug: true,
        user: {
          select: { id: true, fullName: true, role: true, phoneNumber: true, status: true },
        },
      },
    }),
  ]);

  const draftByCategory: Record<string, number> = {};
  draftRows.forEach((r) => { draftByCategory[String(r.staffCategory)] = r._count._all; });
  const publishedByCategory: Record<string, number> = {};
  publishedRows.forEach((r) => { publishedByCategory[String(r.staffCategory)] = r._count._all; });

  const supervisorsBySlug: Record<string, RosterRecipient[]> = {};
  supervisors.forEach((s) => {
    if (!s.user) return;
    if (!supervisorsBySlug[s.deptSlug]) supervisorsBySlug[s.deptSlug] = [];
    supervisorsBySlug[s.deptSlug].push({
      id: s.user.id,
      fullName: s.user.fullName,
      role: s.user.role ? String(s.user.role) : null,
      hasPhone: Boolean(s.user.phoneNumber),
      active: s.user.status === 'APPROVED',
      source: 'SUPERVISOR',
    });
  });

  // The stand-ins: people whose role lets them manage a department that has
  // no assigned supervisor. Fetched once for every such role in the hospital.
  const standInRoles: string[] = [];
  ROSTER_DEPARTMENTS.forEach((d) => {
    if (supervisorsBySlug[d.slug] && supervisorsBySlug[d.slug].length) return;
    const candidates = (HEAD_ROLE_BY_DEPT[d.slug] ?? []).concat(d.managerRoles);
    candidates.forEach((r) => {
      if (ROSTER_ADMIN_ROLES.indexOf(r) !== -1) return;
      if (standInRoles.indexOf(r) === -1) standInRoles.push(r);
    });
  });
  const standIns = standInRoles.length
    ? await prisma.user.findMany({
      where: { role: { in: standInRoles as never }, status: 'APPROVED' },
      select: { id: true, fullName: true, role: true, phoneNumber: true, status: true },
      orderBy: { fullName: 'asc' },
    })
    : [];

  const departments: DeptStanding[] = ROSTER_DEPARTMENTS.map((d) => {
    const mine = pubs.filter((p) => p.department === d.slug);

    // This month's publications: those overlapping the month itself.
    const forThis: PublicationFact[] = mine
      .filter((p) => dayOf(p.periodStart) <= period.end && dayOf(p.periodEnd) >= period.start)
      .map((p) => ({
        // The WAT day it was published on, because the deadline is a day and
        // a publication at 00:30 WAT on the 25th is the 25th, not the 24th.
        publishedDay: new Date(p.publishedAt.getTime() + 60 * 60_000).toISOString().slice(0, 10),
        version: p.version,
        publishedByName: p.publishedByName ?? null,
        rowCount: p.rowCount,
      }));

    const assessment = assessRoster({
      period,
      publications: forThis,
      draftRows: draftByCategory[d.category] ?? 0,
      publishedRows: publishedByCategory[d.category] ?? 0,
      today: now,
    });

    const assigned = supervisorsBySlug[d.slug] ?? [];

    const asRecipient = (u: typeof standIns[number]): RosterRecipient => ({
      id: u.id,
      fullName: u.fullName,
      role: u.role ? String(u.role) : null,
      hasPhone: Boolean(u.phoneNumber),
      active: u.status === 'APPROVED',
      source: 'ROLE',
    });

    // The head of the department, where the hospital has one.
    const heads = standIns
      .filter((u) => u.role && (HEAD_ROLE_BY_DEPT[d.slug] ?? []).indexOf(String(u.role)) !== -1)
      .map(asRecipient);

    // Otherwise whoever may manage this department's roster — but only while
    // that is a short enough list to mean something. Beyond MAX_STAND_INS the
    // truthful answer is that nobody has been made responsible, and the board
    // asks for a supervisor to be assigned rather than writing to a cadre.
    const managers = standIns
      .filter((u) => u.role
        && d.managerRoles.indexOf(String(u.role)) !== -1
        && ROSTER_ADMIN_ROLES.indexOf(String(u.role)) === -1)
      .map(asRecipient);

    const recipients: RosterRecipient[] = assigned.length
      ? assigned
      : (heads.length ? heads : (managers.length <= MAX_STAND_INS ? managers : []));
    const tooManyToName = !assigned.length && !heads.length && managers.length > MAX_STAND_INS;

    return {
      slug: d.slug,
      label: d.label,
      category: d.category,
      assessment,
      recipients,
      priorLateMonths: priorLateCount(month, mine.map((p) => ({
        start: dayOf(p.periodStart),
        end: dayOf(p.periodEnd),
        publishedDay: new Date(p.publishedAt.getTime() + 60 * 60_000)
          .toISOString().slice(0, 10),
      }))),
      nobodyToWriteTo: recipients.length === 0,
      /** Set when a role fallback would have named a whole cadre. */
      candidateCount: tooManyToName ? managers.length : 0,
    };
  });

  return { period, departments };
}

/**
 * How many of the preceding months had nothing in by their deadline.
 *
 * Only the previous month is examined, because that is the only one the
 * publication query covers — asking about three would mean fetching three
 * months of publications for every department to put one clause in one letter.
 * One month is enough to say "this is the second month in a row", which is the
 * sentence that actually prompts a conversation.
 */
function priorLateCount(
  month: string,
  pubs: readonly { start: string; end: string; publishedDay: string }[],
): number {
  const prev = monthPeriod(previousMonth(month));
  if (!prev) return 0;
  const due = dueDay(prev);
  const onTime = pubs.some(
    (p) => p.start <= prev.end && p.end >= prev.start && daysBetween(due, p.publishedDay) <= 0,
  );
  return onTime ? 0 : 1;
}
