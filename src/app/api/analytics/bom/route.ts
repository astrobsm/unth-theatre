import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30');
    const unit = searchParams.get('unit');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Build where clause
    const where: any = {
      scheduledDate: {
        gte: startDate,
      },
      items: {
        some: {},
      },
    };

    if (unit && unit !== 'ALL') {
      where.unit = unit;
    }

    // Fetch surgeries with items
    const surgeries = await prisma.surgery.findMany({
      where,
      include: {
        patient: {
          select: {
            name: true,
          },
        },
        items: {
          include: {
            item: {
              select: {
                name: true,
                category: true,
              },
            },
          },
        },
      },
      orderBy: {
        scheduledDate: 'desc',
      },
    });

    // Calculate analytics
    const totalSurgeries = surgeries.length;
    const totalCost = surgeries.reduce((sum, s) => {
      const cost = s.items.reduce((itemSum, item) => itemSum + Number(item.totalCost), 0);
      return sum + cost;
    }, 0);
    const averageCostPerSurgery = totalSurgeries > 0 ? totalCost / totalSurgeries : 0;
    const totalItems = surgeries.reduce((sum, s) => sum + s.items.length, 0);

    // Cost by category
    const categoryMap = new Map<string, { totalCost: number; itemCount: number }>();
    surgeries.forEach((surgery) => {
      surgery.items.forEach((item) => {
        const category = item.item.category;
        const existing = categoryMap.get(category) || { totalCost: 0, itemCount: 0 };
        categoryMap.set(category, {
          totalCost: existing.totalCost + Number(item.totalCost),
          itemCount: existing.itemCount + 1,
        });
      });
    });

    const costByCategory = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        totalCost: Math.round(data.totalCost),
        itemCount: data.itemCount,
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    // Cost by unit
    const unitMap = new Map<string, { totalCost: number; surgeryCount: number }>();
    surgeries.forEach((surgery) => {
      const surgeryUnit = surgery.unit;
      const cost = surgery.items.reduce((sum, item) => sum + Number(item.totalCost), 0);
      const existing = unitMap.get(surgeryUnit) || { totalCost: 0, surgeryCount: 0 };
      unitMap.set(surgeryUnit, {
        totalCost: existing.totalCost + cost,
        surgeryCount: existing.surgeryCount + 1,
      });
    });

    const costByUnit = Array.from(unitMap.entries())
      .map(([unit, data]) => ({
        unit,
        totalCost: Math.round(data.totalCost),
        surgeryCount: data.surgeryCount,
        averageCost: Math.round(data.totalCost / data.surgeryCount),
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    // Recent surgeries
    const recentSurgeries = surgeries.slice(0, 10).map((surgery) => ({
      id: surgery.id,
      procedureName: surgery.procedureName,
      patient: surgery.patient,
      scheduledDate: surgery.scheduledDate,
      totalItemsCost: Math.round(
        surgery.items.reduce((sum, item) => sum + Number(item.totalCost), 0)
      ),
      itemCount: surgery.items.length,
    }));

    // Monthly trend
    const monthMap = new Map<string, { totalCost: number; surgeryCount: number }>();
    surgeries.forEach((surgery) => {
      const date = new Date(surgery.scheduledDate);
      const monthKey = date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short' });
      const cost = surgery.items.reduce((sum, item) => sum + Number(item.totalCost), 0);
      const existing = monthMap.get(monthKey) || { totalCost: 0, surgeryCount: 0 };
      monthMap.set(monthKey, {
        totalCost: existing.totalCost + cost,
        surgeryCount: existing.surgeryCount + 1,
      });
    });

    const monthlyTrend = Array.from(monthMap.entries())
      .map(([month, data]) => ({
        month,
        totalCost: Math.round(data.totalCost),
        surgeryCount: data.surgeryCount,
      }))
      .reverse();

    const analytics = {
      totalSurgeries,
      totalCost: Math.round(totalCost),
      averageCostPerSurgery: Math.round(averageCostPerSurgery),
      totalItems,
      costByCategory,
      costByUnit,
      recentSurgeries,
      monthlyTrend,
    };

    return NextResponse.json(analytics);
  } catch (error) {
    console.error('Error fetching BOM analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch BOM analytics' },
      { status: 500 }
    );
  }
}
