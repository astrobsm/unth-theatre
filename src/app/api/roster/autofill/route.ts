import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

// GET - Get suggested staff from roster for a specific theatre, date, and shift
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const theatreId = searchParams.get('theatreId');
    const date = searchParams.get('date');
    const shift = searchParams.get('shift');

    if (!theatreId || !date || !shift) {
      return NextResponse.json(
        { error: "Missing required parameters: theatreId, date, shift" },
        { status: 400 }
      );
    }

    // Find rosters for this theatre, date, and shift
    const rosters = await prisma.roster.findMany({
      where: {
        theatreId,
        date: new Date(date),
        shift: shift as any,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
            staffCode: true,
          },
        },
      },
    });

    // Organize staff by category
    const staffSuggestions: Record<string, string | null> = {
      scrubNurse: null,
      circulatingNurse: null,
      anaestheticTechnician: null,
      anaesthetistConsultant: null,
      anaesthetistSeniorRegistrar: null,
      anaesthetistRegistrar: null,
      cleaner: null,
      porter: null,
    };

    rosters.forEach((roster) => {
      switch (roster.staffCategory) {
        case 'NURSES':
          // Assign nurses based on role (SCRUB_NURSE now handles both scrub and circulating)
          if (roster.user.role === 'SCRUB_NURSE' && !staffSuggestions.scrubNurse) {
            staffSuggestions.scrubNurse = roster.user.id;
          } else if (roster.user.role === 'SCRUB_NURSE' && !staffSuggestions.circulatingNurse) {
            staffSuggestions.circulatingNurse = roster.user.id;
          }
          break;
        
        case 'ANAESTHETISTS':
          // Assign anaesthetists based on role
          if (roster.user.role === 'ANAESTHETIST' && !staffSuggestions.anaesthetistConsultant) {
            staffSuggestions.anaesthetistConsultant = roster.user.id;
          }
          break;
        
        case 'ANAESTHETIC_TECHNICIANS':
          if (!staffSuggestions.anaestheticTechnician) {
            staffSuggestions.anaestheticTechnician = roster.user.id;
          }
          break;
        
        case 'CLEANERS':
          if (!staffSuggestions.cleaner) {
            staffSuggestions.cleaner = roster.user.id;
          }
          break;
        
        case 'PORTERS':
          if (!staffSuggestions.porter) {
            staffSuggestions.porter = roster.user.id;
          }
          break;
      }
    });

    return NextResponse.json({
      staffSuggestions,
      rostersFound: rosters.length,
    });
  } catch (error) {
    console.error("Roster autofill error:", error);
    return NextResponse.json(
      { error: "Failed to fetch roster suggestions" },
      { status: 500 }
    );
  }
}
