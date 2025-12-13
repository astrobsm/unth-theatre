import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const endDutySchema = z.object({
  staffCode: z.string().min(1, 'Staff code is required'),
  logId: z.string().optional(),
  quantity: z.number().optional(),
  notes: z.string().optional(),
  qualityRating: z.number().min(1).max(5).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    const body = await request.json();
    const validatedData = endDutySchema.parse(body);

    // Find staff by code
    const staff = await prisma.user.findUnique({
      where: { staffCode: validatedData.staffCode },
      select: {
        id: true,
        fullName: true,
        staffCode: true,
      },
    });

    if (!staff) {
      return NextResponse.json(
        { error: 'Invalid staff code' },
        { status: 404 }
      );
    }

    // Find active duty log
    let dutyLog;
    if (validatedData.logId) {
      dutyLog = await prisma.staffDutyLog.findFirst({
        where: {
          id: validatedData.logId,
          staffId: staff.id,
          status: 'IN_PROGRESS',
        },
      });
    } else {
      dutyLog = await prisma.staffDutyLog.findFirst({
        where: {
          staffId: staff.id,
          status: 'IN_PROGRESS',
        },
        orderBy: { startTime: 'desc' },
      });
    }

    if (!dutyLog) {
      return NextResponse.json(
        { error: 'No active duty session found' },
        { status: 404 }
      );
    }

    // Calculate duration
    const endTime = new Date();
    const durationMs = endTime.getTime() - dutyLog.startTime.getTime();
    const durationMinutes = Math.floor(durationMs / 60000);

    // Update duty log
    const updatedLog = await prisma.staffDutyLog.update({
      where: { id: dutyLog.id },
      data: {
        endTime,
        durationMinutes,
        status: 'COMPLETED',
        quantity: validatedData.quantity || dutyLog.quantity,
        notes: validatedData.notes || dutyLog.notes,
        qualityRating: validatedData.qualityRating,
      },
    });

    return NextResponse.json(
      {
        message: 'Duty session completed successfully',
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

    console.error('Error ending duty:', error);
    return NextResponse.json(
      { error: 'Failed to end duty session' },
      { status: 500 }
    );
  }
}
