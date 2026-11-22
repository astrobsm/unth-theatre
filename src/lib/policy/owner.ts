// ============================================================
// What the Chairman sees: counts that match the database exactly
// ------------------------------------------------------------
// Everything here is COMPUTED from the response rows. Nothing is a model's
// summary, and nothing is cached. That matters for one specific reason: the AI
// analysis later reports its own stance counts, and the server refuses a run
// whose counts disagree with these. If these figures were themselves an
// estimate there would be nothing to check the model against.
//
// ATTRIBUTION IS APPLIED HERE, not in the page. A response carries a name, a
// role and a unit; whether a given viewer may see the name depends on the
// round's visibility setting, and deciding that in a component means deciding
// it again in the export, the PDF and the CSV. Three chances to get it wrong.
// ============================================================

import prisma from '@/lib/prisma';

import { attributionFor, type Attribution, type PolicyResultsVisibilityLike } from './access';
import type { RosterInput } from './roster';

export interface Participation {
  invited: number;
  selfEnrolled: number;
  opened: number;
  inProgress: number;
  submitted: number;
  notStarted: number;
  byUnit: Array<{ unit: string; invited: number; submitted: number }>;
  byRole: Array<{ role: string; invited: number; submitted: number }>;
}

export interface SectionAgreement {
  sectionId: string;
  number: string | null;
  title: string;
  agree: number;
  agreeWithChanges: number;
  disagree: number;
  notMyArea: number;
  answered: number;
  /** Comments asking for a change, which is what the owner actually reads. */
  changeRequests: number;
  patientSafety: number;
  highPriority: number;
}

export interface DecisionItemTally {
  decisionItemId: string;
  sectionNumber: string | null;
  sectionTitle: string;
  placeholder: string;
  surroundingSentence: string;
  type: string;
  currentValue: string;
  accepted: number;
  proposals: Array<{ value: string; support: number; reasons: string[] }>;
  answered: number;
}

export interface FlaggedComment {
  sectionId: string;
  sectionNumber: string | null;
  sectionTitle: string;
  stance: string;
  concernType: string | null;
  priority: string | null;
  comment: string | null;
  proposedWording: string | null;
  /** Already reduced to what this viewer may see. */
  attributedTo: string;
  updatedAt: string;
}

/** Who a response is shown as, for this viewer. */
export function displayContributor(
  invitation: { inviteeName: string; inviteeRole: string | null; inviteeUnit: string | null },
  attribution: Attribution,
): string {
  if (attribution === 'full') {
    const parts = [invitation.inviteeName];
    const qualifier = [invitation.inviteeRole, invitation.inviteeUnit]
      .filter((v) => (v ?? '').trim() !== '')
      .join(', ');
    if (qualifier) parts.push(`(${qualifier})`);
    return parts.join(' ');
  }
  if (attribution === 'role-only') {
    const role = (invitation.inviteeRole ?? '').trim();
    const unit = (invitation.inviteeUnit ?? '').trim();
    if (role && unit) return `${role}, ${unit}`;
    if (role) return role;
    if (unit) return unit;
    return 'A committee member';
  }
  return 'Withheld';
}

export async function participationFor(roundId: string): Promise<Participation> {
  const invitations = await prisma.policyInvitation.findMany({
    where: { roundId, revokedAt: null },
    select: {
      inviteeRole: true,
      inviteeUnit: true,
      openedAt: true,
      submittedAt: true,
      selfEnrolled: true,
      participation: { select: { lastSeenAt: true, submittedAt: true } },
    },
  });

  const group = (key: (i: typeof invitations[number]) => string) => {
    const map = new Map<string, { invited: number; submitted: number }>();
    for (const i of invitations) {
      const k = key(i) || 'Not stated';
      const row = map.get(k) ?? { invited: 0, submitted: 0 };
      row.invited += 1;
      if (i.submittedAt) row.submitted += 1;
      map.set(k, row);
    }
    // Array.from rather than a spread: this project's TS target predates
    // downlevelIteration, so spreading a Map iterator does not compile.
    return Array.from(map.entries())
      .map(([k, v]) => ({ ...v, key: k }))
      .sort((a, b) => b.invited - a.invited);
  };

  const opened = invitations.filter((i) => i.openedAt).length;
  const submitted = invitations.filter((i) => i.submittedAt).length;
  // "In progress" means opened, not submitted. Counting it as "opened minus
  // submitted" would be wrong the moment somebody opens the link and closes it
  // again, which is most people the first time.
  const inProgress = invitations.filter((i) => i.openedAt && !i.submittedAt).length;

  return {
    invited: invitations.length,
    selfEnrolled: invitations.filter((i) => i.selfEnrolled).length,
    opened,
    inProgress,
    submitted,
    notStarted: invitations.length - opened,
    byUnit: group((i) => (i.inviteeUnit ?? '').trim()).map(({ key, ...rest }) => ({ unit: key, ...rest })),
    byRole: group((i) => (i.inviteeRole ?? '').trim()).map(({ key, ...rest }) => ({ role: key, ...rest })),
  };
}

