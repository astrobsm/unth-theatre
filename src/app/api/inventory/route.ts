import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const inventorySchema = z.object({
  name: z.string().min(1),
  category: z.enum(['CONSUMABLE', 'MACHINE', 'DEVICE', 'OTHER']),
  description: z.string().optional(),
  unitCostPrice: z.number().positive(),
  quantity: z.number().int().nonnegative(),
  reorderLevel: z.number().int().positive().default(10),
  supplier: z.string().optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await prisma.inventoryItem.findMany({
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(items);

  } catch (error) {
    console.error("Inventory fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = inventorySchema.parse(body);

    const item = await prisma.inventoryItem.create({
      data: validatedData
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE_INVENTORY_ITEM',
        tableName: 'inventory_items',
        recordId: item.id,
        changes: JSON.stringify(validatedData),
      }
    });

    return NextResponse.json(item, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input data", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Inventory create error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
