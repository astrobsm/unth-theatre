/**
 * Give already-booked cases the anaesthetist the roster has just named.
 *
 * THE GAP THIS CLOSES
 *
 * The anaesthetist is resolved when a case is BOOKED and stored on the surgery.
 * That is right for the booking, and wrong for everything after it: a list is
 * usually booked days before the roster covering it is published, so at booking
 * time there is genuinely nobody to name. Those cases keep "not yet assigned",
 * the roster is then published, and nothing goes back to fix them — so the
 * theatre sees an unstaffed list and the rota-holder sees a published roster,
 * and both are looking at the truth.
 *
 * It happened on 28 August with fifteen cases and had to be repaired by hand.
 * Publishing a roster now repairs it by itself.
 *
 * WHAT IT WILL AND WILL NOT TOUCH
 *
 * Only ELECTIVE cases, and only where no anaesthetist is set. A case somebody
 * has deliberately assigned is left exactly as it is — a backfill that
 * overwrites a human decision is worse than the gap it fixes.
 *
 * And only a SUBSPECIALTY match, never the on-call team: an elective list is
 * covered by the anaesthetist rostered to its own specialty or by nobody, which
 * is the rule the booking route follows. Filling a gap with the wrong name is
 * not filling it.
 */

import prisma from '@/lib/prisma';

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

/** Consultant first, then senior registrar, then registrar. */
const rank = (s: string | null) =>
  s === 'CONSULTANT' ? 0 : s === 'SENIOR_REGISTRAR' ? 1 : s === 'REGISTRAR' ? 2 : 3;

const isOnCallRow = (shift: string, subRole: string | null) =>
  shift === 'CALL' || /all\s*emerg|on[\s-]*call/i.test(subRole || '');

export interface BackfillResult {
  /** Cases that gained an anaesthetist. */
  filled: number;
  /** Cases still unassigned because nobody covers their specialty. */
  stillUnassigned: number;
  /** Specialties that have cases but nobody rostered — the real gap to chase. */
  uncoveredSpecialties: string[];
}

/**
 * Fill unassigned elective anaesthetists across a date range.
 *
 * Called after a roster is published, for the week that was published.
 */
export async function backfillAnaesthetists(
  start: Date,
  end: Date,
): Promise<BackfillResult> {
  const surgeries = await prisma.surgery.findMany({
    where: {
      surgeryType: 'ELECTIVE',
      anesthetistId: null,
      scheduledDate: { gte: start, lte: end },
      status: { notIn: ['COMPLETED', 'CANCELLED'] as never },
    },
    select: {
      id: true,
      subspecialty: true,
      theatreId: true,
      scheduledDate: true,
      scheduledTime: true,
    },
  });

  if (surgeries.length === 0) {
    return { filled: 0, stillUnassigned: 0, uncoveredSpecialties: [] };
  }

  const roster = await prisma.roster.findMany({
    where: {
      staffCategory: 'ANAESTHETISTS' as never,
      status: 'PUBLISHED',
      date: { gte: start, lte: end },
    },
    include: { user: { select: { id: true } } },
  });

  let filled = 0;
  let stillUnassigned = 0;
  const uncovered = new Set<string>();

  for (const s of surgeries) {
    const day = s.scheduledDate.toISOString().slice(0, 10);

    // The elective roster for this case's own day and specialty. On-call rows
    // are excluded outright — see the note at the top.
    const wanted = norm(s.subspecialty);
    let pool = roster.filter(
      (r) =>
        r.date.toISOString().slice(0, 10) === day &&
        !isOnCallRow(r.shift, r.subRole) &&
        norm(r.subRole) === wanted,
    );

    if (!pool.length) {
      stillUnassigned += 1;
      if (s.subspecialty) uncovered.add(s.subspecialty);
      continue;
    }

    // Prefer somebody rostered to the theatre this case is in, when the roster
    // says so; otherwise anyone covering the specialty.
    const tId = (s.theatreId || '').trim();
    const specific = tId ? pool.filter((r) => r.theatreId === tId) : [];
    if (specific.length) pool = specific;

    pool.sort((a, b) => rank(a.seniorityLevel) - rank(b.seniorityLevel));
    const picked = pool[0];
    if (!picked?.user?.id) {
      stillUnassigned += 1;
      continue;
    }

    await prisma.surgery.update({
      where: { id: s.id },
      data: { anesthetistId: picked.user.id },
    });
    filled += 1;
  }

  return {
    filled,
    stillUnassigned,
    uncoveredSpecialties: Array.from(uncovered).sort(),
  };
}