export async function sectionAgreementFor(roundId: string): Promise<SectionAgreement[]> {
  const round = await prisma.policyReviewRound.findUniqueOrThrow({
    where: { id: roundId },
    select: { documentId: true },
  });

  const sections = await prisma.policySection.findMany({
    where: { documentId: round.documentId },
    orderBy: [{ order: 'asc' }, { number: 'asc' }],
    select: { id: true, number: true, title: true },
  });

  const responses = await prisma.policySectionResponse.findMany({
    where: { roundId },
    select: {
      sectionId: true,
      stance: true,
      concernType: true,
      priority: true,
      comment: true,
      proposedWording: true,
    },
  });

  return sections.map((section) => {
    const mine = responses.filter((r) => r.sectionId === section.id);
    const count = (stance: string) => mine.filter((r) => r.stance === stance).length;
    return {
      sectionId: section.id,
      number: section.number,
      title: section.title,
      agree: count('AGREE'),
      agreeWithChanges: count('AGREE_WITH_CHANGES'),
      disagree: count('DISAGREE'),
      notMyArea: count('NOT_MY_AREA'),
      answered: mine.length,
      changeRequests: mine.filter(
        (r) => (r.comment ?? '') !== '' || (r.proposedWording ?? '') !== '',
      ).length,
      patientSafety: mine.filter((r) => r.concernType === 'PATIENT_SAFETY').length,
      highPriority: mine.filter((r) => r.priority === 'HIGH').length,
    };
  });
}

export async function decisionItemTalliesFor(roundId: string): Promise<DecisionItemTally[]> {
  const round = await prisma.policyReviewRound.findUniqueOrThrow({
    where: { id: roundId },
    select: { documentId: true },
  });

  const items = await prisma.policyDecisionItem.findMany({
    where: { section: { documentId: round.documentId }, dismissed: false },
    orderBy: [{ section: { order: 'asc' } }, { order: 'asc' }],
    select: {
      id: true,
      placeholder: true,
      surroundingSentence: true,
      type: true,
      currentValue: true,
      section: { select: { number: true, title: true } },
    },
  });

  const responses = await prisma.policyDecisionItemResponse.findMany({
    where: { roundId },
    select: {
      decisionItemId: true,
      acceptsCurrent: true,
      proposedValue: true,
      reason: true,
    },
  });

  return items.map((item) => {
    const mine = responses.filter((r) => r.decisionItemId === item.id);

    // Proposals are grouped on the value as TYPED, trimmed and case-folded.
    // Not normalised further: "11:00" and "11am" are the same intention and
    // different text, and silently merging them would invent a consensus the
    // committee never expressed. The owner sees both and decides.
    const byValue = new Map<string, { value: string; support: number; reasons: string[] }>();
    for (const r of mine) {
      const raw = (r.proposedValue ?? '').trim();
      if (r.acceptsCurrent || raw === '') continue;
      const key = raw.toLowerCase();
      const row = byValue.get(key) ?? { value: raw, support: 0, reasons: [] };
      row.support += 1;
      const reason = (r.reason ?? '').trim();
      if (reason !== '') row.reasons.push(reason);
      byValue.set(key, row);
    }

    return {
      decisionItemId: item.id,
      sectionNumber: item.section.number,
      sectionTitle: item.section.title,
      placeholder: item.placeholder,
      surroundingSentence: item.surroundingSentence,
      type: item.type,
      currentValue: item.currentValue,
      accepted: mine.filter((r) => r.acceptsCurrent).length,
      proposals: Array.from(byValue.values()).sort((a, b) => b.support - a.support),
      answered: mine.length,
    };
  });
}

