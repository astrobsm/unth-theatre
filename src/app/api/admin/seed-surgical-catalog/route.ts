import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { seedSurgicalCatalog } from "../../../../../prisma/seed-surgical-catalog";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["ADMIN", "SYSTEM_ADMINISTRATOR", "THEATRE_MANAGER"];

// POST /api/admin/seed-surgical-catalog
// Idempotent — re-runs the catalog seed for consumables + drugs/dressings.
export async function POST() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const result = await seedSurgicalCatalog(prisma as any);
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    console.error("seed-surgical-catalog failed", e);
    return NextResponse.json({ error: e.message ?? "Seeding failed" }, { status: 500 });
  }
}
