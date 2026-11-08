// ============================================================
// What a given person may see in the research module
// ------------------------------------------------------------
// TWO SCOPES AND NO THIRD. Either you are looking at cases your own name is
// on, or the Theatre Research Board has granted you wider access for a stated
// purpose and a stated period. There is no quiet middle state, because a
// middle state is what nobody can audit afterwards.
//
// THE SCOPE IS APPLIED IN THE DATABASE WHERE CLAUSE, not after the rows come
// back. Filtering in memory would mean the other cases were read, held and
// counted before being dropped — so a denominator, a "scanned" figure or an
// error message could still betray what is in them. The clause below is the
// control; anything added to this module later must go through it.
//
// AN EXPIRED GRANT IS NOT A GRANT. The expiry is checked on every request
// rather than by a job, because a nightly sweep leaves a window in which a
// lapsed approval still works, and that window is exactly when somebody
// notices it still works.
// ============================================================

import prisma from '@/lib/prisma';
import { participationWhere } from '@/lib/logbook/participation';
import { isResearchBoard } from './board';

export type ResearchScopeKind = 'OWN' | 'GRANTED' | 'BOARD';

export interface ResearchScope {
  kind: ResearchScopeKind;
  /** The Prisma where-fragment to AND into every research query. */
  where: Record<string, unknown> | null;
  /** One line the screen shows, so nobody wonders why a count looks small. */
  explanation: string;
  /** The grant in force, where there is one. */
  grant: {
    id: string; title: string; scopeGranted: string | null;
    expiresAt: string | null; decidedByName: string | null;
  } | null;
  /** A pending application, so the screen can say it is still with the board. */
  pending: { id: string; title: string; submittedAt: string; dueBy: string } | null;
}

/**
 * The scope in force for this person, now.
 *
 * `OWN` is the default and the floor: a person always sees their own cases,
 * grant or no grant.
 */
export async function researchScopeFor(
  userId: string | null | undefined,
  role: string | null | undefined,
): Promise<ResearchScope> {
  if (!userId) {
    return {
      kind: 'OWN',
      // No id means no cases. Not "all cases": a missing session must never
      // widen access, which is the direction this kind of bug always takes.
      where: { id: '__no_user__' },
      explanation: 'Not signed in.',
      grant: null,
      pending: null,
    };
  }

  if (isResearchBoard(role)) {
    return {
      kind: 'BOARD',
      where: null,
      explanation:
        'You sit on the Theatre Research Board, so you can see every case. Everybody else '
        + 'sees their own cases unless the board has granted them more.',
      grant: null,
      pending: null,
    };
  }

  const now = new Date();
  const [granted, pending] = await Promise.all([
    prisma.researchAccessRequest.findFirst({
      where: {
        applicantId: userId,
        status: 'APPROVED',
        // An expiry in the past is not a grant. Checked here, on the request,
        // rather than by a sweep that would leave a window.
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { decidedAt: 'desc' },
      select: {
        id: true, title: true, scopeGranted: true, scopeRequested: true,
        expiresAt: true, decidedByName: true,
      },
    }).catch(() => null),
    prisma.researchAccessRequest.findFirst({
      where: { applicantId: userId, status: 'PENDING' },
      orderBy: { submittedAt: 'desc' },
      select: { id: true, title: true, submittedAt: true, dueBy: true },
    }).catch(() => null),
  ]);

  const pendingOut = pending
    ? {
      id: pending.id,
      title: pending.title,
      submittedAt: pending.submittedAt.toISOString(),
      dueBy: pending.dueBy.toISOString(),
    }
    : null;

  if (granted) {
    return {
      kind: 'GRANTED',
      where: null,
      explanation:
        `The Theatre Research Board approved "${granted.title}"`
        + `${granted.decidedByName ? `, decided by ${granted.decidedByName}` : ''}`
        + `${granted.expiresAt ? `, in force until ${granted.expiresAt.toISOString().slice(0, 10)}` : ''}. `
        + `Scope: ${granted.scopeGranted ?? granted.scopeRequested}`,
      grant: {
        id: granted.id,
        title: granted.title,
        scopeGranted: granted.scopeGranted ?? granted.scopeRequested,
        expiresAt: granted.expiresAt ? granted.expiresAt.toISOString() : null,
        decidedByName: granted.decidedByName,
      },
      pending: pendingOut,
    };
  }

  return {
    kind: 'OWN',
    where: participationWhere(userId),
    explanation:
      'You are seeing the cases your own name is on — as surgeon, assistant, '
      + 'anaesthetist, supervising consultant, or a member of the recorded team. To study '
      + 'cases you were not involved in, apply to the Theatre Research Board.',
    grant: null,
    pending: pendingOut,
  };
}

/** AND the scope into a where clause without either one losing a condition. */
export function withScope(
  base: Record<string, unknown>,
  scope: ResearchScope,
): Record<string, unknown> {
  if (!scope.where) return base;
  // AND rather than a merge: the scope's own OR must not be flattened into
  // the caller's filters, where it would widen them instead of narrowing.
  return { AND: [base, scope.where] };
}
