import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const endTransportSchema = z.object({
  staffCode: z.string().min(1, 'Staff code is required'),
  logId: z.string().optional(),
  receivedBy: z.string().optional(),
  complications: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    const body = await request.json();
    const validatedData = endTransportSchema.parse(body);

    // Find porter by staff code
    const porter = await prisma.user.findUnique({
      where: { staffCode: validatedData.staffCode },
      select: {
        id: true,
        fullName: true,
        staffCode: true,
      },
    });

    if (!porter) {
      return NextResponse.json(
        { error: 'Invalid staff code' },
        { status: 404 }
      );
    }

    // Find active transport log
    let transportLog;
    if (validatedData.logId) {
      transportLog = await prisma.patientTransportLog.findFirst({
        where: {
          id: validatedData.logId,
          porterId: porter.id,
          status: 'IN_PROGRESS',
        },
      });
    } else {
      transportLog = await prisma.patientTransportLog.findFirst({
        where: {
          porterId: porter.id,
          status: 'IN_PROGRESS',
        },
        orderBy: { startTime: 'desc' },
      });
    }

    if (!transportLog) {
      return NextResponse.json(
        { error: 'No active transport session found' },
        { status: 404 }
      );
    }

    // Calculate duration
    const endTime = new Date();
    const durationMs = endTime.getTime() - transportLog.startTime.getTime();
    const durationMinutes = Math.floor(durationMs / 60000);

    // Update transport log
    const updatedLog = await prisma.patientTransportLog.update({
      where: { id: transportLog.id },
      data: {
        endTime,
        durationMinutes,
        status: 'COMPLETED',
        receivedBy: validatedData.receivedBy,
        receivedAt: endTime,
        complications: validatedData.complications,
        notes: validatedData.notes || transportLog.notes,
      },
    });

    return NextResponse.json(
      {
        message: 'Patient transport completed successfully',
        log: updatedLog,
        duration: `${durationMinutes} minutes`,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error ending transport:', error);
    return NextResponse.json(
      { error: 'Failed to end transport session' },
      { status: 500 }
    );
  }
}
