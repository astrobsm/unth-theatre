// ============================================================
// The one query behind "is this case yours?"
// ------------------------------------------------------------
// Kept apart from caseAccess.ts so the rule itself stays pure and testable
// and this file stays small enough to read in one sitting: it loads the four
// facts the rule needs, and nothing else.
// ============================================================

import { prisma } from '@/lib/prisma';
import { decideCaseAccess, type CaseAccess } from './caseAccess';

/**
 * Load the people attached to one case and decide access.
 *
 * Returns null when the surgery does not exist, so the caller can answer 404
 * rather than 403 -- telling someone a case is "not yours" when it does not
 * exist would confirm the existence of cases to anyone who can guess an id.
 */
export async function caseAccessForSurgery(args: {
  surgeryId: string;
  userId: string;
  role: string | null | undefined;
}): Promise<CaseAccess | null> {
  const surgery = await prisma.surgery.findUnique({
    where: { id: args.surgeryId },
    select: {
      anesthetistId: true,
      preOpReviews: { select: { anesthetistId: true, consultantAnesthetistId: true } },
      prescriptions: { select: { prescribedById: true } },
    },
  });
  if (!surgery) return null;

  return decideCaseAccess({
    userId: args.userId,
    role: args.role,
    parties: {
      anesthetistId: surgery.anesthetistId,
      reviews: surgery.preOpReviews,
      prescriptions: surgery.prescriptions,
    },
  });
}
