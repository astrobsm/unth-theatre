import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const consumableSchema = z.object({
  consumables: z.array(
    z.object({
      inventoryItemId: z.string(),
      quantity: z.number().int().positive(),
    })
  ),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const consumables = await prisma.surgeryItem.findMany({
      where: {
        surgeryId: params.id,
      },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            unitCostPrice: true,
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    return NextResponse.json(consumables);

  } catch (error) {
    console.error("Failed to fetch consumables:", error);
    return NextResponse.json(
      { error: "Failed to fetch consumables" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = consumableSchema.parse(body);

    // Check inventory availability
    for (const item of validatedData.consumables) {
      const inventoryItem = await prisma.inventoryItem.findUnique({
        where: { id: item.inventoryItemId },
      });

      if (!inventoryItem) {
        return NextResponse.json(
          { error: `Inventory item not found: ${item.inventoryItemId}` },
          { status: 404 }
        );
      }

      if (inventoryItem.quantity < item.quantity) {
        return NextResponse.json(
          { error: `Insufficient quantity for ${inventoryItem.name}. Available: ${inventoryItem.quantity}` },
          { status: 400 }
        );
      }
    }

    // Create surgery items and update inventory in a transaction
    const results = await prisma.$transaction(async (tx) => {
      const createdItems = [];

      for (const item of validatedData.consumables) {
        // Create surgery item
        const surgeryItem = await tx.surgeryItem.create({
          data: {
            surgeryId: params.id,
            itemId: item.inventoryItemId,
            quantity: item.quantity,
            unitCost: 0,
            totalCost: 0
          },
          include: {
            item: true,
          }
        });

        createdItems.push(surgeryItem);

        // Update inventory quantity
        await tx.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: {
            quantity: {
              decrement: item.quantity
            }
          }
        });
      }

      return createdItems;
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'surgery_items',
        recordId: params.id,
        changes: `Added ${validatedData.consumables.length} consumable items to surgery`,
      }
    });

    return NextResponse.json(results, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Failed to create consumables:", error);
    return NextResponse.json(
      { error: "Failed to create consumables" },
      { status: 500 }
    );
  }
}
