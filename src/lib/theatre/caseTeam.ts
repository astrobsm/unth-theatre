// ============================================================
// Who is actually on a case
// ------------------------------------------------------------
// There is no single list. A surgery names six people in six columns
// (surgeon, assistant, anaesthetist, scrub nurse, technician, supervising
// consultant), theatre_team_assignments holds any number more added by the
// anaesthetists and the technicians, and surgical_team_members holds the ones
// entered at booking. All three are in daily use and none is authoritative on
// its own.
//
// Everything that has to address "the team" — who may answer for a case, whose
// answers appear on the board, whom the CMD can message — needs the same
// answer to the same question, so it is worked out once, here, from data the
// caller has already loaded.
//
// ONE ROW PER PERSON, NOT PER ROLE. A registrar who is both assistant and the
// person who booked the case is one human being who will either turn up or
// not, and asking them twice produces a board that can contradict itself.
// ============================================================

import type { TeamMemberAvailability, AvailabilityStatus } from './availability';

/** The named posts on a Surgery row, in the order a team is read out. */
export const NAMED_POSTS: Array<{ field: string; label: string }> = [
  { field: 'surgeonId', label: 'Surgeon' },
  { field: 'supervisingConsultantId', label: 'Supervising consultant' },
  { field: 'assistantSurgeonId', label: 'Assistant surgeon' },
  { field: 'anesthetistId', label: 'Anaesthetist' },
  { field: 'scrubNurseId', label: 'Scrub nurse' },
  { field: 'theatreTechnicianId', label: 'Theatre technician' },
];

/** Assignment-table roles, as words. */
const ASSIGNMENT_LABEL: Record<string, string> = {
  SCRUB_NURSE: 'Scrub nurse',
  CIRCULATING_NURSE: 'Circulating nurse',
  CONSULTANT_ANAESTHETIST: 'Consultant anaesthetist',
  ANAESTHETIST: 'Anaesthetist',
  ANAESTHETIC_TECHNICIAN: 'Theatre technician',
};

/** A role code from any of the three sources, in words. */
export function roleLabel(code: string | null | undefined): string {
  if (!code) return 'Team member';
  return ASSIGNMENT_LABEL[code]
    ?? code.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export interface TeamSource {
  /** The Surgery row's named-post columns. Missing keys are simply absent. */
  posts: Record<string, string | null | undefined>;
  /** Names for those ids, where the caller resolved them. */
  people: Array<{ id: string; fullName: string; phoneNumber?: string | null; role?: string | null }>;
  /** theatre_team_assignments rows, already filtered to removedAt = null. */
  assignments?: Array<{ userId: string; userName?: string | null; role?: string | null }>;
  /** surgical_team_members rows. */
  bookedMembers?: Array<{ userId?: string | null; memberName?: string | null; role?: string | null }>;
  /** case_team_availability rows for this case. */
  answers?: Array<{
    userId: string;
    status: string;
    etaMinutes?: number | null;
    note?: string | null;
    respondedAt?: Date | string | null;
  }>;
}

/**
 * The team, in reading order, each with whatever they have said.
 *
 * Named posts first, because that is how a list is read out in the morning,
 * then everybody else in the order they were added. Someone holding two roles
 * gets both, joined — "Surgeon / Booked by" — rather than two rows.
 */
export function buildCaseTeam(src: TeamSource): TeamMemberAvailability[] {
  const byId = new Map<string, TeamMemberAvailability>();
  const person = (id: string) => src.people.find((p) => p.id === id);

  const add = (id: string | null | undefined, label: string, fallbackName?: string | null) => {
    if (!id) return;
    const existing = byId.get(id);
    if (existing) {
      // A second role for somebody already listed. Joined, not duplicated.
      if (!existing.role.split(' / ').includes(label)) {
        existing.role = `${existing.role} / ${label}`;
      }
      return;
    }
    const p = person(id);
    byId.set(id, {
      userId: id,
      // A name is needed even when the user row was not loaded: a board that
      // says "Unknown" is less use than one that says what it was told.
      name: p?.fullName || fallbackName || 'Team member',
      role: label,
      phone: p?.phoneNumber ?? null,
      status: null,
    });
  };

  NAMED_POSTS.forEach(({ field, label }) => add(src.posts[field], label));
  (src.assignments ?? []).forEach((a) => add(a.userId, roleLabel(a.role), a.userName));
  (src.bookedMembers ?? []).forEach((m) => add(m.userId, roleLabel(m.role), m.memberName));

  // The answers, laid over the top. A row for somebody not on the team is
  // ignored rather than shown: they may have been taken off the case after
  // answering, and their answer is no longer about anybody's list.
  (src.answers ?? []).forEach((ans) => {
    const member = byId.get(ans.userId);
    if (!member) return;
    member.status = ans.status as AvailabilityStatus;
    member.etaMinutes = ans.etaMinutes ?? null;
    member.note = ans.note ?? null;
    member.respondedAt = ans.respondedAt ?? null;
  });

  return Array.from(byId.values());
}

/** Just the ids, for the "may this person answer?" check. */
export function teamUserIds(src: TeamSource): string[] {
  return buildCaseTeam(src).map((m) => m.userId);
}

/** This person's part on the case, for storing alongside their answer. */
export function roleOnCase(src: TeamSource, userId: string): string {
  return buildCaseTeam(src).find((m) => m.userId === userId)?.role ?? 'Team member';
}
