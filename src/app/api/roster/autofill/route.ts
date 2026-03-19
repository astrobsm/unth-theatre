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

    // Organize staff by category — only auto-fill anaesthetists and anaesthetic technicians
    const staffSuggestions: Record<string, string | null> = {
      anaestheticTechnician: null,
      anaesthetistConsultant: null,
      anaesthetistSeniorRegistrar: null,
      anaesthetistRegistrar: null,
    };

    const staffDetails: Record<string, { id: string; name: string; role: string } | null> = {
      anaestheticTechnician: null,
      anaesthetistConsultant: null,
      anaesthetistSeniorRegistrar: null,
      anaesthetistRegistrar: null,
    };

    rosters.forEach((roster) => {
      switch (roster.staffCategory) {
        case 'ANAESTHETISTS':
          // Use seniorityLevel to distinguish consultant/senior registrar/registrar
          if (roster.seniorityLevel === 'CONSULTANT' && !staffSuggestions.anaesthetistConsultant) {
            staffSuggestions.anaesthetistConsultant = roster.user.id;
            staffDetails.anaesthetistConsultant = { id: roster.user.id, name: roster.user.fullName, role: 'Consultant' };
          } else if (roster.seniorityLevel === 'SENIOR_REGISTRAR' && !staffSuggestions.anaesthetistSeniorRegistrar) {
            staffSuggestions.anaesthetistSeniorRegistrar = roster.user.id;
            staffDetails.anaesthetistSeniorRegistrar = { id: roster.user.id, name: roster.user.fullName, role: 'Senior Registrar' };
          } else if (roster.seniorityLevel === 'REGISTRAR' && !staffSuggestions.anaesthetistRegistrar) {
            staffSuggestions.anaesthetistRegistrar = roster.user.id;
            staffDetails.anaesthetistRegistrar = { id: roster.user.id, name: roster.user.fullName, role: 'Registrar' };
          } else if (!roster.seniorityLevel) {
            // Legacy data without seniorityLevel — fall back to role-based assignment
            if (roster.user.role === 'CONSULTANT_ANAESTHETIST' && !staffSuggestions.anaesthetistConsultant) {
              staffSuggestions.anaesthetistConsultant = roster.user.id;
              staffDetails.anaesthetistConsultant = { id: roster.user.id, name: roster.user.fullName, role: 'Consultant' };
            } else if (!staffSuggestions.anaesthetistRegistrar) {
              staffSuggestions.anaesthetistRegistrar = roster.user.id;
              staffDetails.anaesthetistRegistrar = { id: roster.user.id, name: roster.user.fullName, role: 'Registrar' };
            }
          }
          break;
        
        case 'ANAESTHETIC_TECHNICIANS':
          if (!staffSuggestions.anaestheticTechnician) {
            staffSuggestions.anaestheticTechnician = roster.user.id;
            staffDetails.anaestheticTechnician = { id: roster.user.id, name: roster.user.fullName, role: 'Anaesthetic Technician' };
          }
          break;
      }
    });

    return NextResponse.json({
      staffSuggestions,
      staffDetails,
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
