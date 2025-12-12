import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // Format: YYYY-MM
    const unit = searchParams.get("unit");

    if (!month) {
      return NextResponse.json(
        { error: "month parameter is required (format: YYYY-MM)" },
        { status: 400 }
      );
    }

    const [year, monthNum] = month.split("-");
    const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59);

    const where: any = {
      scheduledDate: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (unit && unit !== "ALL") {
      where.unit = unit;
    }

    const surgeries = await prisma.surgery.findMany({
      where,
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
        items: {
          include: {
            item: true,
          },
        },
      },
      orderBy: { scheduledDate: "asc" },
    });

    // Group by unit
    const unitPerformance: any = {};
    surgeries.forEach((surgery) => {
      const surgeryUnit = surgery.unit;
      if (!unitPerformance[surgeryUnit]) {
        unitPerformance[surgeryUnit] = {
          unit: surgeryUnit,
          booked: 0,
          completed: 0,
          cancelled: 0,
          scheduled: 0,
          inProgress: 0,
          totalCost: 0,
          avgCost: 0,
          completionRate: 0,
          cancellationRate: 0,
        };
      }

      unitPerformance[surgeryUnit].booked++;
      
      if (surgery.status === "COMPLETED") {
        unitPerformance[surgeryUnit].completed++;
        if (surgery.totalItemsCost) {
          unitPerformance[surgeryUnit].totalCost += parseFloat(
            surgery.totalItemsCost.toString()
          );
        }
      }
      if (surgery.status === "CANCELLED") unitPerformance[surgeryUnit].cancelled++;
      if (surgery.status === "SCHEDULED") unitPerformance[surgeryUnit].scheduled++;
      if (surgery.status === "IN_PROGRESS") unitPerformance[surgeryUnit].inProgress++;
    });

    // Calculate rates and averages
    Object.values(unitPerformance).forEach((perf: any) => {
      perf.completionRate =
        perf.booked > 0 ? ((perf.completed / perf.booked) * 100).toFixed(2) : 0;
      perf.cancellationRate =
        perf.booked > 0 ? ((perf.cancelled / perf.booked) * 100).toFixed(2) : 0;
      perf.avgCost =
        perf.completed > 0 ? (perf.totalCost / perf.completed).toFixed(2) : 0;
    });

    // Week-by-week breakdown
    const weeklyBreakdown: any = [];
    const weeks = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );

    for (let i = 0; i < weeks; i++) {
      const weekStart = new Date(startDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(
        Math.min(
          weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1,
          endDate.getTime()
        )
      );

      const weekSurgeries = surgeries.filter(
        (s) =>
          s.scheduledDate >= weekStart && s.scheduledDate <= weekEnd
      );

      weeklyBreakdown.push({
        week: i + 1,
        startDate: weekStart.toISOString().split("T")[0],
        endDate: weekEnd.toISOString().split("T")[0],
        booked: weekSurgeries.length,
        completed: weekSurgeries.filter((s) => s.status === "COMPLETED").length,
        cancelled: weekSurgeries.filter((s) => s.status === "CANCELLED").length,
      });
    }

    return NextResponse.json({
      month,
      totalBooked: surgeries.length,
      totalCompleted: surgeries.filter((s) => s.status === "COMPLETED").length,
      totalCancelled: surgeries.filter((s) => s.status === "CANCELLED").length,
      unitPerformance: Object.values(unitPerformance),
      weeklyBreakdown,
    });
  } catch (error) {
    console.error("Error fetching monthly analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch monthly analytics" },
      { status: 500 }
    );
  }
}
