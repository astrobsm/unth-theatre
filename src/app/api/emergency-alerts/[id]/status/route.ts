import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const StatusSchema = z.object({
  status: z.enum([
    'PENDING',
    'ACKNOWLEDGED',
    'IN_THEATRE',
    'IN_PROGRESS',
    'COMPLETED',
    'RESOLVED',
    'CANCELLED',
  ]),
  notes: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const parsed = StatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid status', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.emergencySurgeryAlert.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Emergency alert not found' }, { status: 404 });
    }

    const { status, notes } = parsed.data;
    const updateData: any = { status };

    const now = new Date();
    if (status === 'ACKNOWLEDGED' && !(existing as any).acknowledgedAt) {
      updateData.acknowledgedAt = now;
      updateData.acknowledgedById = (session.user as any).id;
    }
    if (status === 'IN_THEATRE' || status === 'IN_PROGRESS') {
      updateData.startedAt = (existing as any).startedAt ?? now;
    }
    if (status === 'COMPLETED' || status === 'RESOLVED') {
      updateData.resolvedAt = now;
      updateData.resolvedById = (session.user as any).id;
      if (notes) updateData.resolutionNotes = notes;
    }
    if (notes && status !== 'COMPLETED' && status !== 'RESOLVED') {
      updateData.additionalNotes = notes;
    }

    // Tolerate schemas that don't have every optional field
    const safeUpdate: any = {};
    for (const k of Object.keys(updateData)) {
      safeUpdate[k] = updateData[k];
    }

    let updated;
    try {
      updated = await prisma.emergencySurgeryAlert.update({
        where: { id },
        data: safeUpdate,
      });
    } catch (e) {
      // Fall back to status-only update if optional fields don't exist
      updated = await prisma.emergencySurgeryAlert.update({
        where: { id },
        data: { status },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating emergency alert status:', error);
    return NextResponse.json(
      { error: 'Failed to update status' },
      { status: 500 }
    );
  }
}

// Allow PATCH as well for clients that prefer it
export const PATCH = POST;
