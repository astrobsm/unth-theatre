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
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const allocations = await prisma.theatreAllocation.findMany({
      where: {
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        theatre: true,
      },
    });

    // Get all theatre suites
    const theatres = await prisma.theatreSuite.findMany({
      orderBy: { name: "asc" },
    });

    // Aggregate equipment usage
    const equipmentUsage: Record<string, number> = {};
    
    allocations.forEach((allocation) => {
      const equipment = allocation.equipment
        ? JSON.parse(allocation.equipment as string)
        : [];
      
      equipment.forEach((item: string) => {
        equipmentUsage[item] = (equipmentUsage[item] || 0) + 1;
      });
    });

    const summary = {
      date,
      totalTheatres: theatres.length,
      totalAllocations: allocations.length,
      theatres: theatres.map((theatre) => {
        const theatreAllocations = allocations.filter(
          (a) => a.theatreId === theatre.id
        );
        
        return {
          id: theatre.id,
          name: theatre.name,
          status: theatre.status,
          allocations: theatreAllocations.map((a) => ({
            id: a.id,
            type: a.allocationType,
            startTime: a.startTime,
            endTime: a.endTime,
            equipment: a.equipment ? JSON.parse(a.equipment as string) : [],
          })),
          utilizationPercentage: (theatreAllocations.length / 8) * 100, // Assuming 8-hour day
        };
      }),
      equipmentSummary: Object.entries(equipmentUsage).map(([name, count]) => ({
        name,
        count,
      })),
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Error fetching daily summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch daily summary" },
      { status: 500 }
    );
  }
}
