import prisma from '@/lib/prisma';
import type { IssueInput } from '@/lib/audit/conference';

/**
 * Loading a conference, and deciding whether it may still be written to.
 *
 * Shared because the seal is the whole integrity of this feature and must mean
 * the same thing at every entrance. A minute that can be edited after the
 * chair adopted it is not a minute — it is a draft that people have already
 * acted on, and the version somebody printed on the day no longer matches the
 * one in the system.
 */

/** Who may record proceedings. Kept beside the convene list it mirrors. */
export const MAY_RECORD = [
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC',
  'THEATRE_CHAIRMAN', 'THEATRE_MANAGER',
  'HEAD_OF_SURGERY', 'HEAD_OF_ANAESTHESIA', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'ADMIN', 'SYSTEM_ADMINISTRATOR',
];

export const canRecord = (role: string | null | undefined): boolean =>
  MAY_RECORD.includes((role ?? '').toUpperCase());

export interface Guard {
  ok: boolean;
  status: number;
  error?: string;
  code?: string;
}

const deny = (status: number, error: string, code: string): Guard =>
  ({ ok: false, status, error, code });

/**
 * May this person write to this conference right now?
 *
 * Three separate questions, answered in the order that gives the most useful
 * refusal: does it exist, is it sealed, and are they allowed.
 */
export async function guardWrite(
  conferenceId: string,
  role: string | null | undefined,
): Promise<Guard & { conference?: { id: string; status: string; title: string } }> {
  const conference = await prisma.theatreAuditConference.findUnique({
    where: { id: conferenceId },
    select: { id: true, status: true, title: true, adoptedByName: true, adoptedAt: true },
  });

  if (!conference) return deny(404, 'That conference is not on file.', 'NO_CONFERENCE');

  if (conference.status === 'ADOPTED') {
    return deny(
      409,
      `This resolution was adopted${conference.adoptedByName ? ` by ${conference.adoptedByName}` : ''}`
        + `${conference.adoptedAt ? ` on ${new Date(conference.adoptedAt).toLocaleDateString('en-GB')}` : ''}`
        + ', so its points and decisions can no longer be changed. Convene a further sitting to revisit any of them.',
      'CONFERENCE_ADOPTED',
    );
  }

  if (!canRecord(role)) {
    return deny(
      403,
      'Recording the proceedings of a theatre audit conference is done by theatre management or the executive.',
      'NO_ACCESS',
    );
  }

  return { ok: true, status: 200, conference };
}

/**
 * The conference as the analysis engine wants it.
 *
 * One query. The engine is pure and knows nothing about the database, which is
 * what makes it testable; this is the only place the two meet.
 */
export async function loadIssues(conferenceId: string): Promise<IssueInput[]> {
  const issues = await prisma.conferenceIssue.findMany({
    where: { conferenceId },
    orderBy: { ordinal: 'asc' },
    include: { decision: true },
  });

  return issues.map((i) => ({
    id: i.id,
    ordinal: i.ordinal,
    title: i.title,
    area: i.area,
    proposal: i.proposal,
    decision: i.decision
      ? {
          outcome: i.decision.outcome,
          decisionText: i.decision.decisionText,
          rationale: i.decision.rationale,
          ownerName: i.decision.ownerName,
          dueDate: i.decision.dueDate,
          dependsOnIssueIds: i.decision.dependsOnIssueIds,
          resourceImplication: i.decision.resourceImplication,
          reviewOn: i.decision.reviewOn,
          referredTo: i.decision.referredTo,
          votesFor: i.decision.votesFor,
          votesAgainst: i.decision.votesAgainst,
          votesAbstain: i.decision.votesAbstain,
        }
      : null,
  }));
}
