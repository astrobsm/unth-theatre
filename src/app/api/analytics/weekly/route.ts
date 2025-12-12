import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart");
    const weekEnd = searchParams.get("weekEnd");

    if (!weekStart || !weekEnd) {
      return NextResponse.json(
        { error: "weekStart and weekEnd parameters are required" },
        { status: 400 }
      );
    }

    const surgeries = await prisma.surgery.findMany({
      where: {
        scheduledDate: {
          gte: new Date(weekStart),
          lte: new Date(weekEnd),
        },
      },
      include: {
        patient: {
          select: {
            name: true,
            folderNumber: true,
          },
        },
        surgeon: {
          select: {
            fullName: true,
          },
        },
        cancellation: true,
      },
      orderBy: { unit: "asc" },
    });

    // Group by unit
    const unitSummary: any = {};
    surgeries.forEach((surgery) => {
      const unit = surgery.unit;
      if (!unitSummary[unit]) {
        unitSummary[unit] = {
          unit,
          booked: 0,
          completed: 0,
          cancelled: 0,
          scheduled: 0,
          completionRate: 0,
        };
      }

      unitSummary[unit].booked++;
      if (surgery.status === "COMPLETED") unitSummary[unit].completed++;
      if (surgery.status === "CANCELLED") unitSummary[unit].cancelled++;
      if (surgery.status === "SCHEDULED") unitSummary[unit].scheduled++;
    });

    // Calculate completion rates
    Object.values(unitSummary).forEach((summary: any) => {
      summary.completionRate =
        summary.booked > 0
          ? ((summary.completed / summary.booked) * 100).toFixed(2)
          : 0;
    });

    // Daily breakdown
    const dailyBreakdown: any = {};
    surgeries.forEach((surgery) => {
      const date = surgery.scheduledDate.toISOString().split("T")[0];
      if (!dailyBreakdown[date]) {
        dailyBreakdown[date] = {
          date,
          booked: 0,
          completed: 0,
          cancelled: 0,
        };
      }

      dailyBreakdown[date].booked++;
      if (surgery.status === "COMPLETED") dailyBreakdown[date].completed++;
      if (surgery.status === "CANCELLED") dailyBreakdown[date].cancelled++;
    });

    return NextResponse.json({
      weekStart,
      weekEnd,
      summary: {
        totalBooked: surgeries.length,
        totalCompleted: surgeries.filter((s) => s.status === "COMPLETED").length,
        totalCancelled: surgeries.filter((s) => s.status === "CANCELLED").length,
        totalScheduled: surgeries.filter((s) => s.status === "SCHEDULED").length,
      },
      unitSummary: Object.values(unitSummary),
      dailyBreakdown: Object.values(dailyBreakdown).sort(
        (a: any, b: any) => a.date.localeCompare(b.date)
      ),
    });
  } catch (error) {
    console.error("Error fetching weekly summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch weekly summary" },
      { status: 500 }
    );
  }
}
