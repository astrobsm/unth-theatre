import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = 'force-dynamic';

const rosterSchema = z.object({
  userId: z.string(),
  staffName: z.string(),
  staffCategory: z.enum(['NURSES', 'ANAESTHETISTS', 'PORTERS', 'CLEANERS', 'ANAESTHETIC_TECHNICIANS']),
  date: z.string(),
  theatreId: z.string().optional().nullable(),
  shift: z.enum(['MORNING', 'CALL', 'NIGHT']),
  notes: z.string().optional().nullable(),
});

// GET - Fetch roster assignments
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const theatreId = searchParams.get('theatreId');
    const shift = searchParams.get('shift');
    const staffCategory = searchParams.get('staffCategory');

    const where: any = {};
    
    if (date) {
      where.date = new Date(date);
    }
    
    if (theatreId) {
      where.theatreId = theatreId;
    }
    
    if (shift) {
      where.shift = shift;
    }
    
    if (staffCategory) {
      where.staffCategory = staffCategory;
    }

    const rosters = await prisma.roster.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
            staffCode: true,
          },
        },
        theatre: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { date: 'asc' },
        { shift: 'asc' },
        { staffCategory: 'asc' },
      ],
    });

    return NextResponse.json(rosters);
  } catch (error) {
    console.error("Roster fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch rosters" },
      { status: 500 }
    );
  }
}

// POST - Create roster assignment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = rosterSchema.parse(body);

    const roster = await prisma.roster.create({
      data: {
        userId: validatedData.userId,
        staffName: validatedData.staffName,
        staffCategory: validatedData.staffCategory,
        date: new Date(validatedData.date),
        theatreId: validatedData.theatreId,
        shift: validatedData.shift,
        uploadedBy: session.user.id,
        notes: validatedData.notes,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        theatre: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(roster, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Roster creation error:", error);
    return NextResponse.json(
      { error: "Failed to create roster" },
      { status: 500 }
    );
  }
}

// DELETE - Remove roster assignment
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: "Roster ID required" }, { status: 400 });
    }

    await prisma.roster.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Roster deleted successfully" });
  } catch (error) {
    console.error("Roster deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete roster" },
      { status: 500 }
    );
  }
}
