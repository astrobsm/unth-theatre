// ============================================================
// Which cases a person took part in, and in what capacity
// ------------------------------------------------------------
// A log book stands or falls on this. "All the cases Dr X did" is not one
// question but four — operated, assisted, anaesthetised, or was simply on the
// team — and a book that pools them is a book an examiner will reject, because
// the whole point of the participation column is that the four are different.
//
// WHERE PARTICIPATION IS READ FROM, in order of how directly it says what the
// person actually did:
//
//   1. The intraoperative record's primary surgeon. Written in the room.
//   2. The case's surgeon, assistant surgeon or anaesthetist of record.
//   3. The surgical team list, which records presence and grade but not what
//      the person did with their hands.
//
// AND THE LEVEL IS PROPOSED, NEVER ASSERTED. Nothing in this database records
// whether the consultant was scrubbed, which is the exact distinction between
// "performed under supervision" and "performed independently". So this module
// proposes a level from what IS recorded, says on every row how it reached it,
// and the printed book carries the College's own requirement that each entry
// be signed by the supervising consultant. The signature is what makes the
// level true; this only saves the trainee writing the other nine columns out
// by hand.
//
// Doing it the other way round -- printing a confident level nobody verified --
// would put a claim in front of an examiner that the trainee could not defend.
// ============================================================

import type { RawCase } from '@/lib/research/types';
import { rec, list } from '@/lib/research/access';
import type { ParticipationLevel } from './colleges';

export type LogbookRole =
  | 'SURGEON' | 'ASSISTANT' | 'ANAESTHETIST' | 'TEAM_MEMBER';

export interface Participation {
  role: LogbookRole;
  level: ParticipationLevel;
  /** How this was decided, printed beside the row so it can be challenged. */
  basis: string;
  /** The consultant who supervised, where one is named. */
  supervisorName: string | null;
}

const CONSULTANT_ROLE = /CONSULTANT|HEAD_OF/;

/**
 * Was this person operating under a named supervisor other than themselves?
 *
 * A consultant on the case who is not the person is the supervisor. A person
 * who is themselves a consultant is not supervised by their own name.
 */
function supervisorFor(c: RawCase, personId: string): string | null {
  const supId = c.supervisingConsultantId ? String(c.supervisingConsultantId) : null;
  const supName = c.supervisingConsultantName ? String(c.supervisingConsultantName) : null;
  if (supId && supId !== personId) return supName ?? 'Consultant named on the case';
  if (!supId && supName) return supName;
  return null;
}

/**
 * The level to propose for somebody who performed the procedure.
 *
 * A supervisor named on the case means supervised. A person whose own account
 * is a consultant, with nobody else named, is proposed as independent. Where
 * neither is true the level is still proposed as supervised, because that is
 * the more conservative claim: over-claiming independence in a log book is the
 * error an examiner looks for, and under-claiming is one a supervisor can
 * correct with a stroke of a pen.
 */
function levelForPerformer(
  c: RawCase, personId: string, personRole: string | null,
): { level: ParticipationLevel; basis: string; supervisorName: string | null } {
  const supervisor = supervisorFor(c, personId);
  if (supervisor) {
    return {
      level: 'SUPERVISED',
      basis: `Supervising consultant named on the case (${supervisor}).`,
      supervisorName: supervisor,
    };
  }
  if (personRole && CONSULTANT_ROLE.test(personRole)) {
    return {
      level: 'INDEPENDENT',
      basis: 'Operator of record and holds a consultant appointment; no other consultant named.',
      supervisorName: null,
    };
  }
  return {
    level: 'SUPERVISED',
    basis: 'Operator of record with no consultant named. Proposed as supervised, which is the '
      + 'more conservative claim; have your supervisor confirm or amend it.',
    supervisorName: null,
  };
}

/**
 * How this person took part in this case, or null if they did not.
 *
 * `personRole` is the role on their own account, used only to decide between
 * supervised and independent.
 */
export function participationIn(
  c: RawCase, personId: string, personRole: string | null,
): Participation | null {
  if (!personId) return null;

  const intraPrimary = rec(c, 'intraOperativeRecord')?.primarySurgeonId;
  if (intraPrimary && String(intraPrimary) === personId) {
    const l = levelForPerformer(c, personId, personRole);
    return { role: 'SURGEON', level: l.level, supervisorName: l.supervisorName,
      basis: `Primary surgeon on the intraoperative record. ${l.basis}` };
  }

  if (c.surgeonId && String(c.surgeonId) === personId) {
    const l = levelForPerformer(c, personId, personRole);
    return { role: 'SURGEON', level: l.level, supervisorName: l.supervisorName,
      basis: `Surgeon of record on the case. ${l.basis}` };
  }

  if (c.assistantSurgeonId && String(c.assistantSurgeonId) === personId) {
    return {
      role: 'ASSISTANT', level: 'ASSISTED',
      basis: 'Assistant surgeon of record on the case.',
      supervisorName: supervisorFor(c, personId),
    };
  }

  if (c.anesthetistId && String(c.anesthetistId) === personId) {
    const l = levelForPerformer(c, personId, personRole);
    return { role: 'ANAESTHETIST', level: l.level, supervisorName: l.supervisorName,
      basis: `Anaesthetist of record on the case. ${l.basis}` };
  }

  const onTeam = list(c, 'teamMembers').find((m) => m.userId && String(m.userId) === personId);
  if (onTeam) {
    // The team list records that somebody was there and at what grade. It does
    // NOT record what they did, so the level proposed is the lowest one the
    // evidence supports rather than the one the trainee would prefer.
    return {
      role: 'TEAM_MEMBER', level: 'ASSISTED',
      basis: `Recorded on the surgical team as ${String(onTeam.role ?? 'a team member')}. `
        + 'The team list records presence and grade, not what was done, so this is proposed '
        + 'as assisted.',
      supervisorName: supervisorFor(c, personId),
    };
  }

  return null;
}

/** Every id this person could appear under, for a database-side filter. */
export function participationWhere(personId: string) {
  return {
    OR: [
      { surgeonId: personId },
      { assistantSurgeonId: personId },
      { anesthetistId: personId },
      { supervisingConsultantId: personId },
      { teamMembers: { some: { userId: personId } } },
      { intraOperativeRecord: { primarySurgeonId: personId } },
    ],
  };
}
