import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cancellations = await prisma.caseCancellation.findMany({
      include: {
        surgery: {
          include: {
            patient: true,
            surgeon: true,
          },
        },
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: {
        cancelledAt: 'desc',
      },
    });

    const formattedCancellations = cancellations.map((c) => ({
      id: c.id,
      surgery: {
        procedureName: c.surgery.procedureName,
        scheduledDate: c.surgery.scheduledDate,
        patient: {
          name: c.surgery.patient.name,
          folderNumber: c.surgery.patient.folderNumber,
        },
        surgeon: {
          fullName: c.surgery.surgeonName || c.surgery.surgeon?.fullName || 'Not assigned',
        },
      },
      category: c.category,
      reason: c.reason,
      detailedNotes: c.detailedNotes,
      cancelledAt: c.cancelledAt,
      cancelledBy: {
        fullName: c.user.fullName,
      },
    }));

    return NextResponse.json(formattedCancellations);
  } catch (error) {
    console.error('Failed to fetch cancellations:', error);
    return NextResponse.json({ error: 'Failed to fetch cancellations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { surgeryId, category, reason, detailedNotes } = body;

    // Validate required fields
    if (!surgeryId || !category || !reason || !detailedNotes) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if surgery exists and is not already cancelled
    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      include: { cancellation: true },
    });

    if (!surgery) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    if (surgery.status === 'CANCELLED' || surgery.cancellation) {
      return NextResponse.json({ error: 'Surgery is already cancelled' }, { status: 400 });
    }

    // Create cancellation record and update surgery status in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create cancellation record
      const cancellation = await tx.caseCancellation.create({
        data: {
          surgeryId,
          category,
          reason,
          detailedNotes,
          cancelledBy: session.user.id,
        },
        include: {
          surgery: {
            include: {
              patient: true,
              surgeon: true,
            },
          },
          user: {
            select: {
              fullName: true,
            },
          },
        },
      });

      // Update surgery status to CANCELLED
      await tx.surgery.update({
        where: { id: surgeryId },
        data: { status: 'CANCELLED' },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CANCEL_SURGERY',
          tableName: 'surgeries',
          recordId: surgeryId,
          changes: JSON.stringify({
            category,
            reason,
            patientName: cancellation.surgery.patient.name,
            procedureName: cancellation.surgery.procedureName,
          }),
        },
      });

      return cancellation;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Failed to create cancellation:', error);
    return NextResponse.json({ error: 'Failed to create cancellation' }, { status: 500 });
  }
}
