/**
 * Resolves the assignment (`subRole`) options a department offers, reading them
 * live from the database where the department is configured that way.
 *
 * Kept server-side and shared by the department roster API and the bulk-upload
 * template so the web form and the spreadsheet can never offer different lists.
 */

import prisma from '@/lib/prisma';
import { type RosterDept } from '@/lib/rosterDepartments';

const uniq = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));

/**
 * The live part of the list — whatever table this department is rostered
 * against.
 */
async function baseOptions(dept: RosterDept): Promise<string[]> {
  switch (dept.subRoleSource) {
    // Anaesthetists AND anaesthetic technicians: both are rostered to a surgical
    // specialty, so both read the same live list and a specialty added to the
    // SurgicalUnit table appears in both without a code change.
    case 'SURGICAL_SPECIALTY': {
      const units = await prisma.surgicalUnit.findMany({
        where: { active: true },
        select: { subspecialty: true },
        orderBy: { subspecialty: 'asc' },
      });
      return uniq(units.map((u) => u.subspecialty));
    }
    // No department is rostered by theatre today — the technicians were, until
    // they moved to specialties. Kept because it works and costs nothing.
    case 'THEATRE': {
      const theatres = await prisma.theatreSuite.findMany({
        select: { name: true },
        orderBy: { name: 'asc' },
      });
      return uniq(theatres.map((t) => t.name));
    }
    default:
      return dept.subRoles ?? [];
  }
}

/**
 * Everything this department may be assigned to: its "covers everything" option
 * first, then the live list, then its fixed extras (day call, night call, ICU).
 *
 * De-duplicated, because an extra that is also a live value would otherwise
 * appear twice in the dropdown and read as two different things.
 */
export async function getSubRoleOptions(dept: RosterDept): Promise<string[]> {
  return uniq([
    ...(dept.onCallSubRole ? [dept.onCallSubRole] : []),
    ...(await baseOptions(dept)),
    ...(dept.extraSubRoles ?? []),
  ]);
}
