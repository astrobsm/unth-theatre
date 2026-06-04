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

function assertManager(role: string | undefined) {
  if (!role || !MANAGER_ROLES.has(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const forbidden = assertManager(session.user.role);
    if (forbidden) return forbidden;

    const body = await request.json();
    const data: any = {};
    for (const k of [
      "name",
      "description",
      "category",
      "availability",
      "currency",
      "imageUrl",
    ]) {
      if (k in body) data[k] = body[k];
    }
    if ("price" in body) data.price = Number(body.price ?? 0);
    if ("isActive" in body) data.isActive = !!body.isActive;
    if ("dailyCapacity" in body)
      data.dailyCapacity =
        typeof body.dailyCapacity === "number" ? body.dailyCapacity : null;
    if ("prepTimeMin" in body)
      data.prepTimeMin =
        typeof body.prepTimeMin === "number" ? body.prepTimeMin : null;

    if (data.availability === "FREE_FOR_ON_DUTY") data.price = 0;

    const item = await prisma.mealMenuItem.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ item });
  } catch (error: any) {
    console.error("[/api/meals/menu/:id PATCH]", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to update menu item" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const forbidden = assertManager(session.user.role);
    if (forbidden) return forbidden;

    // Soft-delete: just deactivate so historical orders stay valid.
    const item = await prisma.mealMenuItem.update({
      where: { id: params.id },
      data: { isActive: false },
    });
    return NextResponse.json({ item });
  } catch (error: any) {
    console.error("[/api/meals/menu/:id DELETE]", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to deactivate menu item" },
      { status: 500 }
    );
  }
}
