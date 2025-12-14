import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalSurgeries,
      scheduledSurgeries,
      totalPatients,
      todaySurgeries,
    ] = await Promise.all([
      prisma.surgery.count(),
      prisma.surgery.count({
        where: { status: 'SCHEDULED' }
      }),
      prisma.patient.count(),
      prisma.surgery.count({
        where: {
          scheduledDate: {
            gte: today,
            lt: tomorrow
          }
        }
      }),
    ]);

    // Get low stock items separately with proper query
    const inventoryItems = await prisma.inventoryItem.findMany({
      select: {
        id: true,
        quantity: true,
        reorderLevel: true,
      }
    });
    const lowStockItems = inventoryItems.filter(item => item.quantity <= item.reorderLevel).length;

    return NextResponse.json({
      totalSurgeries,
      scheduledSurgeries,
      totalPatients,
      lowStockItems,
      todaySurgeries,
      pendingTransfers: 0,
    });

  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
