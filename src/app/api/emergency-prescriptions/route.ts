import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateStatusSchema = z.object({
  prescriptionId: z.string(),
  status: z.enum(['PHARMACIST_VIEWED', 'PACKING', 'PACKED', 'DISPENSED', 'OUT_OF_STOCK_FLAGGED']),
  packingNotes: z.string().optional(),
  outOfStockItems: z.string().optional(),
});

// GET - Fetch emergency prescriptions for pharmacists
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('bookingId');
    const status = searchParams.get('status');
    const pendingOnly = searchParams.get('pending') === 'true';

    const where: any = { isEmergency: true };

    if (bookingId) {
      where.emergencyBookingId = bookingId;
    }

    if (status) {
      where.status = status;
    }

    if (pendingOnly) {
      where.status = { in: ['SUBMITTED', 'PHARMACIST_VIEWED', 'PACKING'] };
    }

    const prescriptions = await prisma.emergencyPrescription.findMany({
      where,
      include: {
        review: {
          select: {
            id: true,
            allergyAlerts: true,
            anaestheticPlan: true,
            reviewerName: true,
          },
        },
        emergencyBooking: {
          select: {
            id: true,
            patientName: true,
            folderNumber: true,
            procedureName: true,
            surgicalUnit: true,
            priority: true,
            status: true,
            requiredByTime: true,
          },
        },
        packedBy: {
          select: { id: true, fullName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Auto-mark as viewed by pharmacist
    if (session.user.role === 'PHARMACIST') {
      const unviewed = prescriptions.filter((p: any) => p.status === 'SUBMITTED');
      if (unviewed.length > 0) {
        await prisma.emergencyPrescription.updateMany({
          where: {
            id: { in: unviewed.map((p: any) => p.id) },
            status: 'SUBMITTED',
          },
          data: {
            viewedByPharmacist: true,
            viewedAt: new Date(),
            status: 'PHARMACIST_VIEWED',
          },
        });
      }
    }

    return NextResponse.json(prescriptions);
  } catch (error) {
    console.error('Error fetching emergency prescriptions:', error);
    return NextResponse.json([], { status: 200 });
  }
}

// PATCH - Pharmacist updates prescription status (pack, dispense, flag out-of-stock)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['PHARMACIST', 'ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only pharmacists can update prescription status' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data = updateStatusSchema.parse(body);

    const updateData: any = {
      status: data.status,
    };

    if (data.status === 'PACKED' || data.status === 'DISPENSED') {
      updateData.packedById = session.user.id;
      updateData.packedByName = session.user.name;
      updateData.packedAt = new Date();
      updateData.packingNotes = data.packingNotes;
    }

    if (data.status === 'OUT_OF_STOCK_FLAGGED') {
      updateData.hasOutOfStockItems = true;
      updateData.outOfStockItems = data.outOfStockItems;
    }

    const updated = await prisma.emergencyPrescription.update({
      where: { id: data.prescriptionId },
      data: updateData,
      include: {
        emergencyBooking: {
          select: { patientName: true, folderNumber: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error updating prescription:', error);
    return NextResponse.json({ error: 'Failed to update prescription' }, { status: 500 });
  }
}
