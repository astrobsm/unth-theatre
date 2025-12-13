import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const endCleaningSchema = z.object({
  staffCode: z.string().min(1, 'Staff code is required'),
  logId: z.string().optional(), // If not provided, will find active log
  notes: z.string().optional(),
  qualityRating: z.number().min(1).max(5).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    const body = await request.json();
    const validatedData = endCleaningSchema.parse(body);

    // Find user by staff code
    const user = await prisma.user.findUnique({
      where: { staffCode: validatedData.staffCode },
      select: {
        id: true,
        fullName: true,
        staffCode: true,
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid staff code' },
        { status: 404 }
      );
    }

    // Find active cleaning log
    let cleaningLog;
    if (validatedData.logId) {
      cleaningLog = await prisma.theatreCleaningLog.findFirst({
        where: {
          id: validatedData.logId,
          cleanerId: user.id,
          status: 'IN_PROGRESS',
        },
      });
    } else {
      cleaningLog = await prisma.theatreCleaningLog.findFirst({
        where: {
          cleanerId: user.id,
          status: 'IN_PROGRESS',
        },
        orderBy: { startTime: 'desc' },
      });
    }

    if (!cleaningLog) {
      return NextResponse.json(
        { error: 'No active cleaning session found' },
        { status: 404 }
      );
    }

    // Calculate duration
    const endTime = new Date();
    const durationMs = endTime.getTime() - cleaningLog.startTime.getTime();
    const durationMinutes = Math.floor(durationMs / 60000);

    // Update cleaning log
    const updatedLog = await prisma.theatreCleaningLog.update({
      where: { id: cleaningLog.id },
      data: {
        endTime,
        durationMinutes,
        status: 'COMPLETED',
        notes: validatedData.notes || cleaningLog.notes,
      },
    });

    return NextResponse.json(
      {
        message: 'Cleaning session completed successfully',
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

    console.error('Error ending cleaning:', error);
    return NextResponse.json(
      { error: 'Failed to end cleaning session' },
      { status: 500 }
    );
  }
}
