import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { seedSurgicalPacks } from "../../../../../prisma/seed-surgical-packs";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["ADMIN", "SYSTEM_ADMINISTRATOR", "THEATRE_MANAGER"];

// POST /api/admin/seed-surgical-packs?active=true|false
// Idempotent — (re)seeds the default subspecialty + procedure surgical packs
// (CONSUMABLE → pack providers, PHARMACY → pharmacy). Re-running replaces each
// pack's items in place. Pass ?active=false to seed as drafts for review.
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const isActive = new URL(request.url).searchParams.get("active") !== "false";
    const result = await seedSurgicalPacks(prisma as any, {
      isActive,
      createdByName: (session.user as any).fullName ?? "System Seed",
    });
    return NextResponse.json({ success: true, isActive, ...result });
  } catch (e: any) {
    console.error("seed-surgical-packs failed", e);
    return NextResponse.json({ error: e.message ?? "Seeding failed" }, { status: 500 });
  }
}
