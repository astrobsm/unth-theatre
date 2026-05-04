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

    const checkActivity = (userId: string | null | undefined): boolean | null => {
      if (!userId) return null;
      return activeUserIds.has(userId);
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
      });
    }

    // ---- Totals (unique userIds) ----
    const allEntries: StaffEntry[] = [
      ...Object.values(surgicalTeam).flat(),
      ...Object.values(rosterStaff).flat(),
    ];
    const uniqueUserIds = new Set<string>();
    for (const e of allEntries) if (e.userId) uniqueUserIds.add(e.userId);
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
