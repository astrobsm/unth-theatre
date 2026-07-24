import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { seedAnaesthesiaPacks } from "../../../../../prisma/seed-anaesthesia-packs";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["ADMIN", "SYSTEM_ADMINISTRATOR", "THEATRE_MANAGER"];

// POST /api/admin/seed-anaesthesia-packs?active=true|false
// Idempotent — (re)seeds the default anaesthesia packs (drugs → pharmacy,
// consumables → pack provider). Re-running replaces each pack's items in place.
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const isActive = new URL(request.url).searchParams.get("active") !== "false";
    const result = await seedAnaesthesiaPacks(prisma as any, {
      isActive,
      createdByName: (session.user as any).fullName ?? "System Seed",
    });
    return NextResponse.json({ success: true, isActive, ...result });
  } catch (e: any) {
    console.error("seed-anaesthesia-packs failed", e);
    return NextResponse.json({ error: e.message ?? "Seeding failed" }, { status: 500 });
  }
}
