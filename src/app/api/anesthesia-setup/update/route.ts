import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const updateSetupSchema = z.object({
  setupLogId: z.string().min(1, 'Setup log ID is required'),
  gasSupplyChecked: z.boolean().optional(),
  suctionChecked: z.boolean().optional(),
  monitorsChecked: z.boolean().optional(),
  ventilatorChecked: z.boolean().optional(),
  anesthesiaMachineChecked: z.boolean().optional(),
  emergencyDrugsChecked: z.boolean().optional(),
  airwayEquipmentChecked: z.boolean().optional(),
  ivEquipmentChecked: z.boolean().optional(),
  setupNotes: z.string().optional(),
  blockingIssues: z.string().optional(),
  markAsReady: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updateSetupSchema.parse(body);

    // Get existing setup log
    const setupLog = await prisma.anesthesiaSetupLog.findUnique({
      where: { id: validatedData.setupLogId },
    });

    if (!setupLog) {
      return NextResponse.json(
        { error: 'Setup log not found' },
        { status: 404 }
      );
    }

    // Only the technician who created the log can update it
    if (setupLog.technicianId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'You can only update your own setup logs' },
        { status: 403 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    
    if (validatedData.gasSupplyChecked !== undefined) updateData.gasSupplyChecked = validatedData.gasSupplyChecked;
    if (validatedData.suctionChecked !== undefined) updateData.suctionChecked = validatedData.suctionChecked;
    if (validatedData.monitorsChecked !== undefined) updateData.monitorsChecked = validatedData.monitorsChecked;
    if (validatedData.ventilatorChecked !== undefined) updateData.ventilatorChecked = validatedData.ventilatorChecked;
    if (validatedData.anesthesiaMachineChecked !== undefined) updateData.anesthesiaMachineChecked = validatedData.anesthesiaMachineChecked;
    if (validatedData.emergencyDrugsChecked !== undefined) updateData.emergencyDrugsChecked = validatedData.emergencyDrugsChecked;
    if (validatedData.airwayEquipmentChecked !== undefined) updateData.airwayEquipmentChecked = validatedData.airwayEquipmentChecked;
    if (validatedData.ivEquipmentChecked !== undefined) updateData.ivEquipmentChecked = validatedData.ivEquipmentChecked;
    if (validatedData.setupNotes !== undefined) updateData.setupNotes = validatedData.setupNotes;
    if (validatedData.blockingIssues !== undefined) updateData.blockingIssues = validatedData.blockingIssues;

    // Check if marking as ready
    if (validatedData.markAsReady) {
      // Verify all checks are completed
      const allChecked = 
        (updateData.gasSupplyChecked ?? setupLog.gasSupplyChecked) &&
        (updateData.suctionChecked ?? setupLog.suctionChecked) &&
        (updateData.monitorsChecked ?? setupLog.monitorsChecked) &&
        (updateData.ventilatorChecked ?? setupLog.ventilatorChecked) &&
        (updateData.anesthesiaMachineChecked ?? setupLog.anesthesiaMachineChecked) &&
        (updateData.emergencyDrugsChecked ?? setupLog.emergencyDrugsChecked) &&
        (updateData.airwayEquipmentChecked ?? setupLog.airwayEquipmentChecked) &&
        (updateData.ivEquipmentChecked ?? setupLog.ivEquipmentChecked);

      if (!allChecked) {
        return NextResponse.json(
          { error: 'All equipment checks must be completed before marking as ready' },
          { status: 400 }
        );
      }

      updateData.status = 'READY';
      updateData.isReady = true;
      updateData.readyTime = new Date();
    }

    // Calculate duration if setting end time
    if (updateData.status === 'READY' && !setupLog.setupEndTime) {
      updateData.setupEndTime = new Date();
      const durationMs = updateData.setupEndTime.getTime() - setupLog.setupStartTime.getTime();
      updateData.durationMinutes = Math.floor(durationMs / 60000);
    }

    // Update setup log
    const updatedLog = await prisma.anesthesiaSetupLog.update({
      where: { id: validatedData.setupLogId },
      data: updateData,
    });

    return NextResponse.json(
      {
        message: 'Setup log updated successfully',
        setupLog: updatedLog,
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

    console.error('Error updating setup log:', error);
    return NextResponse.json(
      { error: 'Failed to update setup log' },
      { status: 500 }
    );
  }
}
