import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { GRANTABLE_MODULES, isFullAccessRole } from "@/lib/modules";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["ADMIN", "SYSTEM_ADMINISTRATOR", "THEATRE_MANAGER"];

function requireAdmin(role: string | undefined) {
  return !!role && ADMIN_ROLES.includes(role);
}

/**
 * GET /api/admin/user-access
 *  - With ?userId=...   -> returns single user + their grants
 *  - Without            -> returns all users with their grants summary
 *
 * PUT /api/admin/user-access
 *  Body: { userId: string, moduleIds: string[] }
 *  Replaces the user's entire grant set with the provided module IDs.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = request.nextUrl.searchParams.get("userId");

  try {
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          fullName: true,
          username: true,
          role: true,
          status: true,
          moduleGrants: { select: { moduleId: true, grantedAt: true, grantedById: true } },
        },
      });
      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
      return NextResponse.json({
        user: {
          id: user.id,
          fullName: user.fullName,
          username: user.username,
          role: user.role,
          status: user.status,
          isFullAccess: isFullAccessRole(user.role),
        },
        grants: user.moduleGrants.map((g) => g.moduleId),
        modules: GRANTABLE_MODULES,
      });
    }

    const users = await prisma.user.findMany({
      where: { status: "APPROVED" },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      select: {
        id: true,
        fullName: true,
        username: true,
        role: true,
        _count: { select: { moduleGrants: true } },
      },
    });

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        username: u.username,
        role: u.role,
        grantCount: u._count.moduleGrants,
        isFullAccess: isFullAccessRole(u.role),
      })),
      modules: GRANTABLE_MODULES,
    });
  } catch (e: any) {
    console.error("[/api/admin/user-access GET] failed:", e);
    const msg = String(e?.message || e);
    // Likely cause in production: the user_module_grants table does not yet
    // exist on the prod database. Surface that hint to the admin.
    const hint =
      msg.includes("user_module_grants") ||
      msg.includes("UserModuleGrant") ||
      e?.code === "P2021"
        ? "The 'user_module_grants' table is missing on this database. Run `npx prisma db push` against the production DATABASE_URL."
        : null;
    return NextResponse.json(
      { error: msg, hint, code: e?.code ?? null },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: string; moduleIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { userId, moduleIds } = body;
  if (!userId || !Array.isArray(moduleIds)) {
    return NextResponse.json({ error: "userId and moduleIds[] required" }, { status: 400 });
  }

  // Whitelist: only allow modules from the catalog (and only grantable ones).
  const grantableIds = new Set(GRANTABLE_MODULES.map((m) => m.id));
  const cleanIds = Array.from(new Set(moduleIds.filter((id) => grantableIds.has(id))));

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // No-op for full-access roles — they already see everything.
  if (isFullAccessRole(target.role)) {
    return NextResponse.json({
      ok: true,
      note: "User has a full-access role; grants have no effect.",
      grants: [],
    });
  }

  await prisma.$transaction([
    prisma.userModuleGrant.deleteMany({ where: { userId } }),
    ...(cleanIds.length
      ? [
          prisma.userModuleGrant.createMany({
            data: cleanIds.map((moduleId) => ({
              userId,
              moduleId,
              grantedById: session.user.id,
            })),
          }),
        ]
      : []),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "UPDATE_MODULE_GRANTS",
        tableName: "user_module_grants",
        recordId: userId,
        changes: JSON.stringify({ moduleIds: cleanIds }),
      },
    }),
  ]);

  return NextResponse.json({ ok: true, grants: cleanIds });
}

// Convenience: bulk reset (DELETE) — clears all grants for a user.
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await prisma.$transaction([
    prisma.userModuleGrant.deleteMany({ where: { userId } }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CLEAR_MODULE_GRANTS",
        tableName: "user_module_grants",
        recordId: userId,
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
