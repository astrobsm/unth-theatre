import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const theatreSchema = z.object({
  name: z.string().min(1, "Theatre name is required"),
  location: z.string().min(1, "Location is required"),
  capacity: z.number().int().min(1).default(1),
  equipment: z.array(z.string()).optional(),
  status: z.enum(["AVAILABLE", "OCCUPIED", "MAINTENANCE", "RESERVED"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    const theatres = await prisma.theatreSuite.findMany({
      include: {
        allocations: date
          ? {
              where: {
                date: {
                  gte: new Date(date),
                  lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
                },
              },
              orderBy: { startTime: "asc" },
            }
          : false,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(theatres);
  } catch (error) {
    console.error("Error fetching theatres:", error);
    return NextResponse.json(
      { error: "Failed to fetch theatres" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["ADMIN", "THEATRE_MANAGER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = theatreSchema.parse(body);

    const theatre = await prisma.theatreSuite.create({
      data: {
        ...validatedData,
        equipment: validatedData.equipment
          ? JSON.stringify(validatedData.equipment)
          : null,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CREATE",
        tableName: "theatre_suites",
        recordId: theatre.id,
        changes: JSON.stringify(theatre),
      },
    });

    return NextResponse.json(theatre, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("Error creating theatre:", error);
    return NextResponse.json(
      { error: "Failed to create theatre" },
      { status: 500 }
    );
  }
}
