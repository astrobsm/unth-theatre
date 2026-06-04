import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MANAGER_ROLES = new Set([
  "ADMIN",
  "SYSTEM_ADMINISTRATOR",
  "THEATRE_MANAGER",
  "THEATRE_CAFETERIA_MANAGER",
]);

function isManager(role: string | undefined): boolean {
  return !!role && MANAGER_ROLES.has(role);
}

/**
 * GET /api/meals/menu
 *
 * Query:
 *   - availability=FREE_FOR_ON_DUTY | PAID (optional)
 *   - includeInactive=true               (manager only)
 *
 * Authenticated users see active items by default. Managers may also
 * pass includeInactive=true to see retired items for editing.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const availability = searchParams.get("availability");
    const includeInactive = searchParams.get("includeInactive") === "true";
    const managerView = isManager(session.user.role) && includeInactive;

    const where: any = {};
    if (!managerView) where.isActive = true;
    if (availability === "FREE_FOR_ON_DUTY" || availability === "PAID") {
      where.availability = availability;
    }

    const items = await prisma.mealMenuItem.findMany({
      where,
      orderBy: [{ availability: "asc" }, { category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        availability: true,
        price: true,
        currency: true,
        imageUrl: true,
        isActive: true,
        dailyCapacity: true,
        prepTimeMin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[/api/meals/menu GET]", error);
    return NextResponse.json({ error: "Failed to load menu" }, { status: 500 });
  }
}

/**
 * POST /api/meals/menu  (manager only)
 * Body: { name, description?, category, availability, price?, currency?,
 *         imageUrl?, isActive?, dailyCapacity?, prepTimeMin? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    if (!body?.name || !body?.category || !body?.availability) {
      return NextResponse.json(
        { error: "name, category and availability are required" },
        { status: 400 }
      );
    }

    const item = await prisma.mealMenuItem.create({
      data: {
        name: String(body.name).trim(),
        description: body.description ? String(body.description) : null,
        category: body.category,
        availability: body.availability,
        price:
          body.availability === "FREE_FOR_ON_DUTY"
            ? 0
            : Number(body.price ?? 0),
        currency: body.currency ?? "NGN",
        imageUrl: body.imageUrl ?? null,
        isActive: body.isActive !== false,
        dailyCapacity:
          typeof body.dailyCapacity === "number" ? body.dailyCapacity : null,
        prepTimeMin:
          typeof body.prepTimeMin === "number" ? body.prepTimeMin : null,
        createdById: (session.user as any).id,
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("[/api/meals/menu POST]", error);
    return NextResponse.json(
      { error: "Failed to create menu item" },
      { status: 500 }
    );
  }
}
