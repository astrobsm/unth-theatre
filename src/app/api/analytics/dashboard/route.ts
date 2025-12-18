import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get surgery trends
    const surgeries = await prisma.surgery.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        createdAt: true,
        status: true,
      },
    });

    // Get cost data by category
    const costByCategory = await prisma.surgeryItem.groupBy({
      by: ['itemId'],
      where: {
        surgery: {
          createdAt: {
            gte: startDate,
          },
        },
      },
      _sum: {
        totalCost: true,
      },
    });

    const itemsWithCategory = await prisma.inventoryItem.findMany({
      where: {
        id: {
          in: costByCategory.map((item) => item.itemId),
        },
      },
      select: {
        id: true,
        category: true,
      },
    });

    const categoryMap = itemsWithCategory.reduce((acc, item) => {
      acc[item.id] = item.category;
      return acc;
    }, {} as Record<string, string>);

    const categoryTotals = costByCategory.reduce((acc, item) => {
      const category = categoryMap[item.itemId] || 'OTHER';
      const cost = item._sum.totalCost ? Number(item._sum.totalCost) : 0;
      acc[category] = (acc[category] || 0) + cost;
      return acc;
    }, {} as Record<string, number>);

    // Get theatre utilization - count allocations per theatre
    const theaterAllocations = await prisma.theatreAllocation.findMany({
      where: {
        date: {
          gte: startDate,
        },
      },
      select: {
        theatreId: true,
      },
    });

    // Count allocations per theatre
    const allocationCounts: Record<string, number> = {};
    theaterAllocations.forEach((allocation) => {
      allocationCounts[allocation.theatreId] = (allocationCounts[allocation.theatreId] || 0) + 1;
    });

    const theatres = await prisma.theatreSuite.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    const utilizationData = theatres.map((theatre) => ({
      name: theatre.name,
      utilization: Math.min(100, ((allocationCounts[theatre.id] || 0) / days) * 100),
    }));

    // Group surgeries by day
    const dailyData: Record<string, { scheduled: number; completed: number; cancelled: number }> =
      {};

    surgeries.forEach((surgery) => {
      const date = surgery.createdAt.toISOString().split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = { scheduled: 0, completed: 0, cancelled: 0 };
      }
      dailyData[date].scheduled++;
      if (surgery.status === 'COMPLETED') dailyData[date].completed++;
      if (surgery.status === 'CANCELLED') dailyData[date].cancelled++;
    });

    // Get last 'days' worth of dates
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }

    const trendData = {
      labels: dates.map((d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })),
      scheduled: dates.map((d) => dailyData[d]?.scheduled || 0),
      completed: dates.map((d) => dailyData[d]?.completed || 0),
      cancelled: dates.map((d) => dailyData[d]?.cancelled || 0),
    };

    return NextResponse.json({
      surgeryTrend: trendData,
      costBreakdown: {
        labels: Object.keys(categoryTotals),
        values: Object.values(categoryTotals),
      },
      theatreUtilization: {
        theatres: utilizationData.map((t) => t.name),
        utilization: utilizationData.map((t) => Math.round(t.utilization)),
      },
      summary: {
        totalSurgeries: surgeries.length,
        completedSurgeries: surgeries.filter((s) => s.status === 'COMPLETED').length,
        cancelledSurgeries: surgeries.filter((s) => s.status === 'CANCELLED').length,
        totalCost: Object.values(categoryTotals).reduce((a, b) => a + b, 0),
      },
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
