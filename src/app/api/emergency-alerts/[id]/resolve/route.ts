import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const resolveAlertSchema = z.object({
  resolutionNotes: z.string().optional(),
  actualStartTime: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    if (!['THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only managers can resolve emergency alerts' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = resolveAlertSchema.parse(body);

    // Check if alert exists
    const existingAlert = await prisma.emergencySurgeryAlert.findUnique({
      where: { id: params.id },
    });

    if (!existingAlert) {
      return NextResponse.json(
        { error: 'Emergency alert not found' },
        { status: 404 }
      );
    }

    // Update alert as resolved
    const updatedAlert = await prisma.emergencySurgeryAlert.update({
      where: { id: params.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolutionNotes: validatedData.resolutionNotes,
        actualStartTime: validatedData.actualStartTime
          ? new Date(validatedData.actualStartTime)
          : null,
        displayOnTv: false,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'RESOLVE',
        tableName: 'EmergencySurgeryAlert',
        recordId: updatedAlert.id,
        changes: JSON.stringify({
          resolvedBy: session.user.name,
          resolvedAt: new Date(),
          notes: validatedData.resolutionNotes,
        }),
      },
    });

    // Log TV display dismissal
    await prisma.tvAlertDisplayLog.create({
      data: {
        alertId: params.id,
        alertType: 'EMERGENCY_SURGERY',
        dismissedAt: new Date(),
        acknowledgedBy: session.user.name,
      },
    });

    return NextResponse.json(updatedAlert);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error resolving emergency alert:', error);
    return NextResponse.json(
      { error: 'Failed to resolve emergency alert' },
      { status: 500 }
    );
  }
}
