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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (severity) {
      where.severity = severity;
    }

    const alerts = await prisma.oxygenAlert.findMany({
      where,
      include: {
        activeSurgery: {
          select: {
            id: true,
            procedureName: true,
            patient: {
              select: {
                name: true,
                folderNumber: true,
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
          },
        },
        respondedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        alertDate: 'desc',
      },
    });

    return NextResponse.json(alerts);
  } catch (error) {
    console.error('Error fetching oxygen alerts:', error);
    return NextResponse.json({ alerts: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    // Validate that user is authorized to trigger alerts (anaesthetist or theatre technician)
    const authorizedRoles = [
      'ANAESTHETIST',
      'CONSULTANT_ANAESTHETIST',
      'ANAESTHETIC_TECHNICIAN',
      'THEATRE_MANAGER',
      'ADMIN',
    ];

    if (!authorizedRoles.includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only anaesthetists and theatre technicians can trigger oxygen alerts' },
        { status: 403 }
      );
    }

    const alert = await prisma.oxygenAlert.create({
      data: {
        alertDate: new Date(),
        alertType: data.alertType,
        severity: data.severity,
        location: data.location,
        affectedTheatres: data.affectedTheatres,
        currentPressure: data.currentPressure,
        normalPressure: data.normalPressure,
        oxygenLevel: data.oxygenLevel,
        description: data.description,
        immediateRisk: data.immediateRisk || false,
        activeSurgeryId: data.activeSurgeryId,
        triggeredById: session.user.id,
        triggerReason: data.triggerReason,
        surgeriesAffected: data.surgeriesAffected || 0,
        patientsAffected: data.patientsAffected || 0,
        notes: data.notes,
      },
      include: {
        triggeredBy: {
          select: {
            fullName: true,
            role: true,
          },
        },
        activeSurgery: {
          select: {
            procedureName: true,
            patient: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    // TODO: Send real-time notifications to relevant staff
    // This would typically involve WebSocket, push notifications, or SMS

    return NextResponse.json(alert);
  } catch (error) {
    console.error('Error creating oxygen alert:', error);
    return NextResponse.json({ error: 'Failed to create oxygen alert' }, { status: 500 });
  }
}
