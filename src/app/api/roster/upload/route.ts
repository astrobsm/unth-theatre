import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

// POST - Bulk upload rosters from Excel
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { rosters, staffCategory } = body;

    if (!Array.isArray(rosters) || !staffCategory) {
      return NextResponse.json(
        { error: "Invalid request format. Expected {rosters: [], staffCategory: string}" },
        { status: 400 }
      );
    }

    // Validate staff category
    const validCategories = ['NURSES', 'ANAESTHETISTS', 'PORTERS', 'CLEANERS', 'ANAESTHETIC_TECHNICIANS'];
    if (!validCategories.includes(staffCategory)) {
      return NextResponse.json(
        { error: `Invalid staff category. Must be one of: ${validCategories.join(', ')}` },
        { status: 400 }
      );
    }

    const createdRosters = [];
    const errors = [];

    for (let i = 0; i < rosters.length; i++) {
      const roster = rosters[i];
      
      try {
        // Validate required fields
        if (!roster.name || !roster.date || !roster.shift) {
          errors.push({
            row: i + 1,
            error: 'Missing required fields (name, date, shift)',
            data: roster,
          });
          continue;
        }

        // Validate shift
        if (!['MORNING', 'CALL', 'NIGHT'].includes(roster.shift)) {
          errors.push({
            row: i + 1,
            error: `Invalid shift: ${roster.shift}. Must be MORNING, CALL, or NIGHT`,
            data: roster,
          });
          continue;
        }

        // Find user by name or create placeholder
        let user = await prisma.user.findFirst({
          where: {
            OR: [
              { fullName: { contains: roster.name, mode: 'insensitive' } },
              { staffCode: roster.name },
            ],
          },
        });

        // If user not found, skip or create error
        if (!user) {
          errors.push({
            row: i + 1,
            error: `User not found: ${roster.name}`,
            data: roster,
          });
          continue;
        }

        // Find theatre if specified
        let theatre = null;
        if (roster.theatre) {
          theatre = await prisma.theatreSuite.findFirst({
            where: {
              name: { contains: roster.theatre, mode: 'insensitive' },
            },
          });
        }

        // Create roster entry
        const created = await prisma.roster.create({
          data: {
            userId: user.id,
            staffName: roster.name,
            staffCategory,
            date: new Date(roster.date),
            theatreId: theatre?.id || null,
            shift: roster.shift,
            uploadedBy: session.user.id,
            notes: roster.notes || null,
          },
        });

        createdRosters.push(created);
      } catch (err: any) {
        errors.push({
          row: i + 1,
          error: err.message,
          data: roster,
        });
      }
    }

    return NextResponse.json({
      success: true,
      created: createdRosters.length,
      errors: errors.length,
      details: {
        createdRosters,
        errors,
      },
    });
  } catch (error) {
    console.error("Bulk roster upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload rosters" },
      { status: 500 }
    );
  }
}
