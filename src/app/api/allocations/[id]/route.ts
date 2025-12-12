import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["ADMIN", "THEATRE_MANAGER", "THEATRE_CHAIRMAN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const allocation = await prisma.theatreAllocation.findUnique({
      where: { id: params.id },
    });

    if (!allocation) {
      return NextResponse.json({ error: "Allocation not found" }, { status: 404 });
    }

    await prisma.theatreAllocation.delete({
      where: { id: params.id },
    });

    // Check if theatre has any other allocations today
    const remainingAllocations = await prisma.theatreAllocation.findMany({
      where: {
        theatreId: allocation.theatreId,
        date: allocation.date,
      },
    });

    if (remainingAllocations.length === 0) {
      await prisma.theatreSuite.update({
        where: { id: allocation.theatreId },
        data: { status: "AVAILABLE" },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "DELETE",
        tableName: "theatre_allocations",
        recordId: params.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting allocation:", error);
    return NextResponse.json(
      { error: "Failed to delete allocation" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["ADMIN", "THEATRE_MANAGER", "THEATRE_CHAIRMAN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { equipment, ...rest } = body;

    const allocation = await prisma.theatreAllocation.update({
      where: { id: params.id },
      data: {
        ...rest,
        equipment: equipment ? JSON.stringify(equipment) : undefined,
      },
      include: {
        theatre: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "UPDATE",
        tableName: "theatre_allocations",
        recordId: allocation.id,
        changes: JSON.stringify(body),
      },
    });

    return NextResponse.json(allocation);
  } catch (error) {
    console.error("Error updating allocation:", error);
    return NextResponse.json(
      { error: "Failed to update allocation" },
      { status: 500 }
    );
  }
}
