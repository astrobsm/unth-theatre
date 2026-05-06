import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["ADMIN", "SYSTEM_ADMINISTRATOR", "THEATRE_MANAGER"].includes(session.user.role)) {
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
  } catch (error: any) {
    console.error("Error updating theatre:", error);
    const msg = error?.message || "Failed to update theatre";
    return NextResponse.json(
      { error: msg },
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
    if (!session || !["ADMIN", "SYSTEM_ADMINISTRATOR", "THEATRE_MANAGER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Pre-check the dependents we know about. Anything else will be caught
    // below by the P2003 foreign-key handler.
    const [allocations, surgicalUnitSchedules, surgeries] = await Promise.all([
      prisma.theatreAllocation.count({ where: { theatreId: params.id } }).catch(() => 0),
      prisma.surgicalUnitSchedule.count({ where: { theatreId: params.id } }).catch(() => 0),
      prisma.surgery.count({ where: { theatreId: params.id } }).catch(() => 0),
    ]);
    const blockers: string[] = [];
    if (allocations) blockers.push(`${allocations} allocation(s)`);
    if (surgicalUnitSchedules) blockers.push(`${surgicalUnitSchedules} unit schedule(s)`);
    if (surgeries) blockers.push(`${surgeries} surgery booking(s)`);
    if (blockers.length > 0) {
      return NextResponse.json(
        {
          error:
            `Cannot delete theatre because it is referenced by: ${blockers.join(', ')}. ` +
            `Reassign or remove those records first, or set the theatre to MAINTENANCE/RESERVED instead.`,
        },
        { status: 409 }
      );
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
  } catch (error: any) {
    console.error("Error deleting theatre:", error);
    if (error?.code === 'P2003' || error?.code === 'P2014') {
      return NextResponse.json(
        { error: "Cannot delete theatre because other records still reference it. Set status to MAINTENANCE/RESERVED instead." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to delete theatre" },
      { status: 500 }
    );
  }
}
