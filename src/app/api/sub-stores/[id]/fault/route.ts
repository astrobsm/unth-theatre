import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const faultSchema = z.object({
  faultType: z.enum(['FAULTY', 'BROKEN', 'EXPIRED', 'MISSING', 'CONTAMINATED', 'OTHER']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  description: z.string().min(3, 'Description is required'),
});

// POST /api/sub-stores/:id/fault
// Reports a fault on a sub-store item and notifies biomedical engineers,
// theatre managers and administrators automatically.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const userName = (session.user as any).fullName || (session.user as any).name || 'A user';

    const body = await request.json();
    const data = faultSchema.parse(body);

    const subStore = await prisma.theatreSubStore.findUnique({
      where: { id: params.id },
    });
    if (!subStore) {
      return NextResponse.json({ error: 'Sub-store item not found' }, { status: 404 });
    }

    // Find every recipient that should be alerted.
    const recipients = await prisma.user.findMany({
      where: {
        role: {
          in: [
            'BIOMEDICAL_ENGINEER',
            'ADMIN',
            'SYSTEM_ADMINISTRATOR',
            'THEATRE_MANAGER',
          ],
        },
      },
      select: { id: true, role: true },
    });

    const fault = await prisma.subStoreItemFault.create({
      data: {
        subStoreId: subStore.id,
        theatreNumber: subStore.theatreNumber,
        theatreName: subStore.theatreName,
        ownerRole: subStore.ownerRole,
        itemName: subStore.itemName,
        faultType: data.faultType,
        severity: data.severity,
        description: data.description,
        reportedById: userId,
        alertsSentTo: JSON.stringify(recipients.map((r) => r.id)),
      },
    });

    const ownerLabel =
      subStore.ownerRole === 'ANAESTHETIC_TECHNICIAN'
        ? 'Technician Sub-Store'
        : 'Scrub Nurse Sub-Store';
    const theatreLabel = subStore.theatreName || subStore.theatreNumber;
    const title = `${data.severity} fault: ${subStore.itemName}`;
    const message =
      `${userName} reported a ${data.faultType.toLowerCase()} fault on "${subStore.itemName}" ` +
      `in ${theatreLabel} (${ownerLabel}). ${data.description}`;

    // Fan out notifications.
    if (recipients.length > 0) {
      await prisma.notification.createMany({
        data: recipients.map((r) => ({
          userId: r.id,
          type: 'FAULT_REPORTED',
          title,
          message,
          link: `/dashboard/sub-stores/theatre/${encodeURIComponent(subStore.theatreNumber)}`,
        })),
      });
    }

    return NextResponse.json({
      fault,
      notified: recipients.length,
    });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 });
    }
    console.error('Error reporting sub-store fault:', err);
    return NextResponse.json(
      { error: 'Failed to report fault' },
      { status: 500 }
    );
  }
}

// GET /api/sub-stores/:id/fault — list faults for the item
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const faults = await prisma.subStoreItemFault.findMany({
      where: { subStoreId: params.id },
      orderBy: { reportedAt: 'desc' },
    });

    return NextResponse.json({ faults });
  } catch (err) {
    console.error('Error listing faults:', err);
    return NextResponse.json({ error: 'Failed to load faults' }, { status: 500 });
  }
}
