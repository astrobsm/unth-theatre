import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["ADMIN", "THEATRE_MANAGER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { equipment, ...rest } = body;

    const theatre = await prisma.theatreSuite.update({
      where: { id: params.id },
      data: {
        ...rest,
        equipment: equipment ? JSON.stringify(equipment) : undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "UPDATE",
        tableName: "theatre_suites",
        recordId: theatre.id,
        changes: JSON.stringify(body),
      },
    });

    return NextResponse.json(theatre);
  } catch (error) {
    console.error("Error updating theatre:", error);
    return NextResponse.json(
      { error: "Failed to update theatre" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["ADMIN", "THEATRE_MANAGER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await prisma.theatreSuite.delete({
      where: { id: params.id },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "DELETE",
        tableName: "theatre_suites",
        recordId: params.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting theatre:", error);
    return NextResponse.json(
      { error: "Failed to delete theatre" },
      { status: 500 }
    );
  }
}
