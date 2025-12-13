import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const endOfDaySchema = z.object({
  setupLogId: z.string().min(1, 'Setup log ID is required'),
  endOfDayNotes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = endOfDaySchema.parse(body);

    // Get setup log
    const setupLog = await prisma.anesthesiaSetupLog.findUnique({
      where: { id: validatedData.setupLogId },
      include: {
        equipmentChecks: {
          where: {
            isFunctional: false,
          },
        },
      },
    });

    if (!setupLog) {
      return NextResponse.json(
        { error: 'Setup log not found' },
        { status: 404 }
      );
    }

    // Update setup log with end of day
    const updatedLog = await prisma.anesthesiaSetupLog.update({
      where: { id: validatedData.setupLogId },
      data: {
        endOfDayLogged: true,
        endOfDayTime: new Date(),
        endOfDayNotes: validatedData.endOfDayNotes,
      },
    });

    return NextResponse.json(
      {
        message: 'End of day logged successfully',
        setupLog: updatedLog,
        malfunctioningEquipment: setupLog.equipmentChecks.length,
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

    console.error('Error logging end of day:', error);
    return NextResponse.json(
      { error: 'Failed to log end of day' },
      { status: 500 }
    );
  }
}
