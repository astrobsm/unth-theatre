import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = [
  "ADMIN",
  "SYSTEM_ADMINISTRATOR",
  "THEATRE_MANAGER",
  "THEATRE_CHAIRMAN",
];

const ONLINE_WINDOW_MIN = 5;          // user counted "online" if any audit row in last N minutes
const RECENT_ACTIVITY_LIMIT = 100;    // size of feed

/**
 * GET /api/admin/live-monitoring
 *
 * Real-time-ish snapshot for admins:
 *  - onlineUsers: users with audit-log activity in the last N minutes
 *  - recentActivity: last N audit log rows with user info
 *  - todayLogins: distinct LOGIN events today
 *  - hourlyBuckets: activity counts per hour for last 24h
 *
 * Designed to be polled every 5–10s by the dashboard page.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MIN * 60 * 1000);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Pull recent activity (ordered desc) — single query covers feed AND online detection
    const recent = await prisma.auditLog.findMany({
      where: { createdAt: { gte: last24h } },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        user: {
          select: { id: true, fullName: true, username: true, role: true },
        },
      },
    });

    // Online users — distinct most-recent activity per user inside the window
    const onlineMap = new Map<
      string,
      { userId: string; fullName: string; username: string; role: string; lastActiveAt: string; lastAction: string }
    >();
    for (const r of recent) {
      if (r.createdAt < onlineSince) continue;
      if (!onlineMap.has(r.userId)) {
        onlineMap.set(r.userId, {
          userId: r.userId,
          fullName: r.user?.fullName ?? "Unknown",
          username: r.user?.username ?? "",
          role: r.user?.role ?? "",
          lastActiveAt: r.createdAt.toISOString(),
          lastAction: r.action,
        });
      }
    }
    const onlineUsers = Array.from(onlineMap.values()).sort(
      (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );

    // Recent activity feed (capped)
    const recentActivity = recent.slice(0, RECENT_ACTIVITY_LIMIT).map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user?.fullName ?? "Unknown",
      userRole: r.user?.role ?? "",
      action: r.action,
      tableName: r.tableName,
      recordId: r.recordId,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
    }));

    // Today's distinct logins (count of LOGIN audit rows since midnight, distinct by user)
    const todayLogins = await prisma.auditLog.findMany({
      where: { action: "LOGIN", createdAt: { gte: startOfToday } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        user: { select: { fullName: true, username: true, role: true } },
      },
    });
    const distinctTodayLoginUsers = new Set(todayLogins.map((l) => l.userId)).size;

    // Hourly buckets for last 24h
    const hourly: { hour: string; count: number }[] = [];
    for (let i = 23; i >= 0; i--) {
      const bucketStart = new Date(now);
      bucketStart.setMinutes(0, 0, 0);
      bucketStart.setHours(bucketStart.getHours() - i);
      const bucketEnd = new Date(bucketStart.getTime() + 60 * 60 * 1000);
      const count = recent.filter(
        (r) => r.createdAt >= bucketStart && r.createdAt < bucketEnd
      ).length;
      hourly.push({
        hour: bucketStart.toISOString(),
        count,
      });
    }

    // Per-action breakdown over the last 24h
    const actionTotals: Record<string, number> = {};
    for (const r of recent) {
      actionTotals[r.action] = (actionTotals[r.action] ?? 0) + 1;
    }
    const topActions = Object.entries(actionTotals)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      generatedAt: now.toISOString(),
      onlineWindowMinutes: ONLINE_WINDOW_MIN,
      summary: {
        onlineCount: onlineUsers.length,
        eventsLast24h: recent.length,
        loginsToday: todayLogins.length,
        distinctLoginUsersToday: distinctTodayLoginUsers,
      },
      onlineUsers,
      recentActivity,
      todayLogins: todayLogins.slice(0, 50).map((l) => ({
        id: l.id,
        userId: l.userId,
        userName: l.user?.fullName ?? "Unknown",
        userRole: l.user?.role ?? "",
        username: l.user?.username ?? "",
        loggedInAt: l.createdAt.toISOString(),
      })),
      hourly,
      topActions,
    });
  } catch (error) {
    console.error("[/api/admin/live-monitoring] error:", error);
    return NextResponse.json(
      { error: "Failed to load live monitoring data" },
      { status: 500 }
    );
  }
}
