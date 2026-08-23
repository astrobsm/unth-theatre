/**
 * Resolves the assignment (`subRole`) options a department offers, reading them
 * live from the database where the department is configured that way.
 *
 * Kept server-side and shared by the department roster API and the bulk-upload
 * template so the web form and the spreadsheet can never offer different lists.
 */

import prisma from '@/lib/prisma';
import {
  type RosterDept,
  ON_CALL_ALL_SPECIALTIES,
  TECHNICIAN_SPECIAL_ASSIGNMENTS,
} from '@/lib/rosterDepartments';

const uniq = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));

export async function getSubRoleOptions(dept: RosterDept): Promise<string[]> {
  switch (dept.subRoleSource) {
    // Anaesthetists cover a surgical subspecialty on elective days; the on-call
    // consultant covers all emergencies.
    case 'SURGICAL_SPECIALTY': {
      const units = await prisma.surgicalUnit.findMany({
        where: { active: true },
        select: { subspecialty: true },
        orderBy: { subspecialty: 'asc' },
      });
      return [ON_CALL_ALL_SPECIALTIES, ...uniq(units.map((u) => u.subspecialty))];
    }
    // Anaesthetic technicians cover a theatre, day/night call, or ICU.
    case 'THEATRE': {
      const theatres = await prisma.theatreSuite.findMany({
        select: { name: true },
        orderBy: { name: 'asc' },
      });
      return [...uniq(theatres.map((t) => t.name)), ...TECHNICIAN_SPECIAL_ASSIGNMENTS];
    }
    default:
      return dept.subRoles ?? [];
  }
}
