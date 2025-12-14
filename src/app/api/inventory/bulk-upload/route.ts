import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ItemCategory } from '@prisma/client';

interface BulkInventoryItem {
  name: string;
  category: string;
  description?: string;
  unitCostPrice: number;
  quantity: number;
  reorderLevel?: number;
  supplier?: string;
  // Consumable fields
  manufacturingDate?: string;
  expiryDate?: string;
  batchNumber?: string;
  // Equipment fields
  halfLife?: number;
  depreciationRate?: number;
  deviceId?: string;
  maintenanceIntervalDays?: number;
  lastMaintenanceDate?: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has permission to add inventory
    if (!['ADMIN', 'THEATRE_MANAGER', 'THEATRE_STORE_KEEPER'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Items array is required' }, { status: 400 });
    }

    const errors: Array<{ row: number; error: string; data: any }> = [];
    const validItems: any[] = [];

    // Validate each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowNumber = i + 2; // Excel row number (accounting for header)

      try {
        // Required fields validation
        if (!item.name || typeof item.name !== 'string' || item.name.trim() === '') {
          errors.push({ row: rowNumber, error: 'Name is required', data: item });
          continue;
        }

        if (!item.category || typeof item.category !== 'string') {
          errors.push({ row: rowNumber, error: 'Category is required', data: item });
          continue;
        }

        // Validate category
        const categoryUpper = item.category.toUpperCase();
        if (!['CONSUMABLE', 'MACHINE', 'DEVICE', 'OTHER'].includes(categoryUpper)) {
          errors.push({ 
            row: rowNumber, 
            error: 'Category must be CONSUMABLE, MACHINE, DEVICE, or OTHER', 
            data: item 
          });
          continue;
        }

        // Validate numeric fields
        if (typeof item.unitCostPrice !== 'number' || item.unitCostPrice < 0) {
          errors.push({ row: rowNumber, error: 'Valid unit cost price is required', data: item });
          continue;
        }

        if (typeof item.quantity !== 'number' || item.quantity < 0) {
          errors.push({ row: rowNumber, error: 'Valid quantity is required', data: item });
          continue;
        }

        // Check for duplicate name
        const existingItem = await prisma.inventoryItem.findFirst({
          where: { name: item.name.trim() }
        });

        if (existingItem) {
          errors.push({ 
            row: rowNumber, 
            error: `Item with name "${item.name.trim()}" already exists`, 
            data: item 
          });
          continue;
        }

        // Build item data
        const itemData: any = {
          name: item.name.trim(),
          category: categoryUpper as ItemCategory,
          description: item.description?.trim() || null,
          unitCostPrice: item.unitCostPrice,
          quantity: item.quantity,
          reorderLevel: item.reorderLevel || 10,
          supplier: item.supplier?.trim() || null,
        };

        // Add category-specific fields
        if (categoryUpper === 'CONSUMABLE') {
          if (item.manufacturingDate) {
            itemData.manufacturingDate = new Date(item.manufacturingDate);
          }
          if (item.expiryDate) {
            itemData.expiryDate = new Date(item.expiryDate);
          }
          if (item.batchNumber) {
            itemData.batchNumber = item.batchNumber.trim();
          }
        } else if (categoryUpper === 'MACHINE' || categoryUpper === 'DEVICE') {
          if (item.halfLife) {
            itemData.halfLife = parseFloat(item.halfLife);
          }
          if (item.depreciationRate) {
            itemData.depreciationRate = parseFloat(item.depreciationRate);
          }
          if (item.deviceId) {
            itemData.deviceId = item.deviceId.trim();
          }
          if (item.maintenanceIntervalDays) {
            itemData.maintenanceIntervalDays = parseInt(item.maintenanceIntervalDays);
          }
          if (item.lastMaintenanceDate) {
            const lastMaintDate = new Date(item.lastMaintenanceDate);
            itemData.lastMaintenanceDate = lastMaintDate;
            
            // Calculate next maintenance date if interval is provided
            if (itemData.maintenanceIntervalDays) {
              const nextDate = new Date(lastMaintDate);
              nextDate.setDate(nextDate.getDate() + itemData.maintenanceIntervalDays);
              itemData.nextMaintenanceDate = nextDate;
            }
          }
        }

        validItems.push(itemData);

      } catch (error: any) {
        errors.push({ 
          row: rowNumber, 
          error: error.message || 'Validation error', 
          data: item 
        });
      }
    }

    // Create valid items
    let created = 0;
    for (const itemData of validItems) {
      try {
        await prisma.inventoryItem.create({ data: itemData });
        created++;
      } catch (error: any) {
        errors.push({ 
          row: 0, 
          error: `Failed to create item: ${error.message}`, 
          data: itemData 
        });
      }
    }

    return NextResponse.json({
      success: true,
      created,
      total: items.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Bulk upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process bulk upload' },
      { status: 500 }
    );
  }
}
