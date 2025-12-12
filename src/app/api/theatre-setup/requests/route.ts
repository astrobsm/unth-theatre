import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { theatreId, itemName, quantityRequested, reason, urgency } = body;

    if (!theatreId || !itemName || !quantityRequested || !reason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const request_record = await prisma.theatreExtraRequest.create({
      data: {
        theatreId,
        requestedBy: session.user.id,
        itemName,
        quantityRequested,
        reason,
        urgency: urgency || 'MEDIUM',
        status: 'PENDING',
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'REQUEST_EXTRA_MATERIALS',
        tableName: 'THEATRE_EXTRA_REQUEST',
        recordId: request_record.id,
        changes: JSON.stringify({
          theatreId,
          itemName,
          quantityRequested,
          urgency,
        }),
      },
    });

    return NextResponse.json(request_record, { status: 201 });
  } catch (error) {
    console.error('Failed to create request:', error);
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }
}
