import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/meals/eligibility?date=YYYY-MM-DD
 *
 * Returns whether the *current* user is eligible for a FREE on-duty meal
 * for the given day (defaults to today).
 *
 * Eligible if either:
 *   - A Roster entry exists for the user on that date, OR
 *   - The user is a member of a SurgicalTeamMember row on a Surgery
 *     scheduled for that date.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string | undefined;
    if (!userId) {
      return NextResponse.json({
        eligible: false,
        reason: "No user id on session",
      });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const day = dateParam ? new Date(dateParam) : new Date();
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const [roster, surgicalMembership, transportCredit, theatreTaskCredit] =
      await Promise.all([
        prisma.roster.findFirst({
          where: { userId, date: { gte: start, lt: end } },
          select: { id: true, shift: true, staffCategory: true, location: true },
        }),
        prisma.surgicalTeamMember.findFirst({
          where: {
            userId,
            surgery: { scheduledDate: { gte: start, lt: end } },
          },
          select: {
            id: true,
            role: true,
            surgery: { select: { procedureName: true, scheduledTime: true } },
          },
        }),
        // Porter transported a patient to the holding area today.
        prisma.holdingAreaAssessment.findFirst({
          where: {
            transportRecordedAt: { gte: start, lt: end },
            transportPorterIds: { contains: userId },
          },
          select: { id: true, transportRecordedAt: true },
        }),
        // Porter / cleaner carried out a theatre task today (received patient
        // or cleaned the theatre between cases).
        prisma.theatreCaseFlow.findFirst({
          where: {
            updatedAt: { gte: start, lt: end },
            OR: [
              { porterIds: { contains: userId } },
              { cleanerIds: { contains: userId } },
            ],
          },
          select: { id: true, theatreName: true },
        }),
      ]);

    if (roster) {
      return NextResponse.json({
        eligible: true,
        source: "ROSTER",
        details: {
          shift: roster.shift,
          staffCategory: roster.staffCategory,
          location: roster.location,
        },
      });
    }
    if (surgicalMembership) {
      return NextResponse.json({
        eligible: true,
        source: "SURGICAL_TEAM",
        details: {
          role: surgicalMembership.role,
          procedure: surgicalMembership.surgery.procedureName,
          time: surgicalMembership.surgery.scheduledTime,
        },
      });
    }
    if (transportCredit) {
      return NextResponse.json({
        eligible: true,
        source: "PATIENT_TRANSPORT",
        details: { task: "Transported a patient to the holding area" },
      });
    }
    if (theatreTaskCredit) {
      return NextResponse.json({
        eligible: true,
        source: "THEATRE_TASK",
        details: {
          task: "Theatre reception / cleaning task",
          theatre: theatreTaskCredit.theatreName,
        },
      });
    }
    return NextResponse.json({ eligible: false, source: null, details: null });
  } catch (error) {
    console.error("[/api/meals/eligibility GET]", error);
    return NextResponse.json(
      { error: "Failed to check eligibility" },
      { status: 500 }
    );
  }
}
