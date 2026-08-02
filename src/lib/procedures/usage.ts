// ============================================================
// Counting how often a procedure is actually booked
// ------------------------------------------------------------
// The picker orders by usage, so the twenty operations a theatre really does
// sit at the top instead of being buried under four hundred it does once a
// year. That ordering is only as good as this counter.
//
// Fire and forget, always. A booking must never fail because a statistic
// could not be updated.
// ============================================================

import prisma from '@/lib/prisma';
import { procedureSlug } from './normalise';

/**
 * Record that a procedure was booked.
 *
 * Matches on the normalised slug, so a booking saved with slightly different
 * wording still counts towards the right catalogue entry. Does nothing at all
 * if the procedure is not in the catalogue — a booking made before the
 * catalogue existed, or one typed while the list was unavailable, is not a
 * reason to create an entry nobody reviewed.
 */
export async function recordProcedureUse(
  subspecialty: string | null | undefined,
  procedureName: string | null | undefined
): Promise<void> {
  try {
    if (!subspecialty || !procedureName) return;
    const slug = procedureSlug(procedureName);
    if (!slug) return;

    await prisma.surgicalProcedure.updateMany({
      where: { subspecialty, slug },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  } catch (error) {
    console.error('[procedures] failed to record use:', error);
  }
}
