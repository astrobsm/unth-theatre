import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

// Generate unique request number
function generateRequestNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RST-${dateStr}-${random}`;
}

// Get restock requests with filtering
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const theatreNumber = searchParams.get('theatre');
    const urgency = searchParams.get('urgency');
    const requestedById = searchParams.get('requestedById');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');

    const where: any = {};

    if (status) where.status = status;
    if (theatreNumber) where.theatreNumber = theatreNumber;
    if (urgency) where.urgency = urgency;
    if (requestedById) where.requestedById = requestedById;

    if (fromDate) {
      where.requestedAt = { ...where.requestedAt, gte: new Date(fromDate) };
    }
    if (toDate) {
      where.requestedAt = { ...where.requestedAt, lte: new Date(toDate) };
    }

    const restockRequests = await prisma.subStoreRestockRequest.findMany({
      where,
      include: {
        requestedBy: { select: { id: true, fullName: true, role: true, staffCode: true } },
        approvedBy: { select: { id: true, fullName: true, staffCode: true } },
        fulfilledBy: { select: { id: true, fullName: true, staffCode: true } },
      },
      orderBy: [{ urgency: 'desc' }, { requestedAt: 'desc' }],
    });

    const summary = {
      total: restockRequests.length,
      pending: restockRequests.filter(r => r.status === 'PENDING').length,
      approved: restockRequests.filter(r => r.status === 'APPROVED').length,
      fulfilled: restockRequests.filter(r => r.status === 'FULFILLED').length,
      rejected: restockRequests.filter(r => r.status === 'REJECTED').length,
      urgent: restockRequests.filter(r => r.urgency === 'HIGH' && r.status === 'PENDING').length,
      critical: restockRequests.filter(r => r.urgency === 'CRITICAL' && r.status === 'PENDING').length,
    };

    const byTheatre = restockRequests.reduce((acc: any, req) => {
      const theatre = req.theatreNumber;
      if (!acc[theatre]) {
        acc[theatre] = {
          theatreNumber: theatre,
          theatreName: req.theatreName || `Theatre ${theatre}`,
          requests: [],
          pendingCount: 0,
          urgentCount: 0,
        };
      }
      acc[theatre].requests.push(req);
      if (req.status === 'PENDING') acc[theatre].pendingCount++;
      if (req.urgency === 'HIGH' || req.urgency === 'CRITICAL') acc[theatre].urgentCount++;
      return acc;
    }, {});

    return NextResponse.json({ requests: restockRequests, summary, byTheatre: Object.values(byTheatre) });
  } catch (error) {
    console.error('Error fetching restock requests:', error);
    return NextResponse.json({ error: 'Failed to fetch restock requests' }, { status: 500 });
  }
}

const restockItemSchema = z.object({
  itemName: z.string().min(1),
  quantity: z.number().min(1),
  currentStock: z.number().optional(),
  reason: z.string().optional(),
});

const restockRequestSchema = z.object({
  theatreNumber: z.string().min(1, 'Theatre number is required'),
  theatreName: z.string().optional(),
  items: z.array(restockItemSchema).min(1, 'At least one item is required'),
  urgency: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = (session.user as any).role;
    const userId = (session.user as any).id;

    if (!['SCRUB_NURSE', 'CIRCULATING_NURSE', 'THEATRE_MANAGER', 'ADMIN'].includes(userRole)) {
      return NextResponse.json({ error: 'Insufficient permissions to create restock request.' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = restockRequestSchema.parse(body);

    const restockRequest = await prisma.subStoreRestockRequest.create({
      data: {
        requestNumber: generateRequestNumber(),
        theatreNumber: validatedData.theatreNumber,
        theatreName: validatedData.theatreName,
        itemsRequested: JSON.stringify(validatedData.items),
        urgency: validatedData.urgency,
        requestNotes: validatedData.notes,
        requestedById: userId,
        status: 'PENDING',
        requestedAt: new Date(),
      },
      include: { requestedBy: { select: { fullName: true, staffCode: true } } },
    });

    return NextResponse.json({ success: true, message: 'Restock request created successfully', request: restockRequest }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error creating restock request:', error);
    return NextResponse.json({ error: 'Failed to create restock request' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = (session.user as any).role;
    const userId = (session.user as any).id;
    const body = await request.json();
    const { requestId, action, itemsFulfilled, notes } = body;

    if (!requestId || !action) {
      return NextResponse.json({ error: 'Request ID and action are required' }, { status: 400 });
    }

    const validActions = ['APPROVE', 'REJECT', 'FULFILL', 'PARTIALLY_FULFILL', 'CANCEL'];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (['APPROVE', 'REJECT', 'FULFILL', 'PARTIALLY_FULFILL'].includes(action) && 
        !['THEATRE_MANAGER', 'THEATRE_STORE_KEEPER', 'ADMIN'].includes(userRole)) {
      return NextResponse.json({ error: 'Only Theatre Manager or Store Keeper can process requests' }, { status: 403 });
    }

    const restockRequest = await prisma.subStoreRestockRequest.findUnique({ where: { id: requestId } });
    if (!restockRequest) {
      return NextResponse.json({ error: 'Restock request not found' }, { status: 404 });
    }

    const updateData: any = {};

    switch (action) {
      case 'APPROVE':
        updateData.status = 'APPROVED';
        updateData.approvedById = userId;
        updateData.approvedAt = new Date();
        updateData.approvalNotes = notes;
        break;
      case 'REJECT':
        updateData.status = 'REJECTED';
        updateData.approvedById = userId;
        updateData.approvedAt = new Date();
        updateData.rejectionReason = notes;
        break;
      case 'FULFILL':
        updateData.status = 'FULFILLED';
        updateData.fulfilledById = userId;
        updateData.fulfilledAt = new Date();
        updateData.itemsFulfilled = itemsFulfilled ? JSON.stringify(itemsFulfilled) : restockRequest.itemsRequested;
        updateData.fulfillmentNotes = notes;
        break;
      case 'PARTIALLY_FULFILL':
        updateData.status = 'PARTIALLY_FULFILLED';
        updateData.fulfilledById = userId;
        updateData.fulfilledAt = new Date();
        updateData.itemsFulfilled = JSON.stringify(itemsFulfilled);
        updateData.fulfillmentNotes = notes;
        break;
      case 'CANCEL':
        updateData.status = 'REJECTED';
        updateData.rejectionReason = notes || 'Cancelled';
        break;
    }

    const updatedRequest = await prisma.subStoreRestockRequest.update({
      where: { id: requestId },
      data: updateData,
      include: {
        requestedBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        fulfilledBy: { select: { fullName: true } },
      },
    });

    return NextResponse.json({ success: true, message: `Request ${action.toLowerCase()} successfully`, request: updatedRequest });
  } catch (error) {
    console.error('Error updating restock request:', error);
    return NextResponse.json({ error: 'Failed to update restock request' }, { status: 500 });
  }
}
