/**
 * Who may edit and publish one department's duty roster.
 *
 * Authority used to be role-only: canManageRosterDept compared the user's role
 * against the department's managerRoles. That cannot express "Sister Okeke runs
 * the porters' roster" — the only way to give her that was to make her a
 * THEATRE_MANAGER, which hands over every other theatre-manager power in the
 * system as the price of one duty roster. So people either got far more
 * authority than they needed, or the roster stayed with someone too busy to
 * keep it current.
 *
 * A supervisor is granted authority over ONE named department. Nothing else
 * about their account changes.
 *
 * THE ROLE CHECK STILL COMES FIRST and is unchanged. This only ever ADDS
 * authority; no existing manager loses anything, and a department with no
 * supervisor behaves exactly as it did.
 */

import prisma from '@/lib/prisma';
import { canManageRosterDept, getRosterDept, type RosterDept } from '@/lib/rosterDepartments';

export interface RosterActor {
  id?: string | null;
  role?: string | null;
}

/**
 * May this person manage this department's roster?
 *
 * Async because supervision is data, not a role claim in the session. Call it
 * on the server for every write; the screen may hide a button, but hiding a
 * button is not a permission check.
 */
export async function canManageRosterDeptFor(
  dept: RosterDept | undefined,
  actor: RosterActor,
): Promise<boolean> {
  if (!dept) return false;

  // Unchanged behaviour for everyone who could already manage this roster.
  if (canManageRosterDept(dept, actor.role)) return true;

  if (!actor.id) return false;

  const grant = await prisma.rosterSupervisor.findUnique({
    where: { userId_deptSlug: { userId: actor.id, deptSlug: dept.slug } },
    select: { id: true },
  });
  return grant !== null;
}

/** The same question by slug, for callers holding only the URL segment. */
export async function canManageRosterSlugFor(slug: string, actor: RosterActor): Promise<boolean> {
  return canManageRosterDeptFor(getRosterDept(slug), actor);
}

/**
 * Every department this person may manage — their role's departments plus the
 * ones they supervise. Used to decide what the roster index offers them.
 */
export async function manageableDeptSlugs(actor: RosterActor, all: RosterDept[]): Promise<string[]> {
  const byRole = all.filter((d) => canManageRosterDept(d, actor.role)).map((d) => d.slug);
  if (!actor.id) return byRole;

  const supervised = await prisma.rosterSupervisor.findMany({
    where: { userId: actor.id },
    select: { deptSlug: true },
  });

  return mergeManageable(byRole, supervised.map((s) => s.deptSlug), all.map((d) => d.slug));
}

/**
 * Role-given departments plus supervised ones, de-duplicated.
 *
 * A supervisor slug that no longer names a real department is DROPPED rather
 * than returned: departments live in code, not in a table, so one can be
 * renamed out from under a grant, and handing back a dead slug sends the person
 * to a 404 with no way to tell why. Pure, so the rule can be tested.
 */
export function mergeManageable(byRole: string[], supervised: string[], known: string[]): string[] {
  const real = new Set(known);
  return Array.from(new Set([...byRole, ...supervised.filter((s) => real.has(s))]));
}

/** The supervisors of one department, for the admin screen. */
export async function listSupervisors(deptSlug: string) {
  return prisma.rosterSupervisor.findMany({
    where: { deptSlug },
    orderBy: { assignedAt: 'desc' },
    select: {
      id: true,
      deptSlug: true,
      assignedAt: true,
      notes: true,
      user: { select: { id: true, fullName: true, role: true, staffCode: true, phoneNumber: true } },
      assignedBy: { select: { id: true, fullName: true } },
    },
  });
}
