import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const acknowledgeAlertSchema = z.object({
  staffRole: z.string(),
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

    const body = await request.json();
    const validatedData = acknowledgeAlertSchema.parse(body);

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

    const updateData: any = {
      acknowledgedBy: existingAlert.acknowledgedBy
        ? `${existingAlert.acknowledgedBy},${session.user.name} (${validatedData.staffRole})`
        : `${session.user.name} (${validatedData.staffRole})`,
    };

    // Update specific acknowledgments based on role
    if (session.user.role === 'THEATRE_MANAGER' || session.user.role === 'THEATRE_CHAIRMAN') {
      updateData.managerAcknowledged = true;
      updateData.managerAcknowledgedAt = new Date();
    }

    if (session.user.role === 'ANAESTHETIST') {
      updateData.anesthetistAcknowledged = true;
      updateData.anesthetistAcknowledgedAt = new Date();
      updateData.anesthetistId = session.user.id;
    }

    if (session.user.role === 'SCRUB_NURSE' || session.user.role === 'RECOVERY_ROOM_NURSE') {
      updateData.nurseAcknowledged = true;
      updateData.nurseAcknowledgedAt = new Date();
    }

    // Update alert
    const updatedAlert = await prisma.emergencySurgeryAlert.update({
      where: { id: params.id },
      data: updateData,
      include: {
        surgery: true,
        surgeon: {
          select: {
            fullName: true,
          },
        },
        anesthetist: {
          select: {
            fullName: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'ACKNOWLEDGE',
        tableName: 'EmergencySurgeryAlert',
        recordId: updatedAlert.id,
        changes: JSON.stringify({
          acknowledgedBy: session.user.name,
          role: validatedData.staffRole,
        }),
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

    console.error('Error acknowledging emergency alert:', error);
    return NextResponse.json(
      { error: 'Failed to acknowledge emergency alert' },
      { status: 500 }
    );
  }
}
