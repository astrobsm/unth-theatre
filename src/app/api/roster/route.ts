import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = 'force-dynamic';

const rosterSchema = z.object({
  userId: z.string(),
  staffName: z.string(),
  staffCategory: z.enum(['NURSES', 'ANAESTHETISTS', 'PORTERS', 'CLEANERS', 'ANAESTHETIC_TECHNICIANS', 'PHARMACISTS', 'RECOVERY_NURSES']),
  date: z.string(),
  theatreId: z.string().optional().nullable(),
  shift: z.enum(['MORNING', 'CALL', 'NIGHT']),
  seniorityLevel: z.string().optional().nullable(),
  subRole: z.string().optional().nullable(),
  location: z.enum(['MAIN_THEATRE', 'A_AND_E', 'EYE_THEATRE', 'CTU_THEATRE']).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateRosterSchema = z.object({
  id: z.string().min(1, 'Roster ID is required'),
  staffName: z.string().min(1).optional(),
  staffCategory: z.enum(['NURSES', 'ANAESTHETISTS', 'PORTERS', 'CLEANERS', 'ANAESTHETIC_TECHNICIANS', 'PHARMACISTS', 'RECOVERY_NURSES']).optional(),
  date: z.string().optional(),
  theatreId: z.string().nullable().optional(),
  shift: z.enum(['MORNING', 'CALL', 'NIGHT']).optional(),
  seniorityLevel: z.string().nullable().optional(),
  subRole: z.string().nullable().optional(),
  location: z.enum(['MAIN_THEATRE', 'A_AND_E', 'EYE_THEATRE', 'CTU_THEATRE']).nullable().optional(),
  notes: z.string().nullable().optional(),
  editReason: z.string().min(5, 'Edit reason must be at least 5 characters'),
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
        seniorityLevel: validatedData.seniorityLevel ?? null,
        subRole: validatedData.subRole ?? null,
        location: validatedData.location ?? null,
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

// PUT - Update roster assignment (requires edit reason for audit)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updateRosterSchema.parse(body);

    const existing = await prisma.roster.findUnique({
      where: { id: validatedData.id },
      select: {
        id: true,
        staffName: true,
        staffCategory: true,
        date: true,
        theatreId: true,
        shift: true,
        seniorityLevel: true,
        subRole: true,
        location: true,
        notes: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Roster entry not found' }, { status: 404 });
    }

    const updateData: any = {
      ...(validatedData.staffName !== undefined ? { staffName: validatedData.staffName } : {}),
      ...(validatedData.staffCategory !== undefined ? { staffCategory: validatedData.staffCategory } : {}),
      ...(validatedData.date !== undefined ? { date: new Date(validatedData.date) } : {}),
      ...(validatedData.theatreId !== undefined ? { theatreId: validatedData.theatreId } : {}),
      ...(validatedData.shift !== undefined ? { shift: validatedData.shift } : {}),
      ...(validatedData.seniorityLevel !== undefined ? { seniorityLevel: validatedData.seniorityLevel } : {}),
      ...(validatedData.subRole !== undefined ? { subRole: validatedData.subRole } : {}),
      ...(validatedData.location !== undefined ? { location: validatedData.location } : {}),
      ...(validatedData.notes !== undefined ? { notes: validatedData.notes } : {}),
    };

    const updated = await prisma.roster.update({
      where: { id: validatedData.id },
      data: updateData,
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

    const changeLog = {
      before: {
        staffName: existing.staffName,
        staffCategory: existing.staffCategory,
        date: existing.date,
        theatreId: existing.theatreId,
        shift: existing.shift,
        seniorityLevel: existing.seniorityLevel,
        subRole: existing.subRole,
        location: existing.location,
        notes: existing.notes,
      },
      after: {
        staffName: updated.staffName,
        staffCategory: updated.staffCategory,
        date: updated.date,
        theatreId: updated.theatreId,
        shift: updated.shift,
        seniorityLevel: updated.seniorityLevel,
        subRole: updated.subRole,
        location: updated.location,
        notes: updated.notes,
      },
      reason: validatedData.editReason,
    };

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'ROSTER_EDIT',
        tableName: 'rosters',
        recordId: updated.id,
        changes: JSON.stringify(changeLog),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Roster update error:', error);
    return NextResponse.json(
      { error: 'Failed to update roster' },
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
