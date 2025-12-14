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
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const unit = searchParams.get("unit");

    const dateFilter: any = {};
    if (startDate && endDate) {
      dateFilter.scheduledDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const unitFilter: any = {};
    if (unit && unit !== "ALL") {
      unitFilter.unit = unit;
    }

    // Get all surgeries in the date range
    const surgeries = await prisma.surgery.findMany({
      where: {
        ...dateFilter,
        ...unitFilter,
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
      orderBy: { scheduledDate: "asc" },
    });

    // Group by unit
    const byUnit: any = {};
    surgeries.forEach((surgery) => {
      const unit = surgery.unit;
      if (!byUnit[unit]) {
        byUnit[unit] = {
          unit,
          booked: 0,
          completed: 0,
          cancelled: 0,
          inProgress: 0,
          scheduled: 0,
        };
      }

      byUnit[unit].booked++;
      
      switch (surgery.status) {
        case "COMPLETED":
          byUnit[unit].completed++;
          break;
        case "CANCELLED":
          byUnit[unit].cancelled++;
          break;
        case "IN_PROGRESS":
          byUnit[unit].inProgress++;
          break;
        case "SCHEDULED":
          byUnit[unit].scheduled++;
          break;
      }
    });

    // Calculate cancellation reasons
    const cancellations = await prisma.caseCancellation.findMany({
      where: {
        surgery: {
          ...dateFilter,
          ...unitFilter,
        },
      },
      include: {
        surgery: {
          select: {
            unit: true,
            scheduledDate: true,
          },
        },
      },
    });

    const cancellationsByCategory: any = {};
    cancellations.forEach((cancellation) => {
      const category = cancellation.category;
      if (!cancellationsByCategory[category]) {
        cancellationsByCategory[category] = {
          category,
          count: 0,
          percentage: 0,
        };
      }
      cancellationsByCategory[category].count++;
    });

    // Calculate percentages
    const totalCancellations = cancellations.length;
    Object.values(cancellationsByCategory).forEach((cat: any) => {
      cat.percentage = totalCancellations > 0 
        ? ((cat.count / totalCancellations) * 100).toFixed(2)
        : 0;
    });

    // Overall statistics
    const totalBooked = surgeries.length;
    const totalCompleted = surgeries.filter((s) => s.status === "COMPLETED").length;
    const totalCancelled = surgeries.filter((s) => s.status === "CANCELLED").length;
    const completionRate = totalBooked > 0 
      ? ((totalCompleted / totalBooked) * 100).toFixed(2)
      : '0';
    const cancellationRate = totalBooked > 0
      ? ((totalCancelled / totalBooked) * 100).toFixed(2)
      : '0';

    return NextResponse.json({
      summary: {
        totalBooked,
        totalCompleted,
        totalCancelled,
        totalScheduled: surgeries.filter((s) => s.status === "SCHEDULED").length,
        totalInProgress: surgeries.filter((s) => s.status === "IN_PROGRESS").length,
        completionRate: parseFloat(completionRate),
        cancellationRate: parseFloat(cancellationRate),
      },
      byUnit: Object.values(byUnit),
      cancellationsByCategory: Object.values(cancellationsByCategory),
      surgeries: surgeries.map((s) => ({
        id: s.id,
        patient: s.patient.name,
        folderNumber: s.patient.folderNumber,
        surgeon: s.surgeonName || s.surgeon?.fullName || 'Not assigned',
        procedure: s.procedureName,
        unit: s.unit,
        scheduledDate: s.scheduledDate,
        status: s.status,
        cancelled: !!s.cancellation,
        cancellationReason: s.cancellation?.reason,
        cancellationCategory: s.cancellation?.category,
      })),
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
