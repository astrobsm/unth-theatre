/**
 * Fill in the anaesthetic technician on elective cases, once their roster
 * exists.
 *
 * The counterpart to anaesthetistBackfill, and it exists for the same reason.
 * A case booked before the week's roster is published has nobody against it.
 * That is the honest state and it should say "not yet assigned" — but it must
 * not STAY that way once the roster arrives, or the roster and the theatre list
 * disagree until somebody edits every case by hand.
 *
 * THE CALL TEAM IS NEVER USED HERE. Day call, night call and ICU cover the
 * unplanned; they are not the technician for a planned list. Putting them on an
 * elective case reads as an assignment, so nobody chases the missing roster —
 * which is exactly how the on-call consultant anaesthetist ended up stamped
 * across fifteen elective cases in eight theatres on 27 August.
 *
 * A case with nobody rostered to its specialty stays unassigned and is
 * reported, because that is a gap for a person to fill.
 */

import prisma from '@/lib/prisma';
import { classifyTechnicianRow, specialtyKey } from '@/lib/technicianCoverage';

/**
 * May this rostered technician take a PLANNED case in this specialty?
 *
 * Pure, because it is the whole rule: only somebody rostered to the specialty
 * itself. Day call, night call, ICU and a shift with no assignment are all
 * refused — they cover the unplanned, and putting one of them on an elective
 * case reads as an assignment, so nobody chases the missing roster.
 */
export function coversElectiveSpecialty(
  row: { shift: string; subRole: string | null },
  wantedKey: string | null,
): boolean {
  if (!wantedKey) return false;
  const { duty, specialty } = classifyTechnicianRow({ userId: '', shift: row.shift, subRole: row.subRole });
  if (duty !== 'SPECIALTY') return false;
  return specialtyKey(specialty) === wantedKey;
}

export interface TechnicianBackfillResult {
  /** Cases that gained a technician. */
  filled: number;
  /** Cases still unassigned because nobody covers their specialty. */
  stillUnassigned: number;
  /** Specialties with cases but nobody rostered — the real gap to chase. */
  uncoveredSpecialties: string[];
}

/**
 * Fill unassigned elective technicians across a date range.
 *
 * Called after the anaesthetic technicians' roster is published, for the week
 * that was published.
 */
export async function backfillTechnicians(
  start: Date,
  end: Date,
): Promise<TechnicianBackfillResult> {
  const surgeries = await prisma.surgery.findMany({
    where: {
      surgeryType: 'ELECTIVE',
      theatreTechnicianId: null,
      scheduledDate: { gte: start, lte: end },
      status: { notIn: ['COMPLETED', 'CANCELLED'] as never },
    },
    select: { id: true, subspecialty: true, unit: true, scheduledDate: true },
  });

  if (!surgeries.length) {
    return { filled: 0, stillUnassigned: 0, uncoveredSpecialties: [] };
  }

  const roster = await prisma.roster.findMany({
    where: {
      staffCategory: 'ANAESTHETIC_TECHNICIANS' as never,
      status: 'PUBLISHED',
      date: { gte: start, lte: end },
    },
    select: {
      userId: true, date: true, shift: true, subRole: true,
      user: { select: { id: true } },
    },
  });

  let filled = 0;
  let stillUnassigned = 0;
  const uncovered = new Set<string>();

  for (const s of surgeries) {
    const day = s.scheduledDate.toISOString().slice(0, 10);

    // The case's own specialty. Falls back to the unit, because a booking may
    // record "Neuro Unit III" where the roster says "Neurosurgery" — specialtyKey
    // reconciles the two vocabularies.
    const wanted = specialtyKey(s.subspecialty) ?? specialtyKey(s.unit);
    if (!wanted) {
      stillUnassigned += 1;
      continue;
    }

    const pool = roster.filter(
      (r) => r.date.toISOString().slice(0, 10) === day && coversElectiveSpecialty(r, wanted),
    );

    if (!pool.length) {
      stillUnassigned += 1;
      if (s.subspecialty) uncovered.add(s.subspecialty);
      continue;
    }

    const picked = pool[0];
    if (!picked?.user?.id) {
      stillUnassigned += 1;
      continue;
    }

    await prisma.surgery.update({
      where: { id: s.id },
      data: { theatreTechnicianId: picked.user.id },
    });
    filled += 1;
  }

  return {
    filled,
    stillUnassigned,
    uncoveredSpecialties: Array.from(uncovered).sort(),
  };
}
