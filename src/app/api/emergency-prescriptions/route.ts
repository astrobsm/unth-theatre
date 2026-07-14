import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

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
    const date = searchParams.get('date');
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

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      where.OR = [
        { emergencyBooking: { requiredByTime: { gte: startDate, lte: endDate } } },
        { emergencyBooking: { requiredByTime: null }, createdAt: { gte: startDate, lte: endDate } },
      ];
    }

    const prescriptions = await prisma.emergencyPrescription.findMany({
      where,
      include: {
        review: {
          select: {
            id: true,
            allergies: true,
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
            theatreName: true,
            theatreId: true,
            surgeryId: true,
            surgery: {
              select: {
                id: true,
                location: true,
                theatreId: true,
                scrubNurseId: true,
              },
            },
          },
        },
        packedBy: {
          select: { id: true, fullName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const surgeryIds = Array.from(new Set(prescriptions.map((p: any) => p.emergencyBooking?.surgeryId).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)));
    const surgeries = surgeryIds.length
      ? await prisma.surgery.findMany({
          where: { id: { in: surgeryIds } },
          select: { id: true, scheduledDate: true, location: true, theatreId: true, scrubNurseId: true },
        })
      : [];
    const surgeryById = new Map(surgeries.map((s) => [s.id, s]));

    const theatreIds = Array.from(new Set([
      ...prescriptions.map((p: any) => p.emergencyBooking?.theatreId).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
      ...surgeries.map((s) => s.theatreId).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
    ]));
    const theatres = theatreIds.length
      ? await prisma.theatreSuite.findMany({
          where: { id: { in: theatreIds } },
          select: { id: true, name: true, location: true },
        })
      : [];
    const theatreById = new Map(theatres.map((t) => [t.id, t]));

    const scrubNurseIds = Array.from(new Set(surgeries.map((s) => s.scrubNurseId).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)));
    const scrubNurses = scrubNurseIds.length
      ? await prisma.user.findMany({
          where: { id: { in: scrubNurseIds } },
          select: { id: true, fullName: true, phoneNumber: true },
        })
      : [];
    const scrubNurseById = new Map(scrubNurses.map((u) => [u.id, u]));

    for (const prescription of prescriptions as any[]) {
      const booking = prescription.emergencyBooking;
      if (!booking) continue;
      const surgery = booking.surgeryId ? surgeryById.get(booking.surgeryId) : null;
      const theatre = (booking.theatreId ? theatreById.get(booking.theatreId) : null) || (surgery?.theatreId ? theatreById.get(surgery.theatreId) : null);
      const scrubNurse = surgery?.scrubNurseId ? scrubNurseById.get(surgery.scrubNurseId) : null;
      booking.theatreName = booking.theatreName || theatre?.name || surgery?.location || null;
      booking.theatreLocation = theatre?.location || surgery?.location || null;
      booking.scrubNurse = scrubNurse ? { fullName: scrubNurse.fullName, phoneNumber: scrubNurse.phoneNumber } : null;
    }

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
  } catch (error: any) {
    console.error('Error fetching emergency prescriptions:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch emergency prescriptions', details: error?.message }, { status: 500 });
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
