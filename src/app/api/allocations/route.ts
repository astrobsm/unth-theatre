import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const allocationSchema = z.object({
  theatreId: z.string().uuid("Invalid theatre ID"),
  surgeryId: z.string().uuid().optional(),
  allocationType: z.enum(["SURGERY", "MAINTENANCE", "EMERGENCY", "RESERVED"]),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  date: z.string().datetime(),
  notes: z.string().optional(),
  equipment: z.array(z.string()).optional(),
  // Surgery-specific fields
  surgicalUnit: z.string().optional(),
  surgeryType: z.enum(["ELECTIVE", "URGENT", "EMERGENCY"]).optional(),
  // Staff assignments
  scrubNurseId: z.string().uuid().optional().nullable(),
  circulatingNurseId: z.string().uuid().optional().nullable(),
  anaestheticTechnicianId: z.string().uuid().optional().nullable(),
  anaesthetistConsultantId: z.string().uuid().optional().nullable(),
  anaesthetistSeniorRegistrarId: z.string().uuid().optional().nullable(),
  anaesthetistRegistrarId: z.string().uuid().optional().nullable(),
  cleanerId: z.string().uuid().optional().nullable(),
  porterId: z.string().uuid().optional().nullable(),
  shift: z.enum(["MORNING", "CALL", "NIGHT"]).optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const theatreId = searchParams.get("theatreId");

    const where: any = {};
    if (date) {
      where.date = {
        gte: new Date(date),
        lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
      };
    }
    if (theatreId) {
      where.theatreId = theatreId;
    }

    const allocations = await prisma.theatreAllocation.findMany({
      where,
      include: {
        theatre: true,
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json(allocations);
  } catch (error) {
    console.error("Error fetching allocations:", error);
    return NextResponse.json(
      { error: "Failed to fetch allocations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["ADMIN", "THEATRE_MANAGER", "THEATRE_CHAIRMAN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = allocationSchema.parse(body);

    // Check for conflicts
    const conflicts = await prisma.theatreAllocation.findMany({
      where: {
        theatreId: validatedData.theatreId,
        date: new Date(validatedData.date),
        OR: [
          {
            AND: [
              { startTime: { lte: new Date(validatedData.startTime) } },
              { endTime: { gt: new Date(validatedData.startTime) } },
            ],
          },
          {
            AND: [
              { startTime: { lt: new Date(validatedData.endTime) } },
              { endTime: { gte: new Date(validatedData.endTime) } },
            ],
          },
        ],
      },
    });

    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: "Theatre is already allocated for this time slot" },
        { status: 409 }
      );
    }

    const allocation = await prisma.theatreAllocation.create({
      data: {
        theatreId: validatedData.theatreId,
        surgeryId: validatedData.surgeryId,
        allocationType: validatedData.allocationType,
        startTime: new Date(validatedData.startTime),
        endTime: new Date(validatedData.endTime),
        date: new Date(validatedData.date),
        allocatedBy: session.user.id,
        notes: validatedData.notes,
        equipment: validatedData.equipment
          ? JSON.stringify(validatedData.equipment)
          : null,
        surgicalUnit: validatedData.surgicalUnit,
        surgeryType: validatedData.surgeryType,
        scrubNurseId: validatedData.scrubNurseId || null,
        circulatingNurseId: validatedData.circulatingNurseId || null,
        anaestheticTechnicianId: validatedData.anaestheticTechnicianId || null,
        anaesthetistConsultantId: validatedData.anaesthetistConsultantId || null,
        anaesthetistSeniorRegistrarId: validatedData.anaesthetistSeniorRegistrarId || null,
        anaesthetistRegistrarId: validatedData.anaesthetistRegistrarId || null,
        cleanerId: validatedData.cleanerId || null,
        porterId: validatedData.porterId || null,
        shift: validatedData.shift || null,
      },
      include: {
        theatre: true,
        scrubNurse: { select: { id: true, fullName: true, role: true } },
        circulatingNurse: { select: { id: true, fullName: true, role: true } },
        anaestheticTechnician: { select: { id: true, fullName: true, role: true } },
        anaesthetistConsultant: { select: { id: true, fullName: true, role: true } },
        anaesthetistSeniorRegistrar: { select: { id: true, fullName: true, role: true } },
        anaesthetistRegistrar: { select: { id: true, fullName: true, role: true } },
        cleaner: { select: { id: true, fullName: true, role: true } },
        porter: { select: { id: true, fullName: true, role: true } },
      },
    });

    // Update theatre status
    await prisma.theatreSuite.update({
      where: { id: validatedData.theatreId },
      data: { status: "OCCUPIED" },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CREATE",
        tableName: "theatre_allocations",
        recordId: allocation.id,
        changes: JSON.stringify(allocation),
      },
    });

    return NextResponse.json(allocation, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("Error creating allocation:", error);
    return NextResponse.json(
      { error: "Failed to create allocation" },
      { status: 500 }
    );
  }
}
