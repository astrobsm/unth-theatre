import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = [
  "ADMIN",
  "SYSTEM_ADMINISTRATOR",
  "THEATRE_MANAGER",
  "THEATRE_CAFETERIA_MANAGER",
];

interface StaffEntry {
  userId: string | null;
  name: string;
  role: string;        // SurgicalTeamRole or staff role / category
  meta?: string;       // surgery procedure / shift / sub-role / location
  hasActivity: boolean | null;  // null = unknown (free-text member with no userId)
  /// QUALIFYING | SYSTEM_ONLY | NONE — null for a free-text member.
  activityLevel?: string | null;
}

/**
 * GET /api/cafeteria/daily-staff?date=YYYY-MM-DD
 *
 * Returns:
 *  - The full surgical team (consultants / senior registrars / registrars / house officers)
 *    pulled from every Surgery scheduled for the given day.
 *  - Every staff member rostered for the day, grouped by category.
 *  - For each user we mark `hasActivity` true if they have ANY audit log
 *    entry today (i.e. they have logged some duty in the system).
 *
 * Visible to ADMIN / SYSTEM_ADMINISTRATOR / THEATRE_MANAGER /
 * THEATRE_CAFETERIA_MANAGER so the cafeteria manager can plan and dispense
 * lunch only to staff who have actually logged activity for the day.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const day = dateParam ? new Date(dateParam) : new Date();
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    // 1) Today's surgeries -> surgical team members
    const surgeries = await prisma.surgery.findMany({
      where: { scheduledDate: { gte: start, lt: end } },
      select: {
        id: true,
        procedureName: true,
        teamMembers: {
          select: {
            id: true,
            userId: true,
            memberName: true,
            role: true,
            user: { select: { id: true, fullName: true, role: true } },
          },
        },
      },
    });

    // 2) Today's roster
    const rosters = await prisma.roster.findMany({
      where: { date: { gte: start, lt: end } },
      include: {
        user: { select: { id: true, fullName: true, role: true, staffCode: true } },
      },
    });

    // 3) Audit-log activity for today — collect user ids that did anything today
    const auditedToday = await prisma.auditLog.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { userId: true },
      distinct: ["userId"],
    });
    const activeUserIds = new Set(auditedToday.map((a) => a.userId));

    // ── QUALIFYING activity: work, not presence ─────────────────────────────
    // An audit-log row means "this person did something the system recorded",
    // which includes actions that are not theatre work at all. Being present is
    // not the same as having worked, and lunch is for the second.
    //
    // These three are the same sources /api/meals/eligibility uses, so the board
    // and a staff member's own check can never disagree.
    const [casesWorked, transports, theatreTasks] = await Promise.all([
      // A case that actually RAN with this person on it. Assignment is not work;
      // a case that reached theatre and started or finished is.
      prisma.surgery.findMany({
        where: {
          scheduledDate: { gte: start, lt: end },
          status: { in: ['IN_PROGRESS', 'COMPLETED'] },
        },
        select: { surgeonId: true, anesthetistId: true, scrubNurseId: true },
      }),
      prisma.holdingAreaAssessment.findMany({
        where: { transportRecordedAt: { gte: start, lt: end } },
        select: { transportPorterIds: true },
      }),
      prisma.theatreCaseFlow.findMany({
        where: { updatedAt: { gte: start, lt: end } },
        select: { porterIds: true, cleanerIds: true },
      }),
    ]);

    const qualifyingUserIds = new Set<string>();
    for (const c of casesWorked) {
      for (const id of [c.surgeonId, c.anesthetistId, c.scrubNurseId]) {
        if (id) qualifyingUserIds.add(id);
      }
    }
    // Porter and cleaner ids are stored as delimited strings on these rows, so
    // membership is a substring test rather than a join.
    const idsIn = (blob: string | null | undefined) =>
      (blob ?? '').split(/[^A-Za-z0-9-]+/).filter(Boolean);
    for (const t of transports) for (const id of idsIn(t.transportPorterIds)) qualifyingUserIds.add(id);
    for (const t of theatreTasks) {
      for (const id of idsIn(t.porterIds)) qualifyingUserIds.add(id);
      for (const id of idsIn(t.cleanerIds)) qualifyingUserIds.add(id);
    }

    const checkActivity = (userId: string | null | undefined): boolean | null => {
      if (!userId) return null;
      return activeUserIds.has(userId);
    };

    /**
     * Three states, not two.
     *
     *   QUALIFYING  did recognised theatre work — eligible
     *   SYSTEM_ONLY used the system but no theatre work is recorded — a person
     *               should look before dispensing, because several roles
     *               (pharmacy, CSSD, biomedical, recovery) have no pathway yet
     *               and refusing them outright would starve people who worked
     *   NONE        nothing at all
     */
    const activityLevel = (userId: string | null | undefined): string | null => {
      if (!userId) return null;
      if (qualifyingUserIds.has(userId)) return 'QUALIFYING';
      if (activeUserIds.has(userId)) return 'SYSTEM_ONLY';
      return 'NONE';
    };

    // ---- Build surgical team buckets ----
    const surgicalTeam: Record<string, StaffEntry[]> = {
      CONSULTANT: [],
      SENIOR_REGISTRAR: [],
      REGISTRAR: [],
      HOUSE_OFFICER: [],
    };
    const seenSurgeon = new Set<string>(); // dedupe by userId+role across surgeries
    for (const s of surgeries) {
      for (const m of s.teamMembers) {
        const name = m.user?.fullName || m.memberName || "Unknown";
        const key = `${m.userId || name}::${m.role}`;
        if (seenSurgeon.has(key)) continue;
        seenSurgeon.add(key);
        surgicalTeam[m.role].push({
          userId: m.userId ?? null,
          name,
          role: m.role,
          meta: s.procedureName,
          hasActivity: checkActivity(m.userId),
          activityLevel: activityLevel(m.userId),
        });
      }
    }

    const totalSurgeons =
      surgicalTeam.CONSULTANT.length +
      surgicalTeam.SENIOR_REGISTRAR.length +
      surgicalTeam.REGISTRAR.length +
      surgicalTeam.HOUSE_OFFICER.length;

    // ---- Build roster staff buckets ----
    const rosterStaff: Record<string, StaffEntry[]> = {
      ANAESTHETISTS: [],
      ANAESTHETIC_TECHNICIANS: [],
      NURSES: [],
      RECOVERY_NURSES: [],
      PHARMACISTS: [],
      PORTERS: [],
      CLEANERS: [],
    };
    for (const r of rosters) {
      const bucket = rosterStaff[r.staffCategory];
      if (!bucket) continue;
      bucket.push({
        userId: r.user.id,
        name: r.user.fullName,
        role: r.staffCategory,
        meta: [r.shift, r.location, r.subRole, r.seniorityLevel]
          .filter(Boolean)
          .join(" • "),
        hasActivity: checkActivity(r.user.id),
        activityLevel: activityLevel(r.user.id),
      });
    }

    // ---- Totals (unique userIds) ----
    const allEntries: StaffEntry[] = [
      ...Object.values(surgicalTeam).flat(),
      ...Object.values(rosterStaff).flat(),
    ];
    const uniqueUserIds = new Set<string>();
    for (const e of allEntries) if (e.userId) uniqueUserIds.add(e.userId);
    let qualifying = 0;
    uniqueUserIds.forEach((id) => { if (qualifyingUserIds.has(id)) qualifying++; });

    let loggedIn = 0;
    uniqueUserIds.forEach((id) => {
      if (activeUserIds.has(id)) loggedIn++;
    });

    return NextResponse.json({
      date: start.toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      surgicalTeam,
      totalSurgeons,
      rosterStaff,
      totals: {
        totalStaff: uniqueUserIds.size + allEntries.filter((e) => !e.userId).length,
        uniqueIdentified: uniqueUserIds.size,
        loggedIn,
        qualifying,
        systemOnly: loggedIn - qualifying,
        notLoggedIn: uniqueUserIds.size - loggedIn,
      },
    });
  } catch (error) {
    console.error("[/api/cafeteria/daily-staff] error:", error);
    return NextResponse.json(
      { error: "Failed to load daily staff" },
      { status: 500 }
    );
  }
}
