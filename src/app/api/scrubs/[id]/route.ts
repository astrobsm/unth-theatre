import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Update a single scrub set — re-allocate to an owner, change colour/size, mark
 * missing, or retire it.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const set = await prisma.scrubSet.findUnique({ where: { id: params.id } });
    if (!set) {
      return NextResponse.json(
        { error: 'Scrub set not found' },
        { status: 404 },
      );
    }

    const data: any = {};

    if (typeof body.color === 'string') data.color = body.color;
    if (typeof body.size === 'string') data.size = body.size;
    if (typeof body.condition === 'string') data.condition = body.condition;

    // Re-allocate ownership.
    if (body.ownerId !== undefined) {
      if (body.ownerId) {
        const owner = await prisma.user.findUnique({
          where: { id: body.ownerId },
          select: { fullName: true, role: true },
        });
        data.ownerId = body.ownerId;
        data.ownerName = owner?.fullName || null;
        data.ownerRole = owner?.role || null;
        if (set.status === 'AVAILABLE') data.status = 'RESERVE';
      } else {
        data.ownerId = null;
        data.ownerName = null;
        data.ownerRole = null;
        data.status = 'AVAILABLE';
      }
    }

    // Retire / decommission.
    if (body.action === 'retire') {
      data.status = 'RETIRED';
      data.retiredAt = new Date();
      data.retiredReason = body.reason || 'Decommissioned';
    }

    // Explicit status change (e.g. clear MISSING back to RESERVE).
    if (typeof body.status === 'string') data.status = body.status;

    const updated = await prisma.scrubSet.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ set: updated });
  } catch (error) {
    console.error('PUT /api/scrubs/[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update scrub set' },
      { status: 500 },
    );
  }
}
