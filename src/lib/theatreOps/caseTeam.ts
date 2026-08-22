// ============================================================
// Who is on a case
// ------------------------------------------------------------
// One definition, shared. This used to live inside the check-in route, and
// Theatre Readiness needed the same answer — "who is expected in this room
// today, and has each of them said whether they are coming?"
//
// Two copies of this would diverge, and the failure mode is quiet: a board
// that says the team is complete because it counted five of the seven people
// the other screen counted. So it is here, with the field selection beside it,
// because the selection IS part of the definition — a caller that forgets to
// select supervisingConsultantId silently drops that person from the team.
// ============================================================

/** The fields caseTeamSlots needs. Spread into a Prisma select. */
export const CASE_TEAM_SELECT = {
  surgeonId: true,
  surgeonName: true,
  assistantSurgeonId: true,
  anesthetistId: true,
  scrubNurseId: true,
  theatreTechnicianId: true,
  supervisingConsultantId: true,
  supervisingConsultantName: true,
  surgeon: { select: { fullName: true } },
  assistantSurgeon: { select: { fullName: true } },
  anesthetist: { select: { fullName: true } },
  teamMembers: { select: { userId: true, memberName: true, role: true } },
} as const;

export interface CaseTeamSource {
  surgeonId: string | null;
  surgeonName: string | null;
  surgeon: { fullName: string } | null;
  assistantSurgeonId: string | null;
  assistantSurgeon: { fullName: string } | null;
  anesthetistId: string | null;
  anesthetist: { fullName: string } | null;
  scrubNurseId: string | null;
  theatreTechnicianId: string | null;
  supervisingConsultantId: string | null;
  supervisingConsultantName: string | null;
  teamMembers: { userId: string | null; memberName: string | null; role: string }[];
}

export interface CaseTeamSlot {
  userId: string;
  name: string | null;
  roleOnCase: string;
}

/** ROLE_CODE -> "Role Code", for the free-form team member rows. */
const humanise = (role: string) =>
  role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * The named slots on a case, in the order a theatre would read them.
 *
 * Deduplicated by user: one person filling two slots — the surgeon who is also
 * the supervising consultant — is one person to check in, not two, and
 * counting them twice would make a fully-present team read as half-answered.
 * The FIRST role wins, which is why the order above is the order a theatre
 * would name them in.
 *
 * Rows without a userId are dropped. A team member recorded only as free text
 * has nobody to ask and no way to answer, so counting them as "not responded"
 * would make every such case permanently incomplete.
 */
export function caseTeamSlots(s: CaseTeamSource): CaseTeamSlot[] {
  const raw = [
    { userId: s.surgeonId, name: s.surgeon?.fullName ?? s.surgeonName, roleOnCase: 'Surgeon' },
    { userId: s.assistantSurgeonId, name: s.assistantSurgeon?.fullName ?? null, roleOnCase: 'Assistant Surgeon' },
    { userId: s.anesthetistId, name: s.anesthetist?.fullName ?? null, roleOnCase: 'Anaesthetist' },
    { userId: s.scrubNurseId, name: null, roleOnCase: 'Scrub Nurse' },
    { userId: s.theatreTechnicianId, name: null, roleOnCase: 'Anaesthetic Technician' },
    { userId: s.supervisingConsultantId, name: s.supervisingConsultantName, roleOnCase: 'Supervising Consultant' },
    ...s.teamMembers.map((m) => ({
      userId: m.userId,
      name: m.memberName,
      roleOnCase: humanise(m.role),
    })),
  ];

  const seen = new Set<string>();
  const out: CaseTeamSlot[] = [];
  for (const r of raw) {
    if (!r.userId || seen.has(r.userId)) continue;
    seen.add(r.userId);
    out.push({ userId: r.userId, name: r.name ?? null, roleOnCase: r.roleOnCase });
  }
  return out;
}
