import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const alert = await prisma.oxygenAlert.findUnique({
      where: { id: params.id },
      include: {
        activeSurgery: {
          select: {
            id: true,
            procedureName: true,
            scheduledDate: true,
            patient: {
              select: {
                name: true,
                folderNumber: true,
                ward: true,
              },
            },
          },
        },
        triggeredBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        acknowledgedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        respondedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    return NextResponse.json(alert);
  } catch (error) {
    console.error('Error fetching oxygen alert:', error);
    return NextResponse.json({ error: 'Failed to fetch alert' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const updateData: any = {};

    // Acknowledge alert
    if (data.action === 'acknowledge') {
      updateData.status = 'ACKNOWLEDGED';
      updateData.acknowledgedById = session.user.id;
      updateData.acknowledgedAt = new Date();
    }

    // Respond to alert
    if (data.action === 'respond') {
      updateData.respondedById = session.user.id;
      updateData.respondedAt = new Date();
      updateData.responseAction = data.responseAction;
      if (data.downtime) updateData.downtime = data.downtime;
    }

    // Resolve alert
    if (data.action === 'resolve') {
      updateData.status = 'RESOLVED';
      updateData.resolvedById = session.user.id;
      updateData.resolvedAt = new Date();
      updateData.resolutionNotes = data.resolutionNotes;
      if (data.preventativeMeasures) updateData.preventativeMeasures = data.preventativeMeasures;
      if (data.rootCause) updateData.rootCause = data.rootCause;
    }

    // Cancel alert
    if (data.action === 'cancel') {
      // Only allow if user is manager/admin or the person who triggered it
      const alert = await prisma.oxygenAlert.findUnique({
        where: { id: params.id },
        select: { triggeredById: true },
      });

      if (
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER' &&
        alert?.triggeredById !== session.user.id
      ) {
        return NextResponse.json({ error: 'Not authorized to cancel this alert' }, { status: 403 });
      }

      updateData.status = 'CANCELLED';
    }

    const updatedAlert = await prisma.oxygenAlert.update({
      where: { id: params.id },
      data: updateData,
      include: {
        triggeredBy: {
          select: {
            fullName: true,
            role: true,
          },
        },
        acknowledgedBy: {
          select: {
            fullName: true,
          },
        },
        respondedBy: {
          select: {
            fullName: true,
          },
        },
        resolvedBy: {
          select: {
            fullName: true,
          },
        },
      },
    });

    return NextResponse.json(updatedAlert);
  } catch (error) {
    console.error('Error updating oxygen alert:', error);
    return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can delete oxygen alerts
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only admins can delete oxygen alerts' }, { status: 403 });
    }

    await prisma.oxygenAlert.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: 'Oxygen alert deleted successfully' });
  } catch (error) {
    console.error('Error deleting oxygen alert:', error);
    return NextResponse.json({ error: 'Failed to delete alert' }, { status: 500 });
  }
}