/**
 * The comments the owner must not miss: patient safety first, then anything
 * marked high priority.
 *
 * Ordered by WHAT IT IS, not by when it arrived. A lone safety objection on
 * section 11 is the single most important thing in a review and it would be
 * three screens down a chronological list.
 */
export async function flaggedCommentsFor(opts: {
  roundId: string;
  role: string | null | undefined;
  extraModules?: readonly string[] | null;
  visibility: PolicyResultsVisibilityLike;
}): Promise<FlaggedComment[]> {
  const attribution = attributionFor({
    role: opts.role,
    extraModules: opts.extraModules,
    visibility: opts.visibility,
  });

  const rows = await prisma.policySectionResponse.findMany({
    where: {
      roundId: opts.roundId,
      OR: [
        { concernType: 'PATIENT_SAFETY' },
        { priority: 'HIGH' },
        { concernType: 'LEGAL_OR_DISCIPLINARY' },
      ],
    },
    select: {
      sectionId: true,
      stance: true,
      concernType: true,
      priority: true,
      comment: true,
      proposedWording: true,
      updatedAt: true,
      section: { select: { number: true, title: true } },
      invitation: {
        select: { inviteeName: true, inviteeRole: true, inviteeUnit: true },
      },
    },
  });

  const weight = (r: typeof rows[number]) => {
    if (r.concernType === 'PATIENT_SAFETY') return 0;
    if (r.concernType === 'LEGAL_OR_DISCIPLINARY') return 1;
    return 2;
  };

  return rows
    .sort((a, b) => weight(a) - weight(b)
      || b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((r) => ({
      sectionId: r.sectionId,
      sectionNumber: r.section.number,
      sectionTitle: r.section.title,
      stance: r.stance,
      concernType: r.concernType,
      priority: r.priority,
      comment: r.comment,
      proposedWording: r.proposedWording,
      attributedTo: displayContributor(r.invitation, attribution),
      updatedAt: r.updatedAt.toISOString(),
    }));
}

/**
 * Every invited member and how far each got, for the exported analysis.
 *
 * DELIBERATELY NOT participationFor(). That one filters revokedAt: null
 * because it computes percentages for the dashboard. A roster must list
 * everybody who was ASKED, withdrawals included and named as such -- the
 * document is read to find out who did not respond, and an invitee quietly
 * missing from the table is the one error in it nobody can detect.
 *
 * Names are resolved here through displayContributor() against the round own
 * visibility setting, so a roster can never carry a name the round has not
 * released.
 */
export async function rosterFor(
  roundId: string,
  attribution: Attribution,
): Promise<{ rows: RosterInput[]; totalSections: number }> {
  const round = await prisma.policyReviewRound.findUniqueOrThrow({
    where: { id: roundId },
    select: { documentId: true },
  });

  const invitations = await prisma.policyInvitation.findMany({
    where: { roundId },
    select: {
      id: true,
      inviteeName: true,
      inviteeRole: true,
      inviteeUnit: true,
      openedAt: true,
      submittedAt: true,
      revokedAt: true,
      selfEnrolled: true,
    },
  });

  // One grouped count rather than a query per member: the committee is small,
  // but this runs inside an export that already holds the whole round in
  // memory, and N+1 here would be eleven round trips for one column.
  const answered = await prisma.policySectionResponse.groupBy({
    by: ['invitationId'],
    where: { roundId },
    _count: { _all: true },
  });
  const answeredBy = new Map<string, number>(
    answered.map((a) => [a.invitationId, a._count._all]),
  );

  const totalSections = await prisma.policySection.count({
    where: { documentId: round.documentId },
  });

  return {
    totalSections,
    rows: invitations.map((i) => ({
      contributor: displayContributor(i, attribution),
      openedAt: i.openedAt,
      submittedAt: i.submittedAt,
      revokedAt: i.revokedAt,
      selfEnrolled: i.selfEnrolled,
      answered: answeredBy.get(i.id) ?? 0,
    })),
  };
}
