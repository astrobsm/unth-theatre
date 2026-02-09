import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

// Calculate stock status based on current stock and thresholds
function calculateStockStatus(currentStock: number, minimumStock: number): string {
  if (currentStock === 0) return 'OUT_OF_STOCK';
  if (currentStock <= minimumStock / 2) return 'CRITICAL';
  if (currentStock <= minimumStock) return 'LOW';
  return 'ADEQUATE';
}

// Get all sub-store items with comprehensive filtering and grouping
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', subStores: [], summary: null }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const theatreNumber = searchParams.get('theatre');
    const category = searchParams.get('category');
    const stockStatus = searchParams.get('stockStatus');
    const managedById = searchParams.get('managedById');
    const search = searchParams.get('search');
    const groupBy = searchParams.get('groupBy'); // 'theatre' or 'category'

    const where: any = {};
    
    if (theatreNumber) {
      where.theatreNumber = theatreNumber;
    }
    
    if (category) {
      where.category = category;
    }
    
    if (stockStatus) {
      where.stockStatus = stockStatus;
    }
    
    if (managedById) {
      where.managedById = managedById;
    }

    if (search) {
      where.OR = [
        { itemName: { contains: search, mode: 'insensitive' } },
        { itemCode: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    // If user is a scrub nurse, only show their assigned theatres
    if ((session.user as any).role === 'SCRUB_NURSE') {
      where.managedById = (session.user as any).id;
    }

    const subStores = await prisma.theatreSubStore.findMany({
      where,
      include: {
        managedBy: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
            role: true,
          },
        },
      },
      orderBy: [
        { theatreNumber: 'asc' },
        { category: 'asc' },
        { itemName: 'asc' },
      ],
    });

    // Calculate summary statistics
    const theatreSet = new Set(subStores.map(s => s.theatreNumber));
    const summary = {
      totalItems: subStores.length,
      totalTheatres: theatreSet.size,
      adequate: subStores.filter(s => s.stockStatus === 'ADEQUATE').length,
      lowStock: subStores.filter(s => s.stockStatus === 'LOW').length,
      critical: subStores.filter(s => s.stockStatus === 'CRITICAL').length,
      outOfStock: subStores.filter(s => s.stockStatus === 'OUT_OF_STOCK').length,
      expiringSoon: subStores.filter(s => {
        if (!s.expiryDate) return false;
        const daysUntilExpiry = Math.ceil((new Date(s.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
      }).length,
      expired: subStores.filter(s => {
        if (!s.expiryDate) return false;
        return new Date(s.expiryDate) < new Date();
      }).length,
    };

    // Group by theatre if requested
    let groupedByTheatre = null;
    if (groupBy === 'theatre') {
      groupedByTheatre = subStores.reduce((acc: any, item) => {
        if (!acc[item.theatreNumber]) {
          acc[item.theatreNumber] = {
            theatreNumber: item.theatreNumber,
            theatreName: item.theatreName || `Theatre ${item.theatreNumber}`,
            items: [],
            summary: {
              totalItems: 0,
              adequate: 0,
              lowStock: 0,
              critical: 0,
              outOfStock: 0,
            },
          };
        }
        acc[item.theatreNumber].items.push(item);
        acc[item.theatreNumber].summary.totalItems++;
        
        switch (item.stockStatus) {
          case 'ADEQUATE': acc[item.theatreNumber].summary.adequate++; break;
          case 'LOW': acc[item.theatreNumber].summary.lowStock++; break;
          case 'CRITICAL': acc[item.theatreNumber].summary.critical++; break;
          case 'OUT_OF_STOCK': acc[item.theatreNumber].summary.outOfStock++; break;
        }
        
        return acc;
      }, {});
    }

    // Group by category if requested
    let groupedByCategory = null;
    if (groupBy === 'category') {
      groupedByCategory = subStores.reduce((acc: any, item) => {
        const cat = item.category || 'Uncategorized';
        if (!acc[cat]) {
          acc[cat] = {
            category: cat,
            items: [],
            totalItems: 0,
          };
        }
        acc[cat].items.push(item);
        acc[cat].totalItems++;
        return acc;
      }, {});
    }

    // Get all unique categories for filters
    const categorySet = new Set(subStores.map(s => s.category).filter(Boolean));
    const categories = Array.from(categorySet);

    // Get all theatres with sub-stores
    const theatreSet2 = new Set(subStores.map(s => s.theatreNumber));
    const theatres = Array.from(theatreSet2).sort();

    return NextResponse.json({
      subStores: subStores,
      groupedByTheatre: groupedByTheatre ? Object.values(groupedByTheatre) : null,
      groupedByCategory: groupedByCategory ? Object.values(groupedByCategory) : null,
      summary,
      filters: {
        categories,
        theatres,
        stockStatuses: ['ADEQUATE', 'LOW', 'CRITICAL', 'OUT_OF_STOCK'],
      },
    });
  } catch (error) {
    console.error('Error fetching sub-stores:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch sub-store items', 
      subStores: [], 
      summary: {
        totalItems: 0,
        totalTheatres: 0,
        adequate: 0,
        lowStock: 0,
        critical: 0,
        outOfStock: 0,
        expiringSoon: 0,
        expired: 0,
      },
      groupedByTheatre: null,
      groupedByCategory: null,
      filters: { categories: [], theatres: [], stockStatuses: [] }
    }, { status: 500 });
  }
}

// Schema for creating sub-store items
const createSubStoreSchema = z.object({
  theatreNumber: z.string().min(1, 'Theatre number is required'),
  theatreName: z.string().optional(),
  itemName: z.string().min(1, 'Item name is required'),
  itemCode: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  currentStock: z.number().min(0).default(0),
  minimumStock: z.number().min(1).default(10),
  maximumStock: z.number().min(1).default(100),
  unit: z.string().min(1, 'Unit is required'),
  unitPrice: z.number().min(0).optional(),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  managedById: z.string().optional(),
  notes: z.string().optional(),
  sourceInventoryId: z.string().optional(), // Main store item ID to deduct from
});

// Create new sub-store item - Stock MUST come from main store
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = (session.user as any).role;
    const userId = (session.user as any).id;
    
    // Only theatre managers, store keepers, and admins can create sub-store items
    if (!['THEATRE_MANAGER', 'THEATRE_STORE_KEEPER', 'ADMIN'].includes(userRole)) {
      return NextResponse.json({ 
        error: 'Insufficient permissions. Only Theatre Manager or Store Keeper can add items to sub-stores.' 
      }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = createSubStoreSchema.parse(body);

    // If initial stock > 0, it MUST come from main store deduction
    if (validatedData.currentStock > 0 && !validatedData.sourceInventoryId) {
      return NextResponse.json({
        error: 'Initial stock must be sourced from main store inventory. Please provide sourceInventoryId or use the stock transfer feature.',
      }, { status: 400 });
    }

    // Verify and deduct from main store if initial stock is specified
    if (validatedData.currentStock > 0 && validatedData.sourceInventoryId) {
      const inventoryItem = await prisma.inventoryItem.findUnique({
        where: { id: validatedData.sourceInventoryId },
      });

      if (!inventoryItem) {
        return NextResponse.json({ error: 'Source inventory item not found in main store' }, { status: 404 });
      }

      if (inventoryItem.quantity < validatedData.currentStock) {
        return NextResponse.json({
          error: `Insufficient stock in main store. Available: ${inventoryItem.quantity}, Requested: ${validatedData.currentStock}`,
        }, { status: 400 });
      }

      // Deduct from main store
      await prisma.inventoryItem.update({
        where: { id: validatedData.sourceInventoryId },
        data: {
          quantity: { decrement: validatedData.currentStock },
        },
      });
    }

    // Calculate initial stock status
    const stockStatus = calculateStockStatus(validatedData.currentStock, validatedData.minimumStock);

    // Check if item already exists in this theatre sub-store
    const existingItem = await prisma.theatreSubStore.findFirst({
      where: {
        theatreNumber: validatedData.theatreNumber,
        itemName: validatedData.itemName,
        itemCode: validatedData.itemCode || undefined,
      },
    });

    if (existingItem) {
      // Restore main store stock if already deducted
      if (validatedData.currentStock > 0 && validatedData.sourceInventoryId) {
        await prisma.inventoryItem.update({
          where: { id: validatedData.sourceInventoryId },
          data: { quantity: { increment: validatedData.currentStock } },
        });
      }
      return NextResponse.json({ 
        error: 'Item already exists in this theatre sub-store. Use stock transfer to add more quantity.' 
      }, { status: 400 });
    }

    const subStore = await prisma.theatreSubStore.create({
      data: {
        theatreNumber: validatedData.theatreNumber,
        theatreName: validatedData.theatreName,
        itemName: validatedData.itemName,
        itemCode: validatedData.itemCode,
        category: validatedData.category,
        currentStock: validatedData.currentStock,
        minimumStock: validatedData.minimumStock,
        maximumStock: validatedData.maximumStock,
        unit: validatedData.unit,
        unitPrice: validatedData.unitPrice,
        batchNumber: validatedData.batchNumber,
        expiryDate: validatedData.expiryDate ? new Date(validatedData.expiryDate) : null,
        managedById: validatedData.managedById || userId,
        stockStatus,
        notes: validatedData.notes,
      },
      include: {
        managedBy: {
          select: {
            id: true,
            fullName: true,
            staffCode: true,
            role: true,
          },
        },
      },
    });

    // Create audit log for accountability
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'CREATE_SUBSTORE_ITEM',
          tableName: 'TheatreSubStore',
          recordId: subStore.id,
          changes: JSON.stringify({
            ...validatedData,
            sourceInventoryId: validatedData.sourceInventoryId,
            mainStoreDeducted: validatedData.currentStock > 0 ? validatedData.currentStock : 0,
            createdBy: (session.user as any).fullName || (session.user as any).email,
            timestamp: new Date().toISOString(),
          }),
        },
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    return NextResponse.json({
      success: true,
      message: 'Sub-store item created successfully' + (validatedData.currentStock > 0 ? `. ${validatedData.currentStock} units deducted from main store.` : ''),
      item: subStore,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: 'Validation error', 
        details: error.errors 
      }, { status: 400 });
    }
    console.error('Error creating sub-store item:', error);
    return NextResponse.json({ error: 'Failed to create sub-store item' }, { status: 500 });
  }
}
