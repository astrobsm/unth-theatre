import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - Fetch a specific plumbing fault
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const fault = await prisma.plumbingFault.findUnique({
      where: { id: params.id },
      include: {
        reportedBy: { select: { id: true, fullName: true, role: true, phoneNumber: true } },
        assignedTo: { select: { id: true, fullName: true, role: true, phoneNumber: true } },
        acknowledgedBy: { select: { id: true, fullName: true } },
        resolvedBy: { select: { id: true, fullName: true } },
      },
    });

    if (!fault) {
      return NextResponse.json({ error: 'Fault not found' }, { status: 404 });
    }

    return NextResponse.json(fault);
  } catch (error) {
    console.error('Error fetching plumbing fault:', error);
    return NextResponse.json({ error: 'Failed to fetch fault' }, { status: 500 });
  }
}

// PATCH - Update plumbing fault (acknowledge, assign, resolve, escalate)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case 'ACKNOWLEDGE': {
        await prisma.plumbingFault.update({
          where: { id: params.id },
          data: {
            status: 'ACKNOWLEDGED',
            acknowledgedById: session.user.id,
            acknowledgedAt: new Date(),
          },
        });
        return NextResponse.json({ message: 'Fault acknowledged' });
      }

      case 'ASSIGN': {
        if (!data.assignedToId) {
          return NextResponse.json({ error: 'assignedToId is required' }, { status: 400 });
        }

        const assignee = await prisma.user.findUnique({
          where: { id: data.assignedToId },
          select: { fullName: true },
        });

        await prisma.plumbingFault.update({
          where: { id: params.id },
          data: {
            assignedToId: data.assignedToId,
            assignedToName: assignee?.fullName || '',
            assignedAt: new Date(),
            status: 'ACKNOWLEDGED',
          },
        });

        // Notify assigned plumber
        await prisma.notification.create({
          data: {
            userId: data.assignedToId,
            type: 'PLUMBING_ASSIGNMENT',
            title: '🔧 Plumbing Fault Assigned to You',
            message: `You have been assigned a plumbing fault. Please attend to it promptly.`,
            link: '/dashboard/plumbing-water-supply',
          },
        });

        return NextResponse.json({ message: 'Fault assigned' });
      }

      case 'START_WORK': {
        await prisma.plumbingFault.update({
          where: { id: params.id },
          data: {
            status: 'IN_PROGRESS',
          },
        });
        return NextResponse.json({ message: 'Work started' });
      }

      case 'RESOLVE': {
        await prisma.plumbingFault.update({
          where: { id: params.id },
          data: {
            status: 'RESOLVED',
            resolvedById: session.user.id,
            resolvedByName: session.user.name || '',
            resolvedAt: new Date(),
            resolutionNotes: data.resolutionNotes || null,
            partsUsed: data.partsUsed ? JSON.stringify(data.partsUsed) : null,
            actualCost: data.actualCost ? parseFloat(data.actualCost) : null,
          },
        });

        // Notify the reporter
        const fault = await prisma.plumbingFault.findUnique({
          where: { id: params.id },
          select: { reportedById: true, title: true, location: true },
        });
        if (fault) {
          await prisma.notification.create({
            data: {
              userId: fault.reportedById,
              type: 'PLUMBING_RESOLVED',
              title: '✅ Plumbing Fault Resolved',
              message: `The fault "${fault.title}" at ${fault.location} has been resolved.`,
              link: '/dashboard/plumbing-water-supply',
            },
          });
        }

        return NextResponse.json({ message: 'Fault resolved' });
      }

      case 'ESCALATE': {
        await prisma.plumbingFault.update({
          where: { id: params.id },
          data: {
            isEscalated: true,
            escalatedAt: new Date(),
            escalatedTo: data.escalatedTo || 'MANAGEMENT',
          },
        });

        // Notify management
        const mgmt = await prisma.user.findMany({
          where: {
            role: { in: ['THEATRE_MANAGER', 'ADMIN', 'CHIEF_MEDICAL_DIRECTOR', 'WORKS_SUPERVISOR'] },
            status: 'APPROVED',
          },
          select: { id: true },
        });

        const faultInfo = await prisma.plumbingFault.findUnique({
          where: { id: params.id },
          select: { title: true, location: true, priority: true },
        });

        await Promise.all(
          mgmt.map(m =>
            prisma.notification.create({
              data: {
                userId: m.id,
                type: 'PLUMBING_ESCALATION',
                title: '🚨 Plumbing Fault Escalated',
                message: `${faultInfo?.priority} fault "${faultInfo?.title}" at ${faultInfo?.location} has been escalated and requires management attention.`,
                link: '/dashboard/plumbing-water-supply',
              },
            })
          )
        );

        return NextResponse.json({ message: 'Fault escalated' });
      }

      case 'UPDATE_NOTES': {
        await prisma.plumbingFault.update({
          where: { id: params.id },
          data: { notes: data.notes },
        });
        return NextResponse.json({ message: 'Notes updated' });
      }

      // A plumber claims an unassigned fault and takes ownership of the work.
      case 'CLAIM': {
        await prisma.plumbingFault.update({
          where: { id: params.id },
          data: {
            assignedToId: session.user.id,
            assignedToName: session.user.name || '',
            assignedAt: new Date(),
            acknowledgedById: session.user.id,
            acknowledgedAt: new Date(),
            status: 'IN_PROGRESS',
          },
        });
        return NextResponse.json({ message: 'Fault claimed' });
      }

      // A plumber logs an action they have taken on the fault. Entries are
      // appended to the notes field as a timestamped, authored action log so
      // the full history of work done is preserved.
      case 'LOG_ACTION': {
        const actionText = (data.action_taken || data.actionTaken || '').toString().trim();
        if (!actionText) {
          return NextResponse.json({ error: 'action_taken text is required' }, { status: 400 });
        }

        const existing = await prisma.plumbingFault.findUnique({
          where: { id: params.id },
          select: { notes: true, status: true },
        });
        if (!existing) {
          return NextResponse.json({ error: 'Fault not found' }, { status: 404 });
        }

        const author = `${session.user.name || 'Plumber'} (${session.user.role})`;
        const entry = `[${new Date().toISOString()}] ${author}: ${actionText}`;
        const updatedNotes = existing.notes ? `${existing.notes}\n${entry}` : entry;

        // Logging an action implies work has started — advance the status so the
        // fault is no longer sitting as merely REPORTED/ACKNOWLEDGED/ASSIGNED.
        const shouldStartWork = ['REPORTED', 'ACKNOWLEDGED', 'ASSIGNED'].includes(existing.status);

        await prisma.plumbingFault.update({
          where: { id: params.id },
          data: {
            notes: updatedNotes,
            ...(shouldStartWork ? { status: 'IN_PROGRESS' } : {}),
            // Take ownership if not already assigned.
            ...(data.takeOwnership
              ? {
                  assignedToId: session.user.id,
                  assignedToName: session.user.name || '',
                  assignedAt: new Date(),
                }
              : {}),
          },
        });

        return NextResponse.json({ message: 'Action logged' });
      }

      // Directly set the fault status (any valid PlumbingFaultStatus value).
      case 'UPDATE_STATUS': {
        const allowed = [
          'REPORTED',
          'ACKNOWLEDGED',
          'ASSIGNED',
          'IN_PROGRESS',
          'PARTS_ORDERED',
          'RESOLVED',
          'CLOSED',
        ];
        if (!allowed.includes(data.status)) {
          return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        const updateData: any = { status: data.status };
        if (data.status === 'RESOLVED') {
          updateData.resolvedById = session.user.id;
          updateData.resolvedByName = session.user.name || '';
          updateData.resolvedAt = new Date();
        }

        await prisma.plumbingFault.update({
          where: { id: params.id },
          data: updateData,
        });

        return NextResponse.json({ message: 'Status updated' });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error updating plumbing fault:', error);
    return NextResponse.json({ error: 'Failed to update fault' }, { status: 500 });
  }
}
